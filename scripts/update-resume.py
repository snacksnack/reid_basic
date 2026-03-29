#!/usr/bin/env python3
"""Read public/docs/reidcollins.pdf and generate src/data/resume.ts.

Replaces the manual step of editing resume.ts after updating the PDF.
Uses pdfplumber for line-aware text extraction (much better structure
than the pdfjs-based extract-pdf.mjs which squashes lines).

Usage:
    pip install pdfplumber   # one-time
    python scripts/update-resume.py
"""

import re
import sys
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    sys.exit("pdfplumber is required.  Install it with:\n  pip install pdfplumber")

ROOT = Path(__file__).resolve().parent.parent
PDF_PATH = ROOT / "public" / "docs" / "reidcollins.pdf"
TS_PATH = ROOT / "src" / "data" / "resume.ts"

SECTION_HEADERS_RE = re.compile(
    r"^(?:SUMMARY|PROFESSIONAL EXPERIENCE|TECHNICAL SKILLS(?:\s*&\s*EDUCATION)?|EDUCATION)$"
)

EXPERIENCE_SUB_HEADERS_RE = re.compile(
    r"^[A-Z][A-Za-z /&]+(?:\s*[&/]\s*[A-Za-z ]+)*$"
)

DATE_RE = re.compile(r"^\d{4}\s*[–—\-]\s*(?:\d{4}|Present)$")

LIGATURE_PAIRS = [
    ("\ufb01", "fi"),
    ("\ufb02", "fl"),
    ("\ufb00", "ff"),
    ("\ufb03", "ffi"),
    ("\ufb04", "ffl"),
]


CANARY_PATTERNS = [
    (r"[Pp]la(.)orm", "tf"),
    (r"[Ss]o(.)ware", "ft"),
    (r"migra(.)on", "ti"),
]


def detect_ligature_chars(all_text: str) -> dict[str, str]:
    """Detect which characters the font uses for ti/tf/ft ligatures
    by scanning for known canary words like 'platform', 'software', 'migration'.
    Collects all variant chars (body vs bold font may differ)."""
    mapping: dict[str, str] = {}
    for pattern, ligature in CANARY_PATTERNS:
        for m in re.finditer(pattern, all_text):
            char = m.group(1)
            if char not in ligature and char not in mapping:
                mapping[char] = ligature
    return mapping


def _apply_lig_char(text: str, char: str, replacement: str) -> str:
    """Replace a ligature character, requiring at least one lowercase neighbor
    so that ALL-CAPS section headers (PROFESSIONAL, TECHNICAL, etc.) are left intact."""
    esc = re.escape(char)
    if char == "@":
        text = re.sub(rf"(?<=[a-z]){esc}(?=[a-z])(?![a-z]*\.[a-z]{{2,}})", replacement, text)
    else:
        text = re.sub(rf"(?<=[a-z]){esc}(?=[a-zA-Z-])", replacement, text)
        text = re.sub(rf"(?<=[a-zA-Z-]){esc}(?=[a-z])", replacement, text)
        if replacement == "ti":
            text = re.sub(rf"(?<=-){esc}(?=[a-z]{{2}})", replacement, text)
    return text


def fix_ligatures(text: str, lig_map: dict[str, str] | None = None) -> str:
    for old, new in LIGATURE_PAIRS:
        text = text.replace(old, new)
    text = re.sub(r"(\w)[VQ]\s?l(\w)", r"\1fl\2", text)
    text = re.sub(r"(\w)[VQ]\s?i(\w)", r"\1fi\2", text)

    if lig_map:
        for char, replacement in lig_map.items():
            text = _apply_lig_char(text, char, replacement)

    text = re.sub(r"(\w)- (\w)", r"\1-\2", text)

    return text


def extract_lines(pdf_path: Path) -> list[str]:
    raw_pages: list[str] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                raw_pages.append(text)

    all_raw = "\n".join(raw_pages)
    lig_map = detect_ligature_chars(all_raw)
    if lig_map:
        print(f"  Detected ligature mapping: {lig_map}")

    lines: list[str] = []
    for page_text in raw_pages:
        for raw in page_text.split("\n"):
            cleaned = fix_ligatures(raw.strip(), lig_map)
            if cleaned:
                lines.append(cleaned)
    return lines


