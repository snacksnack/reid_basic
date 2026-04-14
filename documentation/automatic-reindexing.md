# Automatic Re-indexing

## Overview

The RAG pipeline embeds the resume into ChromaDB at startup. Without automatic re-indexing, updating `resume-prompt.txt` requires restarting the server for the change to take effect — fine in production (a Heroku deploy triggers a dyno restart automatically), but disruptive during local development.

This feature adds a background thread that watches `resume-prompt.txt` for changes using a **hash-based cache invalidation** pattern. If the file content changes, the index is rebuilt automatically within 60 seconds. No restart required.

---

## The Hash-Based Cache Invalidation Pattern

A hash function takes any input — a file, a string, a blob of bytes — and produces a fixed-length fingerprint. The defining property is: the same input always produces the same fingerprint, and any change to the input (even one character) produces a completely different fingerprint.

SHA-256, for example, produces a 64-character hex string:

```python
import hashlib
hashlib.sha256(b"Reid Collins").hexdigest()
# → "a3f1c9..."
```

Change one byte, and the output is entirely different. This makes it a reliable **content fingerprint**.

The cache invalidation pattern applies this to file change detection:

1. At startup, compute `hash(file_contents)` and store it
2. Periodically, compute `hash(file_contents)` again
3. If new hash ≠ stored hash → content changed → take action (re-index)
4. If equal → nothing changed → do nothing

### Why hash instead of file modification time?

You could check `os.path.getmtime()` instead. It is simpler and has no CPU cost. But modification timestamps have edge cases:

- Copying a file often resets mtime to the current time even if content is identical
- Some editors (Vim, Emacs) write to a temp file and rename it, which can produce mtime inconsistencies
- Filesystem clocks can be unreliable across environments (containers, NFS mounts)

A hash is a guarantee based on **content**, not metadata. Two files with identical content always produce the same hash regardless of how or when they were written. For this use case — a small text file checked every 60 seconds — the difference is academic, but understanding why hash is the more robust choice is the point.

---

## How It Works

```
App startup
    │
    ├── _build_resume_index()
    │       • Read resume-prompt.txt bytes
    │       • Chunk, embed, load into ChromaDB
    │       • Store SHA-256 hash of file bytes as _resume_hash
    │
    └── _watch_resume() thread starts (daemon=True)
            │
            ▼
        Every 60 seconds:
            • hash(resume-prompt.txt) == _resume_hash?
            │
            ├── Yes → do nothing
            │
            └── No  → log "resume-prompt.txt changed — rebuilding RAG index"
                       call _build_resume_index()
                       (which updates _resume_hash on success)
```

The hash is only updated inside `_build_resume_index()` on success. If a rebuild fails (e.g. OpenAI is unreachable), `_resume_hash` retains the old value and the watcher will retry on the next tick.

---

## Files Changed

### `app.py`

**New imports:**

```python
import hashlib
import threading
```

**New module-level variable:**

```python
_resume_hash: str = ""
```

Stores the SHA-256 hex digest of the resume file as it was at the last successful index build. Compared against a fresh hash on each watcher tick to detect changes.

**Modified: `_build_resume_index()`**

Added `_resume_hash` to the `global` declaration. Two lines changed:

```python
# Before: read file as text
chunk_dicts = _chunk_resume(_resume_path.read_text())

# After: read as bytes so we can hash the same bytes we decode
resume_bytes = _resume_path.read_bytes()
chunk_dicts = _chunk_resume(resume_bytes.decode())
```

After the collection is successfully populated:

```python
_resume_hash = hashlib.sha256(resume_bytes).hexdigest()
```

The hash is stored after the index is built, not before. This ensures `_resume_hash` always reflects a successfully indexed state, not just a read.

**New function: `_watch_resume(interval: int = 60)`**

```python
def _watch_resume(interval: int = 60) -> None:
    while True:
        threading.Event().wait(interval)
        try:
            current_hash = hashlib.sha256(_resume_path.read_bytes()).hexdigest()
            if current_hash != _resume_hash:
                logging.info("resume-prompt.txt changed — rebuilding RAG index")
                _build_resume_index()
        except Exception as e:
            logging.error("Resume watcher error: %s", e)
```

Runs in an infinite loop. On each tick:
- Reads the resume file and hashes it
- Compares to `_resume_hash` (the hash from the last successful build)
- If different, calls `_build_resume_index()` to rebuild and update the hash
- Any exception is logged and swallowed — a bad tick does not stop the loop

**New: thread start**

```python
_watcher = threading.Thread(target=_watch_resume, daemon=True)
_watcher.start()
```

`daemon=True` is important: daemon threads are terminated automatically when the main process exits. Without it, the watcher thread would keep the Python process alive after Flask stops, preventing clean shutdown. With `daemon=True`, the thread requires no explicit lifecycle management.

---

## Local vs. Production Behavior

| Environment | Resume change mechanism | Effect of watcher |
|-------------|------------------------|-------------------|
| Local dev | Edit file manually | Picks up change within 60 seconds — no restart needed |
| Heroku production | Deploy new code | Dyno restarts → `_build_resume_index()` runs at startup. Watcher starts but the file never changes in-dyno, so it never fires |

In production, the watcher is a no-op — it runs harmlessly every 60 seconds, computes a hash, finds a match, and does nothing. The cost is one file read per minute, which is negligible.

---

## Design Notes

**Why 60 seconds?** It is a reasonable trade-off between responsiveness and CPU cost for a development workflow. Resume changes are rare and deliberate — there is no need for sub-second detection. The interval is a parameter (`interval: int = 60`) and could be overridden if needed.

**Why not use a filesystem watcher (e.g. `watchdog`)?** A polling loop is simpler and has no additional dependencies. Filesystem watch APIs (inotify on Linux, FSEvents on macOS, ReadDirectoryChangesW on Windows) are OS-specific and require a separate library. For a single file checked once per minute, polling is the pragmatic choice.

**Why not check on every request?** Hashing the file on every chat request would add a file read and a SHA-256 computation to the hot path. 60-second polling keeps the watcher entirely off the request path.

**Thread safety.** `_build_resume_index()` writes to `_resume_collection`, `_resume_chunks_list`, and `_resume_hash` — three module-level globals. In CPython, the GIL prevents data races at the bytecode level, but an in-flight request that calls `_retrieve_context()` could theoretically see `_resume_collection` pointing to the old collection while `_resume_chunks_list` has already been updated. At the scale of this application (a personal resume site), this is an acceptable transient inconsistency — the worst case is one request that returns slightly mismatched results during the rebuild window. A production system handling concurrent traffic would use a lock or an atomic swap pattern.
