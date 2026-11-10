// Content for the Fleet Observability card (RC1-410).
// Source: github.com/snacksnack/tpm-automation-platform (epic RC1-298).
//
// The one row on this page that is not a discrete agent: it is the Datadog
// estate the other rows report into. Refreshed 2026-11-09 (RC1-637): spend
// from ml_obs.span.llm.total.cost by ml_app and service over the 30 days
// 2026-10-11 to 11-10 UTC; the object count from datadog/manifest.json in the
// platform repo (7 dashboards, 28 monitors, 9 SLOs, 6 synthetics, 1 log
// index), which the daily drift job matched as 51 that night.

import type { ProjectCardContent } from './projectCard'

export interface FleetApp {
  app: string // ml_app tag, as LLM Observability reports it
  production: number // USD over the window from the deployed service
  test: number // USD from eval and benchmark runs (service evals or dry-run)
  // Production runs in the window (ml_obs.trace, one trace per run) and what
  // one run is for this app. Left off where a per-run figure would mislead:
  // test-only apps, whose traces range from one case to a whole sweep, and
  // esp-migration-agent, with one production run.
  runs?: number
  unit?: string
}

export const fleetObservability = {
  name: 'Fleet Observability',
  kicker: 'Platform',
  lead: 'Eleven LLM systems under one pane, priced run by run.',
  tagline:
    'Every agent on this page reports into one Datadog estate. Traces and token counts reach LLM Observability, where a run is priced at the end of its own trace rather than estimated from a monthly bill, and spend has guardrails that fire before a runaway loop becomes an invoice. Fifty-one dashboards, monitors, SLOs, synthetics and a log index are code, and a daily job goes red when the console and the repository disagree, in either direction, for a human to reconcile.',
  note: 'A daily aggregate cannot date a regression. Every number resolves to the raw event behind it, which is how a cost metric in nanodollars, scaled by a billion twice, was caught showing the largest spend as 0.00.',
  result:
    'Eleven apps traced and 51 Datadog objects under daily drift detection. Every run is priced from its own trace, and eval runs are told apart from production by their service tag, so a benchmark sweep never reads as customer spend.',

  technologies: [
    'Datadog (LLM Observability, APM, SLOs, Synthetics)',
    'Python',
    'GitHub Actions',
    'DORA metrics',
  ],

  links: [
    { label: 'GitHub ↗', href: 'https://github.com/snacksnack/tpm-automation-platform' },
  ],

  // A real window, not an illustration: every ml_app that reported cost to
  // LLM Observability in the 30 days, ranked by total. Eval and benchmark
  // runs report under the same ml_app as production and differ only by their
  // service tag (evals, dry-run), so each bar is split on it: a project built
  // this month can be all test runs, and a sweep can triple a day's spend.
  // Per-run cost is production only. pr-review-agent's 171 traces match the
  // agent's own pr_agent.review.cost_usd: 171 reviews, $17.48.
  apps: [
    { app: 'pr-review-agent', production: 17.4835, test: 2.5729, runs: 171, unit: 'review' },
    { app: 'launch-planner', production: 0, test: 3.5394 },
    { app: 'poc-benchmark-agent', production: 0, test: 1.6818 },
    { app: 'esp-migration-agent', production: 0.1508, test: 1.4711 },
    { app: 'kpi-agent', production: 0.8641, test: 0, runs: 10, unit: 'narrative' },
    { app: 'incident-summarizer', production: 0.6471, test: 0.07, runs: 102, unit: 'summary' },
    { app: 'drift-digest', production: 0.6032, test: 0, runs: 30, unit: 'digest' },
    { app: 'tpm-platform', production: 0, test: 0.4898 },
    { app: 'release-notes', production: 0.096, test: 0, runs: 44, unit: 'note' },
    { app: 'hihelloreid-chat', production: 0.0458, test: 0, runs: 480, unit: 'reply' },
    { app: 'concert-intelligence', production: 0.0381, test: 0, runs: 30, unit: 'run' },
  ] as FleetApp[],

  fleetCaption:
    'Datadog’s estimated cost by ml_app, 2026-10-11 to 11-10 UTC. Test runs are eval and benchmark sweeps, tagged by service. Per-run cost is production only.',
} as const satisfies ProjectCardContent & { apps: FleetApp[]; fleetCaption: string }
