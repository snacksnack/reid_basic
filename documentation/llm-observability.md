# LLM Observability (RC1-361)

Every Anthropic call the chatbot makes — each `/api/chat` turn and the forced
`render_fit_card` call on `/api/match` — ships to Datadog LLM Observability as
an LLM span with model, tokens, latency and estimated cost, under ml_app
`hihelloreid-chat`, service `web`.

## Mechanism

`observability.enable_llm_obs` is called once at import in `app.py`, before
the Anthropic client is built. With `DD_API_KEY` set it turns on ddtrace's
anthropic integration, which wraps `messages.create` in-process; without it
the call returns `False` and nothing else changes. Agentless: spans post
straight to the Datadog intake, no agent daemon on the dyno.

The module is a copy of `pr_agent/app/observability.py`, kept as a copy
rather than a dependency for the same reason it exists there: the shared
helper in `agent-evals` is pinned by git ref and carries the whole eval
harness, and this app needs only the enable call.

## Why anthropic-only

`LLMObs.enable()` defaults to patching every LLM integration ddtrace knows
about, with errors raised. RC1-331 found that a version mismatch in any one
of them crashes the process at boot for the sake of its decoration. The
helper env-defaults every non-anthropic integration off before enabling, so
the OpenAI client that builds the resume-embedding index is deliberately
untraced. Embeddings are not billed LLM spans and their cost is a rebuild
event, not a per-visitor one.

## Cost

Datadog bills LLM Observability on LLM spans only, 40k/month free at 15-day
retention. The chatbot makes low hundreds of calls a month. Traces carry the
full prompt and reply text, which includes whatever a visitor typed; that is
already stored in the `chat_messages` table, so no new data class leaves the
app.

## Operating it

- Production: `DD_API_KEY` is a Heroku config var on `hihelloreid`. Remove it
  and tracing stops on the next dyno restart.
- Local: leave it unset. `pytest` runs the no-op path; `tests/test_observability.py`
  asserts it.
- Verify: send one chat message on the site, then open LLM Observability,
  filter ml_app `hihelloreid-chat`, and expect a span within a minute.
