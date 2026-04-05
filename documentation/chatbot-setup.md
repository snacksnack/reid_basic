# Chatbot Setup

## Overview

The resume site includes an AI-powered chatbot that answers questions about Reid's professional background. It uses OpenAI's `gpt-4o-mini` model with the full resume as context.

**Architecture:**
- **Frontend:** React component (`ChatBot.tsx`) — floating button in the bottom-right that opens a chat panel
- **Backend:** Express server (`server.js`) with a `POST /api/chat` endpoint that proxies requests to OpenAI
- **In production:** Express serves both the static site (`dist/`) and the chat API
- **In development:** Vite dev server proxies `/api` requests to the Express backend

---

## Prerequisites

- **OpenAI API key** — sign up at [platform.openai.com](https://platform.openai.com) and add a few dollars of credit ($5 is plenty)

---

## Local Development

### 1. Create a `.env` file in the project root

```
OPENAI_API_KEY=sk-your-actual-key
```

This file is gitignored and will not be committed.

### 2. Start the backend server

```bash
npm run dev:server
```

Runs the Express server on port 3001 with file watching.

### 3. Start the Vite dev server

In a separate terminal:

```bash
npm run dev
```

Opens the site at `http://localhost:5173`. The Vite config proxies `/api` requests to the Express server on port 3001.

### 4. Test the chatbot

Click the blue chat bubble in the bottom-right corner and ask a question like "What AWS services has Reid used?"

---

## Heroku Deployment

### Set the environment variable

```bash
heroku config:set OPENAI_API_KEY=sk-your-actual-key
```

### How it works

- The `Procfile` tells Heroku to run `node server.js`
- In production (`NODE_ENV=production`), Express serves static files from `dist/` and handles `/api/chat`
- Heroku sets `PORT` automatically; the server uses it

### Deploy

```bash
git push heroku chatbot_experiment:main
```

Or merge into `main` and push as usual.

---

## Files Added / Modified

| File | What it does |
|------|-------------|
| `server.js` | Express server — serves static files + `/api/chat` endpoint |
| `src/components/ChatBot.tsx` | React chat widget (floating button + chat panel) |
| `src/components/ChatBot.css` | Chat widget styles (responsive, hidden on print) |
| `Procfile` | Heroku process definition (`node server.js`) |
| `.env.example` | Documents required environment variables |
| `.env` | Your actual API key (gitignored) |
| `vite.config.ts` | Added dev proxy: `/api` → `localhost:3001` |
| `package.json` | Added dependencies, updated `start` script, added `dev:server` |
| `src/App.tsx` | Added `<ChatBot />` component |
| `.gitignore` | Added `.env` |

---

## Configuration

### Model

The chatbot uses `gpt-4o-mini` (cheap and fast). To change the model, edit `server.js`:

```js
const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',  // change to 'gpt-4o' for higher quality
  ...
})
```

### Conversation limits

- **Client-side message cap:** 10 user messages per conversation (controlled by `MAX_USER_MESSAGES` in `ChatBot.tsx`). After the 10th message, the bot delivers a humorous cutoff message and disables the input.
- **Server-side context window:** Last 20 messages sent to OpenAI (controlled by `MAX_CONVERSATION_MESSAGES` in `server.js`). Older messages are silently trimmed to control token costs.
- **Max response tokens:** 500 per reply (controlled by `max_tokens` in the API call)

### Rate limiting

The `/api/chat` endpoint is protected by `express-rate-limit`:

- **20 requests per IP per hour** (controlled in `server.js`)
- Returns a `429` status with `{ error: "Too many requests — please try again later." }` when exceeded
- Uses standard `RateLimit-*` response headers so clients know their remaining quota
- Resets after the 1-hour window expires

This prevents scripts or bots from burning through OpenAI credits. A real user hitting the 10-message client-side cap will never reach the 20-request server limit.

### OpenAI spending limits

As an additional safeguard, set a monthly budget cap in your OpenAI account at [platform.openai.com/settings/organization/limits](https://platform.openai.com/settings/organization/limits). This is a hard ceiling regardless of what happens on the server side.

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

### Agentic tool use (schedule meeting)

The chatbot supports **OpenAI function calling** — the LLM can invoke server-side tools during a conversation. Currently one tool is implemented:

- **`schedule_meeting`** — When a visitor asks to schedule a call or meeting, the model calls this tool to retrieve a scheduling link (Calendly, Cal.com, etc.) and presents it naturally in the response.

**Setup:** Set the `SCHEDULING_URL` environment variable to your booking page URL. If not set, the tool gracefully falls back to suggesting email.

```bash
# Local
echo 'SCHEDULING_URL=https://calendly.com/your-link' >> .env

# Heroku
heroku config:set SCHEDULING_URL=https://calendly.com/your-link --app hihelloreid
```

For full details on the architecture, how the tool-calling loop works, the database table, and how to add new tools, see **[Agentic Tool Use](agentic-tool-use.md)**.

### System prompt

The system prompt in `server.js` contains the full resume text and instructions for the AI. If you update your resume content, update the system prompt to match.

---

## Nightly Email Digest

A script (`scripts/chat-digest.mjs`) queries Postgres for the last 24 hours of chat activity and emails you a summary. If there were no chats, it skips the email.

### What the email contains

- Number of conversations and total messages
- Each conversation grouped by session, showing IP address, start time, and the full user/bot exchange

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
   - Command: `node scripts/chat-digest.mjs`
   - Frequency: **Daily**
   - Time: Pick a time (e.g. 06:00 UTC = 2:00 AM ET)

### Configuration

- **Recipient email:** Defaults to `hire.reid.collins@gmail.com`. Override by setting `DIGEST_EMAIL` on Heroku:

```bash
heroku config:set DIGEST_EMAIL=your-email@example.com --app hihelloreid
```

- **Email sending:** Uses the existing SendGrid SMTP credentials (`SENDGRID_USERNAME` / `SENDGRID_PASSWORD`) already configured on Heroku.

### Test locally

You can't test email locally without SendGrid credentials, but you can test the query by temporarily setting `DATABASE_URL` and `SENDGRID_USERNAME`/`SENDGRID_PASSWORD` in your `.env` file.

### Test on Heroku

```bash
heroku run node scripts/chat-digest.mjs --app hihelloreid
```

---

## Contact form

A "Contact Reid" button in the toolbar opens a modal where visitors can submit their name, email, and a message. Submissions are logged to Postgres and included in the nightly digest.

### How it works

1. Visitor clicks "Contact Reid" in the toolbar
2. A modal appears with Name, Email, and Message fields
3. On submit, the form sends a `POST /api/contact` request
4. The submission is saved to the `contact_submissions` table
5. **In production**, an immediate email notification is sent to Reid via SendGrid (with reply-to set to the visitor's email so you can reply directly)
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

The `/api/contact` endpoint is rate-limited to **3 submissions per IP per hour** to prevent abuse.

### Useful queries

```sql
-- All contact submissions
SELECT * FROM contact_submissions ORDER BY created_at DESC;

-- Submissions from today
SELECT * FROM contact_submissions WHERE created_at >= CURRENT_DATE ORDER BY created_at;

-- Cross-reference with chatters
SELECT DISTINCT cs.name, cs.email, cs.message, cs.created_at
FROM contact_submissions cs
JOIN chat_logs cl ON cs.ip_address = cl.ip_address
ORDER BY cs.created_at DESC;
```

### Components

- **`ContactModal.tsx`** — React component with the form UI and success state
- **`ContactModal.css`** — Styling (modal overlay, animations, form fields)
- **`server.js`** — `POST /api/contact` endpoint with validation and rate limiting

---

## npm Scripts Reference

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Vite dev server (frontend) |
| `npm run dev:server` | Start Express server with file watching (backend) |
| `npm run build` | TypeScript check + production build |
| `npm run start` | Run production server (`node server.js`) |
| `npm run digest` | Run chat digest email manually |
