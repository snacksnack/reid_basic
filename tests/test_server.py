import contextlib
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
    _static_asset,
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


class _SequenceMessages(_FakeMessages):
    """Returns one queued response per create() call."""

    def __init__(self, responses):
        super().__init__()
        self._responses = list(responses)

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self._responses.pop(0)


class TestChatHallucinationContext:
    """RC1-444: every chat-loop model call carries the question and the
    grounding text the hallucination judge compares the answer against."""

    def _patch(self, monkeypatch, responses):
        import app as app_module
        import observability

        class RecordingLLMObs:
            enabled = True

            def __init__(self):
                self.prompts = []

            def annotation_context(self, prompt, tags):
                self.prompts.append(prompt)
                return contextlib.nullcontext()

        llmobs = RecordingLLMObs()
        monkeypatch.setattr(observability, "LLMObs", llmobs)
        client = _FakeClient()
        client.messages = _SequenceMessages(responses)
        monkeypatch.setattr(app_module, "anthropic_client", client)
        return llmobs, client

    def test_turn_annotates_question_and_retrieved_context(self, client, monkeypatch):
        llmobs, fake = self._patch(
            monkeypatch, [_Resp([_Block("text", text="He was at Marigold.")])]
        )

        res = client.post(
            "/api/chat",
            json={"message": "Where did Reid work before Marigold?", "sessionId": "h1"},
        )

        assert res.status_code == 200
        assert len(llmobs.prompts) == 1
        prompt = llmobs.prompts[0]
        assert prompt["variables"]["query"] == "Where did Reid work before Marigold?"
        context = prompt["variables"]["context"]
        assert context
        # RC1-480: the grounding is the catalog plus the retrieved context —
        # the judge must see the same evidence the model saw. Both halves
        # appear in the system prompt (the catalog under its own label, the
        # retrieved text under the context heading).
        catalog_part, retrieved_part = context.split("\n\n---\n\n", 1)
        assert catalog_part.startswith("Project: Reid Collins's project portfolio")
        system = fake.messages.calls[0]["system"]
        assert catalog_part in system
        assert retrieved_part in system
        assert prompt["rag_context_variables"] == ["context"]
        assert prompt["rag_query_variables"] == ["query"]

    def test_tool_results_join_the_context_for_the_next_call(self, client, monkeypatch):
        tool_round = _Resp(
            [_Block("tool_use", name="schedule_meeting", input={})]
        )
        tool_round.content[0].id = "tu_1"
        llmobs, _ = self._patch(
            monkeypatch,
            [tool_round, _Resp([_Block("text", text="Here's the link.")])],
        )
        monkeypatch.setenv("SCHEDULING_URL", "https://cal.example/reid")

        res = client.post(
            "/api/chat",
            json={"message": "Can I book a call with Reid?", "sessionId": "h2"},
        )

        assert res.status_code == 200
        first, second = (p["variables"]["context"] for p in llmobs.prompts)
        assert "cal.example" not in first
        assert second.startswith(first)
        assert "Result of tool schedule_meeting" in second
        assert "cal.example" in second


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


@pytest.fixture(scope="module")
def projects_text():
    from app import _projects_path

    return _projects_path.read_text()


@pytest.fixture(scope="module")
def corpus_text(resume_text, projects_text):
    # What _fallback_text(None) returns: the chat path's degraded-mode context.
    return f"{resume_text}\n\n---\n\n{projects_text}"


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
        marigold = [c for c in chunks if c["metadata"].get("employer") == "Zeta Global (acquired Marigold, November 2025)"]
        assert len(marigold) == 4

    def test_marigold_subsection_chunks_are_prefixed_with_employer_line(self, resume_text):
        # Self-containedness: each sub-section chunk must include the employer
        # header so it is unambiguous when retrieved in isolation.
        chunks = _chunk_resume(resume_text)
        marigold = [c for c in chunks if c["metadata"].get("employer") == "Zeta Global (acquired Marigold, November 2025)"]
        for chunk in marigold:
            assert chunk["text"].startswith("Zeta Global (acquired Marigold, November 2025)")

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


