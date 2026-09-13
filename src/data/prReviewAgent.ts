// Content for the PR Review Agent — the source of truth shared by the /work
// index row (ProjectIndex) and the self-hosted overview page
// (PrReviewAgentPage, RC1-412). Source: github.com/snacksnack/pr_agent
// (epic RC1-106).
//
// RC1-410 rewrote the card. It described the single tool-calling loop that
// RC1-387 → RC1-394 replaced; production has run the pipeline since
// 2026-09-07, and the RC1-421..429 sequence made it the only path. Every
// figure below traces to a decision record in the repository's docs/ — the
// `record` on each decision is the file it came from.

import type { ProjectCardContent, ProjectOverviewContent } from './projectCard'

export type FindingSeverity = 'high' | 'medium' | 'low'

export interface ReviewFinding {
  severity: FindingSeverity
  location: string // file:line, as GitHub anchors it
  category: string
  message: string
}

// Who does the work at a stage: the thesis of the system, drawn rather than
// stated. Python stages decide; model stages judge.
export type StageActor = 'python' | 'model'

export interface ReviewerBranch {
  name: string
  evidence: string // the one kind of evidence this reviewer reads
}

export interface PipelineStage {
  key: string
  label: string
  blurb: string
  actor: StageActor
  // The fan-out: three reviewers on one cached prefix. Only one stage has it.
  branches?: readonly ReviewerBranch[]
}

// One row of a decision's measurement table.
export interface Measure {
  label: string
  value: string
}

export interface Decision {
  key: string
  title: string
  question: string // what had to be decided, in one breath
  method: string // how it was measured
  measures: readonly Measure[]
  verdict: string // the decision, with the number it turned on
  record: string // the decision record in docs/, relative to repoUrl
  ticket: string
}

const REPO = 'https://github.com/snacksnack/pr_agent'

