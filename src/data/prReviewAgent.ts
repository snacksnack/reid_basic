// Content for the PR Review Agent card (RC1-216).
// Source: github.com/snacksnack/pr_agent (epic RC1-106).

import type { ProjectCardContent } from './projectCard'

export type FindingSeverity = 'high' | 'medium' | 'low'

export interface ReviewFinding {
  severity: FindingSeverity
  location: string // file:line, as GitHub anchors it
  category: string
  message: string
}

export const prReviewAgent = {
  name: 'PR Review Agent',
  kicker: 'Code review',
  lead: 'A GitHub App that reviews every PR on an account.',
  tagline:
    'A GitHub App that reviews every pull request opened across an account — including repos that do not exist yet. On each PR it explores the repository for context first, then posts one structured review: a summary plus severity-tagged inline findings.',
  note: 'Advisory by default — it escalates to "Request changes" only on a committed secret.',
  evals: {
    blurb:
      'Measured on planted-defect recall — seeded bugs the review must find — plus a prompt-contract gate in CI.',
    href: 'https://snacksnack.github.io/agent-evals/',
  },

  technologies: ['Python', 'FastAPI', 'GitHub App', 'Claude API', 'Fly.io', 'pytest', 'agent-evals'],

  links: [{ label: 'GitHub ↗', href: 'https://github.com/snacksnack/pr_agent' }],

  // An illustrative review in the agent's own output shape.
  reviewSummary:
    'Adds the drift severity scorer. Logic is sound and well covered; two issues worth a look before merge.',

  findings: [
    {
      severity: 'high',
      location: 'drift/rules.py:118',
      category: 'security',
      message: 'Jira API token interpolated into the debug log line.',
    },
    {
      severity: 'medium',
      location: 'drift/graph.py:64',
      category: 'correctness',
      message: 'Cycle in the dependency graph would recurse without a visited set.',
    },
    {
      severity: 'low',
      location: 'tests/test_rules.py:31',
      category: 'test coverage',
      message: 'The lead-time boundary case (exactly 0 days) is untested.',
    },
  ] as ReviewFinding[],

  verdict: 'Advisory — 1 high, 1 medium, 1 low. Not blocking.',
} as const satisfies ProjectCardContent & {
  reviewSummary: string
  findings: ReviewFinding[]
  verdict: string
}
