# RAG-Based Resume Retrieval

## Overview

The chatbot uses **Retrieval-Augmented Generation (RAG)** to answer questions about Reid's background. Instead of loading the full resume text into the system prompt on every request, the application embeds the resume into a vector database at startup and retrieves only the most relevant sections for each incoming message. The retrieved text is then injected into the system prompt dynamically, giving the model focused, query-relevant context.

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
Cosine similarity search (ChromaDB HNSW index)
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

At startup, the resume is chunked and each chunk is embedded and stored in ChromaDB. At request time, the user's message is embedded and compared against all stored vectors. The closest matches are pulled and placed into the system prompt under a `Relevant resume context` heading.

---

## Step 1: Chunking

**File:** `app.py → _chunk_resume()`

The resume is split into semantic chunks based on its natural structure. The chunking strategy matters: chunks that are too large return more tokens than needed; chunks that are too small lose context and become ambiguous.

### Strategy: paragraph-based, section-aware

The resume is split on double newlines (`\n\n`), which correspond to its logical paragraph boundaries. Additional logic handles two resume-specific patterns:

**Standalone employer headers.** A line like `Marigold (acquired by Zeta Global) — Senior TPM — 2021–2026` is a single-line paragraph that contains no searchable facts on its own. It is not indexed as a chunk — instead it is tracked as context for the sub-sections that follow.

**Sub-section prefixing (self-containedness).** Marigold's work is divided into sub-sections: `Program Leadership & Delivery:`, `Platform & Backend Systems:`, etc. If a sub-section chunk were stored without its employer header, a query like "what did Reid do at Marigold?" would retrieve a chunk that reads:

```
Program Leadership & Delivery:
• Led delivery of multiple cross-functional initiatives...
```

This chunk is ambiguous — it does not say who or when. The chunker prefixes every sub-section with its employer line:

