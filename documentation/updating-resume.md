# Updating Your Resume

## When do I need to follow these steps?

**YES — follow these steps when you changed the resume content** (edited the Word doc, exported new PDF/DOCX, and copied them into `public/docs/`).

**NO — skip these steps when only the site code changed** (styles, layout, buttons, components). Code changes take effect automatically with `npm run dev`.

---

## Prerequisites (one-time setup)

- **Node.js** and **npm** installed ([nodejs.org](https://nodejs.org))
- **Python 3** installed (comes with macOS or via `brew install python`)
- **pdfplumber** Python package in a virtual environment:
  ```bash
  python3 -m venv .venv
  source .venv/bin/activate
  pip install pdfplumber
  ```
- **npm dependencies** installed:
  ```bash
  npm install
  ```

---

## Steps (after updating resume content)

### 1. Edit your resume in Word

Make your changes in the `.docx` file as usual.

### 2. Export to PDF

In Word: **File → Save As** (or **Export**) → choose **PDF** → save as `reidcollins.pdf`.

### 3. Copy both files into the repo

```
public/docs/reidcollins.pdf
public/docs/reidcollins.docx
```

These are what the "Download PDF" and "Download DOCX" buttons serve.

### 4. Generate `resume.ts` from the PDF

```bash
npm run update:resume
```

This reads the PDF, parses sections (header, summary, experience, skills, education), fixes ligature issues, and writes `src/data/resume.ts`.

### 5. Review the output

Open `src/data/resume.ts` and verify:
- Company, role, and period are correct for each job
- Bullet points aren't truncated or merged together
- Ligatures rendered correctly (e.g. "workflows" not "workVlows")
- The `title` field looks right (defaults to your most recent role)
- Achievement sub-headers (if any) are correctly grouped

Fix anything that looks off by hand.

### 6. (Optional) Regenerate the text extract

```bash
npm run extract:pdf
```

Updates `public/docs/reidcollins.txt` with a plain-text version of the PDF. Not required for the site, but keeps the text file in sync.

### 7. Preview locally

```bash
npm run dev
```

Opens a local dev server (usually http://localhost:5173). Check that the site matches your updated resume.

### 8. Commit

```bash
git add public/docs/ src/data/resume.ts
git commit -m "Update resume"
```

---

## Quick Reference: npm Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start local dev server |
| `npm run build` | TypeScript check + production build (output in `dist/`) |
| `npm run preview` | Serve the production build locally |
| `npm run update:resume` | Generate `resume.ts` from PDF (Python) |
| `npm run extract:pdf` | Extract plain text from PDF (Node) |
| `npm run lint` | Run ESLint |

## Project Structure (key files)

```
public/docs/reidcollins.pdf    ← your resume PDF (Download PDF button)
public/docs/reidcollins.docx   ← your resume DOCX (Download DOCX button)
public/docs/reidcollins.txt    ← plain-text extract of the PDF
src/data/resume.ts             ← structured resume data (drives the web page)
src/components/Resume.tsx      ← the React component that renders the resume
src/resume.css                 ← styling
scripts/update-resume.py       ← PDF → resume.ts generator
scripts/extract-pdf.mjs        ← PDF → plain text extractor
index.html                     ← page shell (contains <title>)
```
