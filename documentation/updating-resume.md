# Updating Your Resume

## When do I need to follow these steps?

**YES, when you changed resume content** (edited the Word doc and exported a new
PDF/DOCX into `public/docs/`). The same text has to propagate to the website, the
chatbot, and the download files.

**NO, when only the site code changed** (styles, layout, components). Those take
effect automatically with `npm run dev`.

---

## The fast path: let the agent do it

The full update procedure (edit the DOCX, regenerate the PDF, carry the text into
the website data, the chatbot corpus, and the plain-text/LLM files, then verify) is
codified as the **`update-resume` skill** in `.claude/skills/update-resume/`. A
Claude Code session working in this repo loads it automatically.

What you do by hand:

- Edit the resume in Word (or ask the agent to make a surgical text change).
- If you exported yourself: save a new `reidcollins.pdf` and `reidcollins.docx` into
  `public/docs/`.
- Tell the agent "I updated my resume" and review what it reports.
- Ask it to commit and open a PR when you are satisfied. You merge.

The canonical source of truth is `public/docs/reidcollins.docx`. `reidcollins.pages`
is a stale original and is not used.

---

## What the update touches

Changing resume content means the same text lands in all of these, or the site, the
download buttons, and the chatbot will disagree:

1. `public/docs/reidcollins.docx` and `reidcollins.pdf` (the downloads).
2. `src/data/resume.ts` (website data).
3. `src/data/resume-prompt.txt` (chatbot RAG context).
4. `public/docs/reidcollins.txt` (plain-text extract; regenerate with
   `npm run extract:pdf`).
5. `public/llms.txt` (LLM crawl file).
6. The employer string in `tests/test_server.py`, if the employer line changed.

The `update-resume` skill has the full checklist and the gotchas (for example, the
`npm run update:resume` generator is lossy, so it is used only to preview a diff, not
to author the change).

---

## One-time setup

- **Node.js** and **npm** ([nodejs.org](https://nodejs.org)).
- **Python 3** (macOS ships it, or `brew install python`).
- **Python venv** with the project deps:
  ```bash
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  ```
- **npm deps**: `npm install`.

---

## Preview locally

```bash
npm run dev        # frontend (usually http://localhost:5173)
npm run dev:server # backend
```

---

## Quick reference: scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Vite dev server (frontend) |
| `npm run dev:server` | Start Flask dev server (backend) |
| `npm run build` | TypeScript check + production build (output in `dist/`) |
| `npm run preview` | Serve the production build locally |
| `npm run update:resume` | Generate `resume.ts` + `resume-prompt.txt` from the PDF (lossy; preview only) |
| `npm run extract:pdf` | Extract plain text from the PDF into `reidcollins.txt` |
| `npm test` | Frontend tests (vitest) |
| `npm run test:server` | Server tests (pytest) |
| `npm run lint` | ESLint |

## Project structure (key files)

```
public/docs/reidcollins.pdf       <- resume PDF (Download PDF button)
public/docs/reidcollins.docx      <- resume DOCX (canonical source; Download DOCX button)
public/docs/reidcollins.txt       <- plain-text extract of the PDF
public/llms.txt                   <- LLM crawl file
src/data/resume.ts                <- structured resume data (drives the web page)
src/data/resume-prompt.txt        <- plain-text resume (drives the chatbot)
src/components/Resume.tsx         <- the React component that renders the resume
app.py                            <- Flask server (loads resume-prompt.txt for the chatbot)
scripts/update-resume.py          <- PDF to resume.ts/resume-prompt.txt generator (lossy)
scripts/extract_pdf.py            <- PDF to plain-text extractor
index.html                        <- page shell (contains <title>)
.claude/skills/update-resume/     <- the agent procedure for all of the above
```

## How the chatbot system prompt works

`app.py` builds the chatbot system prompt at startup from two parts:

1. **Behavioral instructions**: `src/data/chatbot-instructions.txt` (tone, response
   length, the `/match` feature). Change these only to change how the chatbot acts;
   see the `chatbot-personality` skill.
2. **Resume content**: `src/data/resume-prompt.txt`, kept in sync with the resume.

So updating resume content never requires editing `app.py`.
