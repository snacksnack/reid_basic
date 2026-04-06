# Agentic Tool Use — Chatbot

## Overview

The chatbot uses **OpenAI function calling** (also called "tool use") to take actions on behalf of visitors. Instead of only generating text responses, the LLM can invoke server-side tools, receive structured results, and incorporate those results into its reply.

This is an implementation of the **agentic tool use** design pattern: the model autonomously decides when a tool is needed, calls it, interprets the result, and responds — all within a single user-visible request/response cycle.

### What is the "agent" here?

The **chatbot is the agent**. Specifically, GPT-4o-mini with the system prompt. It receives a visitor's message, *reasons* about what to do, and *decides* whether to just respond with text or invoke a tool first.

- **Agent** = the chatbot (the LLM with its system prompt and tool definitions)
- **Tool** = a capability the agent can call, like `schedule_meeting`. The agent decides when to use it — not the visitor, not hardcoded logic.
- **Agentic loop** = the `for` loop in `/api/chat` in `app.py`. The agent gets multiple turns to think: call a tool, get the result back, then formulate a final response.

All of the agentic work lives in **`app.py`** — the tool schema, the execution handler, and the orchestration loop. The frontend (`ChatBot.tsx`) is completely unaware that tools are involved; it sends messages and receives a text reply, same as before.

| Before | Now |
|--------|-----|
| Visitor sends message → LLM generates text → done | Visitor sends message → LLM *decides* whether to call a tool → executes it → uses the result to generate text |
| LLM can only *say* things | LLM can *do* things (retrieve scheduling links, and eventually more) |

### Why tool use instead of hardcoded logic?

The existing `/match` feature uses prompt engineering — the entire behavior is encoded in the system prompt. Tool use is different:

| Aspect | Prompt-only (e.g. `/match`) | Tool use (e.g. `schedule_meeting`) |
|--------|----------------------------|------------------------------------|
| Trigger | User must know a magic command | LLM detects intent naturally |
| Data | Static (baked into prompt) | Dynamic (fetched at call time) |
| Actions | Text generation only | Can call APIs, query databases, etc. |
| Extensibility | Edit prompt text | Add a function + schema |

Tool use makes the chatbot genuinely interactive — it can *do things*, not just *say things*.

---

## Architecture

```
Visitor sends message
        │
        ▼
┌──────────────────┐
│  POST /api/chat  │
│  (Flask)         │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  OpenAI Chat Completions API         │
│  model: gpt-4o-mini                  │
│  tools: [schedule_meeting, ...]      │
│  messages: [system + conversation]   │
└────────┬─────────────────────────────┘
         │
         ▼
    ┌────────────┐       YES        ┌──────────────────┐
    │ tool_calls │ ───────────────► │ execute_tool_call │
    │ in reply?  │                  │ (server-side)     │
    └────┬───────┘                  └────────┬─────────┘
         │ NO                                │
         │                                   │ result appended
         │                           ┌───────▼──────────┐
         │                           │ Call OpenAI again │
         │                           │ with tool result  │
         │                           └───────┬──────────┘
         │                                   │
         │◄──────────────────────────────────┘
         │         (loop up to 3 rounds)
         ▼
┌──────────────────┐
│  Return { reply } │
│  to frontend      │
└──────────────────┘
```

Key points:
- The **tool-calling loop runs entirely server-side**. The frontend sends messages and receives a text reply — it doesn't know tools were involved.
- The loop is capped at **3 rounds** (`MAX_TOOL_ROUNDS`) to prevent runaway costs or infinite loops.
- Tool calls and results are **ephemeral** — they exist only during request processing. The frontend's conversation history contains only `user` and `assistant` messages.

---

## The Tool-Calling Loop (step by step)

Three actors are involved:
- **Frontend** = the visitor's browser running `ChatBot.tsx` — sends the HTTP request
- **Server** = `app.py` (Flask) — receives the request, orchestrates the loop
- **Agent** = the LLM (GPT-4o-mini) — called by the server, decides whether to use tools

The flow:

1. **Frontend sends** `POST /api/chat` with `{ messages, sessionId }`
2. **Server builds** the API message array: `[system_prompt, ...last_20_messages]`
3. **Server calls the agent (OpenAI)** with the `tools` parameter containing all tool schemas
4. **Agent responds** with either:
   - **A text message** (`finish_reason: 'stop'`) → return it to the frontend
   - **One or more tool calls** (`message.tool_calls` list) → continue to step 5
5. **Server executes each tool call**:
   - Parses the `arguments` JSON from the agent's response
   - Calls `execute_tool_call(name, args)` which runs the corresponding handler
   - Appends the agent's tool-call message and each tool result to `api_messages`
   - Logs the tool invocation to the `tool_usage` database table
6. **Server calls the agent again** with the updated messages (now including tool results)
7. **Repeat** from step 4, up to `MAX_TOOL_ROUNDS` times
8. **Return** the final text reply to the frontend

### Example: what the messages look like during a tool call

