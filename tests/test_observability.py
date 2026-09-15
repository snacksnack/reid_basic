"""The contract is the no-op: app.py calls enable_llm_obs unconditionally at
import, so an untraced environment (tests, CI, a laptop without DD_API_KEY)
must go through it without side effects."""

import contextlib
import os

import observability


class FakeLLMObs:
    def __init__(self, enabled=False):
        self.enabled = enabled
        self.enabled_with = None
        self.annotations = []

    def enable(self, **kwargs):
        self.enabled_with = kwargs

    def annotation_context(self, **kwargs):
        self.annotations.append(kwargs)
        return contextlib.nullcontext()


def test_declines_without_api_key(monkeypatch):
    monkeypatch.delenv("DD_API_KEY", raising=False)
    monkeypatch.setattr(observability, "LLMObs", FakeLLMObs())
    assert observability.enable_llm_obs("hihelloreid-chat") is False


def test_declines_without_ddtrace(monkeypatch):
    monkeypatch.setenv("DD_API_KEY", "k")
    monkeypatch.setattr(observability, "LLMObs", None)
    assert observability.enable_llm_obs("hihelloreid-chat") is False


def test_enables_agentless_with_key(monkeypatch):
    monkeypatch.setenv("DD_API_KEY", "k")
    monkeypatch.delenv("DD_SITE", raising=False)
    fake = FakeLLMObs()
    monkeypatch.setattr(observability, "LLMObs", fake)
    assert observability.enable_llm_obs("hihelloreid-chat", service="web") is True
    assert fake.enabled_with["ml_app"] == "hihelloreid-chat"
    assert fake.enabled_with["agentless_enabled"] is True
    assert fake.enabled_with["service"] == "web"
    assert fake.enabled_with["site"] == "datadoghq.com"


def test_declines_instead_of_raising_when_patching_crashes(monkeypatch, capsys):
    """RC1-331: an integration patch failure must not crash the dyno boot."""
    monkeypatch.setenv("DD_API_KEY", "k")
    monkeypatch.setattr(observability, "_llm_integration_modules", tuple)

    class CrashingLLMObs(FakeLLMObs):
        def enable(self, **kwargs):
            raise ModuleNotFoundError("No module named 'mcp.shared.session'")

    monkeypatch.setattr(observability, "LLMObs", CrashingLLMObs())
    assert observability.enable_llm_obs("hihelloreid-chat") is False
    assert "mcp.shared.session" in capsys.readouterr().err


def test_non_anthropic_integrations_are_defaulted_off(monkeypatch):
    """RC1-331: the estate is Anthropic-only; the OpenAI embeddings client
    in app.py must not get patched either."""
    monkeypatch.setenv("DD_API_KEY", "k")
    monkeypatch.setattr(
        observability,
        "_llm_integration_modules",
        lambda: ("anthropic", "openai", "google-genai"),
    )
    monkeypatch.delenv("DD_TRACE_ANTHROPIC_ENABLED", raising=False)
    monkeypatch.delenv("DD_TRACE_OPENAI_ENABLED", raising=False)
    monkeypatch.setenv("DD_TRACE_GOOGLE_GENAI_ENABLED", "true")
    monkeypatch.setattr(observability, "LLMObs", FakeLLMObs())

    assert observability.enable_llm_obs("hihelloreid-chat") is True
    assert "DD_TRACE_ANTHROPIC_ENABLED" not in os.environ
    assert os.environ["DD_TRACE_OPENAI_ENABLED"] == "false"
    assert os.environ["DD_TRACE_GOOGLE_GENAI_ENABLED"] == "true"


def test_rag_prompt_is_a_no_op_when_tracing_is_off(monkeypatch):
    fake = FakeLLMObs(enabled=False)
    monkeypatch.setattr(observability, "LLMObs", fake)
    with observability.rag_prompt("q", "c"):
        pass
    assert fake.annotations == []


def test_rag_prompt_is_a_no_op_without_ddtrace(monkeypatch):
    monkeypatch.setattr(observability, "LLMObs", None)
    with observability.rag_prompt("q", "c"):
        pass


def test_rag_prompt_uses_the_hallucination_template_keys(monkeypatch):
    """RC1-444: Datadog's Hallucination template reads
    meta.input.prompt.variables.query and .context."""
    fake = FakeLLMObs(enabled=True)
    monkeypatch.setattr(observability, "LLMObs", fake)
    with observability.rag_prompt("Where did Reid work?", "resume chunk"):
        pass
    assert fake.annotations == [
        {
            "tags": {"rag": "resume"},
            "prompt": {
                "variables": {"query": "Where did Reid work?", "context": "resume chunk"},
                "rag_query_variables": ["query"],
                "rag_context_variables": ["context"],
            }
        }
    ]