```
Marigold (acquired by Zeta Global) — Senior TPM — 2021–2026

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

Each chunk is stored with structured metadata (section, employer, subsection where applicable). ChromaDB stores this alongside the vector and it can be used for **filtered retrieval** — for example, a future feature could restrict queries to `section == "experience"` only. For this implementation it primarily serves debugging: you can inspect ChromaDB's stored documents and see which section each chunk came from.

---

## Step 2: Embedding

**Model:** `text-embedding-3-small` (OpenAI)

An embedding model converts text into a dense numerical vector — a list of floating-point numbers (1536 dimensions for this model) that encodes the semantic meaning of the text. Texts with similar meaning produce vectors that are geometrically close to each other in this high-dimensional space.

### Why text-embedding-3-small

- **Cost and speed.** It is OpenAI's cheapest and fastest embedding model. At 11 chunks, total embedding cost at startup is a fraction of a cent.
- **Quality.** It outperforms the older `text-embedding-ada-002` on most benchmarks while being cheaper. `text-embedding-3-large` offers marginally better quality at 3x the cost — not justified for a resume corpus.
- **Integration.** The existing codebase already uses the OpenAI client, so no new provider credentials are needed.

### When embeddings are generated

Embeddings are generated **once at startup** inside `_build_resume_index()`. ChromaDB's `OpenAIEmbeddingFunction` wrapper handles the API call transparently — you register it on the collection, and ChromaDB calls it automatically when documents are added (`collection.add(...)`) or queried (`collection.query(...)`). You never call the embeddings endpoint directly.

At query time, the user's message is embedded by the same function before the similarity search runs.

---

## Step 3: Vector Database (ChromaDB)

**File:** `app.py → _build_resume_index()`

ChromaDB is an open-source vector database. It stores embedding vectors alongside the original document text and metadata, and provides fast approximate nearest-neighbor search using an **HNSW index** (Hierarchical Navigable Small World — a graph-based structure optimised for high-dimensional similarity search).

### Client mode: ephemeral (in-memory)

```python
chroma_client = chromadb.EphemeralClient()
```

The application uses `EphemeralClient`, which keeps all data in memory. There is no disk I/O and the index is rebuilt from scratch on every startup.

**Why in-memory here:** The deployment target is Heroku, which has an ephemeral filesystem — any file written to disk is wiped on dyno restart. Persisting the ChromaDB index to disk would provide no benefit because it would be gone on the next restart anyway.

**What production would use instead:**

| Option | When to use |
|--------|-------------|
| `chromadb.PersistentClient(path=...)` | Single-server deployment with a durable volume (e.g., AWS EBS, Docker volume) |
| `chromadb.HttpClient(host=..., port=...)` | Dedicated ChromaDB server (self-hosted or ChromaDB Cloud) |
| Pinecone / Weaviate / Qdrant | Managed, hosted vector DB — no infrastructure to run, scales independently of the app server |

For a production system where re-embedding on every startup is expensive (large corpus, expensive model), you would use a persistent or hosted vector DB and implement a **cache invalidation strategy**: store a hash of the source documents alongside the index, and skip re-embedding on startup if the hash matches. This application implements hash-based change detection in the background watcher — see `documentation/automatic-reindexing.md`.

### Distance metric: cosine similarity

```python
metadata={"hnsw:space": "cosine"}
```

ChromaDB defaults to **L2 (Euclidean) distance**. For text embeddings, **cosine similarity** is the correct choice.

Cosine similarity measures the angle between two vectors, ignoring their magnitude. L2 measures the straight-line distance between two points, which is sensitive to vector length. OpenAI's embedding vectors are **normalised** (their magnitude is fixed at 1), which means cosine and L2 produce identical rankings for normalised vectors — but explicitly specifying cosine is the correct and conventional thing to do. It signals intent clearly and remains correct if you ever switch to a model that does not normalise its output.

---

## Step 4: Retrieval

**File:** `app.py → _retrieve_context()`

On each request, the user's message is submitted as a query:

```python
results = _resume_collection.query(
    query_texts=[query],
    n_results=n,
)
```

ChromaDB embeds the query using the registered `OpenAIEmbeddingFunction`, runs cosine similarity against all stored chunk vectors via the HNSW index, and returns the `n` closest matches.

### Why top-3 for normal queries

Most questions a recruiter or hiring manager asks target a specific area of the resume: AWS experience, a particular employer, technical skills. Returning 3 chunks out of 11 total gives the model enough signal without flooding it with unrelated sections. Returning all 11 on every request would defeat the purpose of RAG.

### Special case: /match

The `/match` command accepts a full job description pasted by the user. A job description is a rich, multi-topic query that may reference experience, skills, and background simultaneously. For this command, all chunks are retrieved (`n_results = len(_resume_chunks_list)`), effectively giving the model the full resume. This makes sense because `/match` is explicitly a whole-resume analysis feature, not a focused question.

The retrieval query for `/match` uses the job description text alone (the `/match` prefix is stripped), so the embedding is computed against meaningful content rather than the slash command keyword.

### Why no query rewriting

In large-corpus RAG systems, a preprocessing step often **rewrites the user's query** into a form that embeds more effectively (e.g., rephrasing "what did he do at his last job?" into "Marigold Senior TPM responsibilities 2021"). This adds an extra LLM call before retrieval.

For an 11-chunk corpus, query rewriting provides no meaningful benefit. Even a mediocre embedding similarity will correctly identify the 3 most relevant chunks out of 11. Query rewriting becomes worthwhile when the corpus is large enough (hundreds or thousands of documents) that precision matters — a slightly better query meaningfully changes which chunks are returned.

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

The RAG pipeline has two failure modes, both handled gracefully:

**Index build failure** (`_build_resume_index`): If the index cannot be built at startup (no API key, OpenAI outage, ChromaDB import error), `_resume_collection` is left as `None` and a warning is logged. The app continues to start normally.

**Retrieval failure** (`_retrieve_context`): If `_resume_collection` is `None` — or if an individual query raises an exception — the function returns the full resume text as a string. This is the same content that was previously hardcoded in the system prompt, so the chatbot continues to answer correctly; it just uses more tokens per request.

The result: RAG is a progressive enhancement. Its absence degrades performance (cost, token usage) but never breaks the user-facing feature.

---

## Startup Cost

Re-embedding 11 chunks on every dyno start costs approximately:
- **API calls:** 11 requests to `text-embedding-3-small`
- **Token cost:** ~500 tokens total at $0.00002/1K tokens ≈ $0.00001 per startup
- **Latency:** ~1–2 seconds (parallel requests are batched by ChromaDB internally)

This is negligible. For a corpus of thousands of chunks, startup cost would matter and you would use a persistent vector DB with a freshness check to avoid re-embedding on every restart.

---

## Production Considerations

This implementation is deliberately simplified. Here is what would change at production scale:

| Concern | This implementation | Production approach |
|---------|--------------------|--------------------|
| Vector DB persistence | In-memory, rebuilt on restart | PersistentClient or hosted vector DB |
| Re-embedding on startup | Always (cheap at 11 chunks) | Skip if chunk hash matches stored hash |
| Query strategy | Raw user message | Query rewriting or HyDE for large corpora |
| Retrieval precision | Top-k semantic only | Hybrid search (BM25 + semantic) + reranker |
| Observability | Logs only | Log retrieval scores, chunk IDs, latency per request |
| Index updates | Background watcher re-indexes on file change (60s poll) | Same pattern; swap polling for filesystem event or webhook trigger |
| Embedding model | text-embedding-3-small | Evaluate on retrieval benchmarks before choosing |

**Hybrid search** (combining keyword BM25 with semantic vector search) is the most common production upgrade from pure semantic RAG. It handles cases where the user query contains specific terms (names, acronyms, version numbers) that semantic similarity handles poorly but exact keyword matching handles well. ChromaDB does not natively support hybrid search; systems like Weaviate, Elasticsearch, or Qdrant do.

**Reranking** adds a second-pass relevance model (e.g., a cross-encoder) that rescores the top-k candidates from the vector search before returning them to the LLM. This is typically used when k is large (top-50 from vector search, reranked to top-5 for the prompt).

---

## Observability and Exploration

### Retrieval logging

Every chat request logs one line per retrieved chunk to stdout. In production, stream logs with:

```bash
heroku logs --tail --app hihelloreid
```

Each line shows chunk number, section, employer, cosine distance, and the query. Lower distance means more similar. Example:

```
RAG retrieved chunk 1/4 — section=experience employer=Marigold (acquired by Zeta Global) distance=0.2341 query='AWS experience'
RAG retrieved chunk 2/4 — section=skills employer=— distance=0.2891 query='AWS experience'
```

### Local index explorer

`scripts/explore_rag.py` builds the index locally and lets you inspect chunks and query results interactively. Requires `OPENAI_API_KEY` in `.env`.

```bash
# List all chunks and their metadata
python scripts/explore_rag.py --list-chunks

# Query the index and see what gets retrieved
python scripts/explore_rag.py --query "AWS experience"

# Interactive mode — query repeatedly
python scripts/explore_rag.py
```

This is useful for diagnosing retrieval quality — if a question isn't being answered well, run the query through the script to see which chunks are returned and whether the right content is present.