class TestChunkProjects:
    """RC1-478: the project corpus rendered from the /work TS data files."""

    EXPECTED_SLUGS = {
        "launch-planner",
        "drift-detector",
        "incident-summarizer",
        "pr-review-agent",
        "automation-suite",
        "job-search-agent",
        "concert-intelligence",
        "agent-evals",
        "fleet-observability",
        "portfolio",  # the catalog chunk (RC1-479)
    }

    def test_every_paragraph_becomes_a_chunk(self, projects_text):
        from app import _chunk_projects

        paragraphs = [p for p in projects_text.split("\n\n") if p.strip()]
        chunks = _chunk_projects(projects_text)
        assert len(chunks) == len(paragraphs)

    def test_all_nine_projects_are_present(self, projects_text):
        from app import _chunk_projects

        slugs = {c["metadata"]["project"] for c in _chunk_projects(projects_text)}
        assert slugs == self.EXPECTED_SLUGS

    def test_chunks_are_self_contained_with_project_headers(self, projects_text):
        from app import _chunk_projects

        for chunk in _chunk_projects(projects_text):
            assert chunk["text"].startswith("Project: ")
            assert chunk["metadata"]["section"] == "project"
            assert chunk["metadata"]["project_name"]

    def test_aspect_chunks_carry_aspect_metadata(self, projects_text):
        from app import _chunk_projects

        aspects = {
            (c["metadata"]["project"], c["metadata"].get("aspect"))
            for c in _chunk_projects(projects_text)
        }
        # Overview chunks have no aspect; facet chunks name theirs.
        assert ("launch-planner", None) in aspects
        assert ("launch-planner", "pipeline") in aspects
        assert ("drift-detector", "chains") in aspects

    def test_headerless_paragraph_is_skipped_not_indexed(self):
        from app import _chunk_projects

        text = "Project: Real Thing [real-thing]\nA line.\n\nStray paragraph, no header."
        chunks = _chunk_projects(text)
        assert len(chunks) == 1
        assert chunks[0]["metadata"]["project"] == "real-thing"


class TestProjectCatalog:
    """RC1-479: the portfolio catalog rides in the chat system prompt."""

    def test_catalog_is_loaded_and_names_every_project(self):
        import app as app_module

        assert app_module._project_catalog_text
        for name in (
            "Launch Planner",
            "Dependency Drift Detector",
            "AI Incident Summarizer",
            "PR Review Agent",
            "TPM Workflow Automation",
            "Job Scout",
            "Concert Intelligence Agent",
            "Agent Evals",
            "Fleet Observability",
        ):
            assert name in app_module._project_catalog_text

    def test_catalog_refreshes_when_the_index_rebuilds(self, monkeypatch, tmp_path):
        import app as app_module

        projects_copy = tmp_path / "projects-prompt.txt"
        projects_copy.write_text(
            "Project: New Portfolio [portfolio]\n- Only Project [only]: One line.\n"
        )
        monkeypatch.setattr(app_module, "_projects_path", projects_copy)
        monkeypatch.setattr(app_module, "_project_catalog_text", "stale")
        app_module._build_resume_index()
        assert app_module._project_catalog_text.startswith("Project: New Portfolio")


class TestRetrieveContext:
    def test_falls_back_to_full_corpus_when_index_is_unavailable(self, corpus_text):
        # In the test environment there is no OPENAI_API_KEY (or
        # PINECONE_API_KEY), so _resume_index is None and _retrieve_context
        # must return the full corpus text rather than raising an exception.
        result = _retrieve_context("AWS experience")
        assert result == corpus_text

    def test_resume_filtered_fallback_returns_resume_only(self, resume_text):
        # /match passes source="resume"; its degraded mode must not widen the
        # fit card's evidence to the project corpus (RC1-478).
        result = _retrieve_context("job description", source="resume")
        assert result == resume_text

    def test_fallback_is_non_empty(self):
        result = _retrieve_context("skills")
        assert result.strip()


