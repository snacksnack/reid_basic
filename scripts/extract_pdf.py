#!/usr/bin/env python3
"""Extract plain text from the resume PDF.

Replaces the Node-based extract-pdf.mjs script.
Uses pdfplumber for consistent text extraction across all Python scripts.

Usage:
    python scripts/extract_pdf.py
"""

import sys
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    sys.exit("pdfplumber is required.  Install it with:\n  pip install pdfplumber")

ROOT = Path(__file__).resolve().parent.parent
INPUT_PATH = ROOT / "public" / "docs" / "reidcollins.pdf"
OUTPUT_PATH = ROOT / "public" / "docs" / "reidcollins.txt"


def main():
    if not INPUT_PATH.exists():
        sys.exit(f"PDF not found: {INPUT_PATH}")

    pages: list[str] = []
    with pdfplumber.open(str(INPUT_PATH)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)

    final_text = "\n\n--- PAGE BREAK ---\n\n".join(pages)
    OUTPUT_PATH.write_text(final_text, encoding="utf-8")
    print(f"Extracted text -> {OUTPUT_PATH}")
    print(f"Pages: {len(pages)}")


if __name__ == "__main__":
    main()
