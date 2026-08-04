import { useState } from 'react'
import ProjectIndexRow from './ProjectIndexRow'
import MiniGantt from './MiniGantt'
import MiniDag from './visuals/MiniDag'
import MiniFunnel from './visuals/MiniFunnel'
import MiniReview from './visuals/MiniReview'
import MiniStageStrip from './visuals/MiniStageStrip'
import { launchPlanner } from '../data/launchPlanner'
import { driftDetector } from '../data/driftDetector'
import { incidentSummarizer } from '../data/incidentSummarizer'
import { prReviewAgent } from '../data/prReviewAgent'
import { automationSuite } from '../data/automationSuite'
import type { ProjectCardContent } from '../data/projectCard'
import './ProjectIndex.css'

// The Projects section as one aligned index (RC1-216): five hairline-separated
// rows, each a single scannable line, expanding in place onto the full detail.
// Replaces the five stacked cards, which ran ~2,200px and offered nothing to
// compare across. Nothing is dropped — every tagline, visual, note, chip and
// link lives behind its row.

interface Entry {
  id: string
  content: ProjectCardContent
  visual: React.ReactNode
}

const ENTRIES: Entry[] = [
  {
    id: 'launch-planner',
    content: launchPlanner,
    visual: <MiniGantt tasks={launchPlanner.gantt} compact />,
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
  },
  {
    id: 'automation',
    content: automationSuite,
    visual: <MiniStageStrip stages={automationSuite.stages} />,
  },
]

// The flagship opens on load; the rest start closed. Keyed off the data's own
// `flagship` flag rather than a hardcoded id.
const initialOpen = () =>
  Object.fromEntries(ENTRIES.map((e) => [e.id, Boolean(e.content.flagship)]))

export default function ProjectIndex() {
  const [open, setOpen] = useState<Record<string, boolean>>(initialOpen)

  const allOpen = ENTRIES.every((e) => open[e.id])

  const toggle = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }))
  const toggleAll = () =>
    setOpen(Object.fromEntries(ENTRIES.map((e) => [e.id, !allOpen])))

  return (
    <>
      <div className="pi-thesis-row">
        <p className="pi-thesis">
          Five shipped systems on one thesis:{' '}
          <em>the model proposes, deterministic code decides, a human approves.</em> Each row
          opens onto how it works.
        </p>
        <button type="button" className="pi-all" onClick={toggleAll}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <div className="pi-index">
        {ENTRIES.map((e) => (
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
    </>
  )
}
