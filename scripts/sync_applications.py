#!/usr/bin/env python3
"""Sync the applications table from the Job Scout workspace (RC1-687).

Reads state.json (statuses) and jobs.json (company, location) from the Job
Scout data directory and replaces the private applications table that the
nightly digest correlates visitors against. The application list itself never
enters this repo; this script carries only the transform.

Usage:
    python scripts/sync_applications.py [--source DIR] [--dry-run]

--dry-run prints the rows without touching the database. A real run needs
DATABASE_URL and replaces the table contents in one transaction.
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

try:
    import visitor_intel as vi
except ModuleNotFoundError:
    # Run as `python scripts/sync_applications.py`: repo root is not on sys.path.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import visitor_intel as vi

load_dotenv()

DEFAULT_SOURCE = Path.home() / "programming/personal/job-search-agent/data"
APPLIED_STATUSES = ("applied", "interviewing")

# Location phrases that are not metros ("remote" anywhere in a part also
# disqualifies it).
_NON_METRO = frozenset({
    "us", "usa", "united states", "americas", "hybrid", "on-site", "onsite",
    "global", "anywhere", "worldwide", "east coast",
})


def metros_from_location(location: str | None) -> list[str]:
    """'San Francisco, CA | New York City, NY' -> ['san francisco', 'new york'].
    Remote-only locations yield []."""
    metros: list[str] = []
    for part in re.split(r"[|/;]", location or ""):
        part = re.sub(r"\([^)]*\)", "", part)  # strip '(Hybrid)' etc.
        city = part.split(",")[0].strip()
        metro = vi.normalize_metro(city)
        if (
            metro
            and metro not in _NON_METRO
            and "remote" not in metro
            and len(metro) > 2
            and metro not in metros
        ):
            metros.append(metro)
    return metros


def src_tag_for(company: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (company or "").lower())


def build_rows(state: dict, roles_by_id: dict) -> list[dict]:
    """One row per applied/interviewing role: the digest's correlation input."""
    rows = []
    for role_id, entry in (state.get("jobs") or {}).items():
        if not isinstance(entry, dict) or entry.get("status") not in APPLIED_STATUSES:
            continue
        role = roles_by_id.get(role_id)
        if role:
            company = role.get("company") or ""
            title = role.get("title") or ""
            metros = metros_from_location(role.get("location"))
        elif re.match(r"^[a-z0-9]", role_id) and "://" not in role_id:
            # Not on the board (manual application): best-effort company from
            # the id's leading token; no location is known.
            company = role_id.split("-")[0]
            title, metros = "", []
        else:
            continue
        if not company:
            continue
        applied_on = (
            entry.get("appliedDate")
            or (entry.get("decidedAt") or "")[:10]
            or (entry.get("updatedAt") or "")[:10]
            or None
        )
        rows.append(
            {
                "role_id": role_id,
                "company": company,
                "role_title": title,
                "metros": ",".join(metros),
                "src_tag": src_tag_for(company),
                "applied_on": applied_on,
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    state = json.loads((args.source / "state.json").read_text())
    roles = json.loads((args.source / "jobs.json").read_text())["roles"]
    rows = build_rows(state, {r["id"]: r for r in roles})

    if args.dry_run:
        for row in rows:
            print(row)
        print(f"[dry-run] {len(rows)} applications; database untouched")
        return

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        sys.exit("DATABASE_URL is required")
    conn = psycopg2.connect(database_url, sslmode="require")
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM applications")
            cur.executemany(
                "INSERT INTO applications "
                "(role_id, company, role_title, metros, src_tag, applied_on) "
                "VALUES (%(role_id)s, %(company)s, %(role_title)s, %(metros)s, "
                "%(src_tag)s, %(applied_on)s)",
                rows,
            )
        conn.commit()
    finally:
        conn.close()
    print(f"Synced {len(rows)} applications")


if __name__ == "__main__":
    main()