def classify_section(line: str) -> str | None:
    """Return a normalized section name if line is a section header."""
    if SECTION_HEADERS_RE.match(line):
        if "TECHNICAL SKILLS" in line:
            return "TECHNICAL SKILLS"
        return line
    return None


def split_sections(lines: list[str]) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {"HEADER": []}
    current = "HEADER"
    for line in lines:
        section = classify_section(line)
        if section:
            current = section
            sections[current] = []
        else:
            sections.setdefault(current, []).append(line)
    return sections


def parse_header(lines: list[str]) -> dict[str, str]:
    name = lines[0] if lines else ""
    location, email, linkedin = "", "", ""

    for line in lines[1:]:
        parts = []
        for sep in ["|", "\u2022"]:
            if sep in line:
                parts = [p.strip() for p in line.split(sep)]
                break

        if parts:
            for p in parts:
                if "@" in p:
                    email = p
                elif "linkedin" in p.lower():
                    linkedin = p if p.startswith("http") else f"https://{p}"
                elif re.search(r"NY|New York|CA|TX|Brooklyn|San Francisco", p, re.I):
                    location = p
        elif "@" in line:
            email = line.strip()
        elif "linkedin" in line.lower():
            linkedin = line.strip()
            if not linkedin.startswith("http"):
                linkedin = f"https://{linkedin}"
        elif re.search(r"NY|New York|CA|TX|Brooklyn", line, re.I) and not location:
            location = line.strip()

    return {"name": name, "location": location, "email": email, "linkedin": linkedin}


def parse_summary(lines: list[str]) -> str:
    return " ".join(lines).strip()


def is_experience_sub_header(line: str) -> bool:
    """Detect sub-headers like 'Platform & Backend Systems' within experience."""
    if line.startswith("\u2022") or DATE_RE.match(line):
        return False
    if EXPERIENCE_SUB_HEADERS_RE.match(line) and len(line.split()) <= 8:
        return True
    return False


def parse_experience(lines: list[str]) -> list[dict]:
    date_indices = [i for i, l in enumerate(lines) if DATE_RE.match(l.strip())]
    jobs: list[dict] = []

    for j, di in enumerate(date_indices):
        period = re.sub(r"\s*[–\-]\s*", " \u2014 ", lines[di].strip())

        role = lines[di - 1].strip() if di >= 1 else ""
        company = lines[di - 2].strip() if di >= 2 else ""
        if company.startswith("\u2022"):
            company = ""

        bstart = di + 1
        bend = (date_indices[j + 1] - 2) if j + 1 < len(date_indices) else len(lines)

        groups: list[dict] = []
        current_heading: str | None = None
        current_bullets: list[str] = []

        for line in lines[bstart:bend]:
            if is_experience_sub_header(line):
                if current_bullets:
                    groups.append({"heading": current_heading, "items": current_bullets})
                current_heading = line
                current_bullets = []
            elif line.startswith("\u2022"):
                current_bullets.append(line.lstrip("\u2022 \t"))
            elif current_bullets:
                current_bullets[-1] += " " + line

        if current_bullets:
            groups.append({"heading": current_heading, "items": current_bullets})

        has_sub_headers = any(g["heading"] is not None for g in groups)

        if has_sub_headers:
            jobs.append({
                "company": company, "role": role, "period": period,
                "achievementGroups": [g for g in groups if g["heading"] is not None],
            })
        else:
            flat = [b for g in groups for b in g["items"]]
            jobs.append({
                "company": company, "role": role, "period": period,
                "achievements": flat,
            })

    return jobs


def parse_skills(lines: list[str]) -> tuple[list[dict], list[dict]]:
    """Parse combined TECHNICAL SKILLS (& EDUCATION) section.

    Returns (skill_categories, education_entries).
    """
    categories: list[dict] = []
    education: list[dict] = []

    for line in lines:
        if ":" not in line:
            continue
        label, rest = line.split(":", 1)
        label = label.strip()
        rest = rest.strip()

        if label.lower() == "education":
            m = re.match(r"(.+?)\s*[—–\-]\s*(.+)", rest)
            if m:
                education.append({"degree": m.group(1).strip(), "school": m.group(2).strip()})
            else:
                education.append({"degree": rest, "school": ""})
        else:
            items = [i.strip() for i in rest.split(",") if i.strip()]
            if items:
                categories.append({"category": label, "items": items})

    return categories, education


