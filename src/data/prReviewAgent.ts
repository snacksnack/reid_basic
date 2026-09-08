// Content for the PR Review Agent card (RC1-216).
// Source: github.com/snacksnack/pr_agent (epic RC1-106).
//
// RC1-410 rewrote this card. It described the single tool-calling loop that
// RC1-387 → RC1-394 replaced; production has run the multi-agent pipeline
// since 2026-09-07. Numbers in `result` come from the decision records:
// recall from docs/rc1-390-multi-agent.md, cost and wall clock from
// docs/rc1-393-cheap-exploration.md (three merged PRs, verifier on).

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
  lead: 'Reviews every PR on an account, at a tenth of the cost.',
  tagline:
    'A GitHub App that reviews every pull request opened across an account — including repositories that do not exist yet. Python plans each review and hands the agents the context they would otherwise pay to explore for. Three reviewers, scoped by the kind of evidence a finding needs, share one cached prefix and call no tools. A verifier checks every finding against the diff before one review is posted — advisory unless a secret was committed.',
  note: 'Three agents, not thirteen — one per kind of evidence a finding needs: the hunk, the hunk plus the repository, the hunk plus what the change claims to be. The category list is only an output schema.',
  result:
    'Recall held at 13 of 13 planted defects; cost per review fell from 48¢–$1.10 to 6–21¢ and wall clock from 100s to under a minute. Live since September 2026.',
  evals: {
    blurb:
      'Measured on planted-defect recall and on precision — decoys a competent reviewer would pass — plus a prompt-contract gate in CI.',
    href: 'https://snacksnack.github.io/agent-evals/',
  },

  technologies: [
    'Python',
    'FastAPI',
    'GitHub App',
    'Claude API',
    'Fly.io',
    'Datadog LLM Observability',
    'pytest',
    'agent-evals',
  ],

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
