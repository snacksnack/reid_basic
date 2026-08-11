// Content for the Job Scout card (RC1-226).
// Source: github.com/snacksnack/job-search-agent.
//
// Checked against scripts/pipeline.py rather than the README, which is stale in
// two places: the real score weights are W_TITLE/W_FIT/W_DOMAIN = 0.45/0.45/0.10
// (the bundled skills reference still documents a 0.55/0.35/0.10 split), and
// `fit` is not a raw matched/(matched+gaps) ratio — it is smoothed, then blended
// toward a neutral 70 in proportion to how much evidence and how much job
// description the assessment actually had.

import type { ProjectCardContent } from './projectCard'

export interface BoardRole {
  score: number // matchPercent, 0-100
  title: string
  domain: string // the posting's domain, not a real employer — this is illustrative
  meta: string // arrangement · posted range
  matched: readonly string[] // the skill match's green chips
  gaps: readonly string[] // its amber chips
  status: string // the board dropdown's current value
}

export const jobSearchAgent = {
  name: 'Job Scout',
  kicker: 'Job search',
  lead: 'Scores every new posting against a résumé, daily.',
  tagline:
    'A Claude plugin that runs a personalized job search every morning: it sweeps five ATS APIs across a watchlist, ingests a browser-driven LinkedIn pass, then filters, deduplicates and scores what it finds against a résumé and a set of preferences. The survivors land on a local board where one dropdown records the decision. Local JSON is the source of truth, and nothing is hardcoded to one candidate.',
  note: 'The fetch, filter, dedup and score are standard-library Python — no tokens. Claude is spent only on the judgment call: the résumé-to-JD skill match, cached on a role the first time it is seen and never recomputed.',

  technologies: [
    'Python (stdlib only)',
    'Claude Agent Skills',
    'Claude in Chrome',
    'ATS APIs',
    'Local board server',
    'pytest',
  ],

  links: [{ label: 'GitHub ↗', href: 'https://github.com/snacksnack/job-search-agent' }],

  // Two illustrative rows in the board's own shape — a clean fit and an
  // adjacent title, to show what the ranking is actually doing.
  roles: [
    {
      score: 87,
      title: 'Senior Technical Program Manager',
      domain: 'Developer tooling',
      meta: 'Remote (US) · $170–195K',
      matched: ['Python', 'AWS', 'Cross-team delivery'],
      gaps: ['Kubernetes'],
      status: 'New',
    },
    {
      score: 61,
      title: 'Technical Project Manager',
      domain: 'Fintech',
      meta: 'Hybrid, NYC · $150–170K',
      matched: ['Jira', 'Stakeholder comms'],
      gaps: ['Agency delivery'],
      status: 'Applied',
    },
  ] as BoardRole[],

  boardSortNote: 'sorted by match percent',

  boardCaption:
    'A "Technical Project Manager" scores 60 at the title where a true program-manager role scores 95 — adjacent enough to surface, never enough to outrank.',
} as const satisfies ProjectCardContent & {
  roles: BoardRole[]
  boardSortNote: string
  boardCaption: string
}
