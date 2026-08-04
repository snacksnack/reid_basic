// Shared shape for the Projects index rows (RC1-216). Each project's data file
// exports one of these plus whatever its own visual needs; ProjectIndex renders
// all five — flagship included — through the same row component.

export interface ProjectLink {
  label: string
  href: string
  primary?: boolean // rendered in the accent style
  internal?: boolean // same-origin route; must not open in a new tab
}

export interface ProjectCardContent {
  name: string
  kicker: string
  lead: string // the one-line index lead: what the thing is, in one breath
  tagline: string // the full thesis, shown verbatim in the expanded panel
  note?: string // the design principle, shown under the visual
  technologies: readonly string[]
  links: readonly ProjectLink[]
  flagship?: boolean // accent kicker + open on load
}
