# Reid Collins — Resume Website

A personal resume website with an AI chatbot, built with a **React** frontend and **Flask** (Python) backend.

## Architecture

- **Frontend:** React SPA built with Vite + TypeScript. Includes an interactive career timeline, AI chatbot, and contact form.
- **Backend:** Flask (Python) API server handling chat (OpenAI), contact form, resume downloads, and analytics logging.
- **In production:** Gunicorn runs the Flask app, which serves the API endpoints and the built React static files from `dist/`.
- **In development:** Vite dev server handles the frontend with hot reloading; `/api` requests are proxied to the Flask backend.

## Quick Start

### Prerequisites

- **Node.js 22+** and **npm** — for building the React frontend
- **Python 3.12+** — for the Flask backend
- **OpenAI API key** — sign up at [platform.openai.com](https://platform.openai.com)

### Setup

```bash
# Install frontend dependencies
npm install

# Create a Python virtual environment and install backend dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Add your API key
echo 'OPENAI_API_KEY=sk-your-key-here' > .env
```

### Run locally

In two terminals:

```bash
# Terminal 1: Flask backend (port 3001)
npm run dev:server
# or: source .venv/bin/activate && python app.py

# Terminal 2: Vite frontend (port 5173)
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` requests to Flask on port 3001.

### Run tests

```bash
# Frontend tests (React components + build verification)
npm test

# Server tests (Flask API endpoints + tool definitions)
npm run test:server
# or: source .venv/bin/activate && pytest tests/test_server.py -v
```

## Deployment (Heroku)

The app uses two buildpacks — Node.js (builds the React frontend) and Python (runs the Flask server).

### Initial setup

```bash
heroku buildpacks:clear --app hihelloreid
heroku buildpacks:add heroku/nodejs --app hihelloreid
heroku buildpacks:add heroku/python --app hihelloreid

heroku config:set FLASK_ENV=production --app hihelloreid
heroku config:set OPENAI_API_KEY=sk-your-key --app hihelloreid
```

### Deploy

Push to `main` — GitHub Actions runs tests, then Heroku auto-deploys if they pass.

```bash
git push origin main
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for the chatbot |
| `FLASK_ENV` | Production only | Set to `production` on Heroku |
| `DATABASE_URL` | No | PostgreSQL connection string (auto-set by Heroku Postgres) |
| `SENDGRID_USERNAME` | No | SendGrid SMTP username for email notifications |
| `SENDGRID_PASSWORD` | No | SendGrid SMTP password |
| `DIGEST_EMAIL` | No | Recipient for the nightly digest (default: hire.reid.collins@gmail.com) |
| `SCHEDULING_URL` | No | Calendly/booking link for the chatbot's scheduling tool |

## npm Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Vite dev server (frontend) |
| `npm run dev:server` | Start Flask dev server (backend) |
| `npm run build` | TypeScript check + production build |
| `npm run update:resume` | Generate `resume.ts` + `resume-prompt.txt` from PDF (Python) |
| `npm run extract:pdf` | Extract plain text from PDF (Python) |
| `npm run digest` | Run chat digest email manually (Python) |
| `npm test` | Run frontend tests (vitest) |
| `npm run test:server` | Run server tests (pytest) |

## Project Structure

```
app.py                           ← Flask server (API + static serving)
requirements.txt                 ← Python dependencies
runtime.txt                      ← Python version for Heroku
Procfile                         ← Heroku process definition (gunicorn)
package.json                     ← Node.js dependencies + scripts (frontend only)
vite.config.ts                   ← Vite build config + dev proxy
index.html                       ← SPA entry point
src/
  main.tsx                       ← React entry
  App.tsx                        ← Root component
  components/
    Resume.tsx                   ← Resume layout
    CareerTimeline.tsx           ← Interactive career timeline
    ChatBot.tsx                  ← AI chatbot widget
    ContactModal.tsx             ← Contact form modal
  data/
    resume.ts                    ← Structured resume data (auto-generated from PDF)
    resume-prompt.txt            ← Plain-text resume for chatbot (auto-generated)
    chatbot-instructions.txt     ← Chatbot behavioral instructions
public/docs/
  reidcollins.pdf                ← Resume PDF (served by download endpoint)
  reidcollins.docx               ← Resume DOCX
scripts/
  update-resume.py               ← PDF → resume.ts + resume-prompt.txt
  extract_pdf.py                 ← PDF → plain text
  chat_digest.py                 ← Nightly email digest
tests/
  test_server.py                 ← Flask API tests (pytest)
  app.test.tsx                   ← React component tests (vitest)
  build.test.ts                  ← TypeScript + ESLint verification (vitest)
  conftest.py                    ← pytest fixtures
  setup.ts                       ← vitest setup (jest-dom matchers)
```
