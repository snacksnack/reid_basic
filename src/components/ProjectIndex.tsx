import { useState } from 'react'
import ProjectIndexRow from './ProjectIndexRow'
import MiniGantt from './MiniGantt'
import MiniDag from './visuals/MiniDag'
import MiniFunnel from './visuals/MiniFunnel'
import MiniReview from './visuals/MiniReview'
import MiniStageStrip from './visuals/MiniStageStrip'
import MiniBoard from './visuals/MiniBoard'
import MiniScorecard from './visuals/MiniScorecard'
import MiniTrend from './visuals/MiniTrend'
import { launchPlanner } from '../data/launchPlanner'
import { driftDetector } from '../data/driftDetector'
import { incidentSummarizer } from '../data/incidentSummarizer'
import { prReviewAgent } from '../data/prReviewAgent'
import { automationSuite } from '../data/automationSuite'
import { jobSearchAgent } from '../data/jobSearchAgent'
import { concertIntelligence } from '../data/concertIntelligence'
import { agentEvals } from '../data/agentEvals'
import type { ProjectCardContent } from '../data/projectCard'
import './ProjectIndex.css'

// The Projects section as one aligned index (RC1-216): hairline-separated rows,
// each a single scannable line, expanding in place onto the full detail.
// Replaces the stacked cards, which ran ~2,200px and offered nothing to compare
// across. Nothing is dropped — every tagline, visual, note, chip and link lives
// behind its row.
//
// RC1-226 moved the full index to its own page at /work and left a three-row
// teaser on the résumé, so the same component renders in two lengths.

interface Entry {
  id: string
  content: ProjectCardContent
  visual: React.ReactNode
  teaser?: boolean // also shown in the homepage's short index
}

const ENTRIES: Entry[] = [
  {
    id: 'launch-planner',
    content: launchPlanner,
    visual: <MiniGantt tasks={launchPlanner.gantt} compact />,
    teaser: true,
  },
  // Directly under the flagship on purpose: the harness that measures five of
  // the rows on this page, promoted so the grading shows before the graded.
  {
    id: 'agent-evals',
    content: agentEvals,
    visual: <MiniTrend series={agentEvals.series} caption={agentEvals.trendCaption} />,
  },
  {
    id: 'drift',
    content: driftDetector,
    visual: <MiniDag chains={driftDetector.chains} />,
  },
  {
    id: 'incident',
    content: incidentSummarizer,
    visual: (
      <MiniFunnel
        sources={incidentSummarizer.sources}
        collapse={incidentSummarizer.collapse}
        incident={incidentSummarizer.incident}
      />
    ),
    teaser: true,
  },
  {
    id: 'pr-agent',
    content: prReviewAgent,
    visual: (
      <MiniReview
        summary={prReviewAgent.reviewSummary}
        findings={prReviewAgent.findings}
        verdict={prReviewAgent.verdict}
      />
    ),
    teaser: true,
  },
  {
    id: 'job-scout',
    content: jobSearchAgent,
    visual: (
      <MiniBoard
        roles={jobSearchAgent.roles}
        sortNote={jobSearchAgent.boardSortNote}
        caption={jobSearchAgent.boardCaption}
      />
    ),
  },
  {
    id: 'automation',
    content: automationSuite,
    visual: <MiniStageStrip stages={automationSuite.stages} />,
  },
  {
    id: 'concert',
    content: concertIntelligence,
    visual: (
      <MiniScorecard
        show={concertIntelligence.show}
        dimensions={concertIntelligence.dimensions}
        caption={concertIntelligence.scoreCaption}
      />
    ),
  },
]

// The thesis line counts the systems rather than hardcoding a number, so adding
// an entry can't leave the copy claiming the wrong total.
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n)
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// The flagship opens on load; the rest start closed. Keyed off the data's own
// `flagship` flag rather than a hardcoded id.
const initialOpen = (entries: Entry[]) =>
  Object.fromEntries(entries.map((e) => [e.id, Boolean(e.content.flagship)]))

interface ProjectIndexProps {
  // The résumé's short index: the three teaser rows plus a link out to /work,
  // instead of the full index with an expand-all control.
  teaser?: boolean
}

export default function ProjectIndex({ teaser = false }: ProjectIndexProps) {
  const entries = teaser ? ENTRIES.filter((e) => e.teaser) : ENTRIES
  const [open, setOpen] = useState<Record<string, boolean>>(() => initialOpen(entries))

  const allOpen = entries.every((e) => open[e.id])
  const total = ENTRIES.length

  const toggle = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }))
  const toggleAll = () =>
    setOpen(Object.fromEntries(entries.map((e) => [e.id, !allOpen])))

  return (
    <>
      <div className="pi-thesis-row">
        <p className="pi-thesis">
          {capitalize(numberWord(total))} shipped systems on one thesis:{' '}
          <em>the model proposes, deterministic code decides, a human approves.</em>{' '}
          {teaser
            ? `${capitalize(numberWord(entries.length))} of them below.`
            : 'Each row opens onto how it works.'}
        </p>
        {!teaser && (
          <button type="button" className="pi-all" onClick={toggleAll}>
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>

      <div className="pi-index">
        {entries.map((e) => (
          <ProjectIndexRow
            key={e.id}
            id={e.id}
            content={e.content}
            open={Boolean(open[e.id])}
            onToggle={() => toggle(e.id)}
          >
            {e.visual}
          </ProjectIndexRow>
        ))}
      </div>

      {teaser && (
        <p className="pi-more-row">
          <a className="pi-more" href="/work">
            See all {numberWord(total)} projects →
          </a>
        </p>
      )}
    </>
  )
}
