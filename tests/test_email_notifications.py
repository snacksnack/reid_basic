import importlib
import json
from datetime import datetime


class FakeConnection:
    def close(self):
        pass


class FakeResponse:
    def __init__(self, body=b"{}"):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.body


def test_gmail_api_send_uses_refresh_token_and_message_endpoint(monkeypatch):
    emailer = importlib.reload(importlib.import_module("scripts.emailer"))
    monkeypatch.setenv("GMAIL_CLIENT_ID", "client-id")
    monkeypatch.setenv("GMAIL_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv("GMAIL_REFRESH_TOKEN", "refresh-token")
    monkeypatch.setenv("SMTP_USERNAME", "sender@example.com")
    monkeypatch.setenv("NOTIFICATION_EMAIL", "reid@example.com")
    requests = []

    def fake_urlopen(request, timeout):
        requests.append((request, timeout))
        if request.full_url == "https://oauth2.googleapis.com/token":
            return FakeResponse(json.dumps({"access_token": "access-token"}).encode())
        return FakeResponse()

    monkeypatch.setattr(emailer.urllib.request, "urlopen", fake_urlopen)

    recipient = emailer.send_notification_email(
        subject="Test subject",
        body="Hello from tests",
        from_name="Resume Chatbot",
    )

    assert recipient == "reid@example.com"
    assert requests[0][0].full_url == "https://oauth2.googleapis.com/token"
    assert requests[1][0].full_url == "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
    assert requests[1][0].headers["Authorization"] == "Bearer access-token"
    assert json.loads(requests[1][0].data.decode())["raw"]


def test_summarizer_saves_summary_only_after_email_succeeds(monkeypatch):
    summarizer = importlib.reload(importlib.import_module("scripts.summarize_sessions"))
    events = []
    session = {
        "session_id": "session-1",
        "ip_address": "203.0.113.10",
        "user_message_count": 3,
        "started_at": datetime(2026, 6, 3, 9, 0),
        "last_message_at": datetime(2026, 6, 3, 9, 30),
    }

    monkeypatch.setattr(summarizer, "DATABASE_URL", "postgres://example")
    monkeypatch.setattr(summarizer, "OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(summarizer.psycopg2, "connect", lambda *_args, **_kwargs: FakeConnection())
    monkeypatch.setattr(summarizer, "find_unsummarized_sessions", lambda _conn: [session])
    monkeypatch.setattr(summarizer, "load_transcript", lambda _conn, _sid: [{"role": "user", "content": "Hi"}])
    monkeypatch.setattr(summarizer, "summarize", lambda _client, _transcript: "Summary text")
    monkeypatch.setattr(summarizer, "send_email", lambda _summaries: events.append("send"))
    monkeypatch.setattr(
        summarizer,
        "save_summary",
        lambda *_args: events.append("save"),
    )

    class FakeOpenAI:
        pass

    monkeypatch.setattr(summarizer, "OpenAI", FakeOpenAI)

    summarizer.run()

    assert events == ["send", "save"]


def test_summarizer_does_not_save_summary_when_email_fails(monkeypatch):
    summarizer = importlib.reload(importlib.import_module("scripts.summarize_sessions"))
    events = []
    session = {
        "session_id": "session-1",
        "ip_address": "203.0.113.10",
        "user_message_count": 3,
        "started_at": datetime(2026, 6, 3, 9, 0),
        "last_message_at": datetime(2026, 6, 3, 9, 30),
    }

    monkeypatch.setattr(summarizer, "DATABASE_URL", "postgres://example")
    monkeypatch.setattr(summarizer, "OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(summarizer.psycopg2, "connect", lambda *_args, **_kwargs: FakeConnection())
    monkeypatch.setattr(summarizer, "find_unsummarized_sessions", lambda _conn: [session])
    monkeypatch.setattr(summarizer, "load_transcript", lambda _conn, _sid: [{"role": "user", "content": "Hi"}])
    monkeypatch.setattr(summarizer, "summarize", lambda _client, _transcript: "Summary text")
    monkeypatch.setattr(
        summarizer,
        "send_email",
        lambda _summaries: (_ for _ in ()).throw(RuntimeError("email failed")),
    )
    monkeypatch.setattr(
        summarizer,
        "save_summary",
        lambda *_args: events.append("save"),
    )

    class FakeOpenAI:
        pass

    monkeypatch.setattr(summarizer, "OpenAI", FakeOpenAI)

    try:
        summarizer.run()
    except RuntimeError as e:
        assert str(e) == "email failed"

    assert events == []
