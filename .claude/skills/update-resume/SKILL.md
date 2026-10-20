---
name: update-resume
description: >-
  Update Reid's resume in the reid_basic repo and propagate the change everywhere
  it must land. Use when the user says "I updated my resume", "update the resume",
  "change the resume title/employer/skills line", "I dropped a new PDF/DOCX", or asks
  to edit resume content. Covers both modes: the user hand-exports a new DOCX, OR
  Claude edits the DOCX text directly and regenerates the PDF with LibreOffice. Does
  NOT cover site styling/layout changes (those need no propagation) or the project
  catalog corpus (see extract:projects).
---

# Update resume (reid_basic)

The canonical resume is `public/docs/reidcollins.docx`. Every resume change must
propagate from it to **five** other places, or the website, the download buttons,
the chatbot RAG index, and the LLM crawl file will disagree with each other.

`public/docs/reidcollins.pages` is a stale July original. Never edit it, never treat
it as a source or a revert risk.

## Two entry modes

**Mode A, the user placed a new PDF + DOCX** in `public/docs/` themselves.
Start at "Propagate the text" below. The served PDF is already the one to ship.

**Mode B, Claude makes the edit** (surgical text change: title, employer, a skills row).
1. Edit the text run inside the DOCX, not a regenerated file. Unzip
   `public/docs/reidcollins.docx`, edit the run in `word/document.xml` with Python
   `zipfile`, and **check the run is not split** across multiple `<w:t>` elements
   (Word often splits a run mid-phrase). Re-zip in place.
2. Regenerate the PDF with LibreOffice (the served PDF's producer):
   ```
   scripts/rebuild-pdf.sh            # convert to a temp dir and show the diff
   scripts/rebuild-pdf.sh --apply    # overwrite public/docs/reidcollins.pdf once verified
   ```
   Expect: still **2 pages**, byte size within a few hundred bytes of the served PDF,
   and the text diff limited to exactly the runs you changed. A faithful LibreOffice
   re-export was confirmed on 2026-10-19 (74677 vs 74426 bytes).
3. Then propagate the text as in Mode A.

Do **not** rely on `npm run update:resume` to author the change. It is lossy: it
truncates the wrapped Program Management skills line, drops the "Open to ..." header,
drops the certifications block, and loses the hand-curated Developer Tools split.
Run it only to *see* a diff, then discard its output and apply the real edit by hand.

## Propagate the text: the five targets

After the canonical DOCX (and its PDF) are correct, the same text must be carried into:

1. `src/data/resume.ts`, structured data that drives the website. Hand-edit the
   affected field(s).
2. `src/data/resume-prompt.txt`, plain text the chatbot loads as RAG context.
   Mirrors `resume.ts`. This is the pair the CI guardrail checks (see below).
3. `tests/test_server.py`, **only the employer string** is coupled, in
   `TestChunkResume` (the literal `"Zeta Global (acquired Marigold, November 2025)"`).
   Title and skills changes need no test edit. If the employer line changes, update
   every occurrence in that class.
4. `public/docs/reidcollins.txt`, regenerate, do not hand-edit:
   ```
   npm run extract:pdf
   ```
5. `public/llms.txt`, hand-edit the "Current:" line and any "Selected results" header.

Also check `documentation/rag-retrieval.md`, which quotes the employer header as an
example.

## Constraints that bite

- **No em-dashes.** The resume is application material: use commas, colons, or
  hyphens. Strip any before shipping. (A repo hook enforces this on writes here.)
- **US English spelling** throughout.
- **Skills rows stay on one PDF line.** Reid wants each skills row to render on a
  single line in the PDF; do not let an edit wrap one onto two.

## Verify before committing

1. Tests:
   ```
   npm test
   npm run test:server
   ```
   Note: the CI guardrail `tests/test_resume_sync.py` only checks the
   docx-vs-`resume-prompt.txt` pair. It will NOT catch a missed `resume.ts`,
   `reidcollins.txt`, `llms.txt`, or `test_server.py`. Do not trust green CI as
   proof the propagation was complete.
2. Final sweep for the old text, so nothing is left behind:
   ```
   grep -rl "<OLD STRING>" . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.venv
   ```
   On the first resume PR this step was skipped and three of the five targets were
   missed, needing a follow-up PR. Do not skip it.
3. If you regenerated the PDF/DOCX, confirm the export actually changed something.
   A re-export can be byte-identical and produce a no-op commit (plus a spurious
   644 to 755 mode flip on macOS). Compare blob hashes and reset the mode bit:
   ```
   git rev-parse HEAD:public/docs/reidcollins.pdf   # vs HEAD^:...
   chmod 644 public/docs/reidcollins.*              # then re-stage
   ```

## Commit discipline (Reid's rules)

- Branch first: `git checkout -b rc1-NNN-slug` in its own step, **then** commit.
  A commit hook blocks commits on main, and it reads the branch *before* the Bash
  command runs, so a combined `checkout -b && commit` is blocked.
- Short commit message (subject + a few lines); the "why" goes in the ADR.
- Stage the real targets:
  ```
  git add public/docs/ src/data/resume.ts src/data/resume-prompt.txt \
          public/llms.txt tests/test_server.py documentation/rag-retrieval.md
  ```
- Push the branch and open the PR (pre-authorized). Then **stop**: Reid merges.
  Do not run `gh pr merge`.
- After Reid merges, run the post-merge cleanup (sync main, delete branch, verify
  the Heroku deploy).

## Out of scope

- Site-only changes (styles, layout, components) need none of this; `npm run dev`
  picks them up.
- The project catalog corpus (`src/data/projects-prompt.txt`) is generated from TS
  via `npm run extract:projects` and is a separate path, not the resume.
