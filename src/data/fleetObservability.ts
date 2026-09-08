// Content for the Fleet Observability card (RC1-410).
// Source: github.com/snacksnack/tpm-automation-platform (epic RC1-298).
//
// The one row on this page that is not a discrete agent: it is the Datadog
// estate the other rows report into. Figures verified live 2026-09-08 —
// the roster and shares from ml_obs.span.llm.total.cost by ml_app over 30
// days, the object count from datadog/ in the platform repo (4 dashboards,
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
    'Nine apps traced and 22 Datadog objects under daily drift detection; per-run pricing reconciled against the actual Anthropic bill.',

  technologies: [
    'Datadog (LLM Observability, APM, SLOs, Synthetics)',
    'Python',
    'GitHub Actions',
    'DORA metrics',
  ],

  links: [
    { label: 'GitHub ↗', href: 'https://github.com/snacksnack/tpm-automation-platform' },
  ],

  // A real 30-day window, not an illustration: every ml_app reporting cost to
  // LLM Observability in the 30 days to 2026-09-08, ranked by spend.
  apps: [
    { app: 'pr-review-agent', cost: 2.4915 },
    { app: 'drift-digest', cost: 0.1994 },
    { app: 'launch-planner', cost: 0.1914 },
    { app: 'kpi-agent', cost: 0.1803 },
    { app: 'tpm-platform', cost: 0.0649 },
    { app: 'concert-intelligence', cost: 0.0302 },
    { app: 'hihelloreid-chat', cost: 0.009 },
    { app: 'agent-evals-harness', cost: 0.0003 },
    { app: 'agent-fleet', cost: 0.00005 },
  ] as FleetApp[],

  fleetCaption: 'Cost by ml_app, 30 days to 2026-09-08, as LLM Observability reports it.',
} as const satisfies ProjectCardContent & { apps: FleetApp[]; fleetCaption: string }
