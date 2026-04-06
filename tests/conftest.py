import pytest

from app import app as flask_app


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    flask_app.config["RATELIMIT_ENABLED"] = False
    yield
    flask_app.config["RATELIMIT_ENABLED"] = True


@pytest.fixture
def client():
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as c:
        yield c
