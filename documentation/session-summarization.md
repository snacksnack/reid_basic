# Session Summarization

## Overview

The chatbot stores every conversation in Postgres. Rather than waiting for the nightly digest to see what visitors talked about, a scheduled job runs every 10 minutes and emails a structured AI-generated summary shortly after each conversation ends. This gives near-real-time visibility into visitor intent without requiring Reid to read raw transcripts.

This feature combines several patterns worth knowing: background job scheduling, inactivity-based session detection, LLM-powered information extraction, and idempotent processing.

---

## How It Works

```
Heroku Scheduler (every 10 min)
    │
    ▼
scripts/summarize_sessions.py
    │
    ├── Query Postgres for unsummarized inactive sessions
    │       • last message > 30 minutes ago
    │       • at least 3 user messages
    │       • not already in chat_summaries
    │
    ├── For each qualifying session:
    │       • Load full transcript from chat_logs
    │       • Call gpt-4o-mini to extract structured summary
    │
    └── If any sessions were summarized:
            • Send one email via Gmail with all summaries
            • Save summaries to chat_summaries only after email delivery succeeds
```

---

## What "Session End" Means

There is no explicit session-end event in a browser-based chat. Users close the tab, navigate away, or simply stop responding — none of these fire a reliable server-side signal.

The approach used here is **inactivity timeout**: a session is considered ended when no new messages have arrived for 30 minutes (`INACTIVITY_MINUTES`). This is the standard pattern used by analytics platforms and most production chat systems.

A minimum turn threshold (`MIN_USER_MESSAGES = 3`) filters out one-line exchanges that aren't worth summarizing — someone typing "hi" and leaving, for example.

---

## Idempotency

The script is safe to run as frequently as desired. The `chat_summaries` table uses `session_id` as a unique key, and every query excludes sessions already present there:

```sql
WHERE session_id NOT IN (SELECT session_id FROM chat_summaries)
```

Running the script 100 times produces the same result as running it once — each session is summarized exactly once, regardless of how often the scheduler fires.

This is an important property for scheduled jobs: if a run fails halfway through, the next run picks up where it left off without duplicating work.

---

## The Summarization Prompt

The LLM is given a low temperature (`0.3`) and a structured extraction prompt that asks for exactly four fields:

- **Visitor context** — company, role, or team if mentioned; "unknown" otherwise
- **Topics discussed** — which parts of Reid's background came up
- **Interest signals** — scheduling intent, contact details shared, hiring indicators
- **Suggested follow-up** — one sentence on whether Reid should act, or "none needed"

Low temperature is appropriate here because the goal is factual extraction, not creative generation. Higher temperature would introduce variation in how the same facts are described, which is undesirable for a structured summary.

---

## Email Format

All sessions summarized in a single run are batched into one email. This prevents inbox flooding if multiple sessions become eligible simultaneously (e.g. after the app restarts and several old sessions are processed at once).

If no sessions qualify, no email is sent. The script exits silently — Heroku Scheduler logs the stdout output but no notification is generated.

The email includes for each session:
- Session ID and IP address
- Start and end time, number of user turns
- The four-field structured summary

---

## Files Changed

### `app.py`
Added `chat_summaries` to `_init_db()`. The table is created on first app startup via the existing `CREATE TABLE IF NOT EXISTS` migration pattern:

```sql
CREATE TABLE IF NOT EXISTS chat_summaries (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    summary TEXT NOT NULL,
    user_message_count INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
)
```

The `UNIQUE` constraint on `session_id` enforces idempotency at the database level — even if the script were to attempt a duplicate insert, the `ON CONFLICT DO NOTHING` clause in the script handles it gracefully.

### `scripts/summarize_sessions.py`
New script. Standalone — no dependency on the Flask app. Connects directly to Postgres and OpenAI. Key functions:

| Function | Purpose |
|----------|---------|
| `find_unsummarized_sessions()` | SQL query to identify qualifying sessions |
| `load_transcript()` | Fetch all user/assistant messages for a session |
| `build_transcript_text()` | Format messages into a readable string for the prompt |
| `summarize()` | OpenAI call — returns the structured summary text |
| `save_summary()` | Insert into `chat_summaries` |
| `send_email()` | Batch all summaries into one Gmail notification email |
| `run()` | Orchestrates the full pipeline |

---

## Deployment

### Heroku Scheduler
The script runs every 10 minutes via the Heroku Scheduler add-on (already configured on the hihelloreid app):

```
python scripts/summarize_sessions.py
```

To view or modify the schedule:
```bash
heroku addons:open scheduler --app hihelloreid
```

### Environment Variables
The script needs database/model configuration plus Gmail OAuth settings for email delivery:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection (required) |
| `OPENAI_API_KEY` | Summarization model (required) |
| `GMAIL_CLIENT_ID` | Google OAuth client ID for Gmail API delivery |
| `GMAIL_CLIENT_SECRET` | Google OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | Google OAuth refresh token with `gmail.send` scope |
| `SMTP_USERNAME` | Gmail address used as the sender |
| `NOTIFICATION_EMAIL` | Recipient address (default: hire.reid.collins@gmail.com) |

### Optional Tuning
These can be set as Heroku config vars to adjust behavior without code changes:

| Variable | Default | Effect |
|----------|---------|--------|
| `INACTIVITY_MINUTES` | `30` | Minutes of silence before a session is eligible |
| `MIN_USER_MESSAGES` | `3` | Minimum user turns required to summarize |

---

## Relationship to the Nightly Digest

`scripts/chat_digest.py` (the existing nightly job) and `scripts/summarize_sessions.py` are complementary:

| | `chat_digest.py` | `summarize_sessions.py` |
|--|-----------------|------------------------|
| Frequency | Nightly | Every 10 minutes |
| Content | Raw transcripts + page views + downloads + contacts | AI-generated summaries only |
| Purpose | Complete daily record | Near-real-time intent signals |
| Stores to DB | No | Yes (`chat_summaries`) |

---

## Production Considerations

**Cost.** Each summarization makes one `gpt-4o-mini` call with roughly 500–800 input tokens and ~300 output tokens. At current pricing this is under $0.001 per session — negligible.

**Latency.** The script is not on the request path. It runs as a background job and has no effect on chatbot response time.

**Failure handling.** Each session is summarized in a try/except block. A failure on one session is logged and skipped; the remaining sessions in the same run are still processed. On the next scheduler run, the failed session will be retried (since it was never written to `chat_summaries`).

**Scaling.** If the volume of conversations ever grew significantly, the current approach of processing all eligible sessions in a single synchronous script would become slow. The natural upgrade is to push each session onto a queue (SQS, Celery, etc.) and process them in parallel workers. The idempotency guarantee already in place makes that transition straightforward.
