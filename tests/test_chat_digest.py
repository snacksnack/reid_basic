"""RC1-684: digest formatting - bot/human split, narratives, src tags, return flags."""

from datetime import datetime

from scripts.chat_digest import build_digest

META_UA = "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)"
CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)
HUMAN_IP = "73.10.20.30"
META_IP = "57.141.0.57"
TODAY = "Tuesday, November 24, 2026"


def t(hour, minute, second=0):
    return datetime(2026, 11, 24, hour, minute, second)


def view(ip, path, when, ua=CHROME_UA, referrer="", src=None):
    return {"ip_address": ip, "path": path, "referrer": referrer,
            "user_agent": ua, "src": src, "created_at": when}


def download(ip, fmt, when, ua=CHROME_UA):
    return {"ip_address": ip, "format": fmt, "user_agent": ua,
            "referrer": "", "created_at": when}


ENRICHMENT = {
    HUMAN_IP: {"org": "Comcast Cable", "city": "Austin", "region": "Texas",
               "country": "United States"},
    META_IP: {"org": "Meta Platforms Ireland Limited", "city": "Dublin",
              "region": "Leinster", "country": "Ireland"},
}


def _mixed_night():
    views = [
        view(HUMAN_IP, "/", t(9, 14)),
        view(HUMAN_IP, "/work", t(9, 15, 40), src="figma"),
        view(META_IP, "/", t(3, 27), ua=META_UA),
    ]
    downloads = [
        download(HUMAN_IP, "pdf", t(9, 21)),
        download(META_IP, "pdf", t(3, 27, 32), ua=META_UA),
        download(META_IP, "docx", t(7, 3, 45), ua=META_UA),
    ]
    history = {HUMAN_IP: {"prior_days": 2, "first_seen": datetime(2026, 11, 12)}}
    return build_digest(views, downloads, [], [], ENRICHMENT, history, TODAY)


class TestBotHumanSplit:
    def test_meta_crawler_lands_in_bot_traffic(self):
        _, text = _mixed_night()
        bot_section = text.split("BOT TRAFFIC")[1]
        assert META_IP in bot_section
        assert "Meta Platforms" in bot_section
        assert "2 downloads (PDF, DOCX)" in bot_section

    def test_subject_counts_humans_only(self):
        subject, _ = _mixed_night()
        assert subject.startswith("Resume Digest: 2 views, 1 download, 0 contacts, 0 chats")
        assert "(+3 bot hits)" in subject

    def test_bot_only_night_has_no_visitors_section(self):
        _, text = build_digest(
            [view(META_IP, "/", t(3, 27), ua=META_UA)], [], [], [], ENRICHMENT, {}, TODAY
        )
        assert "VISITORS" not in text
        assert "BOT TRAFFIC" in text


class TestVisitorNarrative:
    def test_narrative_is_ordered_and_includes_download(self):
        _, text = _mixed_night()
        visitor_section = text.split("VISITORS")[1].split("DOWNLOADS")[0]
        assert "Comcast Cable, Austin, Texas, United States" in visitor_section
        assert "desktop" in visitor_section
        lines = [ln.strip() for ln in visitor_section.splitlines() if ln.strip()]
        events = [ln for ln in lines if ln[0].isdigit()]
        assert events[0].endswith("/")
        assert events[1].endswith("/work")
        assert events[2].endswith("PDF download")

    def test_return_flag_and_src_tag_on_headline(self):
        _, text = _mixed_night()
        headline = [ln for ln in text.splitlines() if ln.startswith("* ")][0]
        assert "returning: seen 2 prior days, first Nov 12" in headline
        assert "src: figma" in headline

    def test_first_time_visitor_has_no_return_flag(self):
        _, text = build_digest(
            [view(HUMAN_IP, "/", t(9, 0))], [], [], [], ENRICHMENT, {}, TODAY
        )
        assert "returning" not in text


class TestSrcRollup:
    def test_src_tags_counted(self):
        _, text = _mixed_night()
        assert "By src tag:" in text
        assert "figma - 1" in text

    def test_no_src_section_when_untagged(self):
        _, text = build_digest(
            [view(HUMAN_IP, "/", t(9, 0))], [], [], [], ENRICHMENT, {}, TODAY
        )
        assert "By src tag:" not in text


GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"


class TestPerEventClassification:
    def test_browser_then_crawler_at_same_ip(self):
        views = [
            view(HUMAN_IP, "/", t(9, 0)),
            view(HUMAN_IP, "/work", t(9, 5), ua=GOOGLEBOT_UA),
        ]
        subject, text = build_digest(views, [], [], [], ENRICHMENT, {}, TODAY)
        assert subject.startswith("Resume Digest: 1 view,")
        assert "(+1 bot hits)" in subject
        assert HUMAN_IP in text.split("BOT TRAFFIC")[1]

    def test_crawler_then_browser_at_same_ip(self):
        views = [
            view(HUMAN_IP, "/", t(9, 0), ua=GOOGLEBOT_UA),
            view(HUMAN_IP, "/work", t(9, 5)),
        ]
        subject, text = build_digest(views, [], [], [], ENRICHMENT, {}, TODAY)
        assert subject.startswith("Resume Digest: 1 view,")
        assert "(+1 bot hits)" in subject
        assert HUMAN_IP in text.split("BOT TRAFFIC")[1]

    def test_bot_download_does_not_ride_a_human_view(self):
        views = [view(HUMAN_IP, "/", t(9, 0))]
        downloads = [download(HUMAN_IP, "pdf", t(9, 1), ua="GPTBot/1.0")]
        subject, text = build_digest(views, downloads, [], [], ENRICHMENT, {}, TODAY)
        assert "1 view, 0 downloads" in subject
        assert "1 downloads (PDF)" in text.split("BOT TRAFFIC")[1]

    def test_human_download_does_not_ride_a_bot_view(self):
        views = [view(HUMAN_IP, "/", t(9, 0), ua=GOOGLEBOT_UA)]
        downloads = [download(HUMAN_IP, "pdf", t(9, 1))]
        subject, text = build_digest(views, downloads, [], [], ENRICHMENT, {}, TODAY)
        assert "0 views, 1 download" in subject
        assert "PDF download" in text.split("VISITORS")[1].split("BOT TRAFFIC")[0]


class TestSuspectedAutomation:
    def test_crawler_org_annotates_but_keeps_the_visitor(self):
        enrichment = {
            HUMAN_IP: {"org": "Anthropic, PBC", "city": "San Francisco",
                       "region": "California", "country": "United States"}
        }
        subject, text = build_digest(
            [view(HUMAN_IP, "/", t(9, 0))], [], [], [], enrichment, {}, TODAY
        )
        assert subject.startswith("Resume Digest: 1 view,")
        headline = [ln for ln in text.splitlines() if ln.startswith("* ")][0]
        assert "suspected automation (crawler org)" in headline
        assert "BOT TRAFFIC" not in text

    def test_residential_org_is_not_annotated(self):
        _, text = build_digest(
            [view(HUMAN_IP, "/", t(9, 0))], [], [], [], ENRICHMENT, {}, TODAY
        )
        assert "suspected automation" not in text


class TestUnknownIp:
    def test_unenriched_human_still_renders(self):
        _, text = build_digest(
            [view("203.0.113.9", "/", t(10, 0))], [], [], [], {}, {}, TODAY
        )
        assert "203.0.113.9 - location unknown - desktop" in text
