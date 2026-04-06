import json
import logging
import os
import smtplib
from email.mime.text import MIMEText
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from openai import OpenAI
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
    sg_user = os.environ.get("SENDGRID_USERNAME")
    sg_pass = os.environ.get("SENDGRID_PASSWORD")
    if not sg_user or not sg_pass:
        return
    recipient = os.environ.get("DIGEST_EMAIL", "hire.reid.collins@gmail.com")
    body = (
        f"New contact form submission\n\n"
        f"Name: {name}\nEmail: {visitor_email}\nIP: {ip}\n\n{message}"
    )
    mime_msg = MIMEText(body)
    mime_msg["Subject"] = f"Contact form: {name}"
    mime_msg["From"] = "Resume Site <hire.reid.collins@gmail.com>"
    mime_msg["To"] = recipient
    mime_msg["Reply-To"] = visitor_email
    try:
        with smtplib.SMTP("smtp.sendgrid.net", 587) as server:
            server.starttls()
            server.login(sg_user, sg_pass)
            server.send_message(mime_msg)
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

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

_instructions_path = BASE_DIR / "src" / "data" / "chatbot-instructions.txt"
_resume_path = BASE_DIR / "src" / "data" / "resume-prompt.txt"
SYSTEM_PROMPT = f"{_instructions_path.read_text()}\n\n---\n\n{_resume_path.read_text()}"

MAX_CONVERSATION_MESSAGES = 20
MAX_TOOL_ROUNDS = 3

# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "schedule_meeting",
            "description": (
                "Get a scheduling link for the visitor to book a meeting with Reid Collins. "
                "Use when someone wants to schedule a call, meeting, or interview with Reid."
            ),
            "parameters": {
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
    },
    {
        "type": "function",
        "function": {
            "name": "send_contact",
            "description": (
                "Submit a message from the visitor to Reid (same as the Contact Reid form). "
                "Use only after the visitor has explicitly provided their real name, email, "
                "and the message they want to send. Never guess or invent email or name."
            ),
            "parameters": {
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
    },
]


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
                "scheduling_url": scheduling_url,
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
        messages = data.get("messages")
        session_id = data.get("sessionId", "no-session")

        if not isinstance(messages, list) or len(messages) == 0:
            return jsonify({"error": "messages array is required"}), 400

        if not openai_client:
            return jsonify({"error": "Chat is not configured"}), 503

        ip = request.remote_addr or "unknown"

        last_user_msg = next(
            (m for m in reversed(messages) if m.get("role") == "user"), None
        )
        if last_user_msg:
            _db_execute(
                "INSERT INTO chat_logs (session_id, ip_address, role, content) "
                "VALUES (%s, %s, %s, %s)",
                [session_id, ip, "user", last_user_msg["content"]],
            )

        trimmed = messages[-MAX_CONVERSATION_MESSAGES:]
        api_messages = [{"role": "system", "content": SYSTEM_PROMPT}, *trimmed]

        reply = None
        for _ in range(MAX_TOOL_ROUNDS):
            completion = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=api_messages,
                tools=TOOLS,
                max_tokens=500,
                temperature=0.7,
            )

            choice = completion.choices[0]

            if choice.message.tool_calls:
                api_messages.append(choice.message)
                for tool_call in choice.message.tool_calls:
                    args = json.loads(tool_call.function.arguments or "{}")
                    result = execute_tool_call(
                        tool_call.function.name, args, client_ip=ip
                    )
                    api_messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": result,
                        }
                    )
                    _db_execute(
                        "INSERT INTO tool_usage "
                        "(session_id, ip_address, tool_name, tool_args, tool_result) "
                        "VALUES (%s, %s, %s, %s, %s)",
                        [
                            session_id,
                            ip,
                            tool_call.function.name,
                            json.dumps(args),
                            result,
                        ],
                    )
                continue

            reply = choice.message.content or "Sorry, I couldn't generate a response."
            break

        if not reply:
            reply = "Sorry, I couldn't generate a response."

        _db_execute(
            "INSERT INTO chat_logs (session_id, ip_address, role, content) "
            "VALUES (%s, %s, %s, %s)",
            [session_id, ip, "assistant", reply],
        )

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
