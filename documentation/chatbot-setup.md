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

### System prompt

The system prompt in `server.js` contains the full resume text and instructions for the AI. If you update your resume content, update the system prompt to match.

---

## npm Scripts Reference

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Vite dev server (frontend) |
| `npm run dev:server` | Start Express server with file watching (backend) |
| `npm run build` | TypeScript check + production build |
| `npm run start` | Run production server (`node server.js`) |
