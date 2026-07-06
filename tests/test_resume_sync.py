"""Guardrail: resume-prompt.txt must contain everything in reidcollins.docx.

The RAG index (ChromaDB) is built from src/data/resume-prompt.txt, while
public/docs/reidcollins.docx is the canonical resume. If the docx is updated
without propagating the change to resume-prompt.txt, the chatbot answers from
a stale resume. This test catches that drift.

The docx is read with the stdlib only (zipfile + ElementTree) so no extra
dependency is needed.

Matching is word-based rather than line-based because the two files format
the same content differently (bullet characters, "Company — Title — Dates" on
one line vs. three docx paragraphs, etc.). A docx line passes if all of its
words appear in a window of up to WINDOW consecutive prompt lines, or — for
short structural lines like section headers — anywhere in the prompt.
"""

import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

BASE_DIR = Path(__file__).resolve().parent.parent
DOCX_PATH = BASE_DIR / "public" / "docs" / "reidcollins.docx"
PROMPT_PATH = BASE_DIR / "src" / "data" / "resume-prompt.txt"

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# How many consecutive prompt lines a single docx line may span.
# (e.g. docx "Certifications: X, Y" ↔ prompt "CERTIFICATIONS" + "X" + "Y")
WINDOW = 3

# Normalized docx lines shorter than this are treated as structural
# (section headers) and only need their words to appear somewhere in the
# prompt, not in consecutive lines.
STRUCTURAL_MAX_LEN = 40

# Lines shorter than this are ignored entirely (page numbers, stray chars).
MIN_LEN = 20


def docx_lines(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    lines = []
    for p in root.iter(W_NS + "p"):
        parts = []
        for el in p.iter():
            if el.tag == W_NS + "t":
                parts.append(el.text or "")
            elif el.tag in (W_NS + "tab", W_NS + "br"):
                parts.append(" ")
        text = "".join(parts).strip()
        if text:
            lines.append(text)
    return lines


def words(line: str) -> frozenset[str]:
    return frozenset(re.findall(r"[a-z0-9]+", line.lower()))


def norm(line: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", line.lower())).strip()


def test_docx_content_is_in_resume_prompt():
    assert DOCX_PATH.exists(), f"missing {DOCX_PATH}"
    prompt_lines = [l for l in PROMPT_PATH.read_text().splitlines() if l.strip()]
    prompt_line_words = [words(l) for l in prompt_lines]
    prompt_all_words = frozenset().union(*prompt_line_words)

    missing = []
    for line in docx_lines(DOCX_PATH):
        normalized = norm(line)
        if len(normalized) <= MIN_LEN:
            continue
        line_words = words(line)

        # Words contained in a window of up to WINDOW consecutive prompt lines?
        found = any(
            line_words <= frozenset().union(*prompt_line_words[i : i + n])
            for n in range(1, WINDOW + 1)
            for i in range(len(prompt_line_words) - n + 1)
        )
        # Short structural lines (section headers) may be split across
        # non-adjacent prompt lines.
        if not found and len(normalized) <= STRUCTURAL_MAX_LEN:
            found = line_words <= prompt_all_words

        if not found:
            missing.append(line)

    assert not missing, (
        "reidcollins.docx contains content missing from resume-prompt.txt "
        "(the RAG index will be stale). Propagate these lines:\n  - "
        + "\n  - ".join(missing)
    )
