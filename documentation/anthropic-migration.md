# Migration: OpenAI GPT-4o-mini → Anthropic Claude Haiku 4.5

## Summary

The chatbot's LLM provider was switched from **OpenAI GPT-4o-mini** to **Anthropic Claude Haiku 4.5** (`claude-haiku-4-5-20251001`). The two models serve the same role — fast, affordable chat completions with tool use — but their APIs differ significantly. This document records every change, the rationale, and what to watch for.

OpenAI is **still used** for the RAG embedding pipeline (`text-embedding-3-small` via ChromaDB). Anthropic does not offer an embeddings API, so `OPENAI_API_KEY` remains a required environment variable for the vector index.

**New to API differences?** OpenAI and Anthropic use **different message roles** and **different shapes for tool calls** (OpenAI: `tool_calls` + `role: "tool"`; Anthropic: `tool_use` / `tool_result` **content blocks**, with tool results sent as **`user`** messages). See **[Agentic Tool Use](agentic-tool-use.md)** — section *OpenAI vs Anthropic: message roles and content blocks* — for a side-by-side table and a plain-language explanation.

---

## Why Migrate?

| Consideration | Detail |
|---------------|--------|
| Cost | Claude Haiku 4.5 is priced at $1 / $5 per 1M input/output tokens — comparable to GPT-4o-mini |
| Capability | Similar tier: fast, affordable, strong at instruction following and tool use |
| Provider diversification | Reduces single-vendor dependency |

---

## Files Changed

| File | What changed | Purpose |
|------|-------------|---------|
| `app.py` | Import `anthropic`; new `anthropic_client`; `TOOLS` schema converted; `/api/chat` route rewritten; `_save_message` updated for content-block messages | Switch chat completions from OpenAI to Anthropic |
| `requirements.txt` | Added `anthropic>=0.39.0` | New Python dependency |
| `tests/test_server.py` | `TestToolsDefinition` assertions updated for Anthropic tool schema shape | Tests match new `TOOLS` format |
| `documentation/anthropic-migration.md` | Created | This file |
| `documentation/chatbot-setup.md` | References updated to reflect Anthropic as the chat LLM | Keep docs accurate |
| `documentation/agentic-tool-use.md` | References updated to reflect Anthropic tool-use format | Keep docs accurate |

---

## Detailed Changes

### `app.py` — Imports & Client Initialization

**Before:**
```python
from openai import OpenAI

openai_client = OpenAI() if os.environ.get("OPENAI_API_KEY") else None
```

**After:**
```python
import anthropic
from openai import OpenAI

anthropic_client = anthropic.Anthropic() if os.environ.get("ANTHROPIC_API_KEY") else None
openai_client = OpenAI() if os.environ.get("OPENAI_API_KEY") else None
```

The `OpenAI` import and `openai_client` remain because the RAG embedding pipeline (`_build_resume_index`, `_retrieve_context`) still uses the OpenAI embeddings API via ChromaDB's `OpenAIEmbeddingFunction`.

The `anthropic_client` reads `ANTHROPIC_API_KEY` from the environment (the Anthropic SDK uses this env var by default). If the key is not set, `anthropic_client` is `None` and the `/api/chat` route returns 503.

### `app.py` — Tool Definitions (`TOOLS`)

OpenAI and Anthropic use different schemas for tool definitions.

**Before (OpenAI format):**
```python
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "schedule_meeting",
            "description": "...",
            "parameters": { "type": "object", "properties": { ... } },
        },
    },
]
```

**After (Anthropic format):**
```python
TOOLS = [
    {
        "name": "schedule_meeting",
        "description": "...",
        "input_schema": { "type": "object", "properties": { ... } },
    },
]
```

Key differences:
- No `"type": "function"` wrapper — Anthropic tools are flat dicts with `name`, `description`, `input_schema`
- `parameters` is renamed to `input_schema`
- The inner JSON Schema content is identical

### `app.py` — `/api/chat` Route

The chat endpoint was rewritten to call `anthropic_client.messages.create()` instead of `openai_client.chat.completions.create()`.

**Availability check:**
```python
# Before
if not openai_client:
    return jsonify({"error": "Chat is not configured"}), 503

# After
if not anthropic_client:
    return jsonify({"error": "Chat is not configured"}), 503
```

**System prompt handling:**

OpenAI includes the system prompt as a message in the array. Anthropic takes it as a top-level `system` parameter:

```python
# Before
api_messages = [{"role": "system", "content": system_content}, *trimmed]

# After — history is used directly; system prompt is a top-level parameter
api_messages = trimmed
# ... then in the API call:
response = anthropic_client.messages.create(
    system=system_content,
    messages=api_messages,
    ...
)
```

**API call:**

```python
# Before
completion = openai_client.chat.completions.create(
    model="gpt-4o-mini",
    messages=api_messages,
    tools=TOOLS,
    max_tokens=500,
    temperature=0.7,
)

# After
response = anthropic_client.messages.create(
    model="claude-haiku-4-5-20251001",
    system=system_content,
    messages=api_messages,
    tools=TOOLS,
    max_tokens=500,
    temperature=0.7,
)
```

**Response parsing — tool calls:**

OpenAI returns tool calls as `choice.message.tool_calls` (a list of objects with `id`, `function.name`, `function.arguments`). Anthropic returns them as content blocks of `type: "tool_use"` within `response.content`.