class _FakeMatch:
    def __init__(self, text, section, score):
        self.metadata = {"text": text, "section": section}
        self.score = score


class _FakeQueryResponse:
    def __init__(self, matches):
        self.matches = matches


class _FakeEmbeddingsClient:
    """Stands in for the OpenAI client: embeddings.create -> fixed vectors."""

    class _Embeddings:
        def create(self, model, input):
            class _Item:
                embedding = [0.0] * 8

            class _Response:
                data = [_Item() for _ in input]

            return _Response()

    embeddings = _Embeddings()


class TestRetrieveContextWithIndex:
    """The Pinecone path, offline: a fake index returns canned matches."""

    @pytest.fixture
    def app_module(self, monkeypatch):
        import app as app_module

        monkeypatch.setattr(app_module, "openai_client", _FakeEmbeddingsClient())
        monkeypatch.setattr(app_module, "_resume_namespace", "kb-testhash")
        monkeypatch.setattr(
            app_module, "_resume_chunks_list", ["chunk a", "chunk b", "chunk c", "chunk d"]
        )
        # Corpus = 4 resume chunks + 2 project chunks (RC1-478).
        monkeypatch.setattr(app_module, "_corpus_chunk_count", 6)
        return app_module

    def test_joins_retrieved_chunk_texts_in_score_order(self, app_module, monkeypatch):
        class FakeIndex:
            def query(self, **kwargs):
                self.kwargs = kwargs
                return _FakeQueryResponse(
                    [
                        _FakeMatch("chunk b", "experience", 0.91),
                        _FakeMatch("chunk d", "skills", 0.72),
                    ]
                )

        fake = FakeIndex()
        monkeypatch.setattr(app_module, "_resume_index", fake)
        result = app_module._retrieve_context("AWS experience", n_results=2)
        assert result == "chunk b\n\n---\n\nchunk d"
        # The query must stay scoped to the current corpus version's
        # namespace, or a stale version could answer.
        assert fake.kwargs["namespace"] == "kb-testhash"
        assert fake.kwargs["top_k"] == 2
        assert fake.kwargs["include_metadata"] is True
        # The chat path searches the whole corpus: no source filter.
        assert "filter" not in fake.kwargs

    def test_top_k_is_capped_at_the_corpus_chunk_count(self, app_module, monkeypatch):
        class FakeIndex:
            def query(self, **kwargs):
                self.kwargs = kwargs
                return _FakeQueryResponse([_FakeMatch("chunk a", "summary", 0.5)])

        fake = FakeIndex()
        monkeypatch.setattr(app_module, "_resume_index", fake)
        app_module._retrieve_context("everything", n_results=99)
        assert fake.kwargs["top_k"] == 6

    def test_resume_source_filters_and_caps_at_resume_chunk_count(
        self, app_module, monkeypatch
    ):
        # RC1-478: /match retrieves with source="resume" — the Pinecone query
        # must carry the metadata filter and cap top_k at the resume chunk
        # count, not the whole corpus.
        class FakeIndex:
            def query(self, **kwargs):
                self.kwargs = kwargs
                return _FakeQueryResponse([_FakeMatch("chunk a", "summary", 0.5)])

        fake = FakeIndex()
        monkeypatch.setattr(app_module, "_resume_index", fake)
        app_module._retrieve_context("job description", n_results=99, source="resume")
        assert fake.kwargs["top_k"] == 4
        assert fake.kwargs["filter"] == {"source": {"$eq": "resume"}}

    def test_empty_matches_fall_back_to_full_corpus(self, app_module, monkeypatch, corpus_text):
        # A fresh upsert is eventually consistent: a query can land before
        # the vectors are queryable and legitimately return nothing.
        class FakeIndex:
            def query(self, **kwargs):
                return _FakeQueryResponse([])

        monkeypatch.setattr(app_module, "_resume_index", FakeIndex())
        assert app_module._retrieve_context("anything") == corpus_text

    def test_query_error_falls_back_to_full_corpus(self, app_module, monkeypatch, corpus_text):
        class FakeIndex:
            def query(self, **kwargs):
                raise RuntimeError("pinecone unavailable")

        monkeypatch.setattr(app_module, "_resume_index", FakeIndex())
        assert app_module._retrieve_context("anything") == corpus_text


