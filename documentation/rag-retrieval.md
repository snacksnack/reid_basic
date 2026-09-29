# RAG-Based Resume Retrieval

## Overview

The chatbot uses **Retrieval-Augmented Generation (RAG)** to answer questions about Reid's background. Instead of loading the full resume text into the system prompt on every request, the application embeds the resume into a hosted vector database (Pinecone) and retrieves only the most relevant sections for each incoming message. The retrieved text is then injected into the system prompt dynamically, giving the model focused, query-relevant context.

This is a deliberate learning exercise — the resume is small enough that full-context injection would work fine. The value here is operational familiarity with the RAG pattern, which is standard practice when working with large corpora (documentation sets, knowledge bases, codebases) where you cannot fit everything into a single prompt.

---

## Why RAG Instead of Full-Context Injection

Stuffing the entire resume into every system prompt is the simplest approach and works at this scale. RAG is better practice for several reasons:

**Token efficiency.** Every token in the context window costs money and latency. RAG sends only the relevant subset of a document corpus, not the whole thing. At resume scale this is negligible; at production scale (e.g. thousands of support articles) it is the difference between a working system and one that is too slow and expensive to run.

**Relevance focus.** Models perform better when the context they receive is tightly relevant to the question. Flooding the context with unrelated sections can dilute the signal — the model must distinguish what matters from what does not. Retrieved context is pre-filtered before the model ever sees it.

**Scalability.** A RAG pipeline works the same way whether the corpus has 10 chunks or 10 million. Switching from full-context injection to RAG later — once the corpus grows — is much harder than designing for it from the start.

---

## Architecture

```
User message
    │
    ▼
Embed query (text-embedding-3-small)
    │
    ▼
Cosine similarity search (Pinecone serverless index)
    │
    ▼
Top-k most relevant resume chunks
    │
    ▼
Inject chunks into system prompt
    │
    ▼
Anthropic chat completion (Claude Haiku 4.5)
    │
    ▼
Response to user
```

At startup, the resume is chunked and — unless the current resume version is already indexed — each chunk is embedded and upserted into Pinecone. At request time, the user's message is embedded and compared against the stored vectors. The closest matches are pulled and placed into the system prompt under a `Relevant resume context` heading.

---

## Step 1: Chunking

**File:** `app.py → _chunk_resume()`

The resume is split into semantic chunks based on its natural structure. The chunking strategy matters: chunks that are too large return more tokens than needed; chunks that are too small lose context and become ambiguous.

### Strategy: paragraph-based, section-aware

The resume is split on double newlines (`\n\n`), which correspond to its logical paragraph boundaries. Additional logic handles two resume-specific patterns:

**Standalone employer headers.** A line like `Zeta Global (acquired Marigold, November 2025) — Senior TPM — 2021–2026` is a single-line paragraph that contains no searchable facts on its own. It is not indexed as a chunk — instead it is tracked as context for the sub-sections that follow.

**Sub-section prefixing (self-containedness).** Marigold's work is divided into sub-sections: `Program Leadership & Delivery:`, `Platform & Backend Systems:`, etc. If a sub-section chunk were stored without its employer header, a query like "what did Reid do at Marigold?" would retrieve a chunk that reads:

```
Program Leadership & Delivery:
• Led delivery of multiple cross-functional initiatives...
```

This chunk is ambiguous — it does not say who or when. The chunker prefixes every sub-section with its employer line:

```
Zeta Global (acquired Marigold, November 2025) — Senior TPM — 2021–2026

Program Leadership & Delivery:
• Led delivery of multiple cross-functional initiatives...
```

Now the chunk is fully self-contained. **Self-containedness** is one of the most important properties of a well-chunked corpus — a retrieved chunk must make sense in isolation, without assuming the model has seen the surrounding document.

### Resulting chunks (10 total)

| ID | Section | Content |
|----|---------|---------|
| chunk_0 | contact | Name, title, location, email |
| chunk_1 | summary | Professional summary paragraph |
| chunk_2 | experience / Marigold | Program Leadership & Delivery bullets |
| chunk_3 | experience / Marigold | Platform & Backend Systems bullets |
| chunk_4 | experience / Marigold | Machine Learning / Data Platform bullets |
| chunk_5 | experience / Marigold | Observability & Reliability bullets |
| chunk_6 | experience / Cheetah Digital | All bullets (no sub-sections) |
| chunk_7 | experience / CheetahMail | All bullets (no sub-sections) |
| chunk_8 | skills | Technical skills by category |
| chunk_9 | education_and_certifications | Degree, institution, and CSM certification |

