#!/usr/bin/env python3
"""
Near-real-time chat session summarizer.

Finds sessions that have gone inactive (no new messages for INACTIVITY_MINUTES)
and have at least MIN_USER_MESSAGES turns, summarizes them with OpenAI, stores
the summary in chat_summaries, and emails Reid.

Designed to be run every 15-30 minutes by Heroku Scheduler:
    python scripts/summarize_sessions.py

Sessions already present in chat_summaries are skipped, so running frequently
is safe — each session is summarized exactly once.

Configuration (environment variables):
    DATABASE_URL          — Postgres connection string (required)
    OPENAI_API_KEY        — OpenAI API key for summarization (required)
    SENDGRID_USERNAME     — SendGrid SMTP username (required to send email)
    SENDGRID_PASSWORD     — SendGrid SMTP password (required to send email)
    DIGEST_EMAIL          — recipient address (default: hire.reid.collins@gmail.com)
    INACTIVITY_MINUTES    — minutes of silence before a session is considered
                            inactive (default: 30)
    MIN_USER_MESSAGES     — minimum user turns required to summarize
                            (default: 3 — filters out one-line drive-bys)
"""

import os
import smtplib
import sys
from datetime import datetime
from email.mime.text import MIMEText

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL = os.environ.get("DATABASE_URL")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
RECIPIENT = os.environ.get("DIGEST_EMAIL", "hire.reid.collins@gmail.com")
INACTIVITY_MINUTES = int(os.environ.get("INACTIVITY_MINUTES", 30))
MIN_USER_MESSAGES = int(os.environ.get("MIN_USER_MESSAGES", 3))

# ---------------------------------------------------------------------------
# Summarization prompt
# ---------------------------------------------------------------------------

SUMMARY_SYSTEM_PROMPT = """\
You are reviewing a chat conversation from Reid Collins's personal resume website.
Reid is a Senior Technical Program Manager and Backend Engineer looking for new opportunities.

Analyze the conversation and produce a structured summary with exactly these four fields:

Visitor context: Who they appear to be — company, role, or team if mentioned; otherwise "unknown".
Topics discussed: Which aspects of Reid's background came up (experience, skills, specific employers, education, etc.).
Interest signals: Any indicators of hiring intent, scheduling requests, or contact details shared.
Suggested follow-up: One sentence on whether and how Reid should follow up, or "none needed" if the conversation was casual.

Be concise. Each field should be one or two sentences at most.\
"""

# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------


def find_unsummarized_sessions(conn) -> list[dict]:
    """
    Return sessions that are inactive and have enough turns to be worth
    summarizing, excluding any already present in chat_summaries.

    A session is inactive when its most recent message is older than
    INACTIVITY_MINUTES.  MIN_USER_MESSAGES filters out sessions that are
    too short to produce a meaningful summary.
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
                session_id,
                ip_address,
                COUNT(*) FILTER (WHERE role = 'user')  AS user_message_count,
                MIN(created_at)                         AS started_at,
                MAX(created_at)                         AS last_message_at
            FROM chat_logs
            WHERE session_id NOT IN (SELECT session_id FROM chat_summaries)
            GROUP BY session_id, ip_address
            HAVING
                COUNT(*) FILTER (WHERE role = 'user') >= %(min_turns)s
                AND MAX(created_at) < NOW() - INTERVAL '%(minutes)s minutes'
            ORDER BY MAX(created_at) DESC
            """,
            {"min_turns": MIN_USER_MESSAGES, "minutes": INACTIVITY_MINUTES},
        )
        return cur.fetchall()


