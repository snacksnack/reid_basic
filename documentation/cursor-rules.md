# Cursor Rules

## What are Cursor rules?

Cursor rules are instruction files that tell the AI agent how to behave when working on this project. They live in `.cursor/rules/` as `.mdc` files. Think of them as runbooks the agent follows automatically when a relevant situation comes up.

Each rule has a **trigger mode** that controls when it's loaded:

| Mode | When it activates |
|------|------------------|
| **Always apply** | Loaded into every conversation automatically |
| **Description match** | Loaded when the conversation topic matches the rule's description |
| **Glob match** | Loaded when you're working on files matching a pattern (e.g. `**/*.tsx`) |

---

## Rules in this project

### 1. Project Conventions (`project-conventions.mdc`)

**Trigger:** Always apply (every conversation)

**Purpose:** Ensures the agent writes code that matches the existing patterns in the project. Without this, the agent might use different naming conventions, CSS methodologies, or component structures than what's already in place.

**What it covers:**
- **React components** — one per file, default export, PascalCase names, dedicated props interfaces, local `useState` only (no Redux), accessibility attributes
- **CSS** — flat hyphenated class names grouped by feature prefix (not BEM, not CSS Modules), design tokens via CSS variables in `index.css`, co-located `.css` files imported at top of component, print styles for interactive elements
- **Frontend API calls** — native `fetch` with relative `/api/...` paths, `try/catch` with user-visible fallback, silent catch for analytics
- **Server endpoints** — `/api` prefix, inline handlers, manual validation with early `return res.status(400)`, rate limiting per-route, graceful degradation when DB/email fail
- **TypeScript** — strict mode, `import type` for type-only imports, ESM everywhere
- **Naming** — PascalCase files/components, `is` prefix for booleans, `UPPER_SNAKE` for constants, `on` prefix for callback props

**Example:** If you ask the agent to "add a new API endpoint for feedback," it will follow the existing pattern: inline handler, `/api/feedback` route, manual validation, `{ error: string }` responses, and `console.error` logging.

---

### 2. Resume Update (`resume-update.mdc`)

**Trigger:** Description match — activates when you talk about updating the resume

**Purpose:** Defines the step-by-step procedure the agent follows when you say "I updated my resume" after placing new PDF/DOCX files in `public/docs/`.

**What the agent does:**
1. Runs `npm run update:resume` — generates `src/data/resume.ts` (website data) and `src/data/resume-prompt.txt` (chatbot context) from the PDF
2. Reviews `resume.ts` for parsing issues — ligature errors where PDF font glitches turn characters like `J` into `ti` (e.g. "Jcket" instead of "ticket"), line-break artifacts, empty strings, truncated bullets
3. Reviews `resume-prompt.txt` for the same issues
4. Fixes any problems it finds in both files
5. Runs `npm run extract:pdf` to update the plain text extract
6. Runs `npm test` to verify nothing broke
7. Reports what changed — does NOT commit unless you ask

**Why this exists:** Updating the resume involves multiple steps with a manual review requirement (the PDF parser produces "almost right" output that needs ligature correction). Encoding it as a rule means the agent handles the full procedure consistently every time.

---

### 3. Deployment Troubleshooting (`deploy-troubleshooting.mdc`)

**Trigger:** Description match — activates when you report deploy failures or site issues

**Purpose:** Gives the agent a systematic diagnostic procedure for figuring out what went wrong with a deployment, without you needing to specify where it broke.

**What the agent does:**
1. **Identifies the failure point** — determines whether CI failed, Heroku build failed, the app crashed, or something specific is broken (chatbot, downloads, etc.)
2. **Gathers evidence** — runs diagnostic commands:
   - `gh run list` / `gh run view` for GitHub Actions CI status
   - `heroku builds`, `heroku logs`, `heroku ps` for Heroku status
   - `heroku config` to check environment variables
   - `npm test` / `npm run build` locally to reproduce
3. **Matches against known issues** — checks common failure patterns:
   - CI: TypeScript errors, ESLint errors, test failures
   - Heroku build: missing dependency in wrong section, build script error
   - App crash: missing env var, port binding, missing files
   - Partial breakage: expired OpenAI key, missing `resume-prompt.txt`, missing resume files in `dist/`
4. **Verifies the fix** — runs tests, confirms CI passes, checks Heroku logs

**Key details encoded:** The Heroku app name (`hihelloreid`), required vs. optional environment variables, the build pipeline (`tsc -b && vite build`), and the file structure expectations in production.

---

### 4. Chatbot Personality (`chatbot-personality.mdc`)

**Trigger:** Description match — activates when you want to change the chatbot's behavior

**Purpose:** Tells the agent where the chatbot's personality is defined so it can make changes without touching `server.js`.

**How the chatbot prompt works:**

The chatbot's system prompt is built from two text files, combined at server startup:

| File | What it controls | How to change |
|------|-----------------|---------------|
| `src/data/chatbot-instructions.txt` | Tone, response style, rules, hidden features (`/match`) | Edit directly |
| `src/data/resume-prompt.txt` | Resume content the chatbot knows about | Run `npm run update:resume` (auto-generated from PDF) |

**What the agent does when you want a change:**
1. Edits `src/data/chatbot-instructions.txt`
2. Runs `npm test`
3. Reports the changes

**Example prompts:**
- "Make the chatbot more casual"
- "Remove the /match feature"
- "Add a rule that the chatbot should mention I'm open to remote work"
- "Change the greeting to ask about the visitor's role instead of their company"

---

## How to add a new rule

Create a `.mdc` file in `.cursor/rules/` with YAML frontmatter:

```
---
description: Short description of what this rule does
alwaysApply: false
---

# Rule Title

Instructions for the agent...
```

- Set `alwaysApply: true` for rules that should apply to every conversation
- Set `alwaysApply: false` for rules that should only activate when relevant
- Add `globs: **/*.tsx` to activate only when working on matching files
- Keep rules concise and actionable — the agent follows them literally
