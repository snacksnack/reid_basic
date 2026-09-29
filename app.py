import hashlib
import hmac
import json
import logging
import os
import re
import threading
from functools import wraps
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from flask import Flask, Response, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from observability import enable_llm_obs, rag_prompt
from openai import OpenAI
from scripts.emailer import send_notification_email
from werkzeug.middleware.proxy_fix import ProxyFix

IS_PRODUCTION = os.environ.get("FLASK_ENV") == "production"
BASE_DIR = Path(__file__).resolve().parent

if not IS_PRODUCTION:
    load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

if not IS_PRODUCTION:
    CORS(app)

limiter = Limiter(get_remote_address, app=app, storage_uri="memory://", default_limits=[])

# RC1-361: before the Anthropic client exists, so every gunicorn worker traces
# from its first request. No-op without DD_API_KEY.
# RC1-447: the service is the Software Catalog entity's name, which is also
# what the Heroku Release workflow reports to DORA. It used to be "web" — the
# Procfile dyno type — so the catalog entry had no telemetry to join, and the
# site dashboard's one `service:hihelloreid` filter matched nothing.
enable_llm_obs("hihelloreid-chat", service="hihelloreid")

anthropic_client = anthropic.Anthropic() if os.environ.get("ANTHROPIC_API_KEY") else None
openai_client = OpenAI() if os.environ.get("OPENAI_API_KEY") else None

# ---------------------------------------------------------------------------
# /ui-testbed basic auth — gates the in-progress redesign preview.
# Set TESTBED_USER and TESTBED_PASS in the environment to enable access.
# If either is unset the route stays locked (401) so it can never be
# accidentally exposed on the public domain.
# ---------------------------------------------------------------------------
TESTBED_USER = os.environ.get("TESTBED_USER")
TESTBED_PASS = os.environ.get("TESTBED_PASS")


def _testbed_auth_ok(auth) -> bool:
    if not TESTBED_USER or not TESTBED_PASS or auth is None:
        return False
    user_ok = hmac.compare_digest(auth.username or "", TESTBED_USER)
    pass_ok = hmac.compare_digest(auth.password or "", TESTBED_PASS)
    return user_ok and pass_ok


def requires_testbed_auth(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not _testbed_auth_ok(request.authorization):
            return Response(
                "Authentication required.",
                401,
                {"WWW-Authenticate": 'Basic realm="ui-testbed"'},
            )
        return view(*args, **kwargs)

    return wrapper

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

_pool = None


def _get_pool():
    global _pool
    if _pool is None and os.environ.get("DATABASE_URL"):
        import psycopg2.pool

        _pool = psycopg2.pool.SimpleConnectionPool(
            1, 5, dsn=os.environ["DATABASE_URL"], sslmode="require"
        )
    return _pool


def _db_execute(query, params=None):
    """Best-effort INSERT — failures are logged, never raised."""
    pool = _get_pool()
    if not pool:
        return
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
        conn.commit()
    except Exception as e:
        conn.rollback()
        logging.error("DB error: %s", e)
    finally:
        pool.putconn(conn)


def _recent_contact_submissions_count(ip: str) -> int:
    """Count contact rows for this IP in the rolling last hour (for rate limiting)."""
    pool = _get_pool()
    if not pool:
        return 0
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM contact_submissions "
                "WHERE ip_address = %s AND created_at > NOW() - INTERVAL '1 hour'",
                [ip],
            )
            row = cur.fetchone()
            return int(row[0]) if row else 0
    except Exception as e:
        logging.error("contact rate count error: %s", e)
        return 0
    finally:
        pool.putconn(conn)


MAX_CONTACT_SUBMISSIONS_PER_HOUR = 5


def _send_contact_notification_email(
    name: str, visitor_email: str, message: str, ip: str
) -> None:
    body = (
        f"New contact form submission\n\n"
        f"Name: {name}\nEmail: {visitor_email}\nIP: {ip}\n\n{message}"
    )
    try:
        send_notification_email(
            subject=f"Contact form: {name}",
            body=body,
            from_name="Resume Site",
            reply_to=visitor_email,
        )
    except Exception as e:
        logging.error("Failed to send contact email: %s", e)


def submit_contact(name, email, message, ip: str) -> dict:
    """
    Shared path for contact form POST and the send_contact chat tool.

    Returns a dict: {"ok": True} or {"ok": False, "error": str, "message": str}.
    error is one of: validation, rate_limited.
    """
    name = (name or "").strip()
    email = (email or "").strip()
    message = (message or "").strip()

    if not name or not email or not message:
        return {
            "ok": False,
            "error": "validation",
            "message": "Name, email, and message are required.",
        }

    local = email.split("@")[-1] if "@" in email else ""
    if "@" not in email or "." not in local:
        return {
            "ok": False,
            "error": "validation",
            "message": "A valid email address is required.",
        }

    if _recent_contact_submissions_count(ip) >= MAX_CONTACT_SUBMISSIONS_PER_HOUR:
        return {
            "ok": False,
            "error": "rate_limited",
            "message": "Too many submissions — please try again later.",
        }

    _db_execute(
        "INSERT INTO contact_submissions (name, email, message, ip_address) "
        "VALUES (%s, %s, %s, %s)",
        [name, email, message, ip],
    )
    _send_contact_notification_email(name, email, message, ip)
    return {"ok": True}


