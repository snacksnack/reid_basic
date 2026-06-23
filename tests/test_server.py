import json
import os

import pytest

from app import (
    TOOLS,
    FIT_CARD_TOOL,
    MATCH_MAX_CHARS,
    _build_fit_card,
    execute_tool_call,
    _chunk_resume,
    _retrieve_context,
    _resume_path,
)


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
    def test_rejects_missing_message(self, client):
        res = client.post("/api/chat", json={})
        assert res.status_code == 400
        assert "message" in res.json["error"].lower()

    def test_rejects_empty_message_string(self, client):
        res = client.post("/api/chat", json={"message": "   "})
        assert res.status_code == 400
        assert "message" in res.json["error"].lower()

    def test_rejects_non_string_message(self, client):
        res = client.post("/api/chat", json={"message": []})
        assert res.status_code == 400

    def test_bare_match_returns_prompt_without_model(self, client):
        # "/match" with no job description is answered statically — no model
        # call — so it works even when chat is unconfigured, and never 503s.
        res = client.post("/api/chat", json={"message": "/match"})
        assert res.status_code == 200
        assert "job description" in res.json["reply"].lower()
        assert "fitCard" not in res.json


class _Block:
    """Minimal stand-in for an Anthropic content block."""

    def __init__(self, type, name=None, input=None, text=None):
        self.type = type
        self.name = name
        self.input = input
        self.text = text


class _Resp:
    def __init__(self, content):
        self.content = content


class _FakeMessages:
    def __init__(self, response=None, error=None):
        self._response = response
        self._error = error
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self._error:
            raise self._error
        return self._response


class _FakeClient:
    def __init__(self, response=None, error=None):
        self.messages = _FakeMessages(response, error)


class TestMatchEndpoint:
    """Covers the forced-tool /match branch of the chat endpoint."""

    def _patch_client(self, monkeypatch, fake):
        import app as app_module

        monkeypatch.setattr(app_module, "anthropic_client", fake)
        return fake

    def test_returns_structured_fit_card_via_forced_tool(self, client, monkeypatch):
        tool_block = _Block(
            "tool_use",
            name="render_fit_card",
            input={
                "role_title": "Senior Backend Engineer",
                "verdict": "good",
                "verdict_label": "Good fit, some gaps",
                "strengths": ["Python depth"],
                "transferable": ["ECS → K8s"],
                "gaps": ["No production Kubernetes"],
                "summary": "Strong backend fit.",
            },
        )
        fake = self._patch_client(monkeypatch, _FakeClient(_Resp([tool_block])))

        res = client.post(
            "/api/chat",
            json={"message": "/match Backend role needs Python and K8s", "sessionId": "m1"},
        )

        assert res.status_code == 200
        body = res.json
        card = body["fitCard"]
        assert card["roleTitle"] == "Senior Backend Engineer"
        assert card["verdict"] == "good"
        assert card["gaps"] == ["No production Kubernetes"]
        assert card["sectionsReviewed"] >= 1
        assert body["reply"]  # conversational follow-up accompanies the card

        # The model call must force the render_fit_card tool.
        kwargs = fake.messages.calls[0]
        assert kwargs["tool_choice"] == {"type": "tool", "name": "render_fit_card"}

    def test_falls_back_when_model_returns_no_tool_block(self, client, monkeypatch):
        self._patch_client(monkeypatch, _FakeClient(_Resp([_Block("text", text="hi")])))

        res = client.post(
            "/api/chat", json={"message": "/match some role", "sessionId": "m2"}
        )

        assert res.status_code == 200
        assert "fitCard" not in res.json
        assert "couldn't analyze" in res.json["reply"].lower()

    def test_falls_back_gracefully_on_api_error(self, client, monkeypatch):
        self._patch_client(monkeypatch, _FakeClient(error=RuntimeError("boom")))

        res = client.post(
            "/api/chat", json={"message": "/match some role", "sessionId": "m3"}
        )

        assert res.status_code == 200
        assert "fitCard" not in res.json
        assert "couldn't analyze" in res.json["reply"].lower()

    def test_caps_oversized_job_description_before_the_api_call(self, client, monkeypatch):
        tool_block = _Block(
            "tool_use",
            name="render_fit_card",
            input={
                "role_title": "X",
                "verdict": "good",
                "verdict_label": "Good fit",
                "strengths": ["a"],
                "transferable": [],
                "gaps": [],
                "summary": "s",
            },
        )
        fake = self._patch_client(monkeypatch, _FakeClient(_Resp([tool_block])))

        huge = "x" * (MATCH_MAX_CHARS + 5000)
        res = client.post(
            "/api/chat", json={"message": "/match " + huge, "sessionId": "m4"}
        )

        assert res.status_code == 200
        sent = fake.messages.calls[0]["messages"][0]["content"]
        assert len(sent) <= MATCH_MAX_CHARS


