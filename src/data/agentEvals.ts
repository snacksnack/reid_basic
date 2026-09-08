// Content for the Agent Evals card (RC1-266).
// Source: github.com/snacksnack/agent-evals — the shared harness extracted
// from launch-planner-agent once three repos needed the same answer. The
// trend link goes to the live page; the sparkline below is an illustrative
// slice in its shape, with real subject names from the run store.

import type { ProjectCardContent } from './projectCard'

export interface TrendSeries {
  subject: string // as recorded in the run store
  scores: number[] // suite score per run, 0..1
  flag?: { at: number; note: string } // an attributed regression worth pointing at
}

export const agentEvals = {
  name: 'Agent Evals',
  kicker: 'Quality engineering',
  lead: 'The regression suite measuring six systems on this page.',
  tagline:
    'A shared regression suite for LLM systems, built because five were in production and nothing answered "how do you know the output is any good?" Frozen cases scored on named characteristics — never string equality; a deterministic groundedness checker whose hallucination rate gates CI; and an LLM judge allowed to fail a build only where calibration earned it. Every run is priced from a pinned table, prompt-cache tokens included, into an append-only store.',
  note: 'Attribution over vibes — each run record carries its model, prompt version, code version and token cost, so a regression is a query, not a hunch. An unpriced model raises rather than costing zero.',
  result:
    'Seventeen subjects and 155 runs since August 2026. Pricing cache tokens caught a subject recording its work at roughly 40% of real cost.',

  technologies: ['Python', 'Pydantic', 'pytest', 'Claude API', 'Postgres', 'GitHub Pages'],

  links: [
    { label: 'Quality trend ↗', href: 'https://snacksnack.github.io/agent-evals/', primary: true },
    { label: 'GitHub ↗', href: 'https://github.com/snacksnack/agent-evals' },
  ],

  // Real runs, not an illustration: pr-review's complete suite runs from the
  // store, 2026-08-16 to 09-07. One run covering a single case is left out —
  // its 1.00 is not comparable with a 16-case run. The flagged point is the
  // run where all 16 cases errored while model, prompt and code version stayed
  // put, which is the whole argument for recording versions beside the score.
  series: [
    {
      subject: 'pr-review',
      scores: [
        1.0, 0.86, 0.93, 0.86, 1.0, 0.88, 0.38, 0.0, 0.81, 1.0, 0.88, 1.0, 0.94, 0.81, 0.88,
        0.81, 0.75, 0.81, 0.88, 0.88,
      ],
      flag: {
        at: 7,
        note: 'every case errored — model, prompt and code version unchanged, so the cause was outside the subject.',
      },
    },
  ] as TrendSeries[],

  trendCaption:
    'Real runs from the store: pr-review’s pass rate per run, every point attributed to its versions.',
} as const satisfies ProjectCardContent & { series: TrendSeries[]; trendCaption: string }