def _init_db():
    pool = _get_pool()
    if not pool:
        return
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            for ddl in [
                """CREATE TABLE IF NOT EXISTS chat_logs (
                    id SERIAL PRIMARY KEY, session_id TEXT NOT NULL,
                    ip_address TEXT, role TEXT NOT NULL, content TEXT NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW())""",
                """CREATE TABLE IF NOT EXISTS download_logs (
                    id SERIAL PRIMARY KEY, format TEXT NOT NULL,
                    ip_address TEXT, user_agent TEXT, referrer TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW())""",
                """CREATE TABLE IF NOT EXISTS page_views (
                    id SERIAL PRIMARY KEY, path TEXT NOT NULL,
                    ip_address TEXT, user_agent TEXT, referrer TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW())""",
                """CREATE TABLE IF NOT EXISTS contact_submissions (
                    id SERIAL PRIMARY KEY, name TEXT NOT NULL,
                    email TEXT NOT NULL, message TEXT NOT NULL, ip_address TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW())""",
                """CREATE TABLE IF NOT EXISTS tool_usage (
                    id SERIAL PRIMARY KEY, session_id TEXT NOT NULL,
                    ip_address TEXT, tool_name TEXT NOT NULL,
                    tool_args JSONB, tool_result TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW())""",
                # Migration: add raw_message column if it doesn't exist yet
                "ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS raw_message JSONB",
                # Session summaries — written by scripts/summarize_sessions.py
                """CREATE TABLE IF NOT EXISTS chat_summaries (
                    id SERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL UNIQUE,
                    ip_address TEXT,
                    summary TEXT NOT NULL,
                    user_message_count INT,
                    created_at TIMESTAMPTZ DEFAULT NOW())""",
            ]:
                cur.execute(ddl)
        conn.commit()
        print("database tables ready")
    except Exception as e:
        conn.rollback()
        logging.error("DB init error: %s", e)
    finally:
        pool.putconn(conn)


_init_db()


def _load_session_history(session_id: str) -> list:
    """Return all chat messages for a session, ordered oldest-first.

    Each row's raw_message column stores the complete Anthropic message dict
    (user/assistant with content blocks), so the full sequence can be replayed
    faithfully without relying on the client.
    """
    pool = _get_pool()
    if not pool:
        return []
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT raw_message FROM chat_logs "
                "WHERE session_id = %s AND raw_message IS NOT NULL "
                "ORDER BY created_at ASC",
                [session_id],
            )
            return [row[0] for row in cur.fetchall()]
    except Exception as e:
        logging.error("load session history error: %s", e)
        return []
    finally:
        pool.putconn(conn)


def _save_message(session_id: str, ip: str, message: dict) -> None:
    """Persist a single Anthropic message dict to chat_logs.

    Stores the raw dict in raw_message (used for history reconstruction) and
    also extracts role/content for human-readable querying.  content is stored
    as an empty string when it is a list of content blocks (tool use rounds).
    """
    role = message.get("role", "")
    content = message.get("content") or ""
    if not isinstance(content, str):
        content = ""
    _db_execute(
        "INSERT INTO chat_logs (session_id, ip_address, role, content, raw_message) "
        "VALUES (%s, %s, %s, %s, %s)",
        [session_id, ip, role, content, json.dumps(message)],
    )


# ---------------------------------------------------------------------------
# System prompt (static instructions only — resume content retrieved via RAG)
# ---------------------------------------------------------------------------

_instructions_path = BASE_DIR / "src" / "data" / "chatbot-instructions.txt"
_match_instructions_path = BASE_DIR / "src" / "data" / "match-instructions.txt"
_resume_path = BASE_DIR / "src" / "data" / "resume-prompt.txt"
# RC1-478: rendered from the project TS data files by `npm run extract:projects`;
# tests/projectsPrompt.test.ts keeps it current with the /work page sources.
_projects_path = BASE_DIR / "src" / "data" / "projects-prompt.txt"
_instructions_text = _instructions_path.read_text()
# RC1-363: the fit-card rules ride only on /match requests. Sending them on
# every conversational turn cost ~940 input tokens a turn for rules the model
# could not act on.
_match_instructions_text = _match_instructions_path.read_text()

# ---------------------------------------------------------------------------
# RAG: resume chunking, embedding, and retrieval
# ---------------------------------------------------------------------------

# text-embedding-3-small produces 1536-dim vectors; the Pinecone index is
# created with the same dimension and must match, or upserts are rejected.
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
PINECONE_INDEX_NAME = os.environ.get("PINECONE_INDEX", "reid-basic-resume")

_resume_index = None
_resume_namespace: str = ""
# Resume-only chunk texts: /match retrieves exactly this many chunks with a
# source=resume filter, so its full-coverage semantics are unchanged by the
# project corpus (RC1-478).
_resume_chunks_list: list[str] = []
_corpus_chunk_count: int = 0
# Hash of resume-prompt.txt + projects-prompt.txt together — a change to
# either file rebuilds the index (RC1-478 widened this from resume-only).
_resume_hash: str = ""
# The portfolio-catalog paragraph (all nine projects, one line each) rides in
# the chat system prompt every turn: enumeration questions like "what other
# projects does he have?" cannot be answered from top-k chunk retrieval, so
# the roster is always in context and RAG supplies the depth (RC1-479).
_project_catalog_text: str = ""
_CATALOG_SLUG = "portfolio"


def _embed(texts: list[str]) -> list[list[float]]:
    """Embed texts with OpenAI directly (RC1-440 dropped the wrapper that used
    to hide this call inside the vector-DB client)."""
    response = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    return [item.embedding for item in response.data]


