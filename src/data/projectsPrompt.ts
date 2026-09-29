// Renders the nine /work project data files into the plain-text RAG corpus
// (projects-prompt.txt) the chatbot indexes alongside the resume (RC1-478).
//
// The TS files under src/data/ are the single source of truth for the /work
// index and the overview pages; this module walks their exported content
// objects generically rather than naming per-project fields, so a new field
// (or a new project added to PROJECTS below) flows into the corpus without
// touching the renderer. `npm run extract:projects` writes the file;
// tests/projectsPrompt.test.ts fails CI when the committed text goes stale.
//
// Output contract, relied on by app.py's _chunk_projects: every blank-line-
// separated paragraph is one self-contained chunk whose first line is
// "Project: <name> [<slug>]" or "Project: <name> — <aspect> [<slug>]".

import { launchPlanner } from './launchPlanner'
import { driftDetector } from './driftDetector'
import { incidentSummarizer } from './incidentSummarizer'
import { prReviewAgent } from './prReviewAgent'
import { automationSuite } from './automationSuite'
import { jobSearchAgent } from './jobSearchAgent'
import { concertIntelligence } from './concertIntelligence'
import { agentEvals } from './agentEvals'
import { fleetObservability } from './fleetObservability'

export const PROJECTS: ReadonlyArray<{ slug: string; content: Record<string, unknown> }> = [
  { slug: 'launch-planner', content: launchPlanner },
  { slug: 'drift-detector', content: driftDetector },
  { slug: 'incident-summarizer', content: incidentSummarizer },
  { slug: 'pr-review-agent', content: prReviewAgent },
  { slug: 'automation-suite', content: automationSuite },
  { slug: 'job-search-agent', content: jobSearchAgent },
  { slug: 'concert-intelligence', content: concertIntelligence },
  { slug: 'agent-evals', content: agentEvals },
  { slug: 'fleet-observability', content: fleetObservability },
]

// Card/overview fields folded into the single overview paragraph, in this
// order. Everything else on the object becomes its own aspect paragraph.
const OVERVIEW_KEYS = [
  'name',
  'kicker',
  'lead',
  'tagline',
  'principle',
  'note',
  'result',
  'technologies',
  'evals',
  'demoUrl',
  'repoUrl',
  'links',
] as const

// Presentation-only fields with no retrievable facts.
const SKIP_KEYS = new Set(['flagship', 'overviewPath'])

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Chunks are split on blank lines, so no rendered value may contain one.
const collapseBlankLines = (s: string) => s.replace(/\n{2,}/g, '\n').trim()

const renderScalar = (v: unknown): string => collapseBlankLines(String(v))

// One line per item: "Label — k: v; k: v". The leading key is whichever
// naming field the item carries; the rest keep their key names so the line
// stays meaningful for shapes this module has never seen.
const NAMING_KEYS = ['title', 'label', 'name', 'rule', 'key']

function renderItem(item: unknown): string {
  if (!isPlainObject(item)) {
    return Array.isArray(item) ? item.map(renderScalar).join(', ') : renderScalar(item)
  }
  const entries = Object.entries(item).filter(([, v]) => v !== undefined && v !== null)
  const namingKey = NAMING_KEYS.find((k) => typeof item[k] === 'string')
  const head = namingKey ? String(item[namingKey]) : ''
  const rest = entries
    .filter(([k]) => k !== namingKey)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: ${v.map(renderItem).join(v.every(isPlainObject) ? ' | ' : ', ')}`
      if (isPlainObject(v)) return `${k}: ${renderItem(v)}`
      return `${k}: ${renderScalar(v)}`
    })
    .join('; ')
  return head && rest ? `${head} — ${rest}` : head || rest
}

function renderAspectBody(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.every((v) => !isPlainObject(v))) return value.map(renderScalar).join(', ')
    return value.map((v) => `- ${renderItem(v)}`).join('\n')
  }
  if (isPlainObject(value)) {
    return Object.entries(value)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}: ${renderItem(v)}`)
      .join('\n')
  }
  return renderScalar(value)
}

function renderOverview(slug: string, content: Record<string, unknown>): string {
  const lines: string[] = [`Project: ${content.name} [${slug}]`]
  if (content.kicker) lines.push(`Category: ${renderScalar(content.kicker)}`)
  if (content.lead) lines.push(renderScalar(content.lead))
  if (content.tagline) lines.push(renderScalar(content.tagline))
  const principle = content.principle ?? content.note
  if (principle) lines.push(`Design principle: ${renderScalar(principle)}`)
  if (content.note && content.principle && content.note !== content.principle)
    lines.push(`Note: ${renderScalar(content.note)}`)
  if (content.result) lines.push(`Headline result: ${renderScalar(content.result)}`)
  if (Array.isArray(content.technologies))
    lines.push(`Technologies: ${content.technologies.map(renderScalar).join(', ')}`)
  if (isPlainObject(content.evals) && content.evals.blurb)
    lines.push(`Continuous evals: ${renderScalar(content.evals.blurb)}`)
  if (content.demoUrl) lines.push(`Live demo: ${renderScalar(content.demoUrl)}`)
  if (content.repoUrl) lines.push(`Repository: ${renderScalar(content.repoUrl)}`)
  if (Array.isArray(content.links)) {
    const links = content.links
      .filter(isPlainObject)
      .map((l) => `${renderScalar(l.label).replace(/\s*[→↗]\s*$/, '')}: ${renderScalar(l.href)}`)
    if (links.length) lines.push(`Links: ${links.join('; ')}`)
  }
  return lines.join('\n')
}

// An aspect paragraph longer than this is split into one paragraph per item,
// each repeating the header, so no single chunk overwhelms retrieval.
const MAX_ASPECT_CHARS = 2000

function renderAspects(slug: string, content: Record<string, unknown>): string[] {
  const paragraphs: string[] = []
  const overviewKeys = new Set<string>(OVERVIEW_KEYS)
  for (const [key, value] of Object.entries(content)) {
    if (overviewKeys.has(key) || SKIP_KEYS.has(key)) continue
    if (value === undefined || value === null) continue
    const header = `Project: ${content.name} — ${key} [${slug}]`
    const body = renderAspectBody(value)
    if (!body) continue
    if (body.length > MAX_ASPECT_CHARS && Array.isArray(value) && value.every(isPlainObject)) {
      for (const item of value) paragraphs.push(`${header}\n- ${renderItem(item)}`)
    } else {
      paragraphs.push(`${header}\n${body}`)
    }
  }
  return paragraphs
}

// The catalog chunk answers corpus-level enumeration questions ("what other
// projects does he have?") that top-k retrieval over per-project chunks
// cannot (RC1-479). app.py also lifts this paragraph into the chat system
// prompt so the full roster is always in context; its slug is reserved.
export const CATALOG_SLUG = 'portfolio'

function renderCatalog(): string {
  const lines = [
    `Project: Reid Collins's project portfolio [${CATALOG_SLUG}]`,
    `All ${PROJECTS.length} personal engineering projects on the /work page (hihelloreid.com/work):`,
  ]
  for (const { slug, content } of PROJECTS) {
    lines.push(`- ${content.name} [${slug}]: ${renderScalar(content.lead)}`)
  }
  return lines.join('\n')
}

export function renderProjectsPrompt(): string {
  const paragraphs: string[] = [renderCatalog()]
  for (const { slug, content } of PROJECTS) {
    paragraphs.push(renderOverview(slug, content))
    paragraphs.push(...renderAspects(slug, content))
  }
  return paragraphs.join('\n\n') + '\n'
}
