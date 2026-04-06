# Backend Migration: Express (Node.js) → Flask (Python)

## Why

The backend was converted from Express/Node.js to Flask/Python for two reasons:

1. **Learning alignment** — The DeepLearning.ai agentic AI course teaches Python-based patterns (OpenAI Python SDK, tool calling, prompt engineering). Having the backend in Python means course concepts translate directly into the codebase.
2. **Comfort** — Python is the stronger language; maintaining and extending the chatbot/agentic features is easier in Python than JavaScript.

## What didn't change

The **React frontend is completely untouched**. All components, CSS, TypeScript types, and frontend tests remained identical. The frontend doesn't know or care what language the server speaks — it sends `fetch('/api/...')` requests and gets JSON back.

This is a standard architecture pattern (React SPA + Python API) used by companies like Instagram, Pinterest, and Spotify.

## Architecture: before and after

| | Before | After |
|---|--------|-------|
| **Backend language** | JavaScript (Node.js) | Python |
| **Web framework** | Express 5 | Flask 3 |
| **Production server** | `node server.js` | `gunicorn app:app` |
| **OpenAI SDK** | `openai` (npm) | `openai` (pip) |
| **Database driver** | `pg` (npm) | `psycopg2-binary` (pip) |
| **Email** | `nodemailer` | Python `smtplib` (stdlib) |
| **Rate limiting** | `express-rate-limit` | `flask-limiter` |
| **CORS** | `cors` (npm) | `flask-cors` (pip) |
| **Env loading** | `dotenv` (npm) | `python-dotenv` (pip) |
| **Server tests** | Vitest + supertest | pytest + Flask test client |
| **Frontend build** | Vite (unchanged) | Vite (unchanged) |
| **Frontend tests** | Vitest + Testing Library (unchanged) | Vitest + Testing Library (unchanged) |
| **Heroku buildpacks** | Node.js only | Node.js (build) + Python (server) |

---

## Files Created

### Backend

| File | Purpose |
|------|---------|
| `app.py` | Flask server — all API routes (`/api/chat`, `/api/contact`, `/api/pageview`, `/api/download`), OpenAI chat with tool-calling loop, PostgreSQL logging, SendGrid email, rate limiting, and SPA static file serving in production. Direct replacement for `server.js`. |
| `requirements.txt` | Python dependency list (Flask, OpenAI, psycopg2, gunicorn, etc.). Equivalent to the server-side entries that were in `package.json`. |
| `runtime.txt` | Specifies Python 3.12.8 for the Heroku Python buildpack. |
| `pyproject.toml` | pytest configuration — sets `pythonpath = ["."]` so tests can import from `app.py`. |
| `tests/conftest.py` | pytest fixtures — provides a Flask test client and disables rate limiting during tests. |
| `tests/test_server.py` | Server API tests rewritten in Python/pytest. Tests all 4 endpoints, the `TOOLS` schema, and `execute_tool_call`. Direct replacement for `tests/server.test.ts`. |
| `scripts/extract_pdf.py` | Extracts plain text from the resume PDF using pdfplumber. Replaces `scripts/extract-pdf.mjs` (which used `pdfjs-dist`). |
| `scripts/chat_digest.py` | Queries last 24h of site activity from PostgreSQL and emails a digest via SendGrid SMTP. Replaces `scripts/chat-digest.mjs` (which used `pg` and `nodemailer`). |

### Documentation

| File | Purpose |
|------|---------|
| `documentation/backend-migration.md` | This file — documents the migration itself. |

---

## Files Modified

### Backend / Configuration

| File | Layer | What changed |
|------|-------|-------------|
| `Procfile` | Backend | Changed from `web: node server.js` to `web: gunicorn app:app --bind 0.0.0.0:$PORT` |
| `package.json` | Both | Removed all server-side dependencies (`express`, `cors`, `pg`, `openai`, `nodemailer`, `express-rate-limit`, `dotenv`, `serve`) and their type packages. Updated scripts: `dev:server` now runs `python app.py`, `extract:pdf` and `digest` now call Python scripts. Added `test:server` script for pytest. Frontend dependencies and scripts unchanged. |
| `.gitignore` | Backend | Added `__pycache__` and `*.pyc` (Python build artifacts). |
| `.github/workflows/ci.yml` | Both | Added Python 3.12 setup (`actions/setup-python`) and `pip install -r requirements.txt`. Added a separate "Server tests" step running `pytest`. The existing Node.js setup and `npm test` step remained for frontend tests. |

### Documentation

