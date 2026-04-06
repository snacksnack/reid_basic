#!/usr/bin/env python3
"""Query last 24 hours of site activity and email a digest via SendGrid SMTP.

Replaces the Node-based chat-digest.mjs script.

Usage (local):
    python scripts/chat_digest.py

Usage (Heroku Scheduler):
    python scripts/chat_digest.py
"""

import os
import smtplib
import sys
from collections import defaultdict
from datetime import datetime
from email.mime.text import MIMEText

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
RECIPIENT = os.environ.get("DIGEST_EMAIL", "hire.reid.collins@gmail.com")


def run():
    if not DATABASE_URL:
        sys.exit("DATABASE_URL is required")

    conn = psycopg2.connect(DATABASE_URL, sslmode="require")

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT session_id, ip_address, role, content, created_at "
            "FROM chat_logs WHERE created_at >= NOW() - INTERVAL '24 hours' "
            "ORDER BY session_id, created_at"
        )
        chat_rows = cur.fetchall()

        cur.execute(
            "SELECT format, ip_address, user_agent, created_at "
            "FROM download_logs WHERE created_at >= NOW() - INTERVAL '24 hours' "
            "ORDER BY created_at"
        )
        download_rows = cur.fetchall()

        cur.execute(
            "SELECT ip_address, referrer, created_at "
            "FROM page_views WHERE created_at >= NOW() - INTERVAL '24 hours' "
            "ORDER BY created_at"
        )
        view_rows = cur.fetchall()

        cur.execute(
            "SELECT name, email, message, ip_address, created_at "
            "FROM contact_submissions WHERE created_at >= NOW() - INTERVAL '24 hours' "
            "ORDER BY created_at"
        )
        contact_rows = cur.fetchall()

    conn.close()

    if not any([chat_rows, download_rows, view_rows, contact_rows]):
        print("No activity in the last 24 hours — skipping email.")
        return

    unique_visitors = len({v["ip_address"] for v in view_rows})
    referrers: dict[str, int] = defaultdict(int)
    for v in view_rows:
        referrers[v["referrer"] or "Direct"] += 1

    today = datetime.now().strftime("%A, %B %d, %Y")
    text = f"Resume Site Digest — {today}\n"
    text += "=" * 60 + "\n\n"

    if view_rows:
        suffix = "" if unique_visitors == 1 else "s"
        text += f"PAGE VIEWS: {len(view_rows)} views, {unique_visitors} unique visitor{suffix}\n"
        text += "-" * 40 + "\n"
        for ref, count in sorted(referrers.items(), key=lambda x: -x[1]):
            text += f"  {ref} — {count}\n"
        text += "\n"

    if download_rows:
        text += f"DOWNLOADS ({len(download_rows)})\n"
        text += "-" * 40 + "\n"
        for dl in download_rows:
            time_str = dl["created_at"].strftime("%I:%M:%S %p")
            text += f"  {dl['format'].upper()} — {time_str} — IP: {dl['ip_address']}\n"
        text += "\n"

    if contact_rows:
        text += f"CONTACT SUBMISSIONS ({len(contact_rows)})\n"
        text += "-" * 40 + "\n\n"
        for c in contact_rows:
            time_str = c["created_at"].strftime("%I:%M:%S %p")
            text += f"  From: {c['name']} <{c['email']}>\n"
            text += f"  IP: {c['ip_address']}\n"
            text += f"  Time: {time_str}\n"
            text += f"  Message: {c['message']}\n\n"

    sessions: dict[str, dict] = {}
    for row in chat_rows:
        sid = row["session_id"]
        if sid not in sessions:
            sessions[sid] = {"ip": row["ip_address"], "messages": []}
        sessions[sid]["messages"].append(row)

    if sessions:
        text += f"CHAT CONVERSATIONS ({len(sessions)})\n"
        text += "-" * 40 + "\n\n"
        for sid, session in sessions.items():
            started = session["messages"][0]["created_at"].strftime("%I:%M:%S %p")
            text += f"Session: {sid}\n"
            text += f"IP: {session['ip']}\n"
            text += f"Started: {started}\n"
            text += "-" * 40 + "\n"
            for msg in session["messages"]:
                label = "USER" if msg["role"] == "user" else "BOT"
                text += f"  [{label}] {msg['content']}\n\n"
            text += "\n"

    sg_user = os.environ.get("SENDGRID_USERNAME")
    sg_pass = os.environ.get("SENDGRID_PASSWORD")
    if not sg_user or not sg_pass:
        sys.exit("SENDGRID_USERNAME and SENDGRID_PASSWORD are required to send the digest")

    v_count = len(view_rows)
    d_count = len(download_rows)
    c_count = len(contact_rows)
    s_count = len(sessions)
    subject = (
        f"Resume Digest: {v_count} view{'s' if v_count != 1 else ''}, "
        f"{d_count} download{'s' if d_count != 1 else ''}, "
        f"{c_count} contact{'s' if c_count != 1 else ''}, "
        f"{s_count} chat{'s' if s_count != 1 else ''} — {today}"
    )

    mime_msg = MIMEText(text)
    mime_msg["Subject"] = subject
    mime_msg["From"] = "Resume Chatbot <hire.reid.collins@gmail.com>"
    mime_msg["To"] = RECIPIENT

    with smtplib.SMTP("smtp.sendgrid.net", 587) as server:
        server.starttls()
        server.login(sg_user, sg_pass)
        server.send_message(mime_msg)

    print(
        f"Digest sent to {RECIPIENT} — "
        f"{v_count} view(s), {d_count} download(s), "
        f"{c_count} contact(s), {s_count} chat(s)"
    )


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"Digest failed: {e}", file=sys.stderr)
        sys.exit(1)
