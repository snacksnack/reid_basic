// Content for the ESP Migration Agent card (RC1-549).
// Source: github.com/snacksnack/esp-migration-agent (epic RC1-542), the
// gated email-platform migration engine, built as the lead FDE portfolio
// project. Every figure below traces to a committed artifact in that repo:
// the reconciliation reports, the cutover plan, and the engagement writeup
// the primary link opens.

import type { ProjectCardContent } from './projectCard'

// One row of the acceptance table the MiniReconcile visual draws: the
// reconciliation report is the artifact a customer signs, so the visual is
// the report, not an illustration of the pipeline.
export interface ReconcileCheck {
  label: string
  measured: string // "n of n" as the report prints it
}

const REPO = 'https://github.com/snacksnack/esp-migration-agent'

export const espMigrationAgent = {
  name: 'ESP Migration Agent',
  kicker: 'Platform migration',
  lead: 'Migrates an email platform behind human-approved gates.',
  tagline:
    "A customer's export goes in; a signed-off, reconciled migration comes out. Platform differences live in adapters behind one protocol, so a new target is an adapter, not a rewrite. Deterministic parsers do the counting and the LLM flags every ambiguity rather than guessing. The approver signs off through the customer's Okta, offboarding there ends their session at once (SCIM), and each decision lands in an append-only Postgres log. Suppressions write first.",
  note: 'The suppression invariant is held by the schema, not the model: a spec that could land a suppressed address subscribable cannot even parse.',
  result:
    '4,255 of 4,255 contacts reconciled on a live Brevo run, 411 of 411 suppressions held, and a second executor pass converged to zero writes.',
  evals: {
    blurb:
      'Measured on flag recall and precision over frozen proposer payloads: the three seeded ambiguities must come back flagged, never guessed.',
    href: 'https://snacksnack.github.io/agent-evals/',
  },

  technologies: [
    'Python',
    'pydantic',
    'Claude API',
    'Okta (OIDC SSO, SCIM)',
    'Postgres (Neon)',
    'Listmonk',
    'Brevo',
    'Datadog LLM Observability',
    'agent-evals',
  ],

  links: [
    // The hosted review gate (esp repo RC1-560/562): browse the real review
    // surface and trip the approval gate's refusal; only the named approver
    // can sign off. Fixture-seeded, nothing real behind it.
    { label: 'Live demo ↗', href: 'https://esp.hihelloreid.com', primary: true },
    { label: 'Engagement writeup ↗', href: `${REPO}/blob/main/docs/engagement.md` },
    { label: 'GitHub ↗', href: REPO },
  ],

  // The acceptance table from the live Brevo run, as the committed
  // reconciliation report prints it (docs/reconciliation_report_brevo.md).
  checks: [
    { label: 'Consent counts, per state', measured: '4,255 of 4,255' },
    { label: 'Suppression integrity, enumerated', measured: '411 of 411' },
    { label: 'Segment parity vs the approved plan', measured: '4 of 4' },
    { label: 'Sampled checksums, field-for-field', measured: '51 of 51' },
    { label: 'Campaigns, zero residual source tags', measured: '3 of 3' },
  ] as ReconcileCheck[],

  reconcileCaption:
    'The acceptance report from the live run: reconciliation must PASS before cutover, and any FAIL stops the clock.',
} as const satisfies ProjectCardContent & {
  checks: ReconcileCheck[]
  reconcileCaption: string
}