Education and certifications are merged into a single chunk. Each section is only 1–2 lines, which gives the embedding model little to work with in isolation. A combined chunk has richer semantic signal and ensures a question about either topic retrieves it reliably.

### Metadata

Each chunk is stored with structured metadata (section, employer, subsection where applicable, plus the chunk text itself). Pinecone stores this alongside the vector and it can be used for **filtered retrieval** — for example, a future feature could restrict queries to `section == "experience"` only. For this implementation the `text` field is load-bearing (a query returns the chunk content directly, with no side lookup) and the rest primarily serves debugging: you can inspect the stored records and see which section each chunk came from.

---

## Step 2: Embedding

**Model:** `text-embedding-3-small` (OpenAI)

An embedding model converts text into a dense numerical vector — a list of floating-point numbers (1536 dimensions for this model) that encodes the semantic meaning of the text. Texts with similar meaning produce vectors that are geometrically close to each other in this high-dimensional space.

### Why text-embedding-3-small

- **Cost and speed.** It is OpenAI's cheapest and fastest embedding model. At 11 chunks, total embedding cost at startup is a fraction of a cent.
- **Quality.** It outperforms the older `text-embedding-ada-002` on most benchmarks while being cheaper. `text-embedding-3-large` offers marginally better quality at 3x the cost — not justified for a resume corpus.
- **Integration.** The existing codebase already uses the OpenAI client, so no new provider credentials are needed.

### When embeddings are generated

Chunk embeddings are generated **once per resume version** inside `_build_resume_index()` (RC1-440). The application calls the OpenAI embeddings endpoint directly (`_embed()`, one batched request for all chunks) — the wrapper that used to hide this call inside the vector-DB client is gone. Because the Pinecone index is persistent, a restart that finds the current resume version already indexed skips the embeddings call entirely; see the namespace design below.

At query time, the user's message is embedded by the same `_embed()` helper before the similarity search runs — one embeddings call per chat request.

---

## Step 3: Vector Database (Pinecone)

**File:** `app.py → _build_resume_index()`

Pinecone is a managed, serverless vector database (RC1-440 — it replaced an in-process ChromaDB store; see the security-advisories section for why). Vectors are stored with their metadata — including the chunk text — in a hosted index, and queried over HTTPS by cosine similarity. There is no vector-DB code in this application's dependency tree beyond the thin `pinecone` client.

### Index and namespace design

```python
pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
pc.create_index(PINECONE_INDEX_NAME, dimension=1536, metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1"))
index = pc.Index(PINECONE_INDEX_NAME)
```

One serverless index (`reid-basic-resume`, overridable via `PINECONE_INDEX`) holds the corpus, on AWS `us-east-1` — the one region Pinecone's free Starter tier allows. The index is created on first boot if missing.

**Each resume version gets its own namespace**, named `resume-<sha256[:12]>` of the resume file. This is the cache-invalidation strategy the previous in-memory implementation could only describe: at startup, if the current version's namespace already holds the expected vector count, the embeddings step is skipped entirely and startup takes a handle; if the resume changed, the new namespace is populated and stale namespaces are deleted. On Heroku — where the old in-memory store was wiped on every dyno restart — this means a deploy that doesn't touch the resume re-embeds nothing.

**Consistency caveat:** Pinecone upserts are eventually consistent. Immediately after indexing a *new* resume version, a query can return zero matches for a short window; `_retrieve_context` treats that as a fallback case (full resume text), so the feature degrades rather than breaks.

### Distance metric: cosine similarity

The index is created with `metric="cosine"`. Cosine similarity measures the angle between two vectors, ignoring magnitude. OpenAI's embedding vectors are **normalised** (magnitude fixed at 1), which makes cosine and dot-product rankings identical for them — but declaring cosine states intent and remains correct if the embedding model ever changes to one that does not normalise. Note the sign convention changed with the migration: Pinecone reports a **similarity score (higher = more similar)** where ChromaDB reported a distance (lower = better); the retrieval logs say `score=` accordingly.

---

## Step 4: Retrieval

**File:** `app.py → _retrieve_context()`

On each request, the user's message is embedded and submitted as a query:

```python
results = _resume_index.query(
    top_k=n,
    vector=_embed([query])[0],
    namespace=_resume_namespace,
    include_metadata=True,
)
```

Pinecone runs cosine similarity against the stored chunk vectors in the current resume version's namespace and returns the `n` closest matches; each match carries the chunk text in its metadata, so no second lookup is needed.

### Why top-3 for normal queries

