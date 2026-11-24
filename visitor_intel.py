"""Visitor classification and IP enrichment for the nightly digest (RC1-684).

Pure classification helpers (bot vs. human, device type) plus a cached
IP -> org/geo lookup against ipapi.co over HTTPS. Lookups run only from the
digest script, never in the request path; failures degrade to the bare IP.

Classification is per event and user-agent based. The owning org never flips
an event to bot on its own (a recruiter on a corporate network must stay
visible); is_crawler_org() only marks a visitor as suspected automation.
"""

import ipaddress
import json
import logging
import os
import time
import urllib.request

# User-agent substrings that mark automated clients. Matched lowercase.
# "bot"/"crawl"/"spider" cover most named crawlers (Googlebot, bingbot,
# ClaudeBot, GPTBot, Amazonbot, Applebot, LinkedInBot, ...).
BOT_UA_SIGNATURES = (
    "bot",
    "crawl",
    "spider",
    "scrape",
    "slurp",
    "curl",
    "wget",
    "python",
    "httpx",
    "aiohttp",
    "go-http-client",
    "java/",
    "libwww",
    "okhttp",
    "scrapy",
    "phantomjs",
    "headlesschrome",
    "meta-externalagent",
    "facebookexternalhit",
    "bingpreview",
    "chatgpt-user",
    "claude-web",
    "perplexity",
)

# Owning orgs that run crawl infrastructure. A browser-looking event from one
# of these is SUSPECTED automation, never proof: these orgs are also
# employers, and a recruiter on their corporate network must not be hidden
# from human traffic (the Google/Microsoft concern applies to every org here).
CRAWLER_ORG_SIGNATURES = (
    "meta platforms",
    "facebook",
    "openai",
    "anthropic",
    "perplexity",
    "bytedance",
    "semrush",
    "ahrefs",
    "dataforseo",
    "censys",
    "shodan",
    "internet archive",
)

# ipapi.co: HTTPS without a key. The free tier allows 1,000 lookups/day; the
# cache means a normal night needs a handful. The cap is a guard against a
# backfill-sized night.
IP_API_URL = "https://ipapi.co/{ip}/json/"
LOOKUP_TIMEOUT_SECONDS = 5.0
MAX_LOOKUPS_PER_RUN = 40
# ipapi.co throttles bursts (observed HTTP 429 at ~7 back-to-back requests),
# so consecutive lookups are paced. Worst case adds under a minute to the
# nightly job.
LOOKUP_PAUSE_SECONDS = 1.5


def is_bot(user_agent: str | None) -> bool:
    """True when this event's user agent marks an automated client."""
    ua = (user_agent or "").strip().lower()
    if not ua:
        return True
    return any(sig in ua for sig in BOT_UA_SIGNATURES)


def is_crawler_org(org: str | None) -> bool:
    """True when the owning org runs crawl infrastructure: a suspicion
    signal for annotation, never grounds to exclude a visitor."""
    return bool(org) and any(sig in org.lower() for sig in CRAWLER_ORG_SIGNATURES)


def self_ips() -> frozenset[str]:
    """The site owner's IPs (SELF_IPS env, comma-separated). Self traffic is
    excluded from digest visitor counts and never triggers alerts (RC1-685)."""
    return frozenset(
        s.strip() for s in os.environ.get("SELF_IPS", "").split(",") if s.strip()
    )


def device_type(user_agent: str | None) -> str:
    ua = (user_agent or "").lower()
    if not ua:
        return "unknown"
    if "ipad" in ua or "tablet" in ua:
        return "tablet"
    if "mobi" in ua or "iphone" in ua or "android" in ua:
        return "mobile"
    return "desktop"


def _is_lookupable(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_global
    except ValueError:
        return False


def fetch_ip_info(ip: str) -> dict | None:
    """One ipapi.co lookup over HTTPS. Returns {org, city, region, country}
    or None."""
    req = urllib.request.Request(
        IP_API_URL.format(ip=ip),
        headers={"User-Agent": "resume-site-digest/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=LOOKUP_TIMEOUT_SECONDS) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        logging.error("IP lookup failed for %s: %s", ip, e)
        return None
    if data.get("error"):
        logging.error("IP lookup refused for %s: %s", ip, data.get("reason"))
        return None
    return {
        "org": data.get("org") or "",
        "city": data.get("city") or "",
        "region": data.get("region") or "",
        "country": data.get("country_name") or "",
    }


def enrich_ips(ips, cur, fetch=fetch_ip_info, pause=time.sleep) -> dict:
    """Map each IP to cached {org, city, region, country}, looking up and
    caching the ones not seen before. Lookup failures are not cached (so they
    retry another night) and the IP simply has no entry in the result."""
    wanted = sorted({ip for ip in ips if ip and _is_lookupable(ip)})
    if not wanted:
        return {}

    cur.execute(
        "SELECT ip, org, city, region, country FROM ip_enrichment WHERE ip = ANY(%s)",
        (wanted,),
    )
    found = {
        row["ip"]: {k: row[k] or "" for k in ("org", "city", "region", "country")}
        for row in cur.fetchall()
    }

    lookups = 0
    for ip in wanted:
        if ip in found:
            continue
        if lookups >= MAX_LOOKUPS_PER_RUN:
            logging.error("IP lookup cap (%d) reached; rest stay bare", MAX_LOOKUPS_PER_RUN)
            break
        if lookups:
            pause(LOOKUP_PAUSE_SECONDS)
        lookups += 1
        info = fetch(ip)
        if info is None:
            continue
        found[ip] = info
        cur.execute(
            "INSERT INTO ip_enrichment (ip, org, city, region, country) "
            "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (ip) DO NOTHING",
            (ip, info["org"], info["city"], info["region"], info["country"]),
        )
    return found


def location_line(info: dict | None) -> str:
    """'Org, City, Region, Country' with empty parts dropped; '' when unknown."""
    if not info:
        return ""
    parts = [info.get("org"), info.get("city"), info.get("region"), info.get("country")]
    return ", ".join(p for p in parts if p)
