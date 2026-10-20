# reid_basic

Personal resume site (hihelloreid.com): React + Vite frontend, Flask (`app.py`)
backend, deployed to Heroku (app `hihelloreid`) via GitHub Actions. A Claude Haiku
chatbot answers over a RAG index built from the resume text.

## Repeatable procedures live in skills

These are `.claude/skills/` and load automatically when relevant:

- **update-resume**: the canonical resume update path (edit the DOCX, propagate the
  text to the website, chatbot corpus, and download files). Use whenever resume
  content changes.
- **deploy-troubleshooting**: diagnose a failed deploy or a broken site.
- **chatbot-personality**: change the chatbot's tone or behavior.

## React components

- One component per file, default export, PascalCase filename matching the component.
- Props: a dedicated interface (`ResumeProps`, `ContactModalProps`), not inline.
- Shared types live in `Resume.tsx`, imported elsewhere with `import type`.
- Small helpers can share the parent component's file (e.g. `ContactLine` in `Resume.tsx`).
- State: local `useState` only, no Redux or Zustand. Lift to `App.tsx` only when
  siblings need it.
- Refs: `useRef` for focus management, scroll behavior, DOM observation.
- Accessibility: `aria-label`, `role`, semantic HTML (`<main>`, `<section>`,
  `<header>`), keyboard support.

## CSS

- No CSS Modules, no BEM. Flat, hyphenated class names grouped by feature prefix.
- Component CSS: co-located file (`ChatBot.css` next to `ChatBot.tsx`), imported at
  the top of the component. Resume CSS (`resume.css`) is imported from `App.tsx`,
  not from `Resume.tsx`.
- Design tokens: CSS variables in `index.css` (`:root`): `--text`, `--muted`,
  `--bg`, `--accent`. Use these, never hardcoded colors.
- Modifiers: an extra class, not BEM (e.g. `.chat-bubble.user`, `.toolbar.stuck`).
- Print styles: `@media print` rules hide interactive elements (chat, toolbar, modals).

## Frontend API calls

- Native `fetch` with relative paths (`/api/...`); Vite proxies to Flask in dev.
- POST: `Content-Type: application/json` plus `JSON.stringify(body)`.
- Error handling: `try/catch` with a user-visible fallback for interactive features;
  silent `.catch(() => {})` for analytics.
- Downloads: plain `<a href="/api/download/pdf">` links, not fetch.

## Flask API endpoints (`app.py`)

- Route prefix: always `/api`.
- Decorator handlers: `@app.post('/api/thing')` with `def thing():`.
- Validation: manual checks with early `return jsonify({"error": "..."}), 400`.
- Rate limiting: `@limiter.limit()` per route where needed; JSON 429 via
  `@app.errorhandler(429)`.
- Error responses: `{"error": string}`. 400 bad input, 404 not found, 503
  unconfigured service, 500 server error.
- Logging: `logging.error("Context: %s", err)`. Log on the server, return a generic
  message to the client.
- Graceful degradation: DB and email failures are logged but do not break the
  user response.
- Database: `_db_execute()` helper for best-effort INSERT; `psycopg2` connection
  pool; no ORM.

## TypeScript

- Strict mode (`strict`, `noUnusedLocals`, `noUnusedParameters`).
- `import type` for type-only imports.
- ESM everywhere (`"type": "module"` in `package.json`).

## Python

- Type hints on function signatures.
- f-strings for formatting.
- `logging` module for errors, not `print` (except CLI scripts).
- `pathlib.Path` for filesystem paths.
- snake_case for functions, variables, file names; UPPER_SNAKE for constants
  (`MAX_TOOL_ROUNDS`, `VALID_FORMATS`).
- Imports at the top of the file.

## Naming

- Files: PascalCase React components (`ChatBot.tsx`), snake_case Python (`app.py`,
  `chat_digest.py`), camelCase TypeScript data/utils (`resume.ts`).
- Components: PascalCase (`Resume`, `ChatBot`).
- Handlers (React): `handleSubmit`, `sendMessage`, `onClose` (callback props use
  the `on` prefix). Handlers (Flask): snake_case matching the route (`def contact():`).
- Booleans: `is` prefix (`isOpen`, `isLoading`, `IS_PRODUCTION`).
- Constants: UPPER_SNAKE (`MAX_USER_MESSAGES`, `VALID_FORMATS`).

## Tests and deploy

- Frontend: `npm test` (vitest). Server: `npm run test:server` (pytest). Run both
  before committing.
- Push to `main` runs CI (GitHub Actions); Heroku auto-deploys when CI passes.