Most questions a recruiter or hiring manager asks target a specific area of the resume: AWS experience, a particular employer, technical skills. Returning 3 chunks out of 11 total gives the model enough signal without flooding it with unrelated sections. Returning all 11 on every request would defeat the purpose of RAG.

### Special case: /match

The `/match` command accepts a full job description pasted by the user. A job description is a rich, multi-topic query that may reference experience, skills, and background simultaneously. For this command, all chunks are retrieved (`n_results = len(_resume_chunks_list)`), effectively giving the model the full resume. This makes sense because `/match` is explicitly a whole-resume analysis feature, not a focused question.

The retrieval query for `/match` uses the job description text alone (the `/match` prefix is stripped), so the embedding is computed against meaningful content rather than the slash command keyword.

### Why no query rewriting

In large-corpus RAG systems, a preprocessing step often **rewrites the user's query** into a form that embeds more effectively (e.g., rephrasing "what did he do at his last job?" into "Marigold Senior TPM responsibilities 2021"). This adds an extra LLM call before retrieval.

For an 11-chunk corpus, query rewriting provides no meaningful benefit. Even a mediocre embedding similarity will correctly identify the 3 most relevant chunks out of 11. Query rewriting becomes worthwhile when the corpus is large enough (hundreds or thousands of documents) that precision matters — a slightly better query meaningfully changes which chunks are returned.

### Optional rerank hop (RC1-473, off by default)

With `COHERE_RERANK_ENABLED` set (and `COHERE_API_KEY` present at boot), `_retrieve_context` runs two-stage retrieval on the chat path: the Pinecone query widens to 10 candidates, Cohere `rerank-v4.0-pro` re-scores them against the raw query, and the best `n_results` survive in rerank order. This is a learning integration, not a production default — on a ~48-chunk corpus first-stage recall barely matters, and the eval (`scripts/eval_retrieval.py`) measures whether it changes anything.

Failure semantics, deliberately layered:

- **Flag off (the default):** the query is exactly `top_k=n` — byte-identical to the rerank-free path.
- **Cohere call fails** (bad key, timeout, quota): log an error and keep cosine order — the top-`n` slice of the widened pool is the same set a `top_k=n` query would have returned.
- **`/match` never reranks:** it retrieves every resume chunk (`n == cap`), so a rerank could only reorder a full-coverage set — pure quota burn.

The per-chunk retrieval log line gains ` rerank=<score>` when a rerank happened, and the whole lookup (Pinecone + Cohere hop) is wrapped in a manual LLM Obs retrieval span tagged `rerank:on|off` — manual because the estate rule (RC1-331) keeps ddtrace auto-patching anthropic-only.

### Embedding-model comparison (`scripts/eval_retrieval.py`)

The eval script maintains a parallel serverless index (`reid-basic-resume-cohere`) holding the same chunks embedded with Cohere `embed-v4.0`, and runs the golden set (`scripts/golden_questions.json`, RC1-478) against three arms — OpenAI cosine, Cohere cosine, OpenAI + rerank — reporting hit@3 and MRR from deterministic metadata ground truth. Production never reads the parallel index; switching the serving embedder is a separate decision.

---

## Step 5: Context Injection

**File:** `app.py → chat()` route

Retrieved chunks are joined with a separator and injected into the system prompt dynamically on each request:

```python
context = _retrieve_context(retrieval_query, n_results=n_results)
system_content = (
    f"{_instructions_text}\n\n"
    f"---\n\n"
    f"Relevant resume context (retrieved for this query):\n\n{context}"
)
api_messages = [{"role": "system", "content": system_content}, *history]
```

This means the system prompt is rebuilt on every request with freshly retrieved context. The static chatbot instructions (tone, tool usage rules, the /match feature description) remain constant; only the resume content section varies.

**Why inject into the system prompt rather than as a user message:** System prompt context is the conventional place to provide authoritative reference material. Injecting it as a user message would confuse the model about whose content it is. Some RAG implementations inject context as a separate `system` message at the end of the message list (just before the user turn) to maximise recency, but given the short conversation histories here, injection into the main system prompt is equivalent and cleaner.

### Lesson: prompt-based behavioral constraints are unreliable — use code instead

The chatbot instructions originally contained: *"In your first reply only, ask what company or team the visitor is hiring for. Never repeat it."*

The model ignored this and asked the question on nearly every turn. The first attempted fix was a stronger suppression note appended on non-first turns ("you have already asked — do not ask again"). That also failed intermittently, because it still required the model to follow an instruction.

The correct fix was to **remove the instruction from the prompt entirely** after the first turn, and inject it only when needed:

