#!/usr/bin/env python3
"""Query last 24 hours of site activity and email a digest.

RC1-684: the digest now answers who visited and from where. Every event is
classified bot/human by its own user agent (an IP can appear on both sides of
the split), unique IPs are enriched with org and geography (cached in
ip_enrichment; looked up only here, never in the request path), human
visitors get a per-visit narrative with return-visit flags and ?src= tags,
and bots get their own section. Subject counts are humans only. A crawler-owned
org (Meta, OpenAI, ...) on a browser-looking visitor annotates the line as
suspected automation; it never hides the visitor.

Caveat: narratives and return flags identify an IP, not necessarily one
person; a shared or corporate network can blend several people into one block.

Usage (local):
    python scripts/chat_digest.py [--dry-run]

--dry-run prints the digest instead of emailing it, but still performs the
external enrichment lookups and commits their cache writes.

Usage (Heroku Scheduler):
    python scripts/chat_digest.py
"""

import os
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

try:
    from scripts.emailer import send_notification_email
except ModuleNotFoundError:
    from emailer import send_notification_email

try:
    import visitor_intel as vi
except ModuleNotFoundError:
    # Run as `python scripts/chat_digest.py`: the repo root is not on sys.path.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import visitor_intel as vi

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
RULE = "-" * 40


def _time(dt: datetime) -> str:
    return dt.strftime("%I:%M:%S %p")


def _visitor_ips(view_rows: list[dict], download_rows: list[dict]) -> dict[str, dict]:
    """Group the night's events by IP: views, downloads, first user agent."""
    visitors: dict[str, dict] = {}
    for row in view_rows:
        v = visitors.setdefault(row["ip_address"], {"views": [], "downloads": [], "ua": ""})
        v["views"].append(row)
        v["ua"] = v["ua"] or (row.get("user_agent") or "")
    for row in download_rows:
        v = visitors.setdefault(row["ip_address"], {"views": [], "downloads": [], "ua": ""})
        v["downloads"].append(row)
        v["ua"] = v["ua"] or (row.get("user_agent") or "")
    return visitors


def _return_flag(hist: dict | None) -> str:
    if not hist or not hist.get("prior_days"):
        return ""
    days = hist["prior_days"]
    first = hist["first_seen"].strftime("%b %d")
    noun = "day" if days == 1 else "days"
    return f"returning: seen {days} prior {noun}, first {first}"


