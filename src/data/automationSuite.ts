// Content for the TPM workflow automation card (RC1-216) — three small
// scheduled services presented as one body of work. Sources:
// n8n-jira-notion-sync, n8n-stakeholder-status-email (RC1-47), stale-ticket-bot
// (RC1-4).

import type { ProjectCardContent } from './projectCard'

export interface AutomationStage {
  label: string
  gate?: boolean // a human approval step, marked in the strip
}

export const automationSuite = {
  name: 'TPM Workflow Automation',
  kicker: 'Workflow automation',
  lead: "Three scheduled services behind a program's paperwork.",
  tagline:
    "Three scheduled services that keep a program's paperwork honest: a two-way Jira ↔ Notion sync with echo suppression and an append-only audit log, a Friday stakeholder status email drafted by Claude, and a weekday stale-ticket nudge into Slack.",
  note: 'The status email is the reason the platform exists — hitting n8n’s ceiling here is what motivated the typed, tested rewrite next door.',
  evals: {
    blurb: 'Prompt-contract and golden evals on the status email draft, in the shared agent-evals harness.',
    href: 'https://snacksnack.github.io/agent-evals/',
  },

  technologies: ['n8n', 'AWS Lambda', 'SAM', 'Jira API', 'Notion API', 'Claude API', 'Slack', 'agent-evals'],

  links: [
    { label: 'Jira ↔ Notion ↗', href: 'https://github.com/snacksnack/n8n-jira-notion-sync' },
    { label: 'Status email ↗', href: 'https://github.com/snacksnack/n8n-stakeholder-status-email' },
    { label: 'Stale-ticket bot ↗', href: 'https://github.com/snacksnack/stale-ticket-bot' },
  ],

  // The status-email run, which is the one with the human in the loop.
  stages: [
    { label: 'Fri 4pm cron' },
    { label: 'Pull Jira + Notion' },
    { label: 'Group by status' },
    { label: 'Claude drafts' },
    { label: 'Human approves', gate: true },
    { label: 'Send + log' },
  ] as AutomationStage[],
} as const satisfies ProjectCardContent & { stages: AutomationStage[] }
