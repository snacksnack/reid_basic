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
    "A customer's Mailchimp export goes in; a signed-off, reconciled migration into Listmonk or Brevo comes out. Deterministic parsers do the counting, the LLM proposes mappings with every ambiguity flagged rather than guessed, a human gate refuses approval while questions stay open, and an idempotent executor writes suppressions first. Proven end to end on a live Brevo account, then verified by an enumerated reconciliation report.",
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
    'Listmonk',
    'Brevo',
    'Datadog LLM Observability',
    'pytest',
    'agent-evals',
  ],

  links: [
    { label: 'Engagement writeup ↗', href: `${REPO}/blob/main/docs/engagement.md`, primary: true },
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
