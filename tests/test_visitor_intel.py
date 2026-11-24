"""RC1-684: bot/human classification, device detection, enrichment cache."""

import visitor_intel as vi

META_UA = "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)"
CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)
IPHONE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
)


class TestIsBot:
    def test_named_crawlers_are_bots(self):
        for ua in (META_UA, "GPTBot/1.0", "Googlebot/2.1", "ClaudeBot/1.0", "curl/8.4.0"):
            assert vi.is_bot(ua)

    def test_empty_user_agent_is_a_bot(self):
        assert vi.is_bot("")
        assert vi.is_bot(None)

    def test_browsers_are_human(self):
        assert not vi.is_bot(CHROME_UA)
        assert not vi.is_bot(IPHONE_UA)

    def test_user_agent_is_the_only_bot_evidence(self):
        # A recruiter on any corporate network must stay human; the owning
        # org can only mark a visitor as suspected (is_crawler_org).
        assert not vi.is_bot(CHROME_UA)


class TestIsCrawlerOrg:
    def test_crawler_infrastructure_orgs_match(self):
        assert vi.is_crawler_org("Meta Platforms Ireland Limited")
        assert vi.is_crawler_org("OpenAI, LLC")

    def test_employer_orgs_and_unknowns_do_not_match(self):
        assert not vi.is_crawler_org("Google LLC")
        assert not vi.is_crawler_org("Microsoft Corporation")
        assert not vi.is_crawler_org(None)
        assert not vi.is_crawler_org("")


class TestDeviceType:
    def test_desktop_mobile_tablet(self):
        assert vi.device_type(CHROME_UA) == "desktop"
        assert vi.device_type(IPHONE_UA) == "mobile"
        assert vi.device_type("Mozilla/5.0 (iPad; CPU OS 17_5 ...)") == "tablet"
        assert vi.device_type("") == "unknown"


class FakeCursor:
    """Just enough cursor for enrich_ips: one SELECT then INSERTs."""

    def __init__(self, cached_rows):
        self._cached = cached_rows
        self.inserts = []
        self._last_query = ""

    def execute(self, query, params=None):
        self._last_query = query
        if query.lstrip().upper().startswith("INSERT"):
            self.inserts.append(params)

    def fetchall(self):
        return self._cached


class TestEnrichIps:
    def test_cached_ip_is_not_looked_up_again(self):
        cur = FakeCursor(
            [{"ip": "57.141.0.57", "org": "Meta Platforms", "city": "Dublin",
              "region": "Leinster", "country": "Ireland"}]
        )
        calls = []

        def fetch(ip):
            calls.append(ip)
            return {"org": "x", "city": "", "region": "", "country": ""}

        result = vi.enrich_ips(["57.141.0.57"], cur, fetch=fetch)
        assert calls == []
        assert cur.inserts == []
        assert result["57.141.0.57"]["org"] == "Meta Platforms"

    def test_new_ip_is_fetched_and_cached(self):
        cur = FakeCursor([])
        info = {"org": "Comcast Cable", "city": "Austin", "region": "Texas",
                "country": "United States"}
        result = vi.enrich_ips(["73.10.20.30"], cur, fetch=lambda ip: info)
        assert result["73.10.20.30"] == info
        assert len(cur.inserts) == 1
        assert cur.inserts[0][0] == "73.10.20.30"

    def test_failed_lookup_is_not_cached(self):
        cur = FakeCursor([])
        result = vi.enrich_ips(["73.10.20.30"], cur, fetch=lambda ip: None)
        assert result == {}
        assert cur.inserts == []

    def test_lookups_are_paced_between_requests(self):
        cur = FakeCursor([])
        pauses = []
        info = {"org": "x", "city": "", "region": "", "country": ""}
        vi.enrich_ips(
            ["73.10.20.30", "73.10.20.31", "73.10.20.32"],
            cur,
            fetch=lambda ip: info,
            pause=pauses.append,
        )
        # No pause before the first lookup, one before each later one.
        assert pauses == [vi.LOOKUP_PAUSE_SECONDS] * 2

    def test_cached_ips_consume_no_pause(self):
        cur = FakeCursor(
            [{"ip": "57.141.0.57", "org": "Meta Platforms", "city": "",
              "region": "", "country": ""}]
        )
        pauses = []
        vi.enrich_ips(
            ["57.141.0.57"], cur, fetch=lambda ip: None, pause=pauses.append
        )
        assert pauses == []

    def test_private_and_garbage_ips_are_skipped(self):
        cur = FakeCursor([])
        calls = []
        vi.enrich_ips(
            ["127.0.0.1", "10.0.0.5", "unknown", "", None],
            cur,
            fetch=lambda ip: calls.append(ip),
        )
        assert calls == []


class TestLocationLine:
    def test_joins_known_parts(self):
        assert (
            vi.location_line({"org": "Comcast", "city": "Austin", "region": "Texas",
                              "country": "United States"})
            == "Comcast, Austin, Texas, United States"
        )

    def test_empty_when_unknown(self):
        assert vi.location_line(None) == ""
        assert vi.location_line({"org": "", "city": "", "region": "", "country": ""}) == ""
