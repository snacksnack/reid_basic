"""RC1-476: the feature-flag wrapper's decline and default paths.

The provider itself is exercised only in production — these tests pin the
kill-switch contract: no opt-in means no client, and every failure mode
answers with the caller's default.
"""

import pytest

import feature_flags


@pytest.fixture
def fresh_init(monkeypatch):
    """Re-arm init: the module self-initialized (and declined) at import."""
    monkeypatch.setattr(feature_flags, "_initialized", False)
    monkeypatch.setattr(feature_flags, "_client", None)


class TestInitFeatureFlags:
    def test_declines_without_opt_in(self, fresh_init, monkeypatch):
        monkeypatch.setenv("DD_FEATURE_FLAGS_ENABLED", "")
        monkeypatch.setenv("DD_API_KEY", "present")
        assert feature_flags.init_feature_flags() is False

    def test_declines_without_api_key(self, fresh_init, monkeypatch):
        monkeypatch.setenv("DD_FEATURE_FLAGS_ENABLED", "true")
        monkeypatch.setenv("DD_API_KEY", "")
        assert feature_flags.init_feature_flags() is False

    def test_opt_in_pins_the_long_poll_interval(self, fresh_init, monkeypatch):
        # Provider construction is faked to fail fast — the assertion is the
        # env guard that must be in place before any real init.
        monkeypatch.setenv("DD_FEATURE_FLAGS_ENABLED", "true")
        monkeypatch.setenv("DD_API_KEY", "present")
        monkeypatch.delenv(
            "DD_FEATURE_FLAGS_CONFIGURATION_SOURCE_AGENTLESS_POLL_INTERVAL_SECONDS",
            raising=False,
        )
        import openfeature.api

        def _boom(_provider):
            raise RuntimeError("no network in tests")

        monkeypatch.setattr(openfeature.api, "set_provider", _boom)
        assert feature_flags.init_feature_flags() is False
        import os

        assert (
            os.environ[
                "DD_FEATURE_FLAGS_CONFIGURATION_SOURCE_AGENTLESS_POLL_INTERVAL_SECONDS"
            ]
            == "3600"
        )


class TestFlagEnabled:
    def test_returns_default_when_provider_is_off(self, monkeypatch):
        monkeypatch.setattr(feature_flags, "_client", None)
        assert feature_flags.flag_enabled("rc1-476-probe") is False
        assert feature_flags.flag_enabled("rc1-476-probe", default=True) is True

    def test_returns_default_when_evaluation_raises(self, monkeypatch):
        class _Client:
            def get_boolean_value(self, name, default, ctx=None):
                raise RuntimeError("cdn unreachable")

        monkeypatch.setattr(feature_flags, "_client", _Client())
        assert feature_flags.flag_enabled("rc1-476-probe", default=True) is True

    def test_returns_the_evaluated_value(self, monkeypatch):
        class _Client:
            def get_boolean_value(self, name, default, ctx=None):
                return True

        monkeypatch.setattr(feature_flags, "_client", _Client())
        assert feature_flags.flag_enabled("rc1-476-probe") is True


def test_feature_flags_import_precedes_observability_in_app():
    """The import order is load-bearing (RC1-476): feature_flags
    self-initializes its provider at import, and that must happen before
    observability's import pulls in ddtrace.llmobs — llmobs imported first
    silently kills agentless flag delivery for the life of the process."""
    from pathlib import Path

    source = Path(__file__).resolve().parent.parent.joinpath("app.py").read_text()
    assert source.index("from feature_flags import") < source.index(
        "from observability import"
    )


def test_feature_flags_module_self_initializes_at_import():
    from pathlib import Path

    source = (
        Path(__file__).resolve().parent.parent.joinpath("feature_flags.py").read_text()
    )
    assert source.rstrip().endswith("init_feature_flags()")


def test_init_is_idempotent(monkeypatch):
    # The module already initialized (declined) at import; later calls must
    # not attempt a second provider construction.
    monkeypatch.setattr(feature_flags, "_initialized", True)
    monkeypatch.setattr(feature_flags, "_client", None)
    monkeypatch.setenv("DD_FEATURE_FLAGS_ENABLED", "true")
    monkeypatch.setenv("DD_API_KEY", "present")
    assert feature_flags.init_feature_flags() is False