class TestFitCardTool:
    def test_schema_requires_honest_gaps(self):
        props = FIT_CARD_TOOL["input_schema"]["properties"]
        required = FIT_CARD_TOOL["input_schema"]["required"]
        assert FIT_CARD_TOOL["name"] == "render_fit_card"
        for field in ("role_title", "verdict", "strengths", "transferable", "gaps", "summary"):
            assert field in props
            assert field in required
        assert props["verdict"]["enum"] == ["strong", "good", "partial"]

    def test_build_fit_card_normalizes_to_camel_case(self):
        card = _build_fit_card(
            {
                "role_title": "Senior Backend Engineer",
                "verdict": "good",
                "verdict_label": "Good fit, some gaps",
                "strengths": ["7+ yrs backend", "  AWS at scale  "],
                "transferable": ["ECS → K8s"],
                "gaps": ["No production Kubernetes"],
                "summary": "Strong backend fit; main gap is K8s.",
            },
            sections_reviewed=8,
        )
        assert card["roleTitle"] == "Senior Backend Engineer"
        assert card["verdict"] == "good"
        assert card["strengths"] == ["7+ yrs backend", "AWS at scale"]
        assert card["gaps"] == ["No production Kubernetes"]
        assert card["sectionsReviewed"] == 8

    def test_build_fit_card_defaults_unknown_verdict(self):
        card = _build_fit_card({"verdict": "amazing"}, sections_reviewed=0)
        assert card["verdict"] == "good"
        assert card["roleTitle"] == "this role"
        assert card["strengths"] == []
        assert card["gaps"] == []


class TestToolsDefinition:
    def test_exports_non_empty_tools_array(self):
        assert isinstance(TOOLS, list)
        assert len(TOOLS) > 0

    def test_schedule_meeting_schema(self):
        tool = next(
            (t for t in TOOLS if t["name"] == "schedule_meeting"), None
        )
        assert tool is not None
        assert "input_schema" in tool
        assert "topic" in tool["input_schema"]["properties"]

    def test_send_contact_schema(self):
        tool = next(
            (t for t in TOOLS if t["name"] == "send_contact"), None
        )
        assert tool is not None
        assert "input_schema" in tool
        props = tool["input_schema"]["properties"]
        assert set(tool["input_schema"]["required"]) == {
            "name",
            "email",
            "message",
        }
        assert set(props.keys()) == {"name", "email", "message"}


class TestExecuteToolCall:
    def test_returns_scheduling_link_when_set(self):
        os.environ["SCHEDULING_URL"] = "https://calendly.com/test"
        result = json.loads(
            execute_tool_call("schedule_meeting", {"topic": "engineering role"})
        )
        assert result["available"] is True
        assert result["scheduling_link"] == "[scheduling link](https://calendly.com/test)"
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


# ---------------------------------------------------------------------------
# RAG tests
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def resume_text():
    return _resume_path.read_text()