```python
# Before
choice = completion.choices[0]
if choice.message.tool_calls:
    for tc in choice.message.tool_calls:
        args = json.loads(tc.function.arguments)
        ...

# After
tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
if tool_use_blocks:
    for block in tool_use_blocks:
        args = block.input  # already a dict, no JSON parsing needed
        ...
```

**Sending tool results back:**

OpenAI uses `role: "tool"` messages with `tool_call_id`. Anthropic uses a `user` message containing `tool_result` content blocks:

```python
# Before
tool_result_msg = {
    "role": "tool",
    "tool_call_id": tool_call.id,
    "content": result,
}
api_messages.append(tool_result_msg)

# After — all tool results for a round go into one user message
tool_results = []
for block in tool_use_blocks:
    result = execute_tool_call(block.name, block.input, client_ip=ip)
    tool_results.append({
        "type": "tool_result",
        "tool_use_id": block.id,
        "content": result,
    })
tool_result_msg = {"role": "user", "content": tool_results}
api_messages.append(tool_result_msg)
_save_message(session_id, ip, tool_result_msg)
```

Tool result messages are now saved in Anthropic's native format. The `_save_message` helper stores the raw dict in `raw_message` and writes an empty string to the `content` column (since the content is a list of blocks, not a plain string).

**Extracting the final text reply:**

```python
# Before
reply = choice.message.content

# After — response.content is a list of blocks; extract text blocks
text_blocks = [b.text for b in response.content if b.type == "text"]
reply = " ".join(text_blocks) if text_blocks else None
```

### `requirements.txt`

Added `anthropic>=0.39.0` at the top (alphabetical order). The `openai>=1.0` dependency is retained for embeddings.

### `tests/test_server.py` — `TestToolsDefinition`

Updated to match the new flat Anthropic tool schema:

```python
# Before
tool = next((t for t in TOOLS if t["function"]["name"] == "schedule_meeting"), None)
assert tool["type"] == "function"
assert "topic" in tool["function"]["parameters"]["properties"]

# After
tool = next((t for t in TOOLS if t["name"] == "schedule_meeting"), None)
assert "input_schema" in tool
assert "topic" in tool["input_schema"]["properties"]
```

---

## Environment Variables

| Variable | Required for | Notes |
|----------|-------------|-------|
| `ANTHROPIC_API_KEY` | Chat completions (Claude Haiku 4.5) | **New.** Get from [console.anthropic.com](https://console.anthropic.com) |
| `OPENAI_API_KEY` | RAG embeddings (`text-embedding-3-small`) | **Still required.** Used by ChromaDB's `OpenAIEmbeddingFunction` |

### Setting up locally

Add to `.env`:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
OPENAI_API_KEY=sk-your-existing-key
```

### Setting up on Heroku

```bash
heroku config:set ANTHROPIC_API_KEY=sk-ant-your-key-here --app hihelloreid
```

The existing `OPENAI_API_KEY` config var should remain in place.

---

## Backward Compatibility

### Existing conversations in the database

Pre-migration rows in `chat_logs` contain OpenAI-format messages (e.g. `tool_calls` arrays, `role: "tool"` entries). These are **not** converted — existing sessions that started on GPT-4o-mini will not carry over. New conversations are stored in Anthropic's native format and replayed directly.

### `scripts/summarize_sessions.py`

This offline script still uses the OpenAI SDK directly (it imports `from openai import OpenAI`). It was **not** migrated — it runs independently as a batch job and uses `OPENAI_API_KEY`. No changes needed.

---

## What Did NOT Change

| Component | Why |
|-----------|-----|
| Frontend (`ChatBot.tsx`) | Unchanged — it sends `{ message, sessionId }` and receives `{ reply }`, agnostic to the backend LLM |
| RAG pipeline (`_build_resume_index`, `_retrieve_context`) | Still uses OpenAI `text-embedding-3-small` via ChromaDB |
| `execute_tool_call()` | Unchanged — tool handlers are provider-agnostic (they receive args, return JSON strings) |
| Database schema | Unchanged — same tables, same columns |
| `_save_message()` / `_load_session_history()` | Minor updates — `_save_message` handles list content blocks; docstrings updated; messages stored and replayed in Anthropic's native format |
| `scripts/summarize_sessions.py` | Still uses OpenAI directly |
| `scripts/chat_digest.py` | No LLM calls — just database queries and email |
| Rate limiting | Same 20 requests/IP/hour server-side, 10 messages client-side |
| System prompt (`chatbot-instructions.txt`, `resume-prompt.txt`) | Unchanged — the instructions are provider-agnostic |

---

## Cost Comparison

| | GPT-4o-mini | Claude Haiku 4.5 |
|---|---|---|
| Input | $0.15 / 1M tokens | $1.00 / 1M tokens |
| Output | $0.60 / 1M tokens | $5.00 / 1M tokens |
| Cached input | N/A (automatic) | $0.10 / 1M tokens (with prompt caching) |

Claude Haiku 4.5 is more expensive per-token than GPT-4o-mini, but still very affordable for a personal resume chatbot. At roughly $0.004 per request, $50 in credits covers ~13,000 requests.

**Spending safeguard:** Set a monthly budget cap in your Anthropic account at [console.anthropic.com](https://console.anthropic.com) under Settings → Limits.