```
Round 1 → OpenAI:
  [system, ...conversation, { role: "user", content: "Can I schedule a call with Reid?" }]

Round 1 ← OpenAI:
  { tool_calls: [{ id: "call_abc", function: { name: "schedule_meeting", arguments: '{"topic":"discuss role"}' } }] }

Server executes: execute_tool_call("schedule_meeting", { "topic": "discuss role" })
  → '{"available":true,"scheduling_url":"https://calendly.com/reid","topic":"discuss role"}'

Round 2 → OpenAI:
  [...previous messages,
   { role: "assistant", tool_calls: [...] },
   { role: "tool", tool_call_id: "call_abc", content: '{"available":true,...}' }]

Round 2 ← OpenAI:
  { content: "Sure! Here's Reid's scheduling link: https://calendly.com/reid — pick a time that works for you." }

→ Returned to client as { reply: "Sure! Here's Reid's scheduling link: ..." }
```

---

## Current Tools

### `schedule_meeting`

**Purpose:** Provide visitors with a link to schedule a call/meeting with Reid.

**When the LLM calls it:**
- Visitor asks to schedule a call, meeting, or interview
- Visitor asks about Reid's availability
- Visitor says something like "How can I talk to Reid?" or "Can we set up a time?"

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `topic` | string | No | What the visitor wants to discuss |

**Behavior:**

| Condition | Result |
|-----------|--------|
| `SCHEDULING_URL` env var is set | Returns `{ available: true, scheduling_url, topic }` |
| `SCHEDULING_URL` is not set | Returns `{ available: false, fallback_email: "hire.reid.collins@gmail.com" }` |

The LLM uses the result to craft a natural response — either presenting the scheduling link or suggesting email as a fallback.

**Example exchange:**

> **Visitor:** "This looks great — can I set up a time to chat with Reid about our backend engineering role?"
>
> **Assistant:** "Absolutely! Here's Reid's scheduling link: https://calendly.com/reid — pick whatever time works for you. If you want to share any details about the role beforehand, feel free to mention it when you book."

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SCHEDULING_URL` | No | Full URL to a scheduling page (e.g. Calendly, Cal.com, or any booking link). If not set, the tool gracefully falls back to suggesting email contact. |

**Set locally** (`.env`):
```
SCHEDULING_URL=https://calendly.com/your-link
```

**Set on Heroku:**
```bash
heroku config:set SCHEDULING_URL=https://calendly.com/your-link --app hihelloreid
```

### Constants (in `app.py`)

| Constant | Default | Description |
|----------|---------|-------------|
| `MAX_TOOL_ROUNDS` | 3 | Maximum iterations of the tool-calling loop per request. Prevents runaway API calls if the model keeps requesting tools. |
| `TOOLS` | List | OpenAI function schemas. Imported by tests. |

---

## Database: `tool_usage` Table

Every tool invocation is logged for analytics. The table is auto-created on server startup.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Auto-incrementing primary key |
| `session_id` | TEXT | Links to the chat session |
| `ip_address` | TEXT | Visitor's IP |
| `tool_name` | TEXT | Which tool was called (e.g. `schedule_meeting`) |
| `tool_args` | JSONB | Arguments the model passed to the tool |
| `tool_result` | TEXT | JSON string returned by the tool handler |
| `created_at` | TIMESTAMPTZ | When the tool was invoked |

**Useful queries** (via `heroku pg:psql --app hihelloreid`):

```sql
-- All tool invocations, most recent first
SELECT * FROM tool_usage ORDER BY created_at DESC;

-- How often each tool is called
SELECT tool_name, COUNT(*) AS invocations
FROM tool_usage GROUP BY tool_name ORDER BY invocations DESC;

-- Schedule requests with topics
SELECT session_id, tool_args->>'topic' AS topic, created_at
FROM tool_usage
WHERE tool_name = 'schedule_meeting'
ORDER BY created_at DESC;

-- Cross-reference: who scheduled after chatting?
SELECT DISTINCT tu.session_id, tu.tool_args->>'topic' AS topic,
       tu.created_at AS scheduled_at, cl.content AS first_question
FROM tool_usage tu
JOIN chat_logs cl ON tu.session_id = cl.session_id AND cl.role = 'user'
WHERE tu.tool_name = 'schedule_meeting'
ORDER BY tu.created_at DESC;
```

**Local development:** Logging is skipped when `DATABASE_URL` is not set.

---

## Frontend: Clickable Links

The `ChatBot.tsx` component includes a `Linkified` helper that detects URLs in assistant responses and renders them as clickable `<a>` tags. This ensures scheduling links (and any other URLs) are interactive without requiring markdown rendering.

**How it works:**
1. The `Linkified` component splits message text on URL patterns (`https?://...`)
2. URL segments become `<a>` elements with `target="_blank"` and `rel="noopener noreferrer"`
3. Non-URL segments render as plain `<span>` elements