```python
is_first_reply = not any(m.get("role") == "assistant" for m in trimmed)
first_reply_addendum = (
    'In this first reply, naturally ask what company or team the visitor is hiring for...'
)
instructions = _instructions_text + (first_reply_addendum if is_first_reply else "")
```

After the first turn the instruction simply does not exist — there is nothing for the model to follow or ignore.

**Why prompts fail here:** The model re-evaluates every instruction from scratch on each turn with no memory of prior behavior. "Ask ONCE — never repeat" is unenforceable because the model cannot check whether it complied in a previous turn. A suppression note ("do not ask again") still relies on model cooperation and will fail some percentage of the time.

**The general principle:** Use prompt instructions to shape *how* the model responds — tone, format, scope of knowledge. Use code to enforce *whether* a behavior fires at all, based on observable server-side state. Any constraint that depends on what happened in a previous turn belongs in code, not in the prompt.

---

## Fallback Behavior

The RAG pipeline's failure modes are all handled gracefully:

**Index build failure** (`_build_resume_index`): If the index cannot be built at startup (missing `OPENAI_API_KEY` or `PINECONE_API_KEY` — the skip warning names which — or an OpenAI/Pinecone outage), `_resume_index` is left as `None` and a warning is logged. The app continues to start normally.

**Retrieval failure** (`_retrieve_context`): If `_resume_index` is `None`, if an individual query raises, or if a query returns zero matches (the eventual-consistency window right after a new resume version is indexed), the function returns the full resume text as a string. This is the same content that was previously hardcoded in the system prompt, so the chatbot continues to answer correctly; it just uses more tokens per request.

The result: RAG is a progressive enhancement. Its absence degrades performance (cost, token usage) but never breaks the user-facing feature.

---

## Startup Cost

With the namespace-per-version design, the common dyno restart (resume unchanged) makes **zero embeddings calls** — startup checks the namespace's vector count and takes a handle. Indexing a *new* resume version costs one batched `text-embedding-3-small` request (~500 tokens ≈ $0.00001) plus one Pinecone upsert. Pinecone usage sits deep inside the free Starter tier: ~10 vectors stored, one read unit per chat request.

---

## Production Considerations

This implementation is deliberately simplified. Here is what would change at production scale:

| Concern | This implementation | Production approach |
|---------|--------------------|--------------------|
| Vector DB persistence | Hosted (Pinecone serverless, free tier) | Same pattern; paid tier for scale/SLA |
| Re-embedding on startup | Skipped via hash-named namespace | Same pattern |
| Query strategy | Raw user message | Query rewriting or HyDE for large corpora |
| Retrieval precision | Top-k semantic only | Hybrid search (BM25 + semantic) + reranker |
| Observability | Logs only | Log retrieval scores, chunk IDs, latency per request |
| Index updates | Background watcher re-indexes on file change (60s poll) | Same pattern; swap polling for filesystem event or webhook trigger |
| Embedding model | text-embedding-3-small | Evaluate on retrieval benchmarks before choosing |

**Hybrid search** (combining keyword BM25 with semantic vector search) is the most common production upgrade from pure semantic RAG. It handles cases where the user query contains specific terms (names, acronyms, version numbers) that semantic similarity handles poorly but exact keyword matching handles well. Pinecone supports this natively via sparse-dense vectors; this app has no need for it at 10 chunks.

**Reranking** adds a second-pass relevance model (e.g., a cross-encoder) that rescores the top-k candidates from the vector search before returning them to the LLM. This is typically used when k is large (top-50 from vector search, reranked to top-5 for the prompt).

---

## Observability and Exploration

### Retrieval logging

Every chat request logs one line per retrieved chunk to stdout. In production, stream logs with:

```bash
heroku logs --tail --app hihelloreid
```

Each line shows chunk number, section, employer, cosine similarity score, and the query. Higher score means more similar (the pre-RC1-440 lines logged ChromaDB distances, where lower was better). Example:

```
RAG retrieved chunk 1/4 — section=experience employer=Zeta Global (acquired Marigold, November 2025) score=0.7659 query='AWS experience'
RAG retrieved chunk 2/4 — section=skills employer=— score=0.7109 query='AWS experience'
```

### Local index explorer

`scripts/explore_rag.py` connects to the index and lets you inspect chunks and query results interactively. Requires `OPENAI_API_KEY` and `PINECONE_API_KEY` in `.env`.

```bash
# List all chunks and their metadata
python scripts/explore_rag.py --list-chunks

# Query the index and see what gets retrieved
python scripts/explore_rag.py --query "AWS experience"

# Interactive mode — query repeatedly
python scripts/explore_rag.py
```

