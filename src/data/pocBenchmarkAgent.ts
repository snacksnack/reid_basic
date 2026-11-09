// Content for the POC Benchmark Agent card (RC1-635).
// Source: github.com/snacksnack/poc-benchmark-agent (epic RC1-595), the
// pre-sales sizing project: profile a prospect's database workload, freeze
// success criteria with them, let Claude search a bounded space of compute
// sizes and indexes while Python measures, and score the answer on accounts
// the search never saw. Every figure below is quoted from docs/engagement.md
// in that repo, whose own test suite re-derives each one from the committed
// evidence.
//
// The run's answer was a refusal, so the card leads with that rather than a
// speedup. There is no supported "before" number to compute a delta from
// (today times out on most of the queries that matter), and quoting the best
// tested setup's gains would sell a configuration that fails to qualify.

import type { ProjectCardContent } from './projectCard'

// One row of the MiniCeiling visual: a query shape's errors and timeouts at
// 32 sessions, warm, today versus the strongest setup the space allows.
// Fractions, not percents.
export interface ShapeRow {
  label: string
  today: number
  best: number
}

const REPO = 'https://github.com/snacksnack/poc-benchmark-agent'
const SITE = 'https://snacksnack.github.io/poc-benchmark-agent/'

export const pocBenchmarkAgent = {
  name: 'POC Benchmark Agent',
  kicker: 'Database sizing',
  lead: "Sizes a customer's database, and says no when nothing fits.",
  tagline:
    "Takes a prospect's query log and dataset and answers the pre-sales question: what compute size and indexes hold their latency at their concurrency. Success criteria are frozen with the buyer before any experiment runs. Claude proposes configurations inside a fixed budget, Python measures each one, and the answer is scored on accounts the search never saw. The workload is synthetic and written by the person tuning it, so its traps were committed in advance.",
  note: 'Results mean performance at a fixed 8 or 32 sessions, not a sustained arrival rate. Only compute size and eight candidate indexes were in play; memory settings and extended statistics were not, and two of the three failing shapes need one of them. Every figure is Neon Postgres, whose deepest cache tier is invisible from the client.',
  result:
    "Refused to recommend: no setup in the agreed space met the 80 criteria frozen before the first experiment. At 32 sessions today's setup times out on 97% of daily reports. The strongest permitted setup, 4 CU with all eight candidate indexes, cleared the email lookup, funnel and timeline, and left three shapes failing 15 to 21% of calls against a 1% ceiling. Two experiments, $0.60 of model spend.",
  evals: {
    blurb:
      'Six cases per run, three billed: the real Claude proposer drives the real loop on two modeled workloads, one built to qualify and one built to refuse, beside checks on held-out isolation and report honesty. Also tracks how often a development interval covers the held-out value, which is 14 of 30 and stays red until fixed.',
    href: 'https://snacksnack.github.io/agent-evals/',
  },

  technologies: [
    'Python',
    'Claude API',
    'Neon Postgres',
    'psycopg',
    'GitHub Actions',
    'Datadog',
    'agent-evals',
  ],

  links: [
    { label: 'Engagement writeup ↗', href: SITE, primary: true },
    { label: 'Loop log ↗', href: `${SITE}loop-log.html` },
    { label: 'GitHub ↗', href: REPO },
  ],

  // docs/engagement.md, "Why it said no": today on held-out accounts, the
  // best setup from the development run the refusal was frozen from.
  shapes: [
    { label: 'Latest events per contact', today: 0.001, best: 0.0 },
    { label: 'Email lookup', today: 0.765, best: 0.0 },
    { label: 'Account timeline', today: 0.361, best: 0.0 },
    { label: 'Account contact list', today: 0.0, best: 0.001 },
    { label: 'Campaign funnel', today: 0.671, best: 0.0 },
    { label: 'Bounced contacts', today: 0.001, best: 0.0 },
    { label: 'Daily report', today: 0.968, best: 0.152 },
    { label: 'Segment preview', today: 0.211, best: 0.196 },
    { label: 'Campaign last-touch', today: 0.656, best: 0.208 },
  ] as ShapeRow[],
  ceiling: 0.01,

  ceilingCaption:
    'Errors and timeouts per query shape at 32 sessions. Today is measured on held-out accounts; the best setup is the development run the refusal was frozen from. Every failure was a 5-second timeout.',
} as const satisfies ProjectCardContent & {
  shapes: ShapeRow[]
  ceiling: number
  ceilingCaption: string
}
