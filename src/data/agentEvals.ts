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
  lead: 'The regression suite measuring five systems on this page.',
  tagline:
    'A shared regression suite for LLM systems, built because five were in production and nothing answered "how do you know the output is any good?" Frozen cases scored on named characteristics — never string equality; a deterministic groundedness checker whose hallucination rate gates CI; and an LLM judge allowed to fail a build only where calibration against human labels earned it. Every run lands in an append-only store and renders to a public quality trend page.',
  note: 'Attribution over vibes — each run record carries its model, prompt version, code version and token cost, so a regression is a query, not a hunch.',

  technologies: ['Python', 'Pydantic', 'pytest', 'Claude API', 'Postgres', 'GitHub Pages'],

  links: [
    { label: 'Quality trend ↗', href: 'https://snacksnack.github.io/agent-evals/', primary: true },
    { label: 'GitHub ↗', href: 'https://github.com/snacksnack/agent-evals' },
  ],

  // Two of the store's subjects, in the shape the live page draws them.
  series: [
    {
      subject: 'status-narrative',
      scores: [0.78, 0.81, 0.84, 0.62, 0.86, 0.88, 0.91],
      flag: {
        at: 3,
        note: 'a prompt edit regressed groundedness — the contract gate failed the build.',
      },
    },
    {
      subject: 'work-breakdown',
      scores: [0.71, 0.74, 0.79, 0.8, 0.83, 0.82, 0.87],
    },
  ] as TrendSeries[],

  trendCaption:
    'An illustrative slice of the live trend page: suite score per subject over runs, every point attributed.',
} as const satisfies ProjectCardContent & { series: TrendSeries[]; trendCaption: string }
