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

## npm Scripts Reference

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Vite dev server (frontend) |
| `npm run dev:server` | Start Express server with file watching (backend) |
| `npm run build` | TypeScript check + production build |
| `npm run start` | Run production server (`node server.js`) |
| `npm run digest` | Run chat digest email manually |
