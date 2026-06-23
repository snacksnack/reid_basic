# RC1-125 — Mockup Spec & Build Guide: Chatbot / `/match` Redesign

**Epic:** [RC1-122](https://hirereidcollins.atlassian.net/browse/RC1-122) · **Story:** [RC1-125](https://hirereidcollins.atlassian.net/browse/RC1-125)
**Builds on:** [RC1-124](https://hirereidcollins.atlassian.net/browse/RC1-124) flow (the ONE flow carried forward) · **Feeds:** RC1-126 prototype, RC1-127 implementation
**Figma file (Design):** `RC1-125 Chatbot Match Mockups` *(add link to Jira when created)*

> This doc is the design-decision + implementation-notes deliverable for RC1-125, **and** the step-by-step build guide. Build the frames in Figma by hand (the Figma↔Claude MCP is read-only); use this as the source of truth for layout, tokens, and content.

---

## 0. The flow we're designing (from RC1-124, section 8)

> *Recruiter discovers the role-match CTA → pastes a job description → sees a loading state → reads a structured, **honest** fit result → acts (downloads the matching resume / contacts Reid).*

Five states map onto that thread: **Entry → Empty → Loading → Result → Error.**

## 0a. Locked decisions (RC1-125 kickoff)

- **Entry/container:** a "See how I fit your role" **CTA on the resume page** opens the existing floating chat panel, **widened 380 → 440px** so the fit card breathes. Keeps the FAB→panel architecture from `ChatBot.tsx` → clean 1:1 design-to-code mapping.
- **Device scope:** 5 desktop state frames + **1 mobile variant of the fit-result card** (the only frame that meaningfully reflows on a phone).

---

## 1. What exists today (grounded in code)

| Thing | Today (`ChatBot.tsx` / `ChatBot.css`) |
|---|---|
| Entry | Floating **FAB** (56px accent circle, bottom-right) |
| Panel | **380 × 520px**, radius 16, header `Ask about Reid` (accent bg, white text) |
| First message | Plain text greeting, **no example chips** |
| Bubbles | assistant `#f0f2f5` left / user `accent` right, radius 14 |
| Input | textarea + circular accent send button, top border `#e6e8ee` |
| `/match` | **Hidden** command. Output = *Strong Matches / Transferable Experience / Overall Assessment*, instructed to be "confidently enthusiastic," gaps framed as minor. **No honest gaps, no hand-off actions, no discoverability.** |

**The three things this redesign changes** (each ties to an audit pain point):
1. **Discoverability** → add a page CTA + example prompt chips (recruiter can't find a hidden slash command).
2. **Trust** → restructure the result into an **honest** fit card that *shows real gaps* (counters "is this a gimmick / just marketing?").
3. **Hand-off** → result card ends with clear next actions (download the matching resume / contact).

---

## 2. Design tokens (reuse exactly — these are your live values)

| Token | Value | Use |
|---|---|---|
| `text` | `#0b1220` | primary text |
| `muted` | `#5b657a` | secondary text, labels |
| `accent` | `#0f62fe` | buttons, links, user bubble, header |
| `border` | `#e6e8ee` | hairlines, card border, input border |
| `bg` | `#ffffff` | page / panel / card fill |
| `bubble-assistant` | `#f0f2f5` | assistant bubble fill |
| Content column | `850px` centered | resume page |
| Panel | **440 × 560px**, radius 16 | widened chat panel |
| Button radius | `8px` | toolbar / CTA buttons |
| Chip | fully rounded pill | skill chips, prompt chips |

**New semantic tints for the fit card** (minimal additions — flag these in RC1-127 as 3 new CSS vars):

| Token | Text | Background tint | Use |
|---|---|---|---|
| `success` | `#0f7b3f` | `#e7f4ec` | ✓ Strengths |
| `info` | `#0f62fe` (accent) | `#eaf0ff` | ~ Transferable |
| `caution` | `#9a6700` | `#fdf3e2` | ! Honest gaps |

> Honest gaps use a *caution amber, not red*. Red = error/failure; amber = "worth knowing, not disqualifying." This is the visual half of the trust argument.

---

## 3. The Fit Card — hero deliverable (anatomy)

Rendered as a rich assistant message inside the panel. Card width = panel − padding ≈ **408px** desktop.

```
┌──────────────────────────────────────────────┐
│  Fit for Senior Backend Engineer   [Strong ✓] │  ← title + verdict pill
│  Based on Reid's resume · 8 sections reviewed  │  ← muted provenance line (trust)
│                                                │
│  ✓ STRENGTHS                                   │  ← success tint label
│   • 7+ yrs backend (Python/Go), AWS at scale   │
│   • Led platform migration, ECS/Fargate+Docker │
│   • Owned on-call + reliability for tier-1 svc │
│                                                │
│  ~ TRANSFERABLE                                │  ← info tint label
│   • K8s asked; deep ECS/Fargate → ramps fast   │
│   • Managed via Terraform; IaC concepts carry  │
│                                                │
│  ! HONEST GAPS                                 │  ← caution tint label
│   • No direct Kubernetes in production yet      │
│   • Less exposure to real-time/streaming stacks │
│                                                │
│  VERDICT                                        │
│  Strong fit for a backend/platform role; the    │
│  main gap (K8s) is adjacent to proven ECS work. │
│                                                │
│  [ Download matching resume ]  [ Contact Reid ] │  ← hand-off actions
└──────────────────────────────────────────────┘
   Want me to go deeper on any of these? ▾        ← conversational follow-up (hybrid)
```

**Hybrid layout** (the RC1-124 decision): scannable card on top, normal conversation continues below — so a recruiter gets the 60-second verdict *and* can drill in.

**Verdict pill variants:** `Strong fit` (success), `Good fit, some gaps` (info), `Partial fit` (caution). Always show real gaps regardless of pill — that's the point.

---

## 4. Frame list (build in this order)

| # | Frame | What it shows |
|---|---|---|
| 1 | **Entry** | Resume page (850px) with the "See how I fit your role" CTA card visible |
| 2 | **Empty** | Panel open, role-fit intro + **example prompt chips**, empty input ("Paste a job description…") |
| 3 | **Loading** | JD submitted (user bubble) + typing/skeleton state ("Reviewing résumé against the role…") |
| 4 | **Result** | The full **Fit Card** (section 3) + follow-up line |
| 5 | **Error** | Graceful failure: "Couldn't analyze the role right now" + **Retry** + contact fallback |
| 6 | **Result — mobile** | Fit card at ~360px width; sections stack, actions go full-width |

---

## 5. Component decisions (what becomes a Figma component → React)

| Figma component | Variants | Maps to |
|---|---|---|
| `Button` | `primary` (accent fill) / `secondary` (white + border) | CTA, hand-off actions, retry |
| `Prompt chip` | default / hover | example-prompt starters (new) |
| `Message bubble` | assistant / user | `.chat-bubble` |
| `Fit section` | strengths / transferable / gaps | repeated block in the card |
| `Verdict pill` | strong / good / partial | header pill (new) |

Building these as components (not copies) is the RC1-125 → RC1-127 bridge: each maps to a real React element / CSS class.

---

## 6. How this addresses the audit (acceptance criteria: ≥2 pain points)

1. **Discoverability** (RC1-123 #5 / RC1-124): hidden `/match` → page CTA + prompt chips.
2. **Trust / "gimmick?"**: provenance line ("based on Reid's resume") + **honest gaps** in caution-amber → reads as assessment, not marketing.
3. **(bonus) Hand-off**: result ends with download-the-matching-resume + contact actions.

---

## 7. Implementation notes (for RC1-127)

- Panel width `380 → 440px` in `.chat-panel`; mobile already `calc(100vw - 2rem)`.
- Fit card = a structured assistant message. Either (a) backend returns markdown the existing `ReactMarkdown` renders, or (b) a dedicated `FitCard` component fed structured JSON. **Prefer (b)** for the semantic tints + action buttons; needs `/match` to return structured data, not prose.
- 3 new CSS vars: `--success/--info/--caution` (+ tints). Reuse `--accent/--border/--muted`.
- Honest-gaps tone requires editing `src/data/chatbot-instructions.txt` (today it's "confidently enthusiastic, frame gaps as minor"). **This is the trust trade-off to handle carefully** (RC1-124 risk).
- Prompt chips = clickable buttons that prefill the input (e.g. "Paste a job description", "Is he senior enough?", "What are the gaps?").

---

## 8. Done-when (RC1-125 acceptance criteria)

- [ ] 5 desktop state frames + 1 mobile fit-card variant built in Figma
- [ ] Fit card uses real tokens; honest-gaps treatment present
- [ ] ≥2 audit pain points visibly addressed (discoverability + trust)
- [ ] Component decisions made (section 5)
- [ ] Figma link added to RC1-125
- [ ] Design-decision + implementation notes captured (this doc)