export const prReviewAgent = {
  name: 'PR Review Agent',
  kicker: 'Code review',
  lead: 'Reviews every PR on an account, at a tenth of the cost.',
  tagline:
    'A GitHub App that reviews every pull request opened across an account — including repositories that do not exist yet. Python plans each review and hands the agents the context they would otherwise pay to explore for. Three reviewers, scoped by the kind of evidence a finding needs, share one cached prefix and call no tools. A verifier checks every finding against the diff before one review is posted — advisory unless a secret was committed.',
  principle:
    'Python plans the review and gathers the evidence; three reviewers judge one cached prefix; a verifier checks every finding against the diff.',
  // The index row shows `note`; the overview page reads `principle`.
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

  overviewPath: '/projects/pr-review-agent',
  // A GitHub App has no demo page; the demo is a review it posted. PR #60
  // (durable jobs, RC1-423) carries the summary comment and five inline
  // findings, all public.
  demoUrl: `${REPO}/pull/60`,
  repoUrl: REPO,

  links: [
    { label: 'Overview →', href: '/projects/pr-review-agent', primary: true, internal: true },
    { label: 'GitHub ↗', href: REPO },
  ],

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

  // The pipeline as it runs today (app/agent/pipeline.py after RC1-425 and
  // RC1-427): checks → context → warm cache → reviewers → merge → verifier →
  // assemble, with the webhook's job store in front and posting behind. The
  // scout that once sat between context and the reviewers was measured and
  // removed (RC1-427) — see the cost decision below.
  pipeline: [
    {
      key: 'job',
      label: 'Webhook → job',
      actor: 'python',
      blurb:
        'The delivery is on disk before GitHub gets its 202. A worker runs it with bounded retries and recovers anything a restart interrupted.',
    },
    {
      key: 'router',
      label: 'Router',
      actor: 'python',
      blurb:
        'Which reviewers run, decided from the file list. A docs-only change gets no repository context; a manifest change adds dependency review.',
    },
    {
      key: 'checks',
      label: 'Deterministic checks',
      actor: 'python',
      blurb:
        'The n8n execution-cost check reads each changed workflow whole. Its findings go into the prefix as already recorded, so no reviewer repeats them.',
    },
    {
      key: 'context',
      label: 'Context by grep',
      actor: 'python',
      blurb:
        'The conventions file, callers of every changed symbol, and tests for the changed paths — found by grep, into one shared prefix.',
    },
    {
      key: 'warm',
      label: 'Warm the cache',
      actor: 'model',
      blurb:
        'A one-token call writes the prefix first, so the three reviewers read it from cache instead of each writing it.',
    },
    {
      key: 'reviewers',
      label: 'Three reviewers',
      actor: 'model',
      blurb:
        'Fanned out on the cached prefix, no tools. Each may raise only the categories its evidence supports; anything else is discarded by the merge.',
      branches: [
        { name: 'diff-local', evidence: 'the hunk alone' },
        { name: 'repo-context', evidence: 'the hunk plus the repository' },
        { name: 'change-intent', evidence: 'the hunk plus what the PR says it is' },
      ],
    },
    {
      key: 'merge',
      label: 'Merge',
      actor: 'python',
      blurb:
        'Off-scope findings dropped and counted; same file, line and category folded to the more severe; the summary leads with the most serious finding.',
    },
    {
      key: 'verifier',
      label: 'Verifier',
      actor: 'model',
      blurb:
        'Re-reads the merged findings against the same prefix and may drop or downgrade, never add. Python applies the verdicts under rules the model cannot override.',
    },
    {
      key: 'post',
      label: 'Post',
      actor: 'python',
      blurb:
        'One summary comment plus inline findings, priced and traced. Advisory unless a secret was committed.',
    },
  ] as PipelineStage[],

  decisions: [
    {
      key: 'langgraph',
      title: 'LangGraph, evaluated and declined',
      ticket: 'RC1-391',
      question:
        'Should the fan-out run on an orchestration framework? The graph is fixed — plan, context, warm, three reviewers, merge, verify — and finishes in one shot from a webhook, which plain asyncio wrote in about forty lines.',
      method:
        'The same graph ported unchanged to LangGraph, nodes calling the Anthropic SDK directly so cache placement stayed identical. Measured on the 16-case corpus and three live PRs at their own heads, the same evening, ordered so no run could read another’s prompt cache.',
      measures: [
        { label: 'Corpus cost, asyncio vs LangGraph', value: '$0.709 vs $0.705' },
        { label: 'Recall, planted defects', value: '13 / 13 on both' },
        { label: 'Reviewers reading the prefix from cache', value: '16 / 16 cases on both' },
        { label: 'Framework overhead per review', value: '0.6 ms vs 2.8 ms offline; 7–13 ms live' },
        { label: 'Dependencies added', value: '0 vs 22 packages, 26.9 MB' },
        { label: 'Unexplained hangs', value: '0 in 96 asyncio cases; 1 in 3 LangGraph corpus runs' },
      ],
      verdict:
        'Production stays on asyncio. Same cost to the cent, same cache behaviour to the token, quality inside the run-to-run band, and 22 packages for what asyncio.gather already did. Pause-and-resume before the verifier worked in thirty lines and is the one thing plain Python could not do as cheaply — the day a human has to approve a step mid-run, that is where the framework earns its place. The port was deleted once the question was answered; the record stands.',
      record: 'docs/rc1-391-langgraph-spike.md',
    },
    {
      key: 'tiebreak',
      title: 'The verifier’s tie-break is positional, so no rule',
      ticket: 'RC1-398',
      question:
        'Three reviewers file one defect under two categories; the verifier keeps one. Three records in a row said “right defect, wrong category survived”. Should a preference order between categories be written down?',
      method:
        'Eleven boundary cases — one defect that legitimately fits two rubric dimensions — with the pair handed to the verifier in both orders, five times each. Then the whole pipeline on the same cases, three runs. Then the same probe with a candidate instruction sentence.',
      measures: [
        { label: 'Verifier kept both findings', value: '72 of 110 calls' },
        { label: 'Of the 38 decided, the first-listed won', value: '28 (74%)' },
        { label: 'Why: the merge lists reviewers in plan order', value: 'diff-local’s categories always sat first' },
        { label: 'Candidate sentence — both kept', value: '72 → 10' },
        { label: 'Candidate sentence — first-listed still won', value: '78%' },
        { label: 'Spend', value: '$2.10 across 256 calls' },
      ],
      verdict:
        'No category preference order. The data showed a position preference, not a category one, and a rule between convention and docs would have encoded an artifact of the plan’s reviewer order — reversing the order would move the same misses onto the other reviewers. The candidate sentence folds duplicates without choosing between them, so it shipped later for the fold only (RC1-428: 100 of 110 pairs fold), never for the label.',
      record: 'docs/rc1-398-category-tiebreak.md',
    },
    {
      key: 'cost',
      title: 'From 48¢–$1.10 a review to 6–21¢, and how the projection was wrong',
      ticket: 'RC1-387 → 390 → 393 → 394 → 427',
      question:
        'The single tool-calling loop explored and judged in one conversation. Could three specialists be had for the price of one loop — and what did it actually cost to let a model explore?',
      method:
        'The same three merged PRs of the repository, each reviewed at its own head under every configuration, verifier on, findings counted after it. The corpus alone could not answer: its diffs name files that exist nowhere, so the loop never explored there.',
      measures: [
        { label: 'Single loop, 20-turn cap (PRs #35 / #33 / #39)', value: '48.3¢ / 70.0¢ / $1.10 — 96–110 s' },
        { label: 'Three reviewers + an 8-turn scout (RC1-390)', value: '25.6¢ / 45.8¢ / 62.2¢' },
        { label: '+ conventions and callers by Python, scout cut to 3 turns (RC1-393)', value: '17.9¢ / 31.0¢ / 44.7¢' },
        { label: '+ tests by Python, scout skipped (RC1-394)', value: '5.5¢ / 12.9¢ / 20.3¢' },
        { label: 'Scout removed after a four-arm measurement (RC1-427)', value: '6.5¢ / 12.2¢ / 17.6¢, recall 13 / 13 on every arm' },
        { label: 'Production, the week after the switch (RC1-422)', value: '35 reviews, p50 3.7¢ and 13 s, was 38.7¢ and 123 s' },
      ],
      verdict:
        'Python assembles the context the agent would otherwise pay to discover, and the model’s exploration budget shrank to zero as that context became complete. RC1-390 had projected the opposite — that the split would cost two to three times the loop — because the corpus is diff-only and never let the loop run to its cap; on a real PR it read to its 20-turn cap every time. The scout that remained was then measured against a threshold declared before the runs: it found no defect the review otherwise missed, and its only warnings on the reference PRs were false. Removed.',
      record: 'docs/rc1-393-cheap-exploration.md',
    },
    {
      key: 'conventions',
      title: 'A conventions file is the cheapest lever, and the trap in proving it',
      ticket: 'RC1-396',
      question:
        'The two n8n repositories were the most expensive reviews in the estate: no conventions file, so the context was never complete and the scout ran its full cap. A page in each repository, or a router rule?',
      method:
        'The same PR at the same head, twice: once as it was, once with the working-tree CLAUDE.md laid over the worktree first, a five-minute gap between so neither run read the other’s cache.',
      measures: [
        { label: 'Concert workflow PR, before → after', value: '28.3¢ / 61 s → 8.5¢ / 19 s' },
        { label: 'Status-email PR, before → after', value: '9.3¢ / 36 s → 3.0¢ / 5 s' },
        { label: 'What the scout had been', value: '63–67% of each review' },
        { label: 'The named finding still found', value: 'parent_id set to the string “undefined”, without a brief' },
        { label: 'Page size that reaches the prefix uncut', value: 'under 6,000 characters, sections ranked' },
      ],
      verdict:
        'The file, not the router rule: a page costs nothing in the agent, and the rule would change every repository’s review and need its own corpus run. Every repository the App reviews now carries one. The trap: a docs-only PR skips repository context by design, so the PR that adds a conventions file can never demonstrate its own fix — the proof is the first code PR after it merges, whose log reads complete=True with no exploration.',
      record: 'docs/rc1-396-conventions-files.md',
    },
  ] as Decision[],
} as const satisfies ProjectCardContent &
  ProjectOverviewContent & {
    reviewSummary: string
    findings: ReviewFinding[]
    verdict: string
    pipeline: PipelineStage[]
    decisions: Decision[]
  }
