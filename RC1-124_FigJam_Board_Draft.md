# RC1-124 — FigJam Board Draft: Recruiter "Evaluate Fit" Flow

**Epic:** [RC1-122](https://hirereidcollins.atlassian.net/browse/RC1-122) · **Story:** [RC1-124](https://hirereidcollins.atlassian.net/browse/RC1-124)
**Builds on:** [RC1-123](https://hirereidcollins.atlassian.net/browse/RC1-123) audit (FigJam: `RC1-123 Recruiter Journey`) · **Feeds:** RC1-125 mockups
**Board name (in FigJam):** `RC1-124 Recruiter Evaluate-Fit Flow`

> **Fastest way to "incorporate RC1-123":** in FigJam, **duplicate the `RC1-123 Recruiter Journey` board** and extend it — the six-stage journey and friction stickies are already there. This doc then tells you what to *add* to zoom from the whole-page journey into the chatbot / `/match` slice. (The Figma↔Claude integration is read-only, so the canvas itself is built by hand; this is the content to drop on it.)

> How to use: each numbered section below is a labeled **Section** on the canvas. Each bullet is one **sticky note**. Color convention is noted per section. Build the top row left-to-right and connect stages with arrows (hover sticky edge → drag the **+**).

---

## 0. Carried forward from the RC1-123 audit  *(your actual findings — the starting point)*

**Recruiter journey (6 stages, from `RC1-123 Recruiter Journey`):**
`Arrives → Skims headline → Scans experience → Downloads resume → Contacts Reid → Tries Chatbot / Match`

**The 5 improvement opportunities you logged on RC1-123:**
1. Value prop + job title aren't instant (3-sec skim fails) — *whole-page*
2. Dense experience timeline, seniority hard to extract — *whole-page*
3. Two download buttons (PDF + DOCX) — decision friction — *whole-page*
4. Contact hidden behind a modal — *whole-page*
5. **Chatbot / `/match` trust — "is this a gimmick?"** → add a one-line explainer (what it does / answers come from the real résumé) — **this is the chatbot/`match` slice RC1-124 expands**

> RC1-123 audited the **whole page**; RC1-124 zooms into the **chatbot / `/match`** corner of that journey (stage 6 + opportunity #5) and goes deep. Opportunities #1–4 stay on the board as *context the recruiter passes through* before reaching the chatbot, but are out of scope to redesign here.

---

## 1. Current chatbot / `/match` flow  *(neutral / gray stickies, left→right, connected by arrows)*

Recruiter's real path today:

1. **Arrives** on resume site (from LinkedIn / application / referral link)
2. **Skims headline** — name, title, summary
3. **Notices the chatbot** — a chat widget; purpose not obvious
4. **Asks a free-form question** ("What's his backend experience?") — gets a RAG answer
5. **Never discovers `/match`** — it's a hidden command, never advertised
6. *(Hidden path)* Types `/match [job description]` → structured fit reply (Strong Matches / Transferable Experience / Overall Assessment)
7. **Downloads resume** (PDF or DOCX) and/or **contacts Reid**

> Add a dashed/branch arrow to step 6 labeled **"hidden — only Reid knows this exists"** to make the discoverability gap visual.

---

## 2. Recruiter goals & questions  *(yellow stickies)*

- "Does this candidate actually fit **my** role?"
- "What are the **gaps** — what's he missing for this job?"
- "Is this senior enough for the level I'm hiring?"
- "Where do I get the resume — and which format?"
- "Can I trust an AI summary of a candidate, or is it just hype?"
- "I have 60 seconds — give me the fit verdict fast."

---

## 3. Friction / trust / discoverability problems  *(orange/red stickies — pull from RC1-123 audit)*

- **Discoverability:** `/match` is the most valuable feature and a recruiter would *never* find it — it's an undocumented slash command.
- **Trust / "is this a gimmick?"** *(RC1-123 opportunity #5)* — recruiters don't know answers come from the real résumé; `/match` output is also tuned confidently-positive → reads as marketing, not honest assessment. No visible gaps = less credible.
- **Blank-slate problem:** chatbot opens with no guidance on what to ask; recruiter doesn't know it can evaluate role fit.
- **Empty-state weakness:** `/match` with no job description — what guidance does the recruiter get?
- **Readability:** structured fit result needs clear visual hierarchy (strengths vs. gaps vs. verdict), not a wall of text.
- **Mobile behavior:** chat + structured result on a phone — does it stay readable, or truncate/overflow?
- **Hand-off gap:** after reading a positive fit result, is there a clear next action (download the *right* resume / contact)?

---

## 4. Design opportunities  *(green stickies — need ≥3; this is the core deliverable)*

- **Surface a role-match CTA** on the resume page: an obvious "How do I fit your role?" entry point instead of a hidden command.
- **Example prompt chips:** clickable starters ("Paste a job description", "Is he senior enough?", "What are the gaps?") that teach the feature and remove the blank-slate problem.
- **Restructured, trustworthy fit result:** explicit **Strengths / Transferable / Honest Gaps** sections — leading with credibility, not hype.
- **Honest-gaps treatment:** deliberately show 1–2 real gaps to *increase* trust (counter-intuitive but stronger for a TPM audience).
- **Clear hand-off:** result card ends with "Download the matching resume" + "Contact Reid" actions.
- **State design:** entry → empty → loading → result → error all designed, not just the happy path.

---

## 5. Candidate states to mock up  *(blue stickies — these become RC1-125 frames)*

- **Entry** — resume page with the role-match CTA visible
- **Empty** — input affordance + example prompt chips, no JD yet
- **Loading** — request in flight (retrieval can take a moment)
- **Result** — structured fit card (Strengths / Transferable / Gaps / Verdict + hand-off actions)
- **Error** — retrieval/backend failure, graceful message + retry

---

## 6. Implementation risks / dependencies  *(purple stickies — what to know before building)*

- **Exposing a hidden feature:** surfacing `/match` changes its intent (was private). Product + tone decision, not just UI.
- **Backend retrieval:** `/match` uses different RAG retrieval params than normal chat (`app.py`) — surfacing it may need tuning for public, varied job descriptions.
- **Prompt changes:** honest-gaps treatment means editing `src/data/chatbot-instructions.txt` — risk of breaking the existing positive-but-credible tone.
- **Scope creep:** keep to the chatbot / `/match` slice; resist redesigning the whole resume page.
- **Mobile:** structured result card must hold up at narrow widths.

---

## 7. DECISION: keep `/match` hidden vs. productize  *(one large highlighted sticky / decision box)*

**The central product question for RC1-122.**

- **Option A — Keep hidden:** stays a private power-tool for Reid; zero recruiter value; no discoverability work needed.
- **Option B — Productize:** becomes a recruiter-facing "How do I fit this role?" feature; requires discoverability + trust + honest-gaps treatment.
- **Leaning:** Option B (productize) — it's the only choice that creates recruiter value and gives the epic a real shipped improvement to demo. Note the trade-off: must handle trust/tone carefully so it reads as honest, not as a sales pitch.

> Record the final call here on the board — RC1-125/127 depend on it.

---

## 8. The ONE flow to carry into mockups  *(callout sticky — required by acceptance criteria)*

**Selected flow:** *Recruiter discovers the role-match CTA → pastes a job description → sees a loading state → reads a structured, honest fit result → acts (downloads the matching resume / contacts Reid).*

This is the single end-to-end thread that RC1-125 (mockups) and RC1-126 (prototype) will build.

---

## Done-when checklist (RC1-124 acceptance criteria)

- [ ] Board captures the recruiter fit-evaluation flow end to end (incl. hidden-command path)
- [ ] ≥3 design opportunities on the board
- [ ] Keep-hidden-vs-productize decision recorded
- [ ] Implementation risks captured
- [ ] FigJam link added to RC1-124 / the Epic
- [ ] One flow named to carry into mockups (section 8)
