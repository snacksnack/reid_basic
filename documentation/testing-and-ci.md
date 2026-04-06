# Testing & CI/CD

## Overview

The project uses **Vitest** for frontend tests and **pytest** for backend tests. **GitHub Actions** handles continuous integration. Heroku is configured for automatic deploys from the `main` branch, gated on CI checks passing.

**Pipeline:** Push to `main` → GitHub Actions runs all tests → Heroku deploys (if tests pass)

---

## Running Tests

```bash
# Frontend tests (React components + build verification)
npm test

# Server tests (Flask API endpoints + tool definitions)
npm run test:server
# or: pytest tests/test_server.py -v

# Frontend tests in watch mode
npm run test:watch
```

---

## Test Suites

### Server API tests (`tests/test_server.py`)

Tests the Flask API endpoints using Flask's built-in test client. No external services required (no OpenAI key, no Postgres). The OpenAI client is only instantiated when `OPENAI_API_KEY` is set, so the server starts cleanly in CI and test environments without credentials. The `/api/chat` endpoint returns a 503 if OpenAI is not configured.

| Endpoint | What's tested |
|----------|--------------|
| `POST /api/pageview` | Returns 204 on valid request |
| `POST /api/contact` | Rejects empty body (400), rejects missing fields (400), accepts valid submission (200) |
| `POST /api/chat` | Rejects empty messages array (400), rejects missing messages field (400) |
| `GET /api/download/<fmt>` | Returns 404 with error for invalid format, recognizes valid formats |

Additional test classes cover the `TOOLS` schema definitions and `execute_tool_call` function directly.

**Test fixtures** (`tests/conftest.py`):
- `client` — Flask test client with `TESTING=True`
- `_disable_rate_limit` — auto-use fixture that disables `flask-limiter` during tests

### Frontend component tests (`tests/app.test.tsx`)

Tests the `Resume` component renders correctly using `@testing-library/react`.

| Test | What's verified |
|------|----------------|
| Renders name and title | Core header content appears |
| Renders all major sections | Summary, Technical Skills, Experience, Education, Certifications |
| Renders contact information | Location and email displayed |
| Renders experience entries | Company name, role, and achievements |
| Renders contact button | "Contact Reid" button appears when callback provided |
| Renders download links | PDF and DOCX download links present |

### Build verification tests (`tests/build.test.ts`)

| Test | What's verified |
|------|----------------|
| TypeScript compiles | `tsc --noEmit` exits cleanly (catches type errors) |
| ESLint passes | `eslint .` exits cleanly (catches lint regressions) |

---

## GitHub Actions CI

**Workflow file:** `.github/workflows/ci.yml`

**Triggers:**
- Every push to `main`
- Every pull request targeting `main`

**What it does:**
1. Checks out the code
2. Sets up Node.js 22 with npm caching
3. Sets up Python 3.12 with pip caching
4. Runs `npm ci` (clean install of frontend deps)
5. Runs `pip install -r requirements.txt` (install backend deps)
6. Runs `npm test` (frontend test suites via vitest)
7. Runs `pytest tests/test_server.py -v` (server test suite)

If any test fails, the workflow fails and Heroku will not deploy.

---

## Heroku Automatic Deploys

Automatic deploys are configured in the Heroku Dashboard under the **Deploy** tab:

1. **Deploy method:** GitHub (connected to `snacksnack/reid_basic`)
2. **Branch:** `main`
3. **"Wait for GitHub checks to pass before deploy"** is enabled

This means every push to `main` follows this flow:
1. GitHub Actions CI runs all tests
2. If CI passes, Heroku automatically builds and deploys
3. If CI fails, Heroku skips the deploy

### Manual deploy

You can still trigger a manual deploy from the Heroku Dashboard if needed (e.g., after changing Heroku config vars that don't require a code change).

---

## Adding New Tests

### Server tests (Python / pytest)

Add test classes or functions in `tests/test_server.py`. Use the `client` fixture for HTTP tests:

```python
class TestNewEndpoint:
    def test_returns_200(self, client):
        res = client.post("/api/new-endpoint", json={"key": "value"})
        assert res.status_code == 200
```

Import functions directly from `app.py` for unit tests:

```python
from app import execute_tool_call

class TestNewTool:
    def test_returns_expected_result(self):
        result = json.loads(execute_tool_call("new_tool", {"arg": "value"}))
        assert result["key"] == "expected"

    def test_ip_sensitive_tool(self):
        result = json.loads(
            execute_tool_call(
                "send_contact",
                {"name": "A", "email": "a@b.com", "message": "Hi"},
                client_ip="203.0.113.10",
            )
        )
        assert result["ok"] is True
```

### Frontend tests (TypeScript / vitest)

Test files go in the `tests/` directory:
- `*.test.ts` for Node.js tests (add `// @vitest-environment node` at the top)
- `*.test.tsx` for React component tests (uses `jsdom` environment by default)

The test setup file (`tests/setup.ts`) provides:
- `@testing-library/jest-dom` matchers (e.g., `toBeInTheDocument()`)
- A mock `IntersectionObserver` for components that use it

---

## Dependencies

### Python (server tests)

| Package | Purpose |
|---------|---------|
| `pytest` | Test runner and framework |
| `flask` | Provides test client via `app.test_client()` |

### JavaScript (frontend tests)

| Package | Purpose |
|---------|---------|
| `vitest` | Test runner (integrates with Vite) |
| `@testing-library/react` | React component testing utilities |
| `@testing-library/jest-dom` | DOM assertion matchers |
| `jsdom` | Browser environment simulation for component tests |

All JavaScript testing dependencies are in `devDependencies` and are not included in the production build.
