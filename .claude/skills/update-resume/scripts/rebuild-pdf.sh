#!/usr/bin/env bash
# Regenerate public/docs/reidcollins.pdf from the canonical DOCX using LibreOffice
# (the same producer as the served PDF), then verify the result before promoting it.
#
#   rebuild-pdf.sh           convert to a temp dir, print page count / size / text diff
#   rebuild-pdf.sh --apply   also overwrite public/docs/reidcollins.pdf (after you've looked)
#
# Run from the repo root. Requires LibreOffice and the repo .venv (pdfplumber).
set -euo pipefail

SOFFICE="/Applications/LibreOffice.app/Contents/MacOS/soffice"
DOCX="public/docs/reidcollins.docx"
SERVED="public/docs/reidcollins.pdf"
PY=".venv/bin/python"

[ -x "$SOFFICE" ] || { echo "LibreOffice not found at $SOFFICE"; exit 1; }
[ -f "$DOCX" ]    || { echo "Canonical DOCX not found: $DOCX (run from repo root)"; exit 1; }
[ -x "$PY" ]      || { echo ".venv python not found ($PY); run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

"$SOFFICE" --headless --convert-to pdf --outdir "$TMP" "$DOCX" >/dev/null
NEW="$TMP/reidcollins.pdf"

echo "== size =="
printf "served: %s bytes\n" "$( [ -f "$SERVED" ] && wc -c < "$SERVED" || echo 'none')"
printf "new:    %s bytes\n" "$(wc -c < "$NEW")"

echo "== page count (expect 2) =="
"$PY" - "$SERVED" "$NEW" <<'PYEOF'
import sys, pdfplumber
for label, path in (("served", sys.argv[1]), ("new", sys.argv[2])):
    try:
        with pdfplumber.open(path) as pdf:
            print(f"{label}: {len(pdf.pages)} pages")
    except Exception as e:
        print(f"{label}: (unreadable: {e})")
PYEOF

echo "== text diff (served -> new; should be only your edited runs) =="
"$PY" - "$SERVED" "$NEW" <<'PYEOF' > "$TMP/a.txt" 2>/dev/null || true
import sys, pdfplumber
with pdfplumber.open(sys.argv[1]) as pdf:
    print("\n".join((p.extract_text() or "") for p in pdf.pages))
PYEOF
"$PY" - "$NEW" <<'PYEOF' > "$TMP/b.txt" 2>/dev/null || true
import sys, pdfplumber
with pdfplumber.open(sys.argv[1]) as pdf:
    print("\n".join((p.extract_text() or "") for p in pdf.pages))
PYEOF
diff "$TMP/a.txt" "$TMP/b.txt" || true

if [ "${1:-}" = "--apply" ]; then
    cp "$NEW" "$SERVED"
    chmod 644 "$SERVED"
    echo "== applied: overwrote $SERVED (mode 644) =="
    echo "Next: npm run extract:pdf, then propagate text to the other targets."
else
    echo "== dry run: $SERVED unchanged. Re-run with --apply once the diff looks right. =="
fi
