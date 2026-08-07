// Content for the AI Incident Summarizer — the source of truth shared by the
// homepage index row (ProjectIndex) and the self-hosted overview page
// (IncidentSummarizerPage). (RC1-216, extended for the overview page in RC1-225)
// Source: github.com/snacksnack/ai-incident-summarizer (epic RC1-31).
//
// Every claim below is checked against the implementation, not the README —
// the README has been wrong before.

import type { ProjectCardContent, ProjectOverviewContent } from './projectCard'

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

export interface PipelineStage {
  key: string
  label: string
  blurb: string
}

export interface Principle {
  title: string
  blurb: string
}

export const incidentSummarizer = {
  name: 'AI Incident Summarizer',
  kicker: 'Incident response',
  lead: 'Correlates three alert firehoses into one incident.',
  tagline:
    'Three observability firehoses land as one incident instead of fifty pages. Alerts are normalized to a shared schema, deduplicated by fingerprint, and correlated in a time window; an LLM writes the summary that reaches Slack and Jira.',
  principle: 'Fifty alerts become one incident before anyone gets paged.',
  // The index row shows `note`; the overview page reads `principle`.
  note: 'Correlation state lives in DynamoDB TTL, so the Lambdas stay stateless; replies thread back onto the original Slack message.',

  technologies: ['AWS Lambda', 'SAM', 'DynamoDB', 'API Gateway', 'Claude API', 'Next.js', 'Vercel'],

  overviewPath: '/projects/incident-summarizer',
  demoUrl: 'https://incidents.hihelloreid.com',
  repoUrl: 'https://github.com/snacksnack/ai-incident-summarizer',

  // Three destinations, matching the Launch Planner row.
  links: [
    { label: 'Overview →', href: '/projects/incident-summarizer', primary: true, internal: true },
    { label: 'Live demo ↗', href: 'https://incidents.hihelloreid.com' },
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

  pipeline: [
    { key: 'ingest', label: 'Arrive', blurb: 'CloudWatch through EventBridge; Datadog and GitHub Actions through signed webhooks.' },
    { key: 'normalize', label: 'Normalize', blurb: 'Three payload shapes are rewritten into one incident schema.' },
    { key: 'dedup', label: 'Fingerprint', blurb: 'A conditional write drops any alert already seen — the repeat never reaches the pipeline.' },
    { key: 'correlate', label: 'Correlate', blurb: 'Alerts for the same service inside a five-minute window join one incident instead of opening their own.' },
    { key: 'summarize', label: 'Summarize', blurb: 'Claude writes the summary, the likely cause, and the next step.' },
    { key: 'deliver', label: 'Deliver', blurb: 'A threaded Slack message and a Jira ticket, each linking to the other.' },
    { key: 'dashboard', label: 'Review', blurb: 'Incident history on the dashboard, filterable by service and status together.' },
  ] as PipelineStage[],

  principles: [
    {
      title: 'The functions hold no state',
      blurb:
        'Dedup fingerprints and correlation windows live in DynamoDB under a TTL rather than in memory, so every Lambda is stateless and safe to run concurrently. There is nothing to drain and nothing to restart.',
    },
    {
      title: 'Writes are conditional, so retries are free',
      blurb:
        'An incident is created behind a condition on its ID and updated in place afterwards. A retried invocation cannot duplicate an incident or corrupt one that already exists.',
    },
    {
      title: 'Reads scale on the answer, not the archive',
      blurb:
        'Each service is recorded in a small registry the first time it opens an incident. The dashboard reads that registry, so filtering costs the number of services — about ten — rather than a scan of every incident ever written.',
    },
    {
      title: 'Secrets are never environment variables',
      blurb:
        'The Anthropic key, Datadog credentials, and webhook signing secrets are pulled from AWS Secrets Manager at runtime. Nothing sensitive is baked into the template or the deployment.',
    },
  ] as Principle[],
} as const satisfies ProjectCardContent & ProjectOverviewContent & {
  sources: FunnelSource[]
  collapse: string
  incident: FunnelIncident
  pipeline: PipelineStage[]
  principles: Principle[]
}
