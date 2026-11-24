"""Visitor classification and IP enrichment for the nightly digest (RC1-684).

Pure classification helpers (bot vs. human, device type) plus a cached
IP -> org/geo lookup against ip-api.com. Lookups run only from the digest
script, never in the request path; failures degrade to the bare IP.
"""

import ipaddress
import json
import logging
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

# Owning orgs that are crawl infrastructure: traffic from them is automated
# even when the user agent looks like a browser. Deliberately excludes
# employers whose staff egress through the same org (Google, Microsoft,
# Apple, Amazon): their real crawlers all carry bot user agents, and a
# recruiter on a corporate network must not be hidden as a bot.
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

IP_API_URL = "http://ip-api.com/json/{ip}?fields=status,message,country,regionName,city,isp,org,as"
LOOKUP_TIMEOUT_SECONDS = 5.0
# ip-api.com free tier allows 45 requests/minute; the cache means a normal
# night needs a handful. The cap is a guard against a backfill-sized night.
MAX_LOOKUPS_PER_RUN = 40


def is_bot(user_agent: str | None, org: str | None = None) -> bool:
    """True when the user agent, or the owning org, marks automated traffic."""
    ua = (user_agent or "").strip().lower()
    if not ua:
        return True
    if any(sig in ua for sig in BOT_UA_SIGNATURES):
        return True
    if org and any(sig in org.lower() for sig in CRAWLER_ORG_SIGNATURES):
        return True
    return False


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
    """One ip-api.com lookup. Returns {org, city, region, country} or None."""
    try:
        with urllib.request.urlopen(
            IP_API_URL.format(ip=ip), timeout=LOOKUP_TIMEOUT_SECONDS
        ) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        logging.error("IP lookup failed for %s: %s", ip, e)
        return None
    if data.get("status") != "success":
        logging.error("IP lookup refused for %s: %s", ip, data.get("message"))
        return None
    # "as" reads like "AS32934 Facebook, Inc."; keep the name part as a
    # fallback when org and isp are empty.
    as_name = " ".join((data.get("as") or "").split(" ")[1:])
    return {
        "org": data.get("org") or data.get("isp") or as_name or "",
        "city": data.get("city") or "",
        "region": data.get("regionName") or "",
        "country": data.get("country") or "",
    }


def enrich_ips(ips, cur, fetch=fetch_ip_info) -> dict:
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