class TestChunkResume:
    def test_produces_expected_chunk_count(self, resume_text):
        # 10 chunks: contact, summary, 4 Marigold sub-sections, Cheetah Digital,
        # CheetahMail, skills, education+certifications (merged).
        chunks = _chunk_resume(resume_text)
        assert len(chunks) == 10

    def test_all_chunks_have_non_empty_text_and_metadata(self, resume_text):
        chunks = _chunk_resume(resume_text)
        for chunk in chunks:
            assert "text" in chunk and chunk["text"].strip()
            assert "metadata" in chunk and isinstance(chunk["metadata"], dict)

    def test_bare_professional_experience_marker_is_excluded(self, resume_text):
        # "PROFESSIONAL EXPERIENCE" is a structural header with no content of
        # its own and should not appear as a standalone chunk.
        chunks = _chunk_resume(resume_text)
        texts = [c["text"] for c in chunks]
        assert not any(t.strip() == "PROFESSIONAL EXPERIENCE" for t in texts)

    def test_marigold_produces_four_subsection_chunks(self, resume_text):
        chunks = _chunk_resume(resume_text)
        marigold = [c for c in chunks if c["metadata"].get("employer") == "Marigold (acquired by Zeta Global)"]
        assert len(marigold) == 4

    def test_marigold_subsection_chunks_are_prefixed_with_employer_line(self, resume_text):
        # Self-containedness: each sub-section chunk must include the employer
        # header so it is unambiguous when retrieved in isolation.
        chunks = _chunk_resume(resume_text)
        marigold = [c for c in chunks if c["metadata"].get("employer") == "Marigold (acquired by Zeta Global)"]
        for chunk in marigold:
            assert chunk["text"].startswith("Marigold (acquired by Zeta Global)")

    def test_marigold_subsection_names_are_captured_in_metadata(self, resume_text):
        chunks = _chunk_resume(resume_text)
        subsections = {
            c["metadata"]["subsection"]
            for c in chunks
            if "subsection" in c["metadata"]
        }
        assert "Program Leadership & Delivery" in subsections
        assert "Platform & Backend Systems" in subsections
        assert "Machine Learning / Data Platform" in subsections
        assert "Observability & Reliability" in subsections

    def test_employer_with_inline_bullets_is_not_prefixed(self, resume_text):
        # Cheetah Digital has no sub-sections, so its chunk starts with its
        # own employer line rather than a prepended employer prefix.
        chunks = _chunk_resume(resume_text)
        cheetah = next(
            (c for c in chunks if c["metadata"].get("employer") == "Cheetah Digital"),
            None,
        )
        assert cheetah is not None
        assert cheetah["text"].startswith("Cheetah Digital")

    def test_section_metadata_covers_all_expected_values(self, resume_text):
        chunks = _chunk_resume(resume_text)
        sections = {c["metadata"]["section"] for c in chunks}
        assert sections >= {"contact", "summary", "experience", "skills", "education_and_certifications"}

    def test_education_and_certifications_are_merged(self, resume_text):
        # Short chunks are merged so the embedder has more signal to work with.
        chunks = _chunk_resume(resume_text)
        merged = next(c for c in chunks if c["metadata"]["section"] == "education_and_certifications")
        assert "Tulane" in merged["text"]
        assert "Scrum Master" in merged["text"]
        # There should be no separate certifications-only chunk.
        assert not any(c["metadata"]["section"] == "certifications" for c in chunks)

    def test_skills_chunk_contains_expected_languages(self, resume_text):
        chunks = _chunk_resume(resume_text)
        skills_chunk = next(c for c in chunks if c["metadata"]["section"] == "skills")
        assert "Python" in skills_chunk["text"]
        assert "AWS" in skills_chunk["text"]


class TestRetrieveContext:
    def test_falls_back_to_full_resume_when_index_is_unavailable(self, resume_text):
        # In the test environment there is no OPENAI_API_KEY, so
        # _resume_collection is None and _retrieve_context must return the
        # full resume text rather than raising an exception.
        result = _retrieve_context("AWS experience")
        assert result == resume_text

    def test_fallback_is_non_empty(self):
        result = _retrieve_context("skills")
        assert result.strip()
