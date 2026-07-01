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
PROMPT_PATH = ROOT / "src" / "data" / "resume-prompt.txt"

SECTION_HEADERS_RE = re.compile(
    r"^(?:SUMMARY|PROFESSIONAL EXPERIENCE|TECHNICAL SKILLS(?:\s*&\s*EDUCATION)?|EDUCATION)$"
)

EXPERIENCE_SUB_HEADERS_RE = re.compile(
    r"^[A-Z][A-Za-z /&]+(?:\s*[&/]\s*[A-Za-z ]+)*$"
)

DATE_RE = re.compile(r"^\d{4}\s*[–—\-]\s*(?:\d{4}|Present)$")

INLINE_DATE_RE = re.compile(
    r"^(.+?)\s+(\d{4}\s*[–—\-]\s*(?:\d{4}|Present))$"
)

BULLET_PREFIXES = ("\u2022", "\u00b7", "-", "*")


def is_bullet_line(line: str) -> bool:
    stripped = line.lstrip()
    return any(stripped.startswith(prefix) for prefix in BULLET_PREFIXES)


def strip_bullet(line: str) -> str:
    stripped = line.lstrip()
    for prefix in BULLET_PREFIXES:
        if stripped.startswith(prefix):
            return stripped[len(prefix):].lstrip(" \t")
    return stripped

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


def _normalize_url(value: str) -> str:
    return value if value.startswith("http") else f"https://{value}"


def parse_header(lines: list[str]) -> dict[str, str]:
    name = lines[0] if lines else ""
    location, email, linkedin, website, github = "", "", "", "", ""

    for line in lines[1:]:
        if line.lower().startswith("open to"):
            continue

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
                    linkedin = _normalize_url(p)
                elif "github" in p.lower():
                    github = _normalize_url(p)
                elif re.search(r"\.(com|dev|io|me|net|org)", p, re.I):
                    website = _normalize_url(p)
                elif re.search(r"NY|New York|CA|TX|Brooklyn|San Francisco", p, re.I):
                    location = p
        elif "@" in line:
            email = line.strip()
        elif "linkedin" in line.lower():
            linkedin = _normalize_url(line.strip())
        elif "github" in line.lower():
            github = _normalize_url(line.strip())
        elif re.search(r"\.(com|dev|io|me|net|org)", line, re.I):
            website = _normalize_url(line.strip())
        elif re.search(r"NY|New York|CA|TX|Brooklyn", line, re.I) and not location:
            location = line.strip()

    return {
        "name": name,
        "location": location,
        "email": email,
        "linkedin": linkedin,
        "website": website,
        "github": github,
    }


def parse_summary(lines: list[str]) -> str:
    return " ".join(lines).strip()


def normalize_period(period: str) -> str:
    return re.sub(r"\s*[–\-]\s*", " \u2014 ", period.strip())


def is_experience_sub_header(line: str) -> bool:
    """Detect sub-headers like 'Platform & Backend Systems' within experience."""
    if is_bullet_line(line) or DATE_RE.match(line) or INLINE_DATE_RE.match(line):
        return False
    if EXPERIENCE_SUB_HEADERS_RE.match(line) and len(line.split()) <= 8:
        return True
    return False


def find_job_starts(lines: list[str]) -> list[dict]:
    """Locate job headers in either inline-date or separate-date layout."""
    jobs: list[dict] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        inline = INLINE_DATE_RE.match(line)
        if inline:
            jobs.append({
                "company": inline.group(1).strip(),
                "role": lines[i + 1].strip() if i + 1 < len(lines) else "",
                "period": normalize_period(inline.group(2)),
                "header_index": i,
                "content_start": i + 2,
            })
            i += 2
            continue

        if i + 2 < len(lines) and DATE_RE.match(lines[i + 2].strip()):
            company = line
            if is_bullet_line(company):
                i += 1
                continue
            jobs.append({
                "company": company,
                "role": lines[i + 1].strip(),
                "period": normalize_period(lines[i + 2].strip()),
                "header_index": i,
                "content_start": i + 3,
            })
            i += 3
            continue

        i += 1
    return jobs