def build_digest(
    view_rows: list[dict],
    download_rows: list[dict],
    contact_rows: list[dict],
    chat_rows: list[dict],
    enrichment: dict[str, dict],
    history: dict[str, dict],
    today: str,
) -> tuple[str, str]:
    """Pure formatter: rows in, (subject, body) out. No IO."""
    # Per-event classification: each view/download is judged by its own user
    # agent, so an IP that sends both browser and crawler traffic lands in
    # both halves instead of inheriting whichever event came first.
    human_views = [r for r in view_rows if not vi.is_bot(r.get("user_agent"))]
    human_downloads = [r for r in download_rows if not vi.is_bot(r.get("user_agent"))]
    bot_view_rows = [r for r in view_rows if vi.is_bot(r.get("user_agent"))]
    bot_download_rows = [r for r in download_rows if vi.is_bot(r.get("user_agent"))]
    bot_views = len(bot_view_rows)
    bot_downloads = len(bot_download_rows)

    humans = _visitor_ips(human_views, human_downloads)
    bots = _visitor_ips(bot_view_rows, bot_download_rows)
    for group in (humans, bots):
        for ip, v in group.items():
            info = enrichment.get(ip)
            v["info"] = info
            v["where"] = vi.location_line(info) or "location unknown"

    text = f"Resume Site Digest - {today}\n"
    text += "=" * 60 + "\n\n"

    if human_views:
        paths: dict[str, int] = defaultdict(int)
        referrers: dict[str, int] = defaultdict(int)
        src_tags: dict[str, int] = defaultdict(int)
        for r in human_views:
            paths[r["path"] or "/"] += 1
            referrers[r["referrer"] or "Direct"] += 1
            if r.get("src"):
                src_tags[r["src"]] += 1
        n = len({r["ip_address"] for r in human_views})
        suffix = "" if n == 1 else "s"
        text += f"PAGE VIEWS: {len(human_views)} views, {n} unique visitor{suffix} (humans)\n"
        text += RULE + "\n"
        text += "  By page:\n"
        for path, count in sorted(paths.items(), key=lambda x: -x[1]):
            text += f"    {path} - {count}\n"
        text += "  By source:\n"
        for ref, count in sorted(referrers.items(), key=lambda x: -x[1]):
            text += f"    {ref} - {count}\n"
        if src_tags:
            text += "  By src tag:\n"
            for tag, count in sorted(src_tags.items(), key=lambda x: -x[1]):
                text += f"    {tag} - {count}\n"
        text += "\n"

    if humans:
        text += f"VISITORS ({len(humans)}, by IP)\n"
        text += RULE + "\n"
        ordered = sorted(
            humans.items(),
            key=lambda kv: min(
                [r["created_at"] for r in kv[1]["views"]]
                + [r["created_at"] for r in kv[1]["downloads"]]
            ),
        )
        for ip, v in ordered:
            headline = [ip, v["where"], vi.device_type(v["ua"])]
            if vi.is_crawler_org((v["info"] or {}).get("org")):
                headline.append("suspected automation (crawler org)")
            flag = _return_flag(history.get(ip))
            if flag:
                headline.append(flag)
            tags = sorted({r["src"] for r in v["views"] if r.get("src")})
            if tags:
                headline.append("src: " + ", ".join(tags))
            text += "* " + " - ".join(headline) + "\n"
            events = [(r["created_at"], r["path"] or "/") for r in v["views"]]
            events += [
                (r["created_at"], f"{r['format'].upper()} download") for r in v["downloads"]
            ]
            for when, what in sorted(events):
                text += f"    {_time(when)}  {what}\n"
            text += "\n"

    if human_downloads:
        text += f"DOWNLOADS ({len(human_downloads)})\n"
        text += RULE + "\n"
        for dl in human_downloads:
            where = humans[dl["ip_address"]]["where"]
            text += (
                f"  {dl['format'].upper()} - {_time(dl['created_at'])} - "
                f"IP: {dl['ip_address']} - {where}\n"
            )
        text += "\n"

    if bots:
        text += f"BOT TRAFFIC ({len(bots)} IPs: {bot_views} views, {bot_downloads} downloads)\n"
        text += RULE + "\n"
        for ip in sorted(bots):
            v = bots[ip]
            counts = []
            if v["views"]:
                counts.append(f"{len(v['views'])} views")
            if v["downloads"]:
                formats = ", ".join(r["format"].upper() for r in v["downloads"])
                counts.append(f"{len(v['downloads'])} downloads ({formats})")
            ua = (v["ua"] or "no user agent")[:70]
            text += f"  {ip} - {v['where']} - {'; '.join(counts)} - {ua}\n"
        text += "\n"

    if contact_rows:
        text += f"CONTACT SUBMISSIONS ({len(contact_rows)})\n"
        text += RULE + "\n\n"
        for c in contact_rows:
            text += f"  From: {c['name']} <{c['email']}>\n"
            text += f"  IP: {c['ip_address']}\n"
            text += f"  Time: {_time(c['created_at'])}\n"
            text += f"  Message: {c['message']}\n\n"

    sessions: dict[str, dict] = {}
    for row in chat_rows:
        sid = row["session_id"]
        if sid not in sessions:
            sessions[sid] = {"ip": row["ip_address"], "messages": []}
        sessions[sid]["messages"].append(row)

    if sessions:
        text += f"CHAT CONVERSATIONS ({len(sessions)})\n"
        text += RULE + "\n\n"
        for sid, session in sessions.items():
            started = _time(session["messages"][0]["created_at"])
            where = vi.location_line(enrichment.get(session["ip"]))
            text += f"Session: {sid}\n"
            text += f"IP: {session['ip']}" + (f" - {where}" if where else "") + "\n"
            text += f"Started: {started}\n"
            text += RULE + "\n"
            for msg in session["messages"]:
                label = "USER" if msg["role"] == "user" else "BOT"
                text += f"  [{label}] {msg['content']}\n\n"
            text += "\n"

    v_count = len(human_views)
    d_count = len(human_downloads)
    c_count = len(contact_rows)
    s_count = len(sessions)
    subject = (
        f"Resume Digest: {v_count} view{'s' if v_count != 1 else ''}, "
        f"{d_count} download{'s' if d_count != 1 else ''}, "
        f"{c_count} contact{'s' if c_count != 1 else ''}, "
        f"{s_count} chat{'s' if s_count != 1 else ''} - {today}"
    )
    if bots:
        subject += f" (+{bot_views + bot_downloads} bot hits)"
    return subject, text


def run(dry_run: bool = False):
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
            "SELECT format, ip_address, user_agent, referrer, created_at "
            "FROM download_logs WHERE created_at >= NOW() - INTERVAL '24 hours' "
            "ORDER BY created_at"
        )
        download_rows = cur.fetchall()

        cur.execute(
            "SELECT ip_address, path, referrer, user_agent, src, created_at "
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

        night_ips = sorted(
            {r["ip_address"] for r in view_rows}
            | {r["ip_address"] for r in download_rows}
            | {r["ip_address"] for r in chat_rows}
        )

        enrichment = {}
        try:
            enrichment = vi.enrich_ips(night_ips, cur)
            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"IP enrichment degraded ({e}); digest continues bare", file=sys.stderr)

        history: dict[str, dict] = {}
        if night_ips:
            cur.execute(
                "SELECT ip_address, COUNT(DISTINCT created_at::date) AS prior_days, "
                "MIN(created_at) AS first_seen "
                "FROM page_views "
                "WHERE created_at < NOW() - INTERVAL '24 hours' AND ip_address = ANY(%s) "
                "GROUP BY ip_address",
                (night_ips,),
            )
            history = {row["ip_address"]: row for row in cur.fetchall()}

    conn.close()

    if not any([chat_rows, download_rows, view_rows, contact_rows]):
        print("No activity in the last 24 hours - skipping email.")
        return

    today = datetime.now().strftime("%A, %B %d, %Y")
    subject, text = build_digest(
        view_rows, download_rows, contact_rows, chat_rows, enrichment, history, today
    )

    if dry_run:
        print(f"[dry-run] Subject: {subject}\n")
        print(text)
        return

    recipient = send_notification_email(
        subject=subject,
        body=text,
        from_name="Resume Chatbot",
    )
    print(f"Digest sent to {recipient} - {subject}")


if __name__ == "__main__":
    try:
        run(dry_run="--dry-run" in sys.argv[1:])
    except Exception as e:
        print(f"Digest failed: {e}", file=sys.stderr)
        sys.exit(1)