class TestStaticAsset:
    """The SPA catch-all resolves user-supplied paths under dist/ only (RC1-368)."""

    @pytest.fixture
    def root(self, tmp_path):
        (tmp_path / "dist" / "assets").mkdir(parents=True)
        (tmp_path / "dist" / "assets" / "app.js").write_text("// js")
        (tmp_path / "dist" / "index.html").write_text("<html></html>")
        (tmp_path / "secret.txt").write_text("outside dist")
        return str(tmp_path / "dist")

    def test_file_under_root_is_returned_relative(self, root):
        assert _static_asset(root, "assets/app.js") == os.path.join("assets", "app.js")

    def test_dotdot_that_stays_under_root_is_normalised(self, root):
        assert _static_asset(root, "assets/../assets/app.js") == os.path.join("assets", "app.js")

    @pytest.mark.parametrize(
        "path",
        ["../secret.txt", "assets/../../secret.txt", "..", "/etc/passwd"],
    )
    def test_paths_escaping_root_are_rejected(self, root, path):
        assert _static_asset(root, path) is None

    def test_directory_and_missing_file_are_rejected(self, root):
        assert _static_asset(root, "assets") is None
        assert _static_asset(root, "nope.js") is None

    def test_empty_path_is_rejected(self, root):
        assert _static_asset(root, "") is None


class TestResumeWatcherWithoutKey:
    """RC1-381: with no OpenAI key the skip warning must fire once, not every tick."""

    def test_skip_warning_fires_once_until_resume_changes(self, monkeypatch, caplog, tmp_path):
        import logging

        import app as app_module

        resume_copy = tmp_path / "resume-prompt.txt"
        resume_copy.write_text("REID COLLINS\n\nSUMMARY\nfirst version\n")
        monkeypatch.setattr(app_module, "openai_client", None)
        monkeypatch.setattr(app_module, "_resume_path", resume_copy)
        monkeypatch.setattr(app_module, "_resume_hash", "")

        def skip_warnings():
            return [r for r in caplog.records if "RAG index skipped" in r.getMessage()]

        with caplog.at_level(logging.WARNING):
            app_module._build_resume_index()
            assert len(skip_warnings()) == 1

            # Two watcher ticks with an unchanged file: no rebuild, no new warning.
            assert app_module._rebuild_index_if_resume_changed() is False
            assert app_module._rebuild_index_if_resume_changed() is False
            assert len(skip_warnings()) == 1

            # A real edit still triggers a rebuild attempt (and one more warning).
            resume_copy.write_text("REID COLLINS\n\nSUMMARY\nsecond version\n")
            assert app_module._rebuild_index_if_resume_changed() is True
            assert len(skip_warnings()) == 2

    def test_missing_pinecone_key_also_skips_with_a_named_warning(
        self, monkeypatch, caplog, tmp_path
    ):
        # RC1-440: the index now needs both keys. With OpenAI configured but
        # Pinecone missing, the build must skip (never raise) and the warning
        # must name the key that is actually absent.
        import logging

        import app as app_module

        resume_copy = tmp_path / "resume-prompt.txt"
        resume_copy.write_text("REID COLLINS\n\nSUMMARY\nonly version\n")
        monkeypatch.setattr(app_module, "openai_client", _FakeEmbeddingsClient())
        monkeypatch.setattr(app_module, "_resume_path", resume_copy)
        monkeypatch.setattr(app_module, "_resume_hash", "")
        monkeypatch.setattr(app_module, "_resume_index", None)
        monkeypatch.delenv("PINECONE_API_KEY", raising=False)

        with caplog.at_level(logging.WARNING):
            app_module._build_resume_index()

        assert app_module._resume_index is None
        skips = [r for r in caplog.records if "RAG index skipped" in r.getMessage()]
        assert len(skips) == 1
        assert "PINECONE_API_KEY" in skips[0].getMessage()
