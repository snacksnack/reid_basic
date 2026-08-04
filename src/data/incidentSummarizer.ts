// Content for the AI Incident Summarizer card (RC1-216).
// Source: github.com/snacksnack/ai-incident-summarizer (epic RC1-31).

import type { ProjectCardContent } from './projectCard'

export interface FunnelSource {
  name: string
  blurb: string // how it gets in
}

export interface FunnelIncident {
  severity: string
  service: string
  summary: string
  destinations: string[]
}

export const incidentSummarizer = {
  name: 'AI Incident Summarizer',
  kicker: 'Incident response',
  lead: 'Correlates three alert firehoses into one incident.',
  tagline:
    'Three observability firehoses land as one incident instead of fifty pages. Alerts are normalized to a shared schema, deduplicated by fingerprint, and correlated in a time window; an LLM writes the summary that reaches Slack and Jira.',
  note: 'Correlation state lives in DynamoDB TTL, so the Lambdas stay stateless; replies thread back onto the original Slack message.',

  technologies: ['AWS Lambda', 'SAM', 'DynamoDB', 'API Gateway', 'Claude API', 'Next.js', 'Vercel'],

  links: [
    { label: 'Live demo ↗', href: 'https://incidents.hihelloreid.com', primary: true },
    { label: 'GitHub ↗', href: 'https://github.com/snacksnack/ai-incident-summarizer' },
  ],

  sources: [
    { name: 'CloudWatch', blurb: 'EventBridge' },
    { name: 'Datadog', blurb: 'HMAC webhook' },
    { name: 'GitHub Actions', blurb: 'HMAC webhook' },
  ] as FunnelSource[],

  collapse: 'Normalize → fingerprint dedup → time-window correlation',

  incident: {
    severity: 'critical',
    service: 'checkout-api',
    summary: 'Elevated 5xx and Lambda timeouts on checkout-api, correlated to the 14:02 deploy.',
    destinations: ['Slack thread', 'Jira ticket'],
  } as FunnelIncident,
} as const satisfies ProjectCardContent & {
  sources: FunnelSource[]
  collapse: string
  incident: FunnelIncident
}
