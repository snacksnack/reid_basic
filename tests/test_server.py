import json
import os

from app import TOOLS, execute_tool_call


class TestDownload:
    def test_returns_404_for_invalid_format(self, client):
        res = client.get("/api/download/txt")
        assert res.status_code == 404
        assert res.json["error"] == "invalid format"

    def test_recognizes_valid_format(self, client):
        res = client.get("/api/download/pdf")
        if res.status_code == 404:
            assert res.json["error"] != "invalid format"


class TestPageview:
    def test_returns_204(self, client):
        res = client.post(
            "/api/pageview",
            json={"path": "/", "referrer": ""},
        )
        assert res.status_code == 204


class TestContact:
    def test_rejects_empty_body(self, client):
        res = client.post("/api/contact", json={})
        assert res.status_code == 400
        assert "required" in res.json["error"].lower()

    def test_rejects_missing_name(self, client):
        res = client.post(
            "/api/contact",
            json={"email": "a@b.com", "message": "hi"},
        )
        assert res.status_code == 400

    def test_accepts_valid_submission(self, client):
        res = client.post(
            "/api/contact",
            json={"name": "Test", "email": "test@test.com", "message": "Hello"},
        )
        assert res.status_code == 200
        assert res.json["ok"] is True


class TestChat:
    def test_rejects_empty_messages(self, client):
        res = client.post("/api/chat", json={"messages": []})
        assert res.status_code == 400
        assert "messages" in res.json["error"].lower()

    def test_rejects_missing_messages(self, client):
        res = client.post("/api/chat", json={})
        assert res.status_code == 400


class TestToolsDefinition:
    def test_exports_non_empty_tools_array(self):
        assert isinstance(TOOLS, list)
        assert len(TOOLS) > 0

    def test_schedule_meeting_schema(self):
        tool = next(
            (t for t in TOOLS if t["function"]["name"] == "schedule_meeting"), None
        )
        assert tool is not None
        assert tool["type"] == "function"
        assert "topic" in tool["function"]["parameters"]["properties"]

    def test_send_contact_schema(self):
        tool = next(
            (t for t in TOOLS if t["function"]["name"] == "send_contact"), None
        )
        assert tool is not None
        assert tool["type"] == "function"
        props = tool["function"]["parameters"]["properties"]
        assert set(tool["function"]["parameters"]["required"]) == {
            "name",
            "email",
            "message",
        }
        assert set(props.keys()) == {"name", "email", "message"}


class TestExecuteToolCall:
    def test_returns_scheduling_url_when_set(self):
        os.environ["SCHEDULING_URL"] = "https://calendly.com/test"
        result = json.loads(
            execute_tool_call("schedule_meeting", {"topic": "engineering role"})
        )
        assert result["available"] is True
        assert result["scheduling_url"] == "https://calendly.com/test"
        assert result["topic"] == "engineering role"
        del os.environ["SCHEDULING_URL"]

    def test_returns_fallback_when_not_set(self):
        os.environ.pop("SCHEDULING_URL", None)
        result = json.loads(execute_tool_call("schedule_meeting", {}))
        assert result["available"] is False
        assert result["fallback_email"] == "hire.reid.collins@gmail.com"

    def test_handles_unknown_tool(self):
        result = json.loads(execute_tool_call("unknown_tool", {}))
        assert "unknown tool" in result["error"].lower()

    def test_send_contact_rejects_empty_fields(self):
        result = json.loads(
            execute_tool_call(
                "send_contact",
                {"name": "", "email": "a@b.com", "message": "hi"},
                client_ip="203.0.113.50",
            )
        )
        assert result["ok"] is False
        assert result["error"] == "validation"

    def test_send_contact_rejects_invalid_email(self):
        result = json.loads(
            execute_tool_call(
                "send_contact",
                {"name": "Test", "email": "not-an-email", "message": "Hello"},
                client_ip="203.0.113.51",
            )
        )
        assert result["ok"] is False
        assert result["error"] == "validation"
        assert "email" in result["message"].lower()

    def test_send_contact_accepts_valid_payload(self):
        result = json.loads(
            execute_tool_call(
                "send_contact",
                {
                    "name": "Tool Test",
                    "email": "tooltest@example.com",
                    "message": "Sent via execute_tool_call test",
                },
                client_ip="203.0.113.52",
            )
        )
        assert result["ok"] is True
