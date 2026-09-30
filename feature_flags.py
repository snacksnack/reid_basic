"""Datadog Feature Flags provider (RC1-476 probe).

Opt-in by explicit config: the provider initializes only when
DD_FEATURE_FLAGS_ENABLED=true AND DD_API_KEY are both set, so tests, CI,
and local dev never poll — and unsetting the one Heroku config var turns
the product fully off (its billing stops with the polling).

Two guards ship in code as env setdefaults (RC1-331 pattern — an explicit
environment value still wins):

- The agentless poll interval is pinned to 3600 s, the documented cap.
  MFCR billing is processes x polls x 10 (Datadog bills server-side
  configuration requests at 10x raw count), so the default 30 s poll would
  burn ~864K billed MFCR/month per gunicorn worker against a 1M free tier;
  3600 s is ~7.2K.
- Agentless delivery requires DD_ENV; defaulting it here tags this
  process's traces with env:production (called out in the RC1-476 PR).

Kill-switch design (RC1-473/475): any failure here leaves flags off and
callers on their env-var defaults — the flag service is never the only
path to a behavior.
"""

from __future__ import annotations

import logging
import os

_client = None
_initialized = False


def init_feature_flags() -> bool:
    """Start the provider, or quietly decline. Idempotent; runs once at
    import (see the module-bottom call and the comment there)."""
    global _client, _initialized
    if _initialized:
        return _client is not None
    _initialized = True
    if os.environ.get("DD_FEATURE_FLAGS_ENABLED", "").lower() not in {"1", "true"}:
        return False
    if not os.environ.get("DD_API_KEY"):
        logging.warning("feature flags requested but DD_API_KEY is not set")
        return False

    os.environ.setdefault(
        "DD_FEATURE_FLAGS_CONFIGURATION_SOURCE_AGENTLESS_POLL_INTERVAL_SECONDS",
        "3600",
    )
    os.environ.setdefault("DD_ENV", "production")
    # Bound the provider's initial-config wait (default 10 s) so a CDN or
    # product hiccup cannot stall dyno boot for long.
    os.environ.setdefault(
        "DD_EXPERIMENTAL_FLAGGING_PROVIDER_INITIALIZATION_TIMEOUT_MS", "3000"
    )

    try:
        from ddtrace.openfeature import DataDogProvider
        from openfeature import api

        api.set_provider(DataDogProvider())
        _client = api.get_client()
    except Exception as exc:
        logging.warning("feature flags disabled: provider init failed: %s", exc)
        _client = None
        return False
    logging.info("feature flags enabled (agentless, 3600s poll)")
    return True


def flag_enabled(name: str, default: bool = False) -> bool:
    """Evaluate a boolean flag against the cached config; the default is
    the answer whenever the provider is off or anything fails."""
    if _client is None:
        return default
    try:
        return _client.get_boolean_value(name, default)
    except Exception as exc:
        logging.error(
            "flag %r evaluation failed: %s — using default %s", name, exc, default
        )
        return default


# Initialize at import, NOT at a later call site. The provider must be
# constructed before `ddtrace.llmobs` is ever imported: with llmobs imported
# first, the agentless configuration fetch silently never runs and every
# evaluation returns its default forever (RC1-476; isolated by bisection —
# any module order with llmobs before this init reproduces it, and init
# before the llmobs import is the complete fix, live-flip verified). app.py
# imports this module before `observability`, and a test guards that order.
init_feature_flags()