| File | Layer | What changed |
|------|-------|-------------|
| `README.md` | Both | Complete rewrite — documents React + Flask architecture, dual setup (npm + pip), dev workflow with two terminals, Heroku dual-buildpack deployment. |
| `documentation/chatbot-setup.md` | Backend | All Express references → Flask. Updated dev commands (`npm run dev:server` now runs Python). Updated Heroku deployment section (gunicorn, buildpacks). Updated code examples to Python. Digest command changed to `python scripts/chat_digest.py`. |
| `documentation/agentic-tool-use.md` | Backend | Architecture diagram: "Express" → "Flask". All JavaScript code examples → Python. File references: `server.js` → `app.py`. "How to add a new tool" section rewritten with Python examples. Test references: `server.test.ts` → `test_server.py`. Scaling section uses Python module structure. |
| `documentation/testing-and-ci.md` | Both | Server tests section rewritten for pytest + Flask test client. CI section updated to describe dual-language pipeline (Node.js + Python). Dependencies section split into Python and JavaScript. |
| `documentation/updating-resume.md` | Backend | References to `server.js` → `app.py`. Test commands updated to include `npm run test:server`. Script references updated. Project structure listing updated. |
| `documentation/cursor-rules.md` | Both | Rule descriptions updated — server conventions now reference Flask/Python patterns, troubleshooting references gunicorn/buildpacks, test commands include pytest. |

### Cursor Rules

| File | Layer | What changed |
|------|-------|-------------|
| `.cursor/rules/project-conventions.mdc` | Both | "Server Endpoints" section rewritten for Flask (decorator-based routes, `jsonify`, `flask-limiter`, `_db_execute` helper). Added new "Python" conventions section (type hints, f-strings, `logging`, `pathlib`). Naming section updated with Python snake_case conventions alongside React PascalCase. |
| `.cursor/rules/deploy-troubleshooting.mdc` | Backend | Diagnostic commands updated (added `heroku buildpacks`, `pytest`). Common issues updated for Python (missing pip dependency, `ModuleNotFoundError`, buildpack order, `runtime.txt`). Required env vars now include `FLASK_ENV=production`. |
| `.cursor/rules/resume-update.mdc` | Backend | Test step updated to run both `npm test` and `npm run test:server`. File reference `server.js` → `app.py`. |
| `.cursor/rules/chatbot-personality.mdc` | Backend | File reference `server.js` → `app.py`. Test step updated to include `npm run test:server`. |

---

## Files Deleted

| File | Layer | Why |
|------|-------|-----|
| `server.js` | Backend | Replaced by `app.py` |
| `scripts/extract-pdf.mjs` | Backend | Replaced by `scripts/extract_pdf.py` |
| `scripts/chat-digest.mjs` | Backend | Replaced by `scripts/chat_digest.py` |
| `tests/server.test.ts` | Backend | Replaced by `tests/test_server.py` |

---

## Files Unchanged

