#!/usr/bin/env bash
# Regenerate public/docs/reidcollins.pdf from the canonical DOCX (RC1-580). The
# update-resume skill has documented this script since RC1-519, but it was never
# committed, so every resume edit re-derived the LibreOffice invocation, the text
# diff and the page-count check by hand (RC1-578).
#
# The served PDF's producer is LibreOffice, so the rebuild must use LibreOffice
# too: a PDF exported by anything else reflows the whole document and the diff
# stops being readable.
#
# Converts to a temp dir and reports first, because a regenerated PDF is a binary
# blob that git cannot show you. The report is the review: byte delta, page count,
# and the text diff against the PDF currently in public/docs. --apply only after
# that reads correctly.
#
# Usage:
#   scripts/rebuild-pdf.sh            # convert to a temp dir and show the diff
#   scripts/rebuild-pdf.sh --apply    # overwrite the served PDF once verified
#   scripts/rebuild-pdf.sh --apply --force   # apply despite a page-count change
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
docx="$repo/public/docs/reidcollins.docx"
served="$repo/public/docs/reidcollins.pdf"
venv_python="$repo/.venv/bin/python"

apply=0
force=0
for arg in "$@"; do
  case "$arg" in
    --apply) apply=1 ;;
    --force) force=1 ;;
    -h|--help) sed -n '/^# Usage:/,/--force/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "error: unknown argument '$arg' (expected --apply and/or --force)" >&2; exit 2 ;;
  esac
done

# LibreOffice ships no CLI on the macOS PATH, so fall back to the app bundle.
soffice="$(command -v soffice || true)"
if [ -z "$soffice" ] && [ -x /Applications/LibreOffice.app/Contents/MacOS/soffice ]; then
  soffice=/Applications/LibreOffice.app/Contents/MacOS/soffice
fi
if [ -z "$soffice" ]; then
  echo "error: LibreOffice not found. Install it (brew install --cask libreoffice)" >&2
  echo "       or put 'soffice' on PATH. The served PDF must be a LibreOffice export." >&2
  exit 1
fi

for f in "$docx" "$served"; do
  [ -f "$f" ] || { echo "error: missing $f" >&2; exit 1; }
done
[ -x "$venv_python" ] || {
  echo "error: no venv at $venv_python. Run: python3 -m venv .venv && pip install -r requirements.txt" >&2
  exit 1
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Converting $(basename "$docx") with LibreOffice..."
if ! "$soffice" --headless --convert-to pdf --outdir "$tmp" "$docx" >"$tmp/soffice.log" 2>&1; then
  echo "error: LibreOffice conversion failed" >&2
  cat "$tmp/soffice.log" >&2
  exit 1
fi
rebuilt="$tmp/reidcollins.pdf"
[ -f "$rebuilt" ] || { echo "error: no PDF produced; see below" >&2; cat "$tmp/soffice.log" >&2; exit 1; }

# pdfplumber reads page text in layout order, the same extractor scripts/extract_pdf.py
# uses, so the diff below matches what lands in reidcollins.txt.
dump_text() {
  "$venv_python" -I - "$1" <<'PY'
import sys
import pdfplumber

with pdfplumber.open(sys.argv[1]) as pdf:
    for number, page in enumerate(pdf.pages, 1):
        for line in (page.extract_text() or "").splitlines():
            print(f"p{number}: {line}")
PY
}
page_count() {
  "$venv_python" -I - "$1" <<'PY'
import sys
import pdfplumber

with pdfplumber.open(sys.argv[1]) as pdf:
    print(len(pdf.pages))
PY
}

old_bytes=$(wc -c <"$served" | tr -d ' ')
new_bytes=$(wc -c <"$rebuilt" | tr -d ' ')
old_pages=$(page_count "$served") || exit 1
new_pages=$(page_count "$rebuilt") || exit 1

echo
echo "  bytes: $old_bytes -> $new_bytes (delta $((new_bytes - old_bytes)))"
echo "  pages: $old_pages -> $new_pages"
echo

dump_text "$served" >"$tmp/old.txt" || exit 1
dump_text "$rebuilt" >"$tmp/new.txt" || exit 1

echo "Text diff vs the PDF currently in public/docs:"
if diff -u --label "served" --label "rebuilt" "$tmp/old.txt" "$tmp/new.txt" >"$tmp/diff.txt"; then
  echo "  (no text change: the rebuild is a no-op, so applying it would be an empty commit)"
else
  sed 's/^/  /' "$tmp/diff.txt"
fi
echo

status=0
if [ "$old_pages" -ne "$new_pages" ]; then
  echo "WARNING: page count changed ($old_pages -> $new_pages). A skills row that wrapped," >&2
  echo "         or content pushed onto a new page, is exactly what this check is for." >&2
  status=1
fi

if [ "$apply" -eq 0 ]; then
  echo "Reviewed nothing yet: this was a dry run. Re-run with --apply to overwrite the served PDF."
  exit "$status"
fi

if [ "$status" -ne 0 ] && [ "$force" -eq 0 ]; then
  echo "error: refusing to apply a page-count change. Fix the content, or pass --force if intended." >&2
  exit 1
fi

cp "$rebuilt" "$served"
# macOS hands the converted file back as 755; git would show a spurious mode flip.
chmod 644 "$served"
echo "Applied: $served ($new_bytes bytes, $new_pages pages)"
echo "Next: npm run extract:pdf, then propagate the text (see the update-resume skill)."