def parse_experience(lines: list[str]) -> list[dict]:
    job_starts = find_job_starts(lines)
    jobs: list[dict] = []

    for j, job in enumerate(job_starts):
        bend = job_starts[j + 1]["header_index"] if j + 1 < len(job_starts) else len(lines)

        groups: list[dict] = []
        current_heading: str | None = None
        current_bullets: list[str] = []

        for line in lines[job["content_start"]:bend]:
            if is_experience_sub_header(line):
                if current_bullets:
                    groups.append({"heading": current_heading, "items": current_bullets})
                current_heading = line
                current_bullets = []
            elif is_bullet_line(line):
                bullet = strip_bullet(line)
                if bullet:
                    current_bullets.append(bullet)
            elif current_bullets:
                joined = current_bullets[-1] + " " + line
                current_bullets[-1] = re.sub(r"(\w)- (\w)", r"\1-\2", joined)

        if current_bullets:
            groups.append({"heading": current_heading, "items": current_bullets})

        has_sub_headers = any(g["heading"] is not None for g in groups)

        if has_sub_headers:
            jobs.append({
                "company": job["company"], "role": job["role"], "period": job["period"],
                "achievementGroups": [g for g in groups if g["heading"] is not None],
            })
        else:
            flat = [b for g in groups for b in g["items"]]
            jobs.append({
                "company": job["company"], "role": job["role"], "period": job["period"],
                "achievements": flat,
            })

    return jobs


def split_skill_items(rest: str) -> list[str]:
    """Split comma-separated skill items, respecting parentheses."""
    items: list[str] = []
    current: list[str] = []
    depth = 0
    for char in rest:
        if char == "(":
            depth += 1
            current.append(char)
        elif char == ")":
            depth -= 1
            current.append(char)
        elif char == "," and depth == 0:
            item = "".join(current).strip()
            if item:
                items.append(item)
            current = []
        else:
            current.append(char)
    item = "".join(current).strip()
    if item:
        items.append(item)
    return items


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
            items = split_skill_items(rest)
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
    if header.get("website"):
        w(f"    website: '{ts_str(header['website'])}',")
    if header["linkedin"]:
        w(f"    linkedin: '{ts_str(header['linkedin'])}',")
    if header.get("github"):
        w(f"    github: '{ts_str(header['github'])}',")
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


def generate_prompt_txt(header, summary, skills, experience, education) -> str:
    """Generate a plain-text resume for the chatbot system prompt."""
    out: list[str] = []

    def w(line: str = ""):
        out.append(line)

    title = experience[0]["role"] if experience else ""
    contact_parts = []
    if header["location"]:
        contact_parts.append(header["location"])
    if header["email"]:
        contact_parts.append(header["email"])
    if header.get("website"):
        contact_parts.append(header["website"].replace("https://", ""))
    if header["linkedin"]:
        li = header["linkedin"].replace("https://", "")
        contact_parts.append(li)
    if header.get("github"):
        contact_parts.append(header["github"].replace("https://", ""))

    w(header["name"].upper())
    w(title)
    w(" | ".join(contact_parts))
    w("")
    w("SUMMARY")
    w(summary)
    w("")
    w("PROFESSIONAL EXPERIENCE")

    for job in experience:
        period = job["period"].replace(" — ", "–")
        w("")
        w(f"{job['company']} — {job['role']} — {period}")

        if "achievementGroups" in job:
            for group in job["achievementGroups"]:
                w("")
                w(f"{group['heading']}:")
                for item in group["items"]:
                    w(f"• {item}")
        elif job.get("achievements"):
            for item in job["achievements"]:
                w(f"• {item}")

    w("")
    w("TECHNICAL SKILLS")
    certs: list[str] = []
    for cat in skills:
        if cat["category"].lower() == "certifications":
            certs = cat["items"]
            continue
        w(f"{cat['category']}: {', '.join(cat['items'])}")

    if education:
        w("")
        w("EDUCATION")
        for ed in education:
            if ed["school"]:
                w(f"{ed['degree']} — {ed['school']}")
            else:
                w(ed["degree"])

    if certs:
        w("")
        w("CERTIFICATIONS")
        for c in certs:
            w(c)

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

    prompt = generate_prompt_txt(header, summary, skills, experience, education)
    PROMPT_PATH.write_text(prompt, encoding="utf-8")
    print(f"Wrote {PROMPT_PATH}")

    print(f"  {len(experience)} jobs, {len(skills)} skill categories, {len(education)} education entries")
    print()
    print("Review the output and verify:")
    print("  - Company/role/period are correct for each job")
    print("  - Bullet points aren't truncated or merged")
    print("  - Ligatures (fl, fi) rendered correctly")
    print("  - 'title' field looks right (defaulted to first job's role)")


if __name__ == "__main__":
    main()
