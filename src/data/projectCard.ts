// Shared shape for the Projects index rows (RC1-216). Each project's data file
// exports one of these plus whatever its own visual needs; ProjectIndex renders
// all five — flagship included — through the same row component.

export interface ProjectLink {
  label: string
  href: string
  primary?: boolean // rendered in the accent style
  internal?: boolean // same-origin route; must not open in a new tab
}

// The continuous-eval line a row carries once the system runs under the shared
// agent-evals harness (RC1-266): what the suite measures for this subject.
// Every one links the same public quality trend page.
export interface ProjectEvals {
  blurb: string
  href: string
}

export interface ProjectCardContent {
  name: string
  kicker: string
  lead: string // the one-line index lead: what the thing is, in one breath
  tagline: string // the full thesis, shown verbatim in the expanded panel
  note?: string // the design principle, shown under the visual
  evals?: ProjectEvals
  technologies: readonly string[]
  links: readonly ProjectLink[]
  flagship?: boolean // accent kicker + open on load
}

// The extra fields a project carries when it has a self-hosted overview page
// (Launch Planner, Incident Summarizer). Both pages read all four the same way;
// index-only projects omit the interface entirely.
export interface ProjectOverviewContent {
  principle: string // the hero line — the index row shows `note` instead
  overviewPath: string
  demoUrl: string
  repoUrl: string
}