def load_transcript(conn, session_id: str) -> list[dict]:
    """Return all messages for a session ordered oldest-first."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT role, content FROM chat_logs "
            "WHERE session_id = %s AND role IN ('user', 'assistant') "
            "ORDER BY created_at ASC",
            [session_id],
        )
        return cur.fetchall()


def save_summary(conn, session_id: str, ip: str, summary: str, user_count: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO chat_summaries (session_id, ip_address, summary, user_message_count) "
            "VALUES (%s, %s, %s, %s) ON CONFLICT (session_id) DO NOTHING",
            [session_id, ip, summary, user_count],
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Summarization
# ---------------------------------------------------------------------------


def build_transcript_text(messages: list[dict]) -> str:
    lines = []
    for m in messages:
        label = "Visitor" if m["role"] == "user" else "Reid's assistant"
        lines.append(f"{label}: {m['content']}")
    return "\n\n".join(lines)


def summarize(client: OpenAI, transcript: str) -> str:
    """Call OpenAI to produce a structured summary of the conversation."""
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": f"Conversation to summarize:\n\n{transcript}"},
        ],
        max_tokens=300,
        temperature=0.3,  # Low temperature for consistent, factual extraction
    )
    return response.choices[0].message.content.strip()


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------


def send_email(summaries: list[dict]) -> None:
    """Email all summaries produced in this run as a single digest."""
    sg_user = os.environ.get("SENDGRID_USERNAME")
    sg_pass = os.environ.get("SENDGRID_PASSWORD")
    if not sg_user or not sg_pass:
        print("SENDGRID credentials not set — skipping email.")
        return

    now = datetime.now().strftime("%A, %B %d at %I:%M %p")
    count = len(summaries)
    noun = "session" if count == 1 else "sessions"

    body = f"Resume Chatbot — {count} new {noun} summarized ({now})\n"
    body += "=" * 60 + "\n\n"

    for s in summaries:
        started = s["started_at"].strftime("%I:%M %p")
        ended = s["last_message_at"].strftime("%I:%M %p")
        body += f"Session: {s['session_id']}\n"
        body += f"Time: {started} – {ended}  |  "
        body += f"Turns: {s['user_message_count']} user messages  |  "
        body += f"IP: {s['ip_address']}\n"
        body += "-" * 40 + "\n"
        body += f"{s['summary']}\n\n"

    subject = (
        f"Chat summary: {count} new {noun} — {datetime.now().strftime('%b %d, %I:%M %p')}"
    )

    mime_msg = MIMEText(body)
    mime_msg["Subject"] = subject
    mime_msg["From"] = "Resume Chatbot <hire.reid.collins@gmail.com>"
    mime_msg["To"] = RECIPIENT

    with smtplib.SMTP("smtp.sendgrid.net", 587) as server:
        server.starttls()
        server.login(sg_user, sg_pass)
        server.send_message(mime_msg)

    print(f"Summary email sent — {count} {noun}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def run() -> None:
    if not DATABASE_URL:
        sys.exit("DATABASE_URL is required")
    if not OPENAI_API_KEY:
        sys.exit("OPENAI_API_KEY is required")

    client = OpenAI()
    conn = psycopg2.connect(DATABASE_URL, sslmode="require")

    try:
        sessions = find_unsummarized_sessions(conn)

        if not sessions:
            print(
                f"No sessions to summarize "
                f"(inactive >{INACTIVITY_MINUTES}min, >={MIN_USER_MESSAGES} user messages)."
            )
            return

        print(f"Found {len(sessions)} session(s) to summarize.")
        summarized = []

        for session in sessions:
            sid = session["session_id"]
            try:
                messages = load_transcript(conn, sid)
                transcript = build_transcript_text(messages)
                summary = summarize(client, transcript)
                save_summary(
                    conn,
                    sid,
                    session["ip_address"],
                    summary,
                    session["user_message_count"],
                )
                summarized.append({**session, "summary": summary})
                print(f"  Summarized {sid} ({session['user_message_count']} user turns)")
            except Exception as e:
                print(f"  Failed to summarize {sid}: {e}", file=sys.stderr)
                # Continue — don't let one bad session block the rest.

        if summarized:
            send_email(summarized)

    finally:
        conn.close()


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"Summarizer failed: {e}", file=sys.stderr)
        sys.exit(1)