**Styling** (`ChatBot.css`):
- Assistant bubble links use `var(--accent)` color with underline
- User bubble links stay white with underline (matching the bubble's text color)
- Long URLs break at any character (`word-break: break-all`) to prevent bubble overflow

---

## How to Add a New Tool

Adding a tool to the chatbot involves these steps:

### Step 1: Define the tool schema

Add an entry to the `TOOLS` list in `app.py`. Follow the [OpenAI function calling spec](https://platform.openai.com/docs/guides/function-calling):

```python
{
    "type": "function",
    "function": {
        "name": "your_tool_name",
        "description": "When to call this tool — be specific so the model invokes it correctly.",
        "parameters": {
            "type": "object",
            "properties": {
                "param1": {
                    "type": "string",
                    "description": "What this parameter represents",
                },
            },
            "required": ["param1"],
        },
    },
}
```

**Tips for the description:**
- Write it from the model's perspective: "Get X when the user asks about Y"
- Be specific about when to use it and when *not* to
- The model reads this to decide whether to call the tool

### Step 2: Add the handler to `execute_tool_call`

```python
def execute_tool_call(name, args):
    if name == "schedule_meeting":
        ...

    if name == "your_tool_name":
        # Your logic here — call APIs, query data, compute results
        return json.dumps({
            "result": "whatever the model needs",
        })

    return json.dumps({"error": f"Unknown tool: {name}"})
```

**Guidelines:**
- Always return a JSON string (the model parses it)
- Handle missing config gracefully (check env vars, return fallbacks)
- Keep execution fast — the visitor is waiting
- Don't raise exceptions; return error objects the model can communicate

### Step 3: Update the chatbot instructions

Add a section to `src/data/chatbot-instructions.txt` telling the model when and how to use the new tool. The tool schema's `description` tells the model *what* the tool does; the instructions tell it *when* to use it and *how to present results*.

### Step 4: Add tests

Add test cases in `tests/test_server.py`:
- Verify the tool exists in the `TOOLS` list with the correct schema
- Test `execute_tool_call` with various argument combinations
- Test graceful degradation when config is missing

### Step 5: Document

Add a section to this file describing the tool's purpose, parameters, behavior, and example exchanges.

---

## Scaling: When to Extract Tools from `app.py`

With one tool, keeping everything inline in `app.py` is fine — it matches the project's convention of inline route handlers. Once you reach 3-5+ tools, extract them into a dedicated module:

```
tools/
  __init__.py              ← exports TOOLS list + execute_tool_call
  schedule_meeting.py      ← schema + handler for this tool
  search_resume.py         ← schema + handler for another tool
```

Each tool file exports its schema and handler:

```python
# tools/schedule_meeting.py
import json
import os

SCHEMA = {
    "type": "function",
    "function": {
        "name": "schedule_meeting",
        "description": "...",
        "parameters": { ... },
    },
}

def handler(args):
    scheduling_url = os.environ.get("SCHEDULING_URL")
    # ...
    return json.dumps({ ... })
```

The `__init__.py` collects them into a registry:

```python
# tools/__init__.py
from . import schedule_meeting, search_resume

_registry = [schedule_meeting, search_resume]

TOOLS = [t.SCHEMA for t in _registry]
_handlers = {t.SCHEMA["function"]["name"]: t.handler for t in _registry}

def execute_tool_call(name, args):
    handler = _handlers.get(name)
    if not handler:
        return json.dumps({"error": f"Unknown tool: {name}"})
    return handler(args)
```

Then `app.py` just imports `TOOLS` and `execute_tool_call` — the agentic loop stays in `app.py`, but tool definitions live in their own files.

---

## Cost Considerations

Each tool-calling round is an additional OpenAI API call. For a single tool invocation:
- **Round 1:** User message → model decides to call tool (~200-400 tokens)
- **Round 2:** Tool result → model generates final response (~300-600 tokens)
- **Total:** ~2x the cost of a non-tool response

With `gpt-4o-mini` pricing, this is negligible (fractions of a cent per exchange). The `MAX_TOOL_ROUNDS = 3` cap ensures at most 4 API calls per user message in pathological cases.

The existing rate limits (20 requests/IP/hour server-side, 10 messages client-side) remain unchanged and provide the same cost protection.

---

## Graceful Degradation

| Failure | Behavior |
|---------|----------|
| `SCHEDULING_URL` not set | Tool returns fallback; model suggests email instead |
| `OPENAI_API_KEY` not set | Returns 503 before tool loop is reached |
| OpenAI API error during tool loop | Caught by try/except; returns 500 |
| Tool loop hits `MAX_TOOL_ROUNDS` | Returns generic "couldn't generate" message |
| Database unavailable | Tool usage logging silently skipped |
| Unknown tool name | Returns error JSON; model communicates gracefully |

---

## Files

| File | Change |
|------|--------|
| `app.py` | `TOOLS` list, `execute_tool_call`, tool-calling loop in `/api/chat`, `tool_usage` table |
| `src/data/chatbot-instructions.txt` | Scheduling tool guidance section |
| `src/components/ChatBot.tsx` | `Linkified` component for clickable URLs in chat bubbles |
| `src/components/ChatBot.css` | `.chat-link` styles for assistant and user bubbles |
| `tests/test_server.py` | Tests for `TOOLS` schema and `execute_tool_call` function |
| `documentation/agentic-tool-use.md` | This file |
| `documentation/chatbot-setup.md` | Reference to this document |
