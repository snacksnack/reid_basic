import os

# RC1-478: blank the live-service keys BEFORE app.py imports, so the unit
# suite never builds a real Pinecone index. With keys present, importing app
# used to embed and upsert against the production index — harmless while the
# namespace hash matched what production served, destructive the moment a
# branch changed the corpus (the stale-namespace cleanup deletes what
# production is querying). Tests exercise the no-index fallback paths, same
# as CI, which has no keys; scripts/explore_rag.py is the tool for poking the
# live index deliberately.
#
# Set to "" rather than popped: app.py's load_dotenv() would re-load a popped
# key from .env, but python-dotenv never overrides a variable that is already
# set, and "" is falsy for the `os.environ.get(...)` gates in app.py.
for _key in ("OPENAI_API_KEY", "PINECONE_API_KEY", "COHERE_API_KEY"):
    os.environ[_key] = ""
# RC1-473/475: the Cohere flags default off; blank them too so a developer
# shell that has them exported cannot leak the Cohere paths into the unit
# suite.
os.environ["COHERE_RERANK_ENABLED"] = ""
os.environ["CHAT_PROVIDER"] = ""
# RC1-476: feature flags are opt-in; blank the opt-in so the unit suite
# never starts the polling provider.
os.environ["DD_FEATURE_FLAGS_ENABLED"] = ""

import pytest

from app import app as flask_app, limiter


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    # flask-limiter copies RATELIMIT_ENABLED into limiter.enabled once, at
    # init_app — toggling the config afterwards is a no-op, so the limiter
    # object itself is switched. The config-only version of this fixture was
    # a placebo that held only while a CI session stayed under the 20/hour
    # chat limit; ddtrace Early Flake Detection retrying new tests ~11x
    # (RC1-475) pushed past it and turned every later /api/chat POST 429.
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture
def client():
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as c:
        yield c
