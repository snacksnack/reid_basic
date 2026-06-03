# Chatbot Setup

## Overview

The resume site includes an AI-powered chatbot that answers questions about Reid's professional background. It uses Anthropic's **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) for chat completions and OpenAI's `text-embedding-3-small` for RAG embeddings.

**Architecture:**
- **Frontend:** React component (`ChatBot.tsx`) — floating button in the bottom-right that opens a chat panel
- **Backend:** Flask server (`app.py`) with a `POST /api/chat` endpoint that proxies requests to Anthropic
- **In production:** Gunicorn runs the Flask app, which serves both the static site (`dist/`) and the chat API
- **In development:** Vite dev server proxies `/api` requests to the Flask backend

---

## Prerequisites

- **Anthropic API key** — sign up at [console.anthropic.com](https://console.anthropic.com) for chat completions (Claude Haiku 4.5)
- **OpenAI API key** — sign up at [platform.openai.com](https://platform.openai.com) for RAG embeddings (`text-embedding-3-small`)

---

## Local Development

### 1. Create a `.env` file in the project root

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
OPENAI_API_KEY=sk-your-actual-key
```

This file is gitignored and will not be committed.

### 2. Start the backend server

```bash
npm run dev:server
```

Runs the Flask server on port 3001. Alternatively, activate your venv and run directly:

```bash
source .venv/bin/activate
python app.py
```

### 3. Start the Vite dev server

In a separate terminal:

```bash
npm run dev
```

Opens the site at `http://localhost:5173`. The Vite config proxies `/api` requests to the Flask server on port 3001.

### 4. Test the chatbot

Click the blue chat bubble in the bottom-right corner and ask a question like "What AWS services has Reid used?"

---

## Heroku Deployment

### Set the environment variables

```bash
heroku config:set ANTHROPIC_API_KEY=sk-ant-your-key-here --app hihelloreid
heroku config:set OPENAI_API_KEY=sk-your-actual-key --app hihelloreid
heroku config:set FLASK_ENV=production --app hihelloreid
```

### How it works

- The `Procfile` tells Heroku to run `gunicorn app:app --bind 0.0.0.0:$PORT`
- In production (`FLASK_ENV=production`), Flask serves static files from `dist/` and handles `/api/chat`
- Heroku sets `PORT` automatically; gunicorn binds to it

### Buildpacks

The app requires two Heroku buildpacks (order matters):

```bash
heroku buildpacks:clear --app hihelloreid
heroku buildpacks:add heroku/nodejs --app hihelloreid
heroku buildpacks:add heroku/python --app hihelloreid
```

Node.js runs first (installs npm deps, runs `npm run build` to create `dist/`), then Python runs (installs pip deps from `requirements.txt`).

### Deploy

```bash
git push heroku main
```

Or push to `main` on GitHub — CI runs, and Heroku auto-deploys if tests pass.

---

## Files

| File | What it does |
|------|-------------|
| `app.py` | Flask server — serves static files + `/api/chat` endpoint |
| `src/components/ChatBot.tsx` | React chat widget (floating button + chat panel) |
| `src/components/ChatBot.css` | Chat widget styles (responsive, hidden on print) |
| `Procfile` | Heroku process definition (`gunicorn app:app`) |
| `.env` | Your actual API key (gitignored) |
| `vite.config.ts` | Dev proxy: `/api` → `localhost:3001` |
| `package.json` | Frontend dependencies and scripts |
| `requirements.txt` | Python dependencies (Flask, Anthropic, OpenAI, etc.) |
| `src/App.tsx` | Includes `<ChatBot />` component |

---

## Configuration

### Model

The chatbot uses Anthropic's **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) — fast and affordable. To change the model, edit `app.py`:

```python
response = anthropic_client.messages.create(
    model="claude-haiku-4-5-20251001",  # change to "claude-sonnet-4-5-20250929" for higher quality
    ...
)
```

See [anthropic-migration.md](anthropic-migration.md) for full details on the provider switch.

### Conversation limits

- **Client-side message cap:** 10 user messages per conversation (controlled by `MAX_USER_MESSAGES` in `ChatBot.tsx`). After the 10th message, the bot delivers a humorous cutoff message and disables the input.
- **Server-side context window:** Last 20 messages sent to Anthropic (controlled by `MAX_CONVERSATION_MESSAGES` in `app.py`). Older messages are silently trimmed to control token costs.
- **Max response tokens:** 500 per reply (controlled by `max_tokens` in the API call)

### Rate limiting

The `/api/chat` endpoint is protected by `flask-limiter`:

- **20 requests per IP per hour** (controlled in `app.py`)
- Returns a `429` status with `{ error: "Too many requests — please try again later." }` when exceeded
- Resets after the 1-hour window expires

This prevents scripts or bots from burning through Anthropic credits. A real user hitting the 10-message client-side cap will never reach the 20-request server limit.

### Spending limits

As an additional safeguard, set a monthly budget cap in your Anthropic account at [console.anthropic.com](https://console.anthropic.com) under Settings → Limits. This is a hard ceiling regardless of what happens on the server side. Also set an OpenAI budget cap at [platform.openai.com/settings/organization/limits](https://platform.openai.com/settings/organization/limits) for the embeddings usage.

### Visitor analytics (Postgres)

Every page load is logged to a `page_views` table. The frontend fires a `POST /api/pageview` request once on mount, capturing the visitor's path and referrer. The server adds IP and user agent.

| Column | Description |
|--------|-------------|
| `path` | URL path visited (e.g. `/`) |
| `ip_address` | Visitor's IP address |
| `user_agent` | Browser/client user agent string |
| `referrer` | Where they came from (e.g. LinkedIn, Google, or empty for direct) |
| `created_at` | Timestamp |

**Useful queries** (run via `heroku pg:psql --app hihelloreid`):

```sql
-- Page views per day with unique visitors
SELECT DATE(created_at) AS day,
       COUNT(*) AS views,
       COUNT(DISTINCT ip_address) AS unique_visitors
FROM page_views GROUP BY day ORDER BY day DESC;

-- Top referrers
SELECT referrer, COUNT(*) AS visits
FROM page_views
WHERE referrer != ''
GROUP BY referrer ORDER BY visits DESC;

-- Visitors who viewed, chatted, AND downloaded (high intent)
SELECT DISTINCT pv.ip_address, pv.referrer, pv.created_at AS visited_at
FROM page_views pv
JOIN chat_logs cl ON pv.ip_address = cl.ip_address
JOIN download_logs dl ON pv.ip_address = dl.ip_address;
```

The nightly digest includes a page views summary with total views, unique visitors, and a breakdown by referrer.

### Download tracking (Postgres)

Every resume download (PDF or DOCX) is logged to a `download_logs` table. The download buttons in the toolbar route through `/api/download/pdf` and `/api/download/docx`, which log the event and serve the file.

| Column | Description |
|--------|-------------|
| `format` | `pdf` or `docx` |
| `ip_address` | Visitor's IP address |
| `user_agent` | Browser/client user agent string |
| `referrer` | The referring URL (e.g. LinkedIn, Google) |
| `created_at` | Timestamp |

**Useful queries** (run via `heroku pg:psql --app hihelloreid`):

```sql
-- See all downloads, most recent first
SELECT * FROM download_logs ORDER BY created_at DESC;

-- Downloads per day
SELECT DATE(created_at) AS day, format, COUNT(*) AS downloads
FROM download_logs GROUP BY day, format ORDER BY day DESC;

-- Cross-reference downloaders with chatters (same IP)
SELECT DISTINCT d.ip_address, d.format, d.created_at AS downloaded_at, c.content AS first_question
FROM download_logs d
JOIN chat_logs c ON d.ip_address = c.ip_address AND c.role = 'user'
ORDER BY d.created_at DESC;
```

### Chat logging (Postgres)

Every user message and AI response is logged to a `chat_logs` table in the Heroku Postgres database. Each row captures:

| Column | Description |
|--------|-------------|
| `session_id` | Unique ID generated per browser session (groups a conversation together) |
| `ip_address` | Visitor's IP address |
| `role` | `user` or `assistant` |
| `content` | The message text |
| `created_at` | Timestamp |

The table is auto-created on server startup if it doesn't exist. Logging is non-blocking — if Postgres is unavailable, the chatbot still works.

**Useful queries** (run via `heroku pg:psql --app hihelloreid`):

```sql
-- See all conversations, most recent first
SELECT session_id, role, content, created_at
FROM chat_logs ORDER BY created_at DESC;

-- List recent sessions with their first message
SELECT session_id, ip_address, MIN(created_at) AS started,
       (SELECT content FROM chat_logs c2
        WHERE c2.session_id = c.session_id AND c2.role = 'user'
        ORDER BY created_at LIMIT 1) AS first_question
FROM chat_logs c
GROUP BY session_id, ip_address
ORDER BY started DESC;

-- Count conversations by day
SELECT DATE(created_at) AS day, COUNT(DISTINCT session_id) AS sessions
FROM chat_logs GROUP BY day ORDER BY day DESC;
```

**Local development:** Logging is skipped when `DATABASE_URL` is not set, so the chatbot works fine locally without Postgres.

### Job description matcher (hidden feature)

The chatbot has a hidden job description matching mode, activated by typing `/match` followed by a job description. This is intended for Reid's private use only — the chatbot will never mention it to visitors.

**How to use:**

In the chatbot, type:

```
/match [paste job description here]
```

The AI will respond with:
1. **Strong Matches** — skills and experience that directly align
2. **Transferable Experience** — adjacent skills where Reid could ramp quickly
3. **Overall Assessment** — optimistic summary of fit

The analysis is deliberately framed as an advocate — it focuses on strengths and frames gaps constructively (e.g. "strong containerization experience with ECS/Fargate translates naturally to Kubernetes").

**Notes:**
- The chat input is a textarea that auto-expands, so pasting long job descriptions works fine
- The `/match` trigger is handled entirely in the system prompt — no special code paths
- Visitors will never see this feature unless they guess the trigger

### Agentic tool use (schedule meeting & send contact)

The chatbot supports **Anthropic tool use** (previously OpenAI function calling) — the LLM can invoke server-side tools during a conversation. Two tools are implemented:

- **`schedule_meeting`** — When a visitor asks to schedule a call or meeting, the model calls this tool to retrieve a scheduling link (Calendly, Cal.com, etc.) and presents it naturally in the response.
- **`send_contact`** — When a visitor wants Reid to receive a written message and has provided name, email, and message in chat, the model can submit the same payload as the Contact Reid form (shared backend path, shared rate limit). See **[Agentic Tool Use](agentic-tool-use.md)** for behavior, validation, and privacy notes.

**Scheduling setup:** Set the `SCHEDULING_URL` environment variable to your booking page URL. If not set, the scheduling tool falls back to suggesting email.

```bash
# Local
echo 'SCHEDULING_URL=https://calendly.com/your-link' >> .env

# Heroku
heroku config:set SCHEDULING_URL=https://calendly.com/your-link --app hihelloreid
```

For full details on the architecture, the tool-calling loop, `tool_usage` logging, and how to add new tools, see **[Agentic Tool Use](agentic-tool-use.md)**. That doc also explains **how OpenAI and Anthropic differ** (message roles, `tool_use` / `tool_result` content blocks vs OpenAI’s `tool_calls` / `tool` role).

### System prompt

The system prompt in `app.py` is built from two text files at startup. If you update your resume content, run `npm run update:resume` — the chatbot picks up the new content on the next server restart.

---

## Nightly Email Digest

A script (`scripts/chat_digest.py`) queries Postgres for the last 24 hours of site activity and emails you a summary. If there were no activity, it skips the email.

### What the email contains

- Page views with unique visitors and referrer breakdown
- Downloads by format
- Contact form submissions
- Each chat conversation grouped by session, showing IP address, start time, and the full user/bot exchange

### Setup on Heroku

1. **Add Heroku Scheduler** (free):

```bash
heroku addons:create scheduler:standard --app hihelloreid
```

2. **Open the scheduler dashboard:**

```bash
heroku addons:open scheduler --app hihelloreid
```

3. **Add a job:**
   - Command: `python scripts/chat_digest.py`
   - Frequency: **Daily**
   - Time: Pick a time (e.g. 06:00 UTC = 2:00 AM ET)

### Configuration

- **Recipient email:** Defaults to `hire.reid.collins@gmail.com`. Override by setting `NOTIFICATION_EMAIL` on Heroku:

```bash
heroku config:set NOTIFICATION_EMAIL=your-email@example.com --app hihelloreid
```

- **Email sending:** Uses Gmail API OAuth configuration (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and `SMTP_USERNAME`) configured on Heroku.

### Test on Heroku

```bash
heroku run python scripts/chat_digest.py --app hihelloreid
```

---

## Contact form

A "Contact Reid" button in the toolbar opens a modal where visitors can submit their name, email, and a message. Submissions are logged to Postgres and included in the nightly digest.

### How it works

1. Visitor clicks "Contact Reid" in the toolbar
2. A modal appears with Name, Email, and Message fields
3. On submit, the form sends a `POST /api/contact` request
4. The submission is saved to the `contact_submissions` table
5. **In production**, an immediate email notification is sent to Reid via Gmail (with reply-to set to the visitor's email so you can reply directly)
6. The nightly digest email also includes all submissions from the last 24 hours

### Database schema

| Column | Description |
|--------|-------------|
| `name` | Visitor's name |
| `email` | Visitor's email address |
| `message` | The message body |
| `ip_address` | Visitor's IP address |
| `created_at` | Timestamp |

### Rate limiting

Successful contact submissions are capped at **5 per client IP per rolling hour** (`MAX_CONTACT_SUBMISSIONS_PER_HOUR` in `app.py`), enforced by counting rows in `contact_submissions` (same limit whether the visitor uses the **Contact Reid** modal or the chatbot’s **`send_contact`** tool). Invalid requests do not consume quota. The API returns **429** with a JSON `error` when the limit is exceeded.

### Components

- **`ContactModal.tsx`** — React component with the form UI and success state
- **`ContactModal.css`** — Styling (modal overlay, animations, form fields)
- **`app.py`** — `POST /api/contact` and `submit_contact()` (shared with the `send_contact` chat tool)

---

## Script Reference

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Vite dev server (frontend) |
| `npm run dev:server` | Start Flask dev server (backend) |
| `npm run build` | TypeScript check + production build |
| `npm test` | Run frontend tests (vitest) |
| `npm run test:server` | Run server tests (pytest) |
| `npm run update:resume` | Generate `resume.ts` + `resume-prompt.txt` from PDF |
| `npm run extract:pdf` | Extract plain text from PDF |
| `npm run digest` | Run chat digest email manually |