This is useful for diagnosing retrieval quality — if a question isn't being answered well, run the query through the script to see which chunks are returned and whether the right content is present.

## Security advisories (RC1-360)

As of 2026-09-01 the newest chromadb release, 1.5.9, carries five open
advisory records with no fixed version, covering four distinct issues:
CVE-2026-45829 (pre-auth code injection; also filed as PYSEC-2026-311 and
GHSA-f4j7-r4q5-qw2c), CVE-2026-45833 (authenticated code injection),
CVE-2026-45830 and CVE-2026-45831 (cross-tenant authorization gaps). Every one of them lives in Chroma's HTTP
server: the `/api/v2/.../collections` endpoints, the tenant and database
checks, and `SimpleRBACAuthorizationProvider`.

This app does not run that server. `_build_resume_index` uses
`chromadb.EphemeralClient()`, an in-process store with no listener, and nothing
in `app.py` mounts Chroma's API. The only network surface is Flask's own routes,
so the vulnerable code is present in the wheel but unreachable. The version is
pinned so a future bump is a deliberate decision, not a side effect of a
rebuild.

When a dependency scanner flags these (GitHub Dependabot once RC1-359 enables
it, or OSV), the right disposition is "vulnerable code is not actually used",
with a pointer here. Revisit only if the app ever switches to
`chromadb.HttpClient` against a hosted server, at which point the server, not
this app, is what needs patching.

**Disposition (RC1-439, 2026-09-13).** Dependabot raised the same four
advisories (GHSA-f4j7-r4q5-qw2c, GHSA-36p7-vc44-83pf, GHSA-2wm9-hf6c-p5cr,
GHSA-xph7-9rjv-w5fr) as alerts 1–4. 1.5.9 was still the newest release, so the
alerts were dismissed with reason `not_used` and a pointer to this section.
That closes the badge, not the exposure question, which was never open: the
vulnerable code is the server the app does not run. Removing the dependency
altogether (a numpy cosine store over the same OpenAI embeddings, ~30 chunks)
is tracked as RC1-440; until then, re-check PyPI before any bump and re-dismiss
if Chroma ships a new server-only advisory.

**Resolution (RC1-440, 2026-09-27).** chromadb is out of the dependency tree
entirely: the vector store moved to Pinecone serverless (hosted, thin client),
so the four dismissed alerts can never resurface on a version bump and the
"vulnerable code present but unreachable" argument no longer needs making. The
sections above are kept as the record of why the dependency was pinned and how
the alerts were dispositioned while it shipped.

## The project corpus (RC1-478)

The index holds more than the resume now. The nine project data files under
`src/data/` (the same TypeScript objects the /work index and the overview
pages render) are the second half of the corpus:

- `npm run extract:projects` renders them to `src/data/projects-prompt.txt`
  via `src/data/projectsPrompt.ts`. The renderer walks the exported objects
  generically, so a new field or a new project flows through without renderer
  changes. Every blank-line-separated paragraph it emits is self-contained
  and opens with a `Project: <name> [<slug>]` header (facet paragraphs add
  `— <aspect>`).
- `app.py → _chunk_projects()` splits on paragraphs and parses the header
  into metadata: `section=project`, `project=<slug>`, `project_name`, and
  `aspect` when present. Resume chunks carry `source=resume`, project chunks
  `source=project`.
- The namespace fingerprint covers both files (`kb-<sha256[:12]>` over
  resume-prompt.txt + projects-prompt.txt) and the watcher rebuilds on a
  change to either.
- `/match` retrieves with a `source=resume` Pinecone filter so the fit card
  still judges the resume with full coverage; the chat path searches the
  whole corpus unfiltered.
- Freshness is CI-enforced from the TypeScript side:
  `tests/projectsPrompt.test.ts` fails when the committed txt no longer
  matches a fresh render. On failure, run the extract script and commit.
- `scripts/golden_questions.json` holds the labeled retrieval questions
  (resume + project) for the eval harness planned in RC1-473.

**The catalog chunk (RC1-479).** Corpus-level enumeration questions ("what
other projects does he have?") cannot be answered from top-k chunk retrieval
— the classic RAG aggregation weakness, observed live the day RC1-478
shipped. The extractor therefore opens the file with a portfolio catalog
paragraph (slug `portfolio`: every project, one line each), and app.py lifts
that paragraph into the chat system prompt on every turn (`/match` excluded),
refreshing it whenever the watcher rebuilds. Retrieval supplies per-project
depth; the catalog supplies breadth. The chat path retrieves `top_k=6` of the
~49-chunk corpus (was 4 of 10 in the resume-only era).