| File | Layer | Why |
|------|-------|-----|
| `vite.config.ts` | Frontend | Dev proxy target stayed at `http://localhost:3001` — Flask runs on the same port |
| `index.html` | Frontend | SPA entry point — no server references |
| `src/main.tsx` | Frontend | React entry — no server references |
| `src/App.tsx` | Frontend | Root component — `fetch('/api/...')` calls work with any backend |
| `src/components/Resume.tsx` | Frontend | Resume layout — pure React |
| `src/components/CareerTimeline.tsx` | Frontend | Timeline — pure React |
| `src/components/ChatBot.tsx` | Frontend | Chat widget — talks to `/api/chat` which has the same request/response shape |
| `src/components/ContactModal.tsx` | Frontend | Contact form — talks to `/api/contact` which has the same request/response shape |
| All `*.css` files | Frontend | Styling — no server dependency |
| `src/data/resume.ts` | Frontend | Resume data — auto-generated from PDF |
| `src/data/resume-prompt.txt` | Backend | Chatbot context — loaded by `app.py` (was loaded by `server.js`) |
| `src/data/chatbot-instructions.txt` | Backend | Chatbot personality — loaded by `app.py` (was loaded by `server.js`) |
| `scripts/update-resume.py` | Backend | Already Python — no changes needed |
| `tests/app.test.tsx` | Frontend | React component tests — no server dependency |
| `tests/build.test.ts` | Frontend | TypeScript + ESLint verification — no server dependency |
| `tests/setup.ts` | Frontend | Vitest setup — no server dependency |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` | Frontend | TypeScript config for Vite/React build |
| `eslint.config.js` | Frontend | ESLint config for TypeScript/React |
| `public/docs/*` | Both | Resume files served by the download endpoint |

---

## Local Development After Migration

### One-time setup

If you haven't already created the Python virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Update the npm dependencies (removes the old Express/server packages from `node_modules`):

```bash
npm install
```

### Running the dev servers

You need two terminals — one for the Flask backend, one for the Vite frontend:

```bash
# Terminal 1: Flask backend (port 3001)
npm run dev:server

# Terminal 2: Vite frontend (port 5173, proxies /api → localhost:3001)
npm run dev
```

Alternatively, if you prefer activating the venv yourself instead of using the npm script:

```bash
# Terminal 1
source .venv/bin/activate
python app.py
```

Open http://localhost:5173 in your browser.

### Running tests

```bash
# Frontend tests (React components + TypeScript + ESLint)
npm test

# Server tests (Flask API endpoints + tool definitions)
npm run test:server

# Or directly with pytest
source .venv/bin/activate
pytest tests/test_server.py -v
```

### Other useful commands

```bash
# Generate resume.ts + resume-prompt.txt from PDF
npm run update:resume

# Extract plain text from PDF
npm run extract:pdf

# Run the nightly digest script manually (requires DATABASE_URL + SendGrid creds in .env)
npm run digest

# Build the production bundle (same as before)
npm run build

# Lint the frontend
npm run lint
```

### What changed from before

| Task | Before | After |
|------|--------|-------|
| Start backend | `npm run dev:server` (ran `node --watch server.js`) | `npm run dev:server` (runs `.venv/bin/python app.py`) |
| Start frontend | `npm run dev` | `npm run dev` (unchanged) |
| Run all tests | `npm test` (vitest ran everything) | `npm test` (frontend) + `npm run test:server` (backend) |
| Install deps | `npm install` | `npm install` + `pip install -r requirements.txt` |
| Extract PDF text | `npm run extract:pdf` (Node/pdfjs) | `npm run extract:pdf` (Python/pdfplumber) |
| Run digest | `npm run digest` (Node) | `npm run digest` (Python) |
| Update resume | `npm run update:resume` (already Python) | `npm run update:resume` (unchanged) |

---

## Heroku Deployment Changes

### One-time setup commands

These commands need to be run once to reconfigure the Heroku app for the new Python backend:

```bash
# Replace the single Node.js buildpack with both Node.js and Python
# Order matters — Node.js must run first to build the React frontend
heroku buildpacks:clear --app hihelloreid
heroku buildpacks:add heroku/nodejs --app hihelloreid
heroku buildpacks:add heroku/python --app hihelloreid

# Tell Flask it's running in production (serves static files, disables CORS/debug)
heroku config:set FLASK_ENV=production --app hihelloreid
```

### Verify buildpack order

```bash
heroku buildpacks --app hihelloreid
```

Expected output:
```
=== hihelloreid Buildpack URLs
1. heroku/nodejs
2. heroku/python
```

### Environment variables to verify

All existing env vars carry over. Run this to confirm they're still set:

```bash
heroku config --app hihelloreid
```

| Variable | Status | Notes |
|----------|--------|-------|
| `OPENAI_API_KEY` | Already set | No change needed |
| `DATABASE_URL` | Already set | Auto-managed by Heroku Postgres add-on |
| `SENDGRID_USERNAME` | Already set | No change needed |
| `SENDGRID_PASSWORD` | Already set | No change needed |
| `DIGEST_EMAIL` | Already set | No change needed |
| `SCHEDULING_URL` | Already set | No change needed |
| `FLASK_ENV` | **New — must be set** | `heroku config:set FLASK_ENV=production --app hihelloreid` |
| `NODE_ENV` | Previously set | Can be left as-is or removed — Flask doesn't use it |

### Update the Heroku Scheduler job

The nightly digest script changed from Node.js to Python:

```bash
heroku addons:open scheduler --app hihelloreid
```

In the scheduler dashboard, update the job command:
- **Old:** `node scripts/chat-digest.mjs`
- **New:** `python scripts/chat_digest.py`

### Deploy

```bash
git push heroku main
```

Or push to `main` on GitHub — CI runs both frontend and server tests, then Heroku auto-deploys if they pass.

### Post-deploy verification

```bash
# Check the app is running
heroku ps --app hihelloreid

# Check logs for successful startup
heroku logs --tail --app hihelloreid

# Verify the build used both buildpacks
heroku builds --app hihelloreid

# Quick smoke test — should return 204
curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"path":"/"}' \
  https://hihelloreid.herokuapp.com/api/pageview

# Verify downloads work
curl -s -o /dev/null -w "%{http_code}" \
  https://hihelloreid.herokuapp.com/api/download/pdf
```

### Rollback (if needed)

If the deploy has issues, roll back to the previous (Express) version:

```bash
heroku rollback --app hihelloreid
```

Then investigate locally before re-deploying. Note: after rolling back, you'd also need to revert the buildpack changes temporarily:

```bash
heroku buildpacks:clear --app hihelloreid
heroku buildpacks:add heroku/nodejs --app hihelloreid
```

### How the build works

1. **Node.js buildpack** runs first — installs npm dependencies, runs `npm run build` (TypeScript check + Vite build), producing the `dist/` directory
2. **Python buildpack** runs second — installs pip dependencies from `requirements.txt`
3. **Procfile** starts gunicorn, which runs `app.py` — Flask serves the API endpoints and the static files from `dist/`

The `FLASK_ENV=production` env var tells the Flask app to serve static files from `dist/` and skip CORS/debug mode.

---

## Test Results After Migration

```
Frontend (vitest):  8 tests passed — 2 suites (app.test.tsx, build.test.ts)
Server  (pytest):  13 tests passed — 6 classes (Download, Pageview, Contact, Chat, ToolsDefinition, ExecuteToolCall)
```

All API endpoints return identical JSON responses with the same status codes. The frontend is unaware the backend changed.