def _chunk_resume(text: str) -> list[dict]:
    """
    Split the resume into self-contained semantic chunks for vector indexing.

    Strategy: paragraph-based splitting on double newlines, with special
    handling for employer sub-sections.  Each sub-section chunk is prefixed
    with the parent employer line so it reads correctly in isolation — a
    property called "self-containedness" that matters for retrieval quality:
    a chunk like "Program Leadership & Delivery: ..." is ambiguous without
    knowing it belongs to Marigold 2021–2026.

    Returns a list of dicts with "text" and "metadata" keys.  The metadata
    is stored in Pinecone alongside the vector and can be used for filtered
    retrieval or debugging (e.g., "show only experience chunks").
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[dict] = []
    current_employer: str | None = None

    # Bare section headers carry no retrievable facts on their own.
    BARE_MARKERS = {"PROFESSIONAL EXPERIENCE"}

    for para in paragraphs:
        lines = para.split("\n")
        first_line = lines[0]

        # Skip bare structural markers.
        if para in BARE_MARKERS:
            continue

        # Standalone employer header: a single line containing " — " and year
        # digits (e.g. "Marigold — Senior TPM — 2021–2026").  We track it as
        # context for the sub-sections that follow but do not index it alone
        # because it contains no searchable facts by itself.
        if (
            len(lines) == 1
            and " — " in first_line
            and any(c.isdigit() for c in first_line)
        ):
            current_employer = first_line
            continue

        # Sub-section under an employer (e.g. "Program Leadership & Delivery:").
        # Prefix with the employer line so the chunk is fully self-contained.
        if first_line.endswith(":") and current_employer:
            employer_name = current_employer.split(" — ")[0].strip()
            chunks.append(
                {
                    "text": f"{current_employer}\n\n{para}",
                    "metadata": {
                        "section": "experience",
                        "employer": employer_name,
                        "subsection": first_line.rstrip(":"),
                    },
                }
            )
            continue

        # Employer block with inline content (employer line + bullets, no
        # sub-section headers).  Example: "Cheetah Digital — TPM — 2015–2021
        # \n• Led Agile delivery..."
        if " — " in first_line and any(c.isdigit() for c in first_line) and len(lines) > 1:
            current_employer = first_line
            employer_name = first_line.split(" — ")[0].strip()
            chunks.append(
                {
                    "text": para,
                    "metadata": {"section": "experience", "employer": employer_name},
                }
            )
            continue

        # Named sections (SUMMARY, TECHNICAL SKILLS, etc.) and the contact
        # header block fall through to here.
        SECTION_LABELS = {
            "SUMMARY": "summary",
            "TECHNICAL SKILLS": "skills",
            "EDUCATION": "education",
            "CERTIFICATIONS": "certifications",
        }
        section = SECTION_LABELS.get(first_line, "contact" if not chunks else "other")

        # Merge CERTIFICATIONS into the preceding EDUCATION chunk rather than
        # indexing it alone.  Both sections are very short (1–2 lines each),
        # which gives the embedder little to work with.  A combined chunk has
        # richer signal and ensures questions about either topic retrieve it.
        if section == "certifications" and chunks and chunks[-1]["metadata"]["section"] == "education":
            chunks[-1]["text"] += f"\n\n{para}"
            chunks[-1]["metadata"]["section"] = "education_and_certifications"
        else:
            chunks.append({"text": para, "metadata": {"section": section}})

    return chunks


_PROJECT_HEADER = re.compile(
    r"^Project: (?P<name>.+?)(?: — (?P<aspect>.+?))? \[(?P<slug>[a-z0-9-]+)\]$"
)


def _chunk_projects(text: str) -> list[dict]:
    """
    Split projects-prompt.txt into chunks for vector indexing (RC1-478).

    The extractor already did the semantic work: every blank-line-separated
    paragraph is self-contained and opens with a "Project: <name> [<slug>]"
    header (optionally "— <aspect>" for a facet like decisions or pipeline).
    This side just splits and parses the header into metadata, mirroring what
    section/employer are to the resume chunks: `project` is the ground-truth
    label the retrieval eval keys on.
    """
    chunks: list[dict] = []
    for para in (p.strip() for p in text.split("\n\n")):
        if not para:
            continue
        match = _PROJECT_HEADER.match(para.split("\n", 1)[0])
        if not match:
            logging.warning(
                "projects-prompt paragraph without a Project header skipped: %r",
                para[:80],
            )
            continue
        metadata = {
            "section": "project",
            "project": match["slug"],
            "project_name": match["name"],
        }
        if match["aspect"]:
            metadata["aspect"] = match["aspect"]
        chunks.append({"text": para, "metadata": metadata})
    return chunks


def _corpus_hash() -> str:
    """Fingerprint of everything the index is built from."""
    return hashlib.sha256(
        _resume_path.read_bytes() + _projects_path.read_bytes()
    ).hexdigest()


def _build_resume_index() -> None:
    """
    Index the resume chunks in Pinecone at application startup (RC1-440).

    Pinecone is a hosted, serverless vector DB, so the index survives dyno
    restarts — unlike the previous in-process ChromaDB store, which Heroku's
    ephemeral filesystem forced to re-embed on every boot.  Each corpus
    version (resume + projects, RC1-478) gets its own namespace,
    ``kb-<sha256[:12]>``: when the current version's namespace is already
    populated, startup skips the embeddings call entirely and just takes a
    handle; when either source file changes, the new namespace is filled and
    stale ones are deleted.

    Embeddings are computed by calling the OpenAI embeddings API directly
    (see _embed) — the chunk text rides along as Pinecone metadata so a query
    returns the text, not just ids.
    """
    global _resume_index, _resume_namespace, _resume_chunks_list, _resume_hash
    global _corpus_chunk_count, _project_catalog_text

    # The catalog rides in the system prompt independent of the vector index,
    # so refresh it before the key check: it must be current even in the
    # no-index fallback mode, and on every watcher-triggered rebuild.
    all_project_chunks = _chunk_projects(_projects_path.read_text())
    _project_catalog_text = next(
        (
            c["text"]
            for c in all_project_chunks
            if c["metadata"]["project"] == _CATALOG_SLUG
        ),
        "",
    )
    if not _project_catalog_text:
        logging.warning(
            "projects-prompt.txt has no %r catalog paragraph — "
            "enumeration questions will degrade to top-k retrieval",
            _CATALOG_SLUG,
        )

    missing = (
        "OPENAI_API_KEY"
        if not openai_client
        else "PINECONE_API_KEY" if not os.environ.get("PINECONE_API_KEY") else None
    )
    if missing:
        # Record the hash even though nothing is indexed, otherwise the
        # watcher sees a mismatch on every tick and re-logs this warning
        # once a minute for the life of the process.  The warning fires
        # again only when the corpus text actually changes.
        _resume_hash = _corpus_hash()
        logging.warning(
            "RAG index skipped: %s not set — "
            "falling back to full corpus text in system prompt",
            missing,
        )
        return

    try:
        from pinecone import Pinecone, ServerlessSpec

        resume_chunks = [
            {**c, "metadata": {**c["metadata"], "source": "resume"}}
            for c in _chunk_resume(_resume_path.read_text())
        ]
        project_chunks = [
            {**c, "metadata": {**c["metadata"], "source": "project"}}
            for c in all_project_chunks
        ]
        chunk_dicts = resume_chunks + project_chunks
        chunk_texts = [c["text"] for c in chunk_dicts]
        corpus_hash = _corpus_hash()
        namespace = f"kb-{corpus_hash[:12]}"

        pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
        if not pc.has_index(PINECONE_INDEX_NAME):
            pc.create_index(
                PINECONE_INDEX_NAME,
                dimension=EMBEDDING_DIMENSIONS,
                # Cosine is standard for text embeddings; OpenAI's vectors are
                # normalised, so magnitude carries no meaning to preserve.
                metric="cosine",
                # us-east-1 on AWS is the one region Pinecone's free tier allows.
                spec=ServerlessSpec(cloud="aws", region="us-east-1"),
            )
        index = pc.Index(PINECONE_INDEX_NAME)

        stats = index.describe_index_stats()
        namespaces = dict(stats.namespaces or {})
        existing = namespaces.get(namespace)
        if existing is not None and getattr(existing, "vector_count", 0) == len(chunk_dicts):
            logging.info(
                "RAG index ready: reusing %d vectors in namespace %s",
                len(chunk_dicts),
                namespace,
            )
        else:
            embeddings = _embed(chunk_texts)
            index.upsert(
                vectors=[
                    {
                        "id": f"chunk_{i}",
                        "values": embeddings[i],
                        # The text lives in metadata so retrieval is a single
                        # query — no side lookup to map ids back to content.
                        "metadata": {**chunk_dicts[i]["metadata"], "text": chunk_texts[i]},
                    }
                    for i in range(len(chunk_dicts))
                ],
                namespace=namespace,
                show_progress=False,
            )
            # Namespaces for older resume versions are dead weight; retire
            # them so the index only ever holds the current resume.
            for stale in namespaces:
                if stale != namespace:
                    index.delete(delete_all=True, namespace=stale)
            logging.info(
                "RAG index ready: %d chunks embedded into namespace %s",
                len(chunk_dicts),
                namespace,
            )

        _resume_index = index
        _resume_namespace = namespace
        _resume_chunks_list = [c["text"] for c in resume_chunks]
        _corpus_chunk_count = len(chunk_dicts)
        _resume_hash = corpus_hash

    except Exception as e:
        logging.error(
            "Failed to build RAG index: %s — "
            "falling back to full resume text in system prompt",
            e,
        )
        _resume_index = None


def _fallback_text(source: str | None) -> str:
    """Full corpus text for when the vector index cannot answer.

    Resume-filtered callers (/match) get the resume alone; the general chat
    path gets resume + projects so a degraded index still answers project
    questions — larger prompt, but this is already the degraded mode.
    """
    if source == "resume":
        return _resume_path.read_text()
    return f"{_resume_path.read_text()}\n\n---\n\n{_projects_path.read_text()}"


def _retrieve_context(query: str, n_results: int = 3, source: str | None = None) -> str:
    """
    Query the vector index for the top-n most relevant corpus chunks.

    The query text is embedded with the same OpenAI model as the chunks, and
    Pinecone returns the nearest stored vectors by cosine similarity — higher
    score means more similar (the old ChromaDB logs reported *distance*,
    where lower was better; dashboards reading these lines should use score).

    `source` filters by chunk origin ("resume" or "project", RC1-478): /match
    passes "resume" so the fit card keeps its full-resume-coverage semantics;
    the chat path passes None and searches the whole corpus.

    Falls back to the full corpus text if the index is unavailable (missing
    API key in local dev, or _build_resume_index raised), if the query
    raises, or if it returns nothing — a fresh upsert is eventually
    consistent, so the first request after indexing a new corpus version can
    land before the vectors are queryable.
    """
    if _resume_index is None:
        return _fallback_text(source)

    try:
        cap = len(_resume_chunks_list) if source == "resume" else _corpus_chunk_count
        n = min(n_results, cap) if cap else n_results
        results = _resume_index.query(
            top_k=n,
            vector=_embed([query])[0],
            namespace=_resume_namespace,
            include_metadata=True,
            **({"filter": {"source": {"$eq": source}}} if source else {}),
        )
        matches = list(results.matches or [])
        if not matches:
            logging.warning(
                "RAG query returned no matches (fresh namespace still indexing?) — "
                "falling back to full corpus text"
            )
            return _fallback_text(source)

        chunks: list[str] = []
        for i, match in enumerate(matches):
            meta = match.metadata or {}
            logging.info(
                "RAG retrieved chunk %d/%d — source=%s section=%s employer=%s "
                "project=%s score=%.4f query=%r",
                i + 1,
                len(matches),
                meta.get("source", "?"),
                meta.get("section", "?"),
                meta.get("employer", "—"),
                meta.get("project", "—"),
                match.score,
                query[:60],
            )
            chunks.append(meta.get("text", ""))

        return "\n\n---\n\n".join(c for c in chunks if c)
    except Exception as e:
        logging.error("RAG retrieval error: %s — falling back to full corpus text", e)
        return _fallback_text(source)


_build_resume_index()


def _watch_resume(interval: int = 60) -> None:
    """
    Background thread: check whether resume-prompt.txt or projects-prompt.txt
    has changed every `interval` seconds.  If the combined SHA-256 hash
    differs from the hash stored when the index was last built, rebuild the
    index automatically.

    This is the hash-based cache invalidation pattern.  A hash uniquely
    represents the file *content* — any edit, however small, produces a
    completely different fingerprint.  Comparing hashes at two points in time
    tells us conclusively whether the file changed without reading the whole
    file into memory for a diff.

    In production (Heroku), the dyno restarts on every deploy, so the index
    is always rebuilt from the latest resume automatically.  This watcher is
    primarily useful in local development: edit resume-prompt.txt, and the
    running Flask server picks up the change within 60 seconds — no restart
    required.
    """
    while True:
        threading.Event().wait(interval)
        try:
            _rebuild_index_if_resume_changed()
        except Exception as e:
            logging.error("Resume watcher error: %s", e)


def _rebuild_index_if_resume_changed() -> bool:
    """One watcher tick: rebuild the index if either corpus file changed.

    Returns True when a rebuild was triggered.  Split out of the thread loop
    so the change detection can be tested without sleeping.
    """
    current_hash = _corpus_hash()
    if current_hash == _resume_hash:
        return False
    logging.info("RAG corpus text changed — rebuilding index")
    _build_resume_index()
    return True


_watcher = threading.Thread(target=_watch_resume, daemon=True)
_watcher.start()

MAX_CONVERSATION_MESSAGES = 20
MAX_TOOL_ROUNDS = 3

# Upper bound on the job-description body sent to the role-fit matcher. The
# normal chat path trims to a token budget; the /match path sends the raw body
# directly, so cap it to avoid an oversized/expensive call (e.g. a recruiter
# pasting an entire HTML page). A real JD front-loads the relevant detail well
# within this limit.
MATCH_MAX_CHARS = 8000

# Output token budget for the structured fit card. Higher than the regular chat
# path because the card packs several arrays (strengths/transferable/gaps) plus
# a summary; too low risks a truncated tool call that silently falls back.
MATCH_MAX_TOKENS = 1200

# Model shared by the conversational chat path and the role-fit matcher, so the
# two never silently diverge. Overridable via env for easy upgrades.
CHAT_MODEL = os.environ.get("ANTHROPIC_CHAT_MODEL", "claude-haiku-4-5-20251001")

# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "schedule_meeting",
        "description": (
            "Return Reid's scheduling link. Call it as soon as a visitor wants to "
            "talk to, meet, interview, or reach Reid."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": "What the visitor wants to discuss, in a few words.",
                },
            },
        },
    },
    {
        "name": "send_contact",
        "description": (
            "Deliver a written message from the visitor to Reid, like the site's "
            "contact form. Call only with the visitor's real name, email, and message "
            "as they gave them."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Visitor's name."},
                "email": {"type": "string", "description": "Visitor's email, for Reid's reply."},
                "message": {"type": "string", "description": "The message for Reid."},
            },
            "required": ["name", "email", "message"],
        },
    },
]


# The role-fit matcher forces this tool so the model returns structured fields
# (validated by the API) instead of free-text JSON we'd have to parse. It is NOT
# part of the general TOOLS list — it is only offered on a "/match" request.
FIT_CARD_TOOL = {
    "name": "render_fit_card",
    "description": (
        "Render a structured, honest assessment of how Reid Collins fits a job "
        "description. Base every field strictly on the retrieved résumé context. "
        "Always include real gaps — honesty is the point of this feature."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "role_title": {
                "type": "string",
                "description": "The role/title from the job description, e.g. 'Senior Backend Engineer'.",
            },
            "verdict": {
                "type": "string",
                "enum": ["strong", "good", "partial"],
                "description": "Honest overall fit judgment.",
            },
            "verdict_label": {
                "type": "string",
                "description": "Short pill label matching the verdict, e.g. 'Strong fit', 'Good fit, some gaps', 'Partial fit'.",
            },
            "strengths": {
                "type": "array",
                "items": {"type": "string"},
                "description": "2-4 concrete, evidence-based matches drawn directly from the résumé.",
            },
            "transferable": {
                "type": "array",
                "items": {"type": "string"},
                "description": "1-3 adjacent areas where Reid would ramp quickly; name the adjacency.",
            },
            "gaps": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Only genuine gaps the role clearly needs that the résumé does not "
                    "demonstrate (or a close equivalent). Verify against the full skills/tools "
                    "lists and every experience bullet first. Prefer 1-3, but may be empty for a "
                    "strong fit — never manufacture a gap."
                ),
            },
            "summary": {
                "type": "string",
                "description": "2-3 sentence honest verdict acknowledging the main gap and genuine strengths.",
            },
        },
        "required": [
            "role_title",
            "verdict",
            "verdict_label",
            "strengths",
            "transferable",
            "gaps",
            "summary",
        ],
    },
}


def _build_fit_card(tool_input: dict, sections_reviewed: int) -> dict:
    """Normalize the render_fit_card tool input into the camelCase shape the
    frontend FitCard component expects. Defensive against a missing/odd field
    even though the API validates the schema."""

    def _as_list(value):
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    verdict = tool_input.get("verdict")
    if verdict not in ("strong", "good", "partial"):
        verdict = "good"

    return {
        "roleTitle": (tool_input.get("role_title") or "this role").strip(),
        "verdict": verdict,
        "verdictLabel": (tool_input.get("verdict_label") or "Fit assessment").strip(),
        "strengths": _as_list(tool_input.get("strengths")),
        "transferable": _as_list(tool_input.get("transferable")),
        "gaps": _as_list(tool_input.get("gaps")),
        "summary": (tool_input.get("summary") or "").strip(),
        "sectionsReviewed": sections_reviewed,
    }


def execute_tool_call(name, args, *, client_ip="unknown"):
    if name == "schedule_meeting":
        scheduling_url = os.environ.get("SCHEDULING_URL")
        if not scheduling_url:
            return json.dumps(
                {
                    "available": False,
                    "fallback_email": "hire.reid.collins@gmail.com",
                    "message": "Online scheduling is not currently configured. "
                    "Suggest the visitor email Reid directly.",
                }
            )
        return json.dumps(
            {
                "available": True,
                "scheduling_link": f"[scheduling link]({scheduling_url})",
                "instructions": "Include the scheduling_link value EXACTLY as-is in your reply. Do not alter the URL.",
                "topic": args.get("topic"),
            }
        )
    if name == "send_contact":
        result = submit_contact(
            args.get("name"),
            args.get("email"),
            args.get("message"),
            client_ip,
        )
        if result["ok"]:
            return json.dumps(
                {
                    "ok": True,
                    "message": "Submission was recorded. Confirm briefly with the visitor.",
                }
            )
        return json.dumps(
            {
                "ok": False,
                "error": result["error"],
                "message": result["message"],
            }
        )
    return json.dumps({"error": f"Unknown tool: {name}"})


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------


@app.errorhandler(429)
def ratelimit_handler(_e):
    if request.path == "/api/contact":
        msg = "Too many submissions — please try again later."
    else:
        msg = "Too many requests — please try again later."
    return jsonify({"error": msg}), 429


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.post("/api/pageview")
def pageview():
    data = request.get_json(silent=True) or {}
    ip = request.remote_addr or "unknown"
    _db_execute(
        "INSERT INTO page_views (path, ip_address, user_agent, referrer) "
        "VALUES (%s, %s, %s, %s)",
        [
            data.get("path", "/"),
            ip,
            request.headers.get("User-Agent", ""),
            data.get("referrer", ""),
        ],
    )
    return "", 204


@app.post("/api/contact")
def contact():
    data = request.get_json(silent=True) or {}
    ip = request.remote_addr or "unknown"
    result = submit_contact(
        data.get("name"), data.get("email"), data.get("message"), ip
    )
    if result["ok"]:
        return jsonify({"ok": True})
    status_code = 429 if result["error"] == "rate_limited" else 400
    return jsonify({"error": result["message"]}), status_code


@app.post("/api/chat")
@limiter.limit("20 per hour")
def chat():
    try:
        data = request.get_json(silent=True) or {}
        message = data.get("message")
        session_id = data.get("sessionId", "no-session")

        if not message or not isinstance(message, str) or not message.strip():
            return jsonify({"error": "message is required"}), 400

        raw_query = message.strip()
        is_match = raw_query.lower().startswith("/match")
        match_body = raw_query[len("/match"):].strip() if is_match else ""

        # Cap the job-description body before it reaches the model (cost/context).
        if len(match_body) > MATCH_MAX_CHARS:
            logging.info(
                "Truncating /match job description from %d to %d chars",
                len(match_body),
                MATCH_MAX_CHARS,
            )
            match_body = match_body[:MATCH_MAX_CHARS]

        # "/match" with no job description: a static prompt, no model call needed.
        if is_match and not match_body:
            return jsonify(
                {
                    "reply": "Paste a job description and I'll break down how Reid's "
                    "background fits — strengths, transferable experience, and any "
                    "honest gaps."
                }
            )

        if not anthropic_client:
            return jsonify({"error": "Chat is not configured"}), 503

        ip = request.remote_addr or "unknown"

        # Persist the user's message first, then load the full history from the
        # database.  The server — not the client — is the source of truth for
        # the conversation.  This prevents a caller from injecting fake prior
        # turns (e.g. fabricated assistant messages or tool results) into the
        # context that the LLM sees.
        user_message = {"role": "user", "content": message.strip()}
        _save_message(session_id, ip, user_message)

        history = _load_session_history(session_id)
        # Guard against DB unavailability: _save_message() is best-effort and
        # may be a no-op if there is no database connection, in which case
        # _load_session_history() returns [].  Ensure the current user message
        # is always present in the messages sent to the model — without it the
        # model receives only a system prompt and generates a default greeting
        # rather than responding to the actual question.
        last = history[-1] if history else {}
        if not (last.get("role") == "user" and last.get("content") == user_message["content"]):
            history = history + [user_message]
        trimmed = history[-MAX_CONVERSATION_MESSAGES:]

        # Determine retrieval parameters.  The /match command receives a full
        # job description as its query body — that is naturally rich for
        # semantic search, so we retrieve all resume chunks (source-filtered,
        # RC1-478: the fit card judges the resume, not the project corpus) to
        # guarantee full resume coverage.  For ordinary conversational
        # messages, top-4 over the whole corpus is enough: most questions
        # target one area (an employer, a skill, a project) and returning
        # more chunks adds noise.
        if is_match:
            retrieval_query = match_body or raw_query
            n_results = len(_resume_chunks_list) if _resume_chunks_list else 10
        else:
            prior_assistant = next(
                (m.get("content", "") for m in reversed(trimmed)
                 if m.get("role") == "assistant" and isinstance(m.get("content"), str)),
                "",
            )
            if len(raw_query.split()) < 5 and prior_assistant:
                retrieval_query = f"{prior_assistant} {raw_query}"
            else:
                retrieval_query = raw_query
            # 6 of 48 corpus chunks (RC1-479 bumped from 4-of-10-resume-era):
            # project questions often need an overview chunk plus a facet.
            n_results = 6

        context = _retrieve_context(
            retrieval_query,
            n_results=n_results,
            source="resume" if is_match else None,
        )

        instructions = _instructions_text
        if is_match:
            instructions = f"{instructions}\n\n{_match_instructions_text}"
        elif _project_catalog_text:
            # Enumeration questions ("what other projects?") can't be answered
            # from top-k retrieval; the full roster rides along every chat turn
            # (RC1-479). /match is excluded — it judges the resume.
            instructions = (
                f"{instructions}\n\n"
                f"Full catalog of Reid's projects (the retrieved context below "
                f"adds depth on any of them):\n{_project_catalog_text}"
            )
        system_content = (
            f"{instructions}\n\n"
            f"---\n\n"
            f"Relevant context about Reid, retrieved for this query "
            f"(resume and/or project write-ups):\n\n{context}"
        )

        # Role-fit matcher: a single forced-tool call so the model returns
        # structured, schema-validated fields the frontend renders as a fit card,
        # rather than free-text we'd have to parse. Bypasses the conversational
        # tool loop (no scheduling/contact during an analysis).
        if is_match:
            sections_reviewed = len(_resume_chunks_list) if _resume_chunks_list else n_results
            tool_block = None
            try:
                match_response = anthropic_client.messages.create(
                    model=CHAT_MODEL,
                    system=system_content,
                    messages=[{"role": "user", "content": match_body}],
                    tools=[FIT_CARD_TOOL],
                    tool_choice={"type": "tool", "name": "render_fit_card"},
                    max_tokens=MATCH_MAX_TOKENS,
                    # anthropic 1.x dropped temperature from the create() signature;
                    # Haiku 4.5 still accepts it on the wire, so keep the sampling
                    # behavior unchanged via extra_body.
                    extra_body={"temperature": 0.4},
                )
                tool_block = next(
                    (
                        b
                        for b in match_response.content
                        if b.type == "tool_use" and b.name == "render_fit_card"
                    ),
                    None,
                )
            except anthropic.AuthenticationError as e:
                # Bad/expired key — a config problem, not a transient failure.
                # Surface it loudly so it isn't mistaken for a flaky model.
                logging.error("Role-fit match auth error (check ANTHROPIC_API_KEY): %s", e)
            except anthropic.APIStatusError as e:
                # Other 4xx/5xx (rate limit, overload, server error): log the
                # status so transient issues are distinguishable from config ones.
                logging.error(
                    "Role-fit match API error (status %s): %s",
                    getattr(e, "status_code", "?"),
                    e,
                )
            except Exception as e:
                logging.error("Role-fit match error: %s", e)

            if not tool_block:
                # No tool call came back — an API error (logged above) or a
                # truncated/empty response. Log so silent degradation is visible.
                logging.warning(
                    "Role-fit match produced no fit card; returning fallback "
                    "(possible truncation at max_tokens=%d or API error).",
                    MATCH_MAX_TOKENS,
                )
                fallback = (
                    "I couldn't analyze that role right now. Please try again in a "
                    "moment, or email Reid directly at hire.reid.collins@gmail.com."
                )
                _save_message(session_id, ip, {"role": "assistant", "content": fallback})
                return jsonify({"reply": fallback})

            fit_card = _build_fit_card(tool_block.input or {}, sections_reviewed)
            follow_up = (
                "Want me to go deeper on any of these — the gaps, a specific "
                "requirement, or whether he's senior enough?"
            )
            # Persist a readable summary so later turns have context.
            _save_message(
                session_id,
                ip,
                {
                    "role": "assistant",
                    "content": (
                        f"[Role-fit: {fit_card['verdictLabel']} for "
                        f"{fit_card['roleTitle']}] {fit_card['summary']}"
                    ),
                },
            )
            return jsonify({"reply": follow_up, "fitCard": fit_card})

        api_messages = trimmed

        # RC1-444: the hallucination judge checks each answer against this
        # grounding text. Tool results join it as they arrive, so an answer
        # quoting calendar slots isn't judged unsupported by the resume.
        # RC1-480: the catalog joins it for the same reason — it rides in the
        # system prompt, so the judge must see it too, or every enumeration
        # answer ("all nine projects...") is judged unsupported by the six
        # retrieved chunks and pages a false-positive P2.
        grounding = (
            f"{_project_catalog_text}\n\n---\n\n{context}"
            if _project_catalog_text
            else context
        )
        reply = None
        for _ in range(MAX_TOOL_ROUNDS):
            with rag_prompt(raw_query, grounding):
                response = anthropic_client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    system=system_content,
                    messages=api_messages,
                    tools=TOOLS,
                    max_tokens=500,
                    # See the /match call above: temperature moved to extra_body for
                    # the anthropic 1.x SDK without changing sampling behavior.
                    extra_body={"temperature": 0.7},
                )

            tool_use_blocks = [b for b in response.content if b.type == "tool_use"]

            if tool_use_blocks:
                assistant_content = []
                for block in response.content:
                    if block.type == "text":
                        assistant_content.append({"type": "text", "text": block.text})
                    elif block.type == "tool_use":
                        assistant_content.append({
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": block.input,
                        })

                assistant_tool_msg = {"role": "assistant", "content": assistant_content}
                api_messages.append(assistant_tool_msg)
                _save_message(session_id, ip, assistant_tool_msg)

                tool_results: list = []
                for block in tool_use_blocks:
                    args = block.input or {}
                    result = execute_tool_call(block.name, args, client_ip=ip)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })

                    _db_execute(
                        "INSERT INTO tool_usage "
                        "(session_id, ip_address, tool_name, tool_args, tool_result) "
                        "VALUES (%s, %s, %s, %s, %s)",
                        [session_id, ip, block.name, json.dumps(args), result],
                    )

                grounding += "".join(
                    f"\n\n---\n\nResult of tool {b.name}:\n\n{r['content']}"
                    for b, r in zip(tool_use_blocks, tool_results)
                )
                tool_result_msg = {"role": "user", "content": tool_results}
                api_messages.append(tool_result_msg)
                _save_message(session_id, ip, tool_result_msg)
                continue

            # No tool use — extract the text reply.
            text_blocks = [b.text for b in response.content if b.type == "text"]
            reply = " ".join(text_blocks) if text_blocks else None
            break

        if not reply:
            reply = "Sorry, I couldn't generate a response."

        _save_message(session_id, ip, {"role": "assistant", "content": reply})

        return jsonify({"reply": reply})

    except Exception as e:
        logging.error("Chat API error: %s", e)
        return jsonify({"error": "Failed to generate response"}), 500


VALID_FORMATS = {"pdf": "reidcollins.pdf", "docx": "reidcollins.docx"}


@app.get("/api/download/<fmt>")
def download(fmt):
    filename = VALID_FORMATS.get(fmt)
    if not filename:
        return jsonify({"error": "invalid format"}), 404

    ip = request.remote_addr or "unknown"
    _db_execute(
        "INSERT INTO download_logs (format, ip_address, user_agent, referrer) "
        "VALUES (%s, %s, %s, %s)",
        [fmt, ip, request.headers.get("User-Agent", ""), request.headers.get("Referer", "")],
    )

    docs_dir = BASE_DIR / ("dist" if IS_PRODUCTION else "public") / "docs"
    filepath = docs_dir / filename
    if not filepath.is_file():
        return jsonify({"error": "File not found"}), 404

    return send_file(filepath, as_attachment=True, download_name=filename)


# ---------------------------------------------------------------------------
# SPA static serving (production only)
# ---------------------------------------------------------------------------


def _static_asset(root: str, path: str) -> str | None:
    """Return `path` relative to `root` if it names a file inside `root`.

    `path` is user input from the URL. Normalise the joined path and require
    it to stay under `root` before touching the filesystem; anything else —
    traversal, an absolute path, a directory, a miss — returns None and the
    caller serves the SPA shell instead (CodeQL py/path-injection, RC1-368).
    """
    if not path:
        return None
    candidate = os.path.normpath(os.path.join(root, path))
    if not candidate.startswith(root + os.sep) or not os.path.isfile(candidate):
        return None
    return os.path.relpath(candidate, root)


if IS_PRODUCTION:

    @app.route("/ui-testbed")
    @requires_testbed_auth
    def ui_testbed():
        # Isolated redesign preview. Static rule wins over the catch-all below,
        # so the live site at "/" is never affected.
        return send_from_directory(str(BASE_DIR / "dist"), "ui-testbed.html")

    @app.route("/")
    @app.route("/<path:path>")
    def serve_spa(path=""):
        dist = str(BASE_DIR / "dist")
        asset = _static_asset(dist, path)
        return send_from_directory(dist, asset if asset else "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3001))
    app.run(host="0.0.0.0", port=port, debug=not IS_PRODUCTION)
