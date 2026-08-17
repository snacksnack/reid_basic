// Content for the Dependency Drift Detector card (RC1-216). Narrative pairing
// with the flagship: Launch Planner plans the critical path, this watches it
// drift. Source: github.com/snacksnack/tpm-automation-platform (epic RC1-131).

import type { ProjectCardContent } from './projectCard'

export type DriftSeverity = 'red' | 'yellow' | 'white'

export interface DriftChain {
  nodes: string[] // ticket keys, upstream -> downstream
  severity: DriftSeverity
  rule: string
  detail: string // the finding, as the digest phrases it
}

export const driftDetector = {
  name: 'Dependency Drift Detector',
  kicker: 'Delivery risk',
  lead: 'Watches a Jira dependency graph for upstream slips.',
  tagline:
    "Launch Planner plans the critical path; this watches it drift. It walks a Jira project's dependency graph and flags upstream slips the downstream schedule hasn't absorbed — before the collision lands.",
  note: 'Deterministic Python decides what is drifting; Claude only writes the narrative.',
  evals: {
    blurb:
      'Drift-digest goldens in the shared agent-evals harness — a template edit that changes the digest fails CI.',
    href: 'https://snacksnack.github.io/agent-evals/',
  },

  technologies: ['Python', 'FastAPI', 'networkx', 'SQLite', 'Claude API', 'Fly.io', 'agent-evals'],

  links: [
    { label: 'GitHub ↗', href: 'https://github.com/snacksnack/tpm-automation-platform' },
  ],

  // The four detection rules as they fire against the repo's seeded RC1 demo
  // scenario — the same findings the Slack digest reports.
  chains: [
    {
      nodes: ['RC1-157', 'RC1-158'],
      severity: 'red',
      rule: 'timeline inversion',
      detail: 'Upstream due 07-20 lands after downstream due 07-16 — a 12d overlap.',
    },
    {
      nodes: ['RC1-159', 'RC1-160'],
      severity: 'red',
      rule: 'unabsorbed slip',
      detail: 'Launch readiness unchanged despite the vendor review slipping 14d.',
    },
    {
      nodes: ['RC1-161', 'RC1-162'],
      severity: 'yellow',
      rule: 'lead-time risk',
      detail: 'Downstream starts with ~1 working day of lead; upstream not started.',
    },
    {
      nodes: ['RC1-163', 'RC1-164', 'RC1-165'],
      severity: 'white',
      rule: 'transitive risk',
      detail: 'Both sit downstream of a blocker now Blocked.',
    },
  ] as DriftChain[],
} as const satisfies ProjectCardContent & { chains: DriftChain[] }