def parse_education(lines: list[str]) -> list[dict]:
    text = " ".join(lines).strip()
    if not text:
        return []
    m = re.match(r"(.+?)\s*[—–\-]\s*(.+)", text)
    if m:
        return [{"degree": m.group(1).strip(), "school": m.group(2).strip()}]
    return [{"degree": text, "school": ""}]


def ts_str(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def generate_ts(header, summary, skills, experience, education) -> str:
    out: list[str] = []

    def w(line: str = ""):
        out.append(line)

    title = experience[0]["role"] if experience else ""

    w("import type { ResumeData } from '../components/Resume'")
    w("")
    w("const resume: ResumeData = {")
    w(f"  name: '{ts_str(header['name'])}',")
    w(f"  title: '{ts_str(title)}',")
    w("  contact: {")
    w(f"    location: '{ts_str(header['location'])}',")
    w(f"    email: '{ts_str(header['email'])}',")
    if header["linkedin"]:
        w(f"    linkedin: '{ts_str(header['linkedin'])}',")
    w("  },")

    w("  summary:")
    w(f"    '{ts_str(summary)}',")

    if skills:
        w("  skillCategories: [")
        for cat in skills:
            items = ", ".join(f"'{ts_str(i)}'" for i in cat["items"])
            w(f"    {{ category: '{ts_str(cat['category'])}', items: [{items}] }},")
        w("  ],")

    if experience:
        w("  experience: [")
        for job in experience:
            w("    {")
            w(f"      company: '{ts_str(job['company'])}',")
            w(f"      role: '{ts_str(job['role'])}',")
            w(f"      period: '{ts_str(job['period'])}',")
            if "achievementGroups" in job:
                w("      achievementGroups: [")
                for group in job["achievementGroups"]:
                    w("        {")
                    w(f"          heading: '{ts_str(group['heading'])}',")
                    w("          items: [")
                    for a in group["items"]:
                        w(f"            '{ts_str(a)}',")
                    w("          ],")
                    w("        },")
                w("      ],")
            elif job.get("achievements"):
                w("      achievements: [")
                for a in job["achievements"]:
                    w(f"        '{ts_str(a)}',")
                w("      ],")
            w("    },")
        w("  ],")

    if education:
        w("  education: [")
        for ed in education:
            w("    {")
            w(f"      school: '{ts_str(ed['school'])}',")
            w(f"      degree: '{ts_str(ed['degree'])}',")
            w("      period: '',")
            w("    },")
        w("  ],")

    w("}")
    w("")
    w("export default resume")
    w("")

    return "\n".join(out)


def main():
    if not PDF_PATH.exists():
        sys.exit(f"PDF not found: {PDF_PATH}")

    print(f"Reading {PDF_PATH} ...")
    lines = extract_lines(PDF_PATH)
    sections = split_sections(lines)

    header = parse_header(sections.get("HEADER", []))
    summary = parse_summary(sections.get("SUMMARY", []))
    experience = parse_experience(sections.get("PROFESSIONAL EXPERIENCE", []))

    skills_lines = sections.get("TECHNICAL SKILLS", [])
    edu_lines = sections.get("EDUCATION", [])

    if skills_lines:
        skills, skills_edu = parse_skills(skills_lines)
    else:
        skills, skills_edu = [], []

    if edu_lines:
        education = parse_education(edu_lines)
    elif skills_edu:
        education = skills_edu
    else:
        education = []

    ts = generate_ts(header, summary, skills, experience, education)
    TS_PATH.write_text(ts, encoding="utf-8")

    print(f"Wrote {TS_PATH}")
    print(f"  {len(experience)} jobs, {len(skills)} skill categories, {len(education)} education entries")
    print()
    print("Review the output and verify:")
    print("  - Company/role/period are correct for each job")
    print("  - Bullet points aren't truncated or merged")
    print("  - Ligatures (fl, fi) rendered correctly")
    print("  - 'title' field looks right (defaulted to first job's role)")


if __name__ == "__main__":
    main()
