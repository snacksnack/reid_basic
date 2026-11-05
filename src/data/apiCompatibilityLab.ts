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

export const apiCompatibilityLab = {
  name: 'API Compatibility Lab',
  kicker: 'API upgrades',
  status: 'In progress',
  lead: 'Replays captured traffic across two API versions to find the breaks a schema diff misses.',
  tagline:
    'An OpenAPI diff catches removed fields and changed types. It is blind to a changed default, a field that became nullable in practice, a pagination boundary shift, a different error code under the same HTTP status. Each of those breaks working integration code while the diff reports green. So this captures a customer’s own traffic, sanitizes it for storage, replays the identical requests against both versions, and compares canonical responses. Every surviving difference is classified, mapped onto the workflows and the exact field reads it affects, and compiled into a test that passes on the old version and fails on the new one. Goes beyond schema comparison to find the changes that actually break customer applications. Phases 0 through 7 are built and the captured corpus reaches six of the eight documented breaks in the inventory, the last two each needing something a bare test-mode sandbox cannot do, so this is an argument that holds rather than a finished tool.',
  note: 'Four gates refuse to publish rather than caveat: no false-break rate while a finding lacks a hand verdict, no precision while a claim is unconfirmed, no pass-fail count while a pin is uncertified, and no corpus that still holds a credential. Two of the eight documented breaks are unexercised by this traffic, and they are reported as unexercised, never as passed.',
  result:
    'Caught 6 of the 6 documented behavioral breaks the corpus exercises. The schema-diff baseline gave no usable warning on five of them, four with no entry at all and one naming the field but not the behavior, while reporting 17,495 breaking changes on the same twenty-seven endpoints. 0 false breaks over 62 breaking findings, and 19 of 19 generated tests pass on the old version and fail on the new one.',
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
    { label: 'Engagement writeup ↗', href: `${REPO}/blob/main/docs/engagement.md`, primary: true },
    { label: 'Impact report ↗', href: `${REPO}/blob/main/docs/impact-report.md` },
    { label: 'GitHub ↗', href: REPO },
  ],

  // The six documented breaks this corpus exercises, with the baseline's
  // verdict on each, exactly as docs/behavioral-diff-report.md records it:
  // four green, one named-only, one reported. The last two arrived with the
  // RC1-618 capture, and both are fully green: the schema diff reports the
  // half that moved a field and says nothing about the half that moved a
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
      label: 'amount_paid now counts out-of-band payments',
      baseline: 'no entry',
      blind: true,
    },
  ] as BreakRow[],

  blindCaption:
    'The same baseline reported 17,495 breaking changes on these twenty-seven endpoints, 15,916 of them one enum rule. It does not hand a reader a green light to trust; it hands them a haystack, and five of the six needles are not in it.',
} as const satisfies ProjectCardContent & {
  breaks: BreakRow[]
  blindCaption: string
}
