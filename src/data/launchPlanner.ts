// Content for the Launch Planner project — the source of truth shared by the
// homepage index row (ProjectIndex) and the self-hosted overview page
// (LaunchPlannerPage). Ported from the RC1-204 quick-start into the site's own
// voice; no claude.ai dependency. (RC1-206, reshaped in RC1-216)

import type { ProjectCardContent, ProjectOverviewContent } from './projectCard'

export interface GanttTask {
  name: string
  start: number // in working-day units
  span: number
  critical: boolean
}

export interface PipelineStage {
  key: string
  label: string
  blurb: string
}

export interface Surface {
  name: string
  blurb: string
}

export interface Principle {
  title: string
  blurb: string
}

export const launchPlanner = {
  name: 'Launch Planner',
  kicker: 'Flagship project',
  lead: 'An agentic delivery planner for migrations and launches.',
  tagline:
    'An agentic planner for migrations and launches: a PRD goes in, a defensible delivery plan comes out — critical-path schedule, risk log, and exec status — with a first-class audit trail.',
  principle: 'The LLM proposes; deterministic Python validates; a human approves.',
  // The index row shows `note`; the overview page still reads `principle`.
  note: 'The LLM proposes; deterministic Python validates; a human approves.',
  flagship: true,

  overviewPath: '/projects/launch-planner',
  demoUrl: 'https://planner.hihelloreid.com',
  repoUrl: 'https://github.com/snacksnack/launch-planner-agent',

  // The same three destinations the retired card offered, as index-row links.
  links: [
    { label: 'Overview →', href: '/projects/launch-planner', primary: true, internal: true },
    { label: 'Live demo ↗', href: 'https://planner.hihelloreid.com' },
    { label: 'GitHub ↗', href: 'https://github.com/snacksnack/launch-planner-agent' },
  ],

  technologies: ['Python', 'FastAPI', 'Pydantic', 'Claude API', 'CPM / Monte Carlo', 'Vite'],

  // An illustrative slice of the flagship plan (On-Prem Jira → Jira Cloud), with
  // the critical path highlighted. Not the full 23-task plan — enough to read.
  gantt: [
    { name: 'Inventory & audit', start: 0, span: 4, critical: true },
    { name: 'Plugin compatibility audit', start: 3, span: 5, critical: false },
    { name: 'Provision Jira Cloud', start: 4, span: 6, critical: false },
    { name: 'Set up migration tooling', start: 4, span: 5, critical: true },
    { name: 'Pilot-migrate 2 projects', start: 9, span: 4, critical: true },
    { name: 'Validate pilot data', start: 13, span: 3, critical: true },
    { name: 'Bulk-migrate 18 projects', start: 16, span: 12, critical: true },
    { name: 'Production cutover', start: 28, span: 3, critical: true },
  ] as GanttTask[],

  pipeline: [
    { key: 'prd', label: 'PRD', blurb: 'A spec, team, and constraints go in.' },
    { key: 'breakdown', label: 'Work breakdown', blurb: 'Agent drafts epics + tasks, each with a cited quote.' },
    { key: 'deps', label: 'Dependencies', blurb: 'Agent proposes edges; Python drops the invalid ones.' },
    { key: 'schedule', label: 'Schedule', blurb: 'Deterministic CPM: float, critical path, deadlines.' },
    { key: 'whatif', label: 'What-if & forecast', blurb: 'Slip simulator + a Monte Carlo confidence band.' },
    { key: 'raid', label: 'RAID', blurb: 'Risks/assumptions/issues/decisions, evidence-backed.' },
    { key: 'status', label: 'Status', blurb: 'A weekly exec update — health set by rule, not the LLM.' },
    { key: 'jira', label: 'Jira', blurb: 'Generates tickets behind an explicit approval gate.' },
  ] as PipelineStage[],

  surfaces: [
    { name: 'Gantt', blurb: 'Interactive timeline with the critical path outlined.' },
    { name: 'Decisions', blurb: 'What the agents proposed vs. what Python dropped, cut, or flagged.' },
    { name: 'RAID', blurb: 'The risk log, sorted by severity, each item evidence-backed.' },
    { name: 'Simulate', blurb: 'Compose a what-if; the schedule recomputes over a ghost baseline.' },
    { name: 'Forecast', blurb: 'Monte Carlo the launch date: P50/P80/P90 + a criticality index.' },
    { name: 'Baseline', blurb: 'Drift of the current plan against the committed baseline.' },
    { name: 'Status', blurb: 'The weekly update, with a rule-set health badge.' },
    { name: 'Jira', blurb: 'Preview the tickets a run would create — gated, never auto-written.' },
  ] as Surface[],

  principles: [
    {
      title: 'Provenance is the spine',
      blurb:
        'Every agent-produced entity carries why it was proposed, the verbatim PRD quote, the model and timestamp, and a confidence. A plan cannot be built without it.',
    },
    {
      title: 'Deterministic math, not a black box',
      blurb:
        'The critical-path scheduling, float, and Monte Carlo run in pure Python — inspectable and unit-tested. Hallucinated dependencies can never reach the schedule.',
    },
    {
      title: 'Side effects are gated',
      blurb:
        'Jira writes and status emails happen only behind an explicit human approval step. The web demo is read-only by construction.',
    },
  ] as Principle[],
} as const satisfies ProjectCardContent & ProjectOverviewContent & {
  gantt: GanttTask[]
  pipeline: PipelineStage[]
  surfaces: Surface[]
  principles: Principle[]
}
