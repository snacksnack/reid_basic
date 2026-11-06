// Content for the API Compatibility Lab card (RC1-612).
// Source: github.com/snacksnack/api-compatibility-lab (epic RC1-603), the
// differential-testing project: replay a customer's own sanitized traffic
// across two dated Stripe API versions and report what the upgrade breaks.
// Every figure below traces to a committed, regenerated artifact in that
// repo (the behavioral diff report, the impact report, and the pinned-test
// certification), and the repo's own test suite re-derives each one.
//
// The only row on this page carrying a status: phases 0 through 7 of the
// epic are built and the corpus reaches six of the eight documented breaks
// in the inventory, so it is an argument that holds rather than a finished
// tool. The card says so in the same breath as the numbers. The last two
// each need something a bare test-mode sandbox cannot do, which is why they
// stay unexercised rather than becoming a longer corpus.

import type { ProjectCardContent } from './projectCard'

// One row of the MiniBlindspot visual: a documented behavioral break, and
// what the schema-diff baseline said about it. `blind` is the whole point:
// the baseline reporting nothing usable while the replay caught it.
export interface BreakRow {
  label: string
  baseline: string // the baseline's verdict, as the scorecard records it
  blind: boolean
}

const REPO = 'https://github.com/snacksnack/api-compatibility-lab'
// The reports, rendered (RC1-620). Built by Actions from main; the impact
// report is served as the same bytes an FDE would send a customer.
const SITE = 'https://snacksnack.github.io/api-compatibility-lab/'

export const apiCompatibilityLab = {
  name: 'API Compatibility Lab',
  kicker: 'API upgrades',
  status: 'In progress',
  lead: 'Replays captured traffic across two API versions to find the breaks a schema diff misses.',
  tagline:
    'An OpenAPI diff catches removed fields and changed types. It is blind to a changed default, a field that became nullable in practice, a pagination boundary shift, a different error code under the same HTTP status. Each of those breaks working integration code while the diff reports green. So this captures a customer’s own traffic, sanitizes it for storage, replays the identical requests against both versions, and compares canonical responses. Every surviving difference is classified, mapped onto the workflows and the exact field reads it affects, and compiled into a test that passes on the old version and fails on the new one. Goes beyond schema comparison to find the changes that actually break customer applications. Every phase is built and the captured corpus reaches seven of the eight documented breaks in the inventory. The one it does not reach was probed and confirmed live, then left unexercised by decision rather than by blocker: observing it needs a hosted Checkout page driven to a failed payment, and replaying that would put a browser inside the control run whose determinism the whole method rests on. So this is an argument that holds rather than a finished tool: the inventory of workflows is declared by the customer, not discovered from their code, and every figure describes one version pair.',
  note: 'Four gates refuse to publish rather than caveat: no false-break rate while a finding lacks a hand verdict, no precision while a claim is unconfirmed, no pass-fail count while a pin is uncertified, and no corpus that still holds a credential. One of the eight documented breaks is unexercised by this traffic, and it is reported as unexercised, never as passed.',
  result:
    'Caught 7 of the 7 documented behavioral breaks the corpus exercises. The schema-diff baseline gave no usable warning on six of them, five with no entry at all and one naming the field but not the behavior, while reporting 18,901 breaking changes on the same twenty-nine endpoints. 0 false breaks over 65 breaking findings, and 21 of 21 generated tests pass on the old version and fail on the new one.',
  evals: {
    blurb:
      'Six dimensions scored on every run: detection recall against a changelog its author did not write, the false-break rate, the schema-diff comparison, workflow-mapping precision, pin certification, and the corpus PII count. The only subject on the harness that calls no model, so its record carries zero spend on purpose.',
    href: 'https://snacksnack.github.io/agent-evals/',
  },

  technologies: [
    'Python',
    'httpx',
    'pytest',
    'oasdiff',
    'Stripe API (dated versions)',
    'Datadog',
    'agent-evals',
  ],

  links: [
    { label: 'Engagement writeup ↗', href: SITE, primary: true },
    { label: 'Impact report ↗', href: `${SITE}impact-report.html` },
    { label: 'GitHub ↗', href: REPO },
  ],

  // The six documented breaks this corpus exercises, with the baseline's
  // verdict on each, exactly as docs/behavioral-diff-report.md records it:
  // five green, one named-only, one reported. The last three arrived with the
  // RC1-618 capture, and all three are fully green: the schema diff reports
  // the half that moved a field and says nothing about the half that moved a
  // number.
  breaks: [
    {
      label: 'Automatic payment methods on by default',
      baseline: 'no entry',
      blind: true,
    },
    {
      label: 'capture_method default changed',
      baseline: 'field only',
      blind: true,
    },
    {
      label: 'Partial capture stopped creating a Refund',
      baseline: 'no entry',
      blind: true,
    },
    {
      label: 'GET /v1/invoices/upcoming removed',
      baseline: 'reported',
      blind: false,
    },
    {
      label: 'payment_method_collection default flipped',
      baseline: 'no entry',
      blind: true,
    },
    {
      label: 'Checkout statement descriptor derives from the business name',
      baseline: 'no entry',
      blind: true,
    },
    {
      label: 'amount_paid now counts out-of-band payments',
      baseline: 'no entry',
      blind: true,
    },
  ] as BreakRow[],

  blindCaption:
    'The same baseline reported 18,901 breaking changes on these twenty-nine endpoints, 17,204 of them one enum rule. It does not hand a reader a green light to trust; it hands them a haystack, and six of the seven needles are not in it.',
} as const satisfies ProjectCardContent & {
  breaks: BreakRow[]
  blindCaption: string
}
