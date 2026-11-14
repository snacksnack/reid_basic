// Content for the Customer Install Kit card (RC1-645).
// Source: github.com/snacksnack/customer-install-kit (epic RC1-594), the
// third FDE build: install the ESP Migration Agent in a customer's own cloud
// account and support it from shared evidence alone. Every figure below is
// quoted from docs/engagement.md and docs/demo.md in that repo, whose
// tests/test_engagement.py re-derives each one from committed artifacts.
//
// The engagement brief says not to claim zero administrator access or that no
// sensitive data can ever leave, so the copy says what the vendor holds (no
// customer credential) and calls the canary result bounded.

import type { ProjectCardContent } from './projectCard'

// One step of the MiniHandoff visual: who acted, what happened, and what (if
// anything) crossed from one side to the other afterwards.
export interface HandoffStep {
  side: 'customer' | 'vendor'
  label: string
  sends?: string
}

const REPO = 'https://github.com/snacksnack/customer-install-kit'

export const customerInstallKit = {
  name: 'Customer Install Kit',
  kicker: 'Customer deployment',
  lead: "Installs the ESP agent in a customer's own cloud and supports it when it breaks, with no access to their systems.",
  tagline:
    "An install and support kit for running the ESP Migration Agent where the vendor cannot see. The customer installs a signed release into their own Fly account and database, then runs a real migration of fake contacts to prove the workflow works, not just that the app is up. When something breaks, they collect a diagnostic bundle built only from listed fields, read it, and send it. Support diagnoses from that bundle alone, first with fixed rules and then with a Claude investigator that can only ask for one of three read-only checks. The fix is a proposal the customer applies, and a new signed test run shows whether it worked.",
  note: 'One person played customer and vendor, on synthetic contacts, on one supported setup (Fly, amd64, Postgres, Brevo). A signed test report proves it was not altered, not that its results are true: the customer controls the machine and the key.',
  result:
    "In the demo, a revoked database grant left the health check green while the install test failed. From the customer's 11-file bundle and one follow-up check, support named the missing grant, and after the customer applied it the test passed 14 of 14. Across 13 sealed cases the AI investigator diagnosed 4 of 8 known faults to the rules' 3, and neither diagnosed the held-out fault type (0 of 2).",
  evals: {
    blurb:
      'Four billed cases on frozen bundles score whether the investigator asks for the right check, supports a cause only after the answer, and cites the row that decides it; two free cases fail the build if anything leaves its tracing allowlist or reaches a customer system.',
    href: 'https://snacksnack.github.io/agent-evals/',
  },

  technologies: [
    'Python',
    'Claude API',
    'Fly.io',
    'Postgres (Neon)',
    'Sigstore (cosign)',
    'Docker',
    'Datadog LLM Observability',
    'agent-evals',
  ],

  links: [
    { label: 'Engagement writeup ↗', href: `${REPO}/blob/main/docs/engagement.md`, primary: true },
    { label: 'Demo with artifacts ↗', href: `${REPO}/blob/main/docs/demo.md` },
    { label: 'GitHub ↗', href: REPO },
  ],

  // docs/demo.md, "Timeline": the one support case, end to end.
  steps: [
    { side: 'customer', label: 'Install signed 0.1.4 · 45 s' },
    { side: 'customer', label: 'Install test 14 of 14' },
    { side: 'customer', label: 'Grant revoked · health still 200 · test fails', sends: 'bundle + key fingerprint' },
    { side: 'vendor', label: 'Rules and agent: which grants does the app role hold?', sends: 'one read-only check' },
    { side: 'customer', label: 'Runs the check, reads the answer', sends: 'follow-up bundle' },
    { side: 'vendor', label: 'Missing: review_audit SELECT', sends: 'proposed GRANT' },
    { side: 'customer', label: 'Applies it · install test 14 of 14' },
  ] as HandoffStep[],

  handoffCaption:
    'The demo case from docs/demo.md. Every arrow is a file or a line of text the customer chose to send; the vendor held no customer credential at any step.',
} as const satisfies ProjectCardContent & {
  steps: HandoffStep[]
  handoffCaption: string
}
