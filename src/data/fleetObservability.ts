// Content for the Fleet Observability card (RC1-410).
// Source: github.com/snacksnack/tpm-automation-platform (epic RC1-298).
//
// The one row on this page that is not a discrete agent: it is the Datadog
// estate the other rows report into. Figures verified live 2026-09-08 —
// the roster and shares from ml_obs.span.llm.total.cost by ml_app over 30
// days (see RC1-411), the object count from datadog/ in the platform repo (4 dashboards,
// 11 monitors, 2 SLOs, 5 synthetics), whose drift job runs daily.

import type { ProjectCardContent } from './projectCard'

export interface FleetApp {
  app: string // ml_app tag, as LLM Observability reports it
  cost: number // USD over the window
}

export const fleetObservability = {
  name: 'Fleet Observability',
  kicker: 'Platform',
  lead: 'Nine LLM systems under one pane, priced run by run.',
  tagline:
    'Every agent on this page reports into one Datadog estate. Traces and token counts reach LLM Observability, where a run is priced at the end of its own trace rather than estimated from a monthly bill, and spend has guardrails that fire before a runaway loop becomes an invoice. Twenty-two dashboards, monitors, SLOs and synthetics are code, and a daily job goes red when the console and the repository disagree — in either direction, for a human to reconcile.',
  note: 'A daily aggregate cannot date a regression. Every number resolves to the raw event behind it — which is how a cost metric in nanodollars, scaled by a billion twice, was caught showing the largest spend as 0.00.',
  result:
    'Nine apps traced and 22 Datadog objects under daily drift detection; every run priced from its own trace rather than a monthly estimate.',

  technologies: [
    'Datadog (LLM Observability, APM, SLOs, Synthetics)',
    'Python',
    'GitHub Actions',
    'DORA metrics',
  ],

  links: [
    { label: 'GitHub ↗', href: 'https://github.com/snacksnack/tpm-automation-platform' },
  ],

  // A real window, not an illustration: every ml_app reporting cost to LLM
  // Observability, ranked by spend. The window is every day the data exists —
  // instrumentation landed 2026-08-28 — so it is 11 days, not a round month.
  // These are Datadog's per-span estimates and include benchmark and corpus
  // runs, which RC1-411 is reconciling against the agent's own per-review
  // metric; the caption says so rather than implying this is the invoice.
  apps: [
    { app: 'pr-review-agent', cost: 34.9377 },
    { app: 'launch-planner', cost: 1.6977 },
    { app: 'kpi-agent', cost: 0.2382 },
    { app: 'drift-digest', cost: 0.1994 },
    { app: 'tpm-platform', cost: 0.1948 },
    { app: 'concert-intelligence', cost: 0.0464 },
    { app: 'hihelloreid-chat', cost: 0.014 },
    { app: 'agent-evals-harness', cost: 0.0006 },
    { app: 'agent-fleet', cost: 0.00005 },
  ] as FleetApp[],

  fleetCaption:
    'Datadog’s estimated cost by ml_app, 2026-08-28 to 09-07 — every run, benchmarks included.',
} as const satisfies ProjectCardContent & { apps: FleetApp[]; fleetCaption: string }
