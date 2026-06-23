import hashlib
import json
import logging
import os
import threading
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
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

anthropic_client = anthropic.Anthropic() if os.environ.get("ANTHROPIC_API_KEY") else None
openai_client = OpenAI() if os.environ.get("OPENAI_API_KEY") else None

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
_resume_path = BASE_DIR / "src" / "data" / "resume-prompt.txt"
_instructions_text = _instructions_path.read_text()

# ---------------------------------------------------------------------------
# RAG: resume chunking, embedding, and retrieval
# ---------------------------------------------------------------------------

_resume_collection = None
_resume_chunks_list: list[str] = []
_resume_hash: str = ""


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
    is stored in ChromaDB alongside the vector and can be used for filtered
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


def _build_resume_index() -> None:
    """
    Embed all resume chunks into ChromaDB at application startup.

    ChromaDB is initialised as an ephemeral (in-memory) client because the
    deployment environment (Heroku) has an ephemeral filesystem — any data
    written to disk is lost on dyno restart anyway.  In a production
    environment with durable storage you would use
    chromadb.PersistentClient(path=...) or an HTTP client pointed at a hosted
    vector DB (Pinecone, Weaviate, Qdrant, etc.), and skip re-embedding if the
    collection already contains the current chunks.

    The OpenAIEmbeddingFunction wrapper handles calling the embeddings API
    transparently: ChromaDB invokes it automatically when documents are added
    or queried, so we never call the embeddings endpoint directly.
    """
    global _resume_collection, _resume_chunks_list, _resume_hash

    if not openai_client:
        logging.warning(
            "RAG index skipped: OPENAI_API_KEY not set — "
            "falling back to full resume text in system prompt"
        )
        return

    try:
        import chromadb
        from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

        resume_bytes = _resume_path.read_bytes()
        chunk_dicts = _chunk_resume(resume_bytes.decode())
        _resume_chunks_list = [c["text"] for c in chunk_dicts]

        embedding_fn = OpenAIEmbeddingFunction(
            api_key=os.environ["OPENAI_API_KEY"],
            model_name="text-embedding-3-small",
        )

        chroma_client = chromadb.EphemeralClient()
        _resume_collection = chroma_client.create_collection(
            name="resume",
            embedding_function=embedding_fn,
            # Cosine distance is standard for text embeddings.  The default
            # ChromaDB distance is L2 (Euclidean), which penalises magnitude
            # differences that are not meaningful for normalised dense vectors.
            metadata={"hnsw:space": "cosine"},
        )

        _resume_collection.add(
            documents=_resume_chunks_list,
            metadatas=[c["metadata"] for c in chunk_dicts],
            ids=[f"chunk_{i}" for i in range(len(chunk_dicts))],
        )

        _resume_hash = hashlib.sha256(resume_bytes).hexdigest()
        logging.info("RAG index ready: %d chunks indexed", len(chunk_dicts))

    except Exception as e:
        logging.error(
            "Failed to build RAG index: %s — "
            "falling back to full resume text in system prompt",
            e,
        )
        _resume_collection = None


def _retrieve_context(query: str, n_results: int = 3) -> str:
    """
    Query the vector index for the top-n most relevant resume chunks.

    ChromaDB embeds the query text using the same OpenAIEmbeddingFunction
    registered on the collection, computes cosine similarity against all
    stored chunk vectors via its HNSW index, and returns the closest matches.

    Falls back to the full resume text if the index is unavailable (no API
    key in local dev, or if _build_resume_index raised an exception).
    """
    if _resume_collection is None:
        return _resume_path.read_text()

    try:
        n = min(n_results, len(_resume_chunks_list))
        results = _resume_collection.query(
            query_texts=[query],
            n_results=n,
            include=["documents", "metadatas", "distances"],
        )
        # results["documents"] is a list-of-lists — one inner list per
        # query_text submitted.  We always submit exactly one query.
        chunks = results["documents"][0]
        metadatas = results["metadatas"][0]
        distances = results["distances"][0]

        for i, (meta, dist) in enumerate(zip(metadatas, distances)):
            logging.info(
                "RAG retrieved chunk %d/%d — section=%s employer=%s distance=%.4f query=%r",
                i + 1,
                n,
                meta.get("section", "?"),
                meta.get("employer", "—"),
                dist,
                query[:60],
            )

        return "\n\n---\n\n".join(chunks)
    except Exception as e:
        logging.error("RAG retrieval error: %s — falling back to full resume", e)
        return _resume_path.read_text()


_build_resume_index()


def _watch_resume(interval: int = 60) -> None:
    """
    Background thread: check whether resume-prompt.txt has changed every
    `interval` seconds.  If the SHA-256 hash of the file differs from the
    hash stored when the index was last built, rebuild the index automatically.

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
            current_hash = hashlib.sha256(_resume_path.read_bytes()).hexdigest()
            if current_hash != _resume_hash:
                logging.info("resume-prompt.txt changed — rebuilding RAG index")
                _build_resume_index()
        except Exception as e:
            logging.error("Resume watcher error: %s", e)


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
            "Get a scheduling link for the visitor to book a meeting with Reid Collins. "
            "Use when someone wants to schedule a call, meeting, or interview with Reid."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": (
                        "What the visitor wants to discuss "
                        '(e.g., "engineering role at Acme Corp", "contract opportunity")'
                    ),
                },
            },
        },
    },
    {
        "name": "send_contact",
        "description": (
            "Submit a message from the visitor to Reid (same as the Contact Reid form). "
            "Use only after the visitor has explicitly provided their real name, email, "
            "and the message they want to send. Never guess or invent email or name."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Visitor's name as they gave it.",
                },
                "email": {
                    "type": "string",
                    "description": "Visitor's email address (for Reid to reply).",
                },
                "message": {
                    "type": "string",
                    "description": "The message body the visitor wants Reid to receive.",
                },
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
        # semantic search, so we retrieve all chunks to guarantee full resume
        # coverage.  For ordinary conversational messages, top-3 is enough:
        # most questions target one area of the resume (e.g. AWS experience,
        # skills, a specific employer) and returning more chunks adds noise.
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
            n_results = 4

        context = _retrieve_context(retrieval_query, n_results=n_results)

        system_content = (
            f"{_instructions_text}\n\n"
            f"---\n\n"
            f"Relevant resume context (retrieved for this query):\n\n{context}"
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
                    temperature=0.4,
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

        reply = None
        for _ in range(MAX_TOOL_ROUNDS):
            response = anthropic_client.messages.create(
                model="claude-haiku-4-5-20251001",
                system=system_content,
                messages=api_messages,
                tools=TOOLS,
                max_tokens=500,
                temperature=0.7,
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

if IS_PRODUCTION:

    @app.route("/")
    @app.route("/<path:path>")
    def serve_spa(path=""):
        dist = BASE_DIR / "dist"
        if path and (dist / path).is_file():
            return send_from_directory(str(dist), path)
        return send_from_directory(str(dist), "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3001))
    app.run(host="0.0.0.0", port=port, debug=not IS_PRODUCTION)
