"""Datadog LLM Observability for the chatbot (RC1-361).

Mirrors `pr_agent/app/observability.py` (RC1-322): one enable call at import,
and every Anthropic `messages.create` in this process becomes an LLM span —
model, tokens, latency, estimated cost — under the given `ml_app`. Agentless
on purpose: a Heroku dyno has no Datadog agent daemon, so spans post straight
to the intake with `DD_API_KEY`. Without the key the call is a no-op, so
tests, CI and a laptop run identical code.

The OpenAI client here only serves the resume-embedding index, and the estate
rule (RC1-331) is anthropic-only patching, so it stays untraced.
"""

from __future__ import annotations

import os
import sys
from contextlib import AbstractContextManager, contextmanager, nullcontext

try:  # documented optional-dep exception: ddtrace is absent in minimal envs
    from ddtrace.llmobs import LLMObs
except ImportError:  # pragma: no cover - exercised only without ddtrace
    LLMObs = None


def enable_llm_obs(ml_app: str, *, service: str | None = None) -> bool:
    """Turn on tracing for this process, or quietly decline. Returns whether
    tracing is on; safe to call more than once.

    RC1-331: `LLMObs.enable()` patches ddtrace's entire LLM integration list
    with `raise_errors=True`, so a module-name collision or version mismatch
    would crash the dyno boot for the sake of its decoration. Only the
    anthropic integration is left on, and any failure to start tracing is a
    decline, not an error.
    """
    if LLMObs is None or not os.environ.get("DD_API_KEY"):
        return False
    _restrict_patching_to_anthropic()
    try:
        LLMObs.enable(
            ml_app=ml_app,
            agentless_enabled=True,
            site=os.environ.get("DD_SITE", "datadoghq.com"),
            service=service or ml_app,
        )
    except Exception as exc:
        print(f"llmobs: tracing disabled, enable() failed: {exc}", file=sys.stderr)
        return False
    return True


def rag_prompt(
    query: str, context: str, extra_tags: dict | None = None
) -> AbstractContextManager:
    """Attach the visitor's question and the retrieved resume text to every
    LLM span opened inside the block (RC1-444).

    Datadog's Hallucination judge reads `meta.input.prompt.variables.query`
    and `.context` and compares `span_output` against them. ddtrace keeps a
    prompt annotation on LLM spans only and drops it from workflow spans, so
    the annotation wraps the auto-traced `messages.create` call itself. The
    rag_* keys are set explicitly because ddtrace defaults the query key to
    `question`, and the template reads `query`. The `rag:resume` tag is the
    judge's filter: it keeps un-annotated calls (the /match fit card) from
    being scored against an empty context. A no-op when tracing is off.
    """
    if LLMObs is None or not LLMObs.enabled:
        return nullcontext()
    return LLMObs.annotation_context(
        # extra_tags: per-request facts a trace query needs, e.g. the
        # rc1-476-probe flag value (RC1-476 AC2 — evaluations visible in
        # traces; INFO log lines never reach Heroku's log stream).
        tags={"rag": "resume", **(extra_tags or {})},
        prompt={
            "variables": {"query": query, "context": context},
            "rag_query_variables": ["query"],
            "rag_context_variables": ["context"],
        }
    )


def cohere_llm_span(model_name: str) -> AbstractContextManager:
    """A manual LLM span for a Cohere generation call (RC1-475).

    Manual for the same reason as `retrieval_span`: RC1-331 keeps ddtrace
    auto-patching anthropic-only, so the Command arm would otherwise be
    invisible. The span's model_name/model_provider identify the arm per
    trace. Opened inside a `rag_prompt` block, it inherits the prompt
    annotation the hallucination judge reads. A no-op when tracing is off.
    """
    if LLMObs is None or not LLMObs.enabled:
        return nullcontext()
    return LLMObs.llm(
        model_name=model_name, model_provider="cohere", name="cohere.chat"
    )


def annotate_llm_io(**kwargs) -> None:
    """Annotate the active LLM Obs span (input/output/metrics/tags); no-op
    when tracing is off. Auto-traced anthropic spans get this from ddtrace;
    manual spans must do it themselves or the judge has no span_output to
    score."""
    if LLMObs is None or not LLMObs.enabled:
        return
    LLMObs.annotate(**kwargs)


def retrieval_span(*, rerank: bool) -> AbstractContextManager:
    """A manual LLM Obs retrieval span around the RAG lookup (RC1-473).

    Covers the Pinecone query plus, when reranking, the Cohere hop — so the
    rerank on/off latency delta is readable straight off the span durations,
    filtered by the `rerank` tag. Manual on purpose: the estate rule
    (RC1-331) is anthropic-only auto-patching, and
    `_restrict_patching_to_anthropic` env-defaults the cohere integration
    off, so an SDK-level trace would never appear. A no-op when tracing is
    off.
    """
    if LLMObs is None or not LLMObs.enabled:
        return nullcontext()
    return _retrieval_span(rerank)


@contextmanager
def _retrieval_span(rerank: bool):
    with LLMObs.retrieval(name="rag.retrieve") as span:
        LLMObs.annotate(span=span, tags={"rerank": "on" if rerank else "off"})
        yield span


def _llm_integration_modules() -> tuple[str, ...]:
    """The module names `LLMObs.enable()` would patch; empty when unknown.

    Read from ddtrace's own constants — the same two lists its
    `_patch_integrations` concatenates — so the set tracks the installed
    version. Private imports, guarded: if they move in a future ddtrace we
    fall back to patching everything, and the try/except above still keeps
    the process alive.
    """
    try:
        from ddtrace.llmobs._constants import SUPPORTED_LLMOBS_INTEGRATIONS
        from ddtrace.llmobs._llmobs import _INTEGRATIONS_W_PROPAGATION_SUPPORT
    except ImportError:  # pragma: no cover - exercised only on a moved layout
        return ()
    modules = set(SUPPORTED_LLMOBS_INTEGRATIONS.values())
    modules |= set(_INTEGRATIONS_W_PROPAGATION_SUPPORT.values())
    return tuple(modules)


def _restrict_patching_to_anthropic() -> None:
    """Env-default every non-anthropic LLM integration off (RC1-331).

    setdefault, not setenv: an explicitly configured `DD_TRACE_<X>_ENABLED`
    in the environment still wins.
    """
    for module in _llm_integration_modules():
        if module == "anthropic":
            continue
        os.environ.setdefault(f"DD_TRACE_{module.upper().replace('-', '_')}_ENABLED", "false")
