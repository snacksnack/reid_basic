import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ProjectIndex from '../src/components/ProjectIndex'
import ProjectIndexRow from '../src/components/ProjectIndexRow'
import { apiCompatibilityLab } from '../src/data/apiCompatibilityLab'
import { pocBenchmarkAgent } from '../src/data/pocBenchmarkAgent'

// The Projects section is an aligned index that expands in place (RC1-216),
// rendered full at /work and as a three-row teaser on the résumé (RC1-226).

const ALL_NAMES = [
  'Launch Planner',
  'Dependency Drift Detector',
  'AI Incident Summarizer',
  'PR Review Agent',
  'Job Scout',
  'TPM Workflow Automation',
  'Concert Intelligence Agent',
  'Agent Evals',
  'Fleet Observability',
  'ESP Migration Agent',
  'API Compatibility Lab',
  'POC Benchmark Agent',
]

const rowButton = (name: string | RegExp) =>
  screen.getByRole('button', { name: typeof name === 'string' ? new RegExp(name) : name })

// The status chip, tested on a synthetic row rather than on a real project.
// Asserting it against whichever card currently carries a status is how the
// last version of these tests broke the moment one stopped: which project is
// in that state is supposed to change, the mechanism is not.
describe('ProjectIndexRow status chip', () => {
  const content = {
    name: 'Fixture System',
    kicker: 'fixtures',
    lead: 'A row that exists only for this test.',
    tagline: 'Tagline.',
    technologies: ['TypeScript'],
    links: [],
  } as unknown as Parameters<typeof ProjectIndexRow>[0]['content']

  const renderRow = (status?: string) =>
    render(
      <ProjectIndexRow
        id="fixture"
        content={{ ...content, ...(status ? { status } : {}) }}
        open={false}
        onToggle={() => {}}
      >
        <div />
      </ProjectIndexRow>,
    )

  it('renders the status as a chip when a row declares one', () => {
    renderRow('Still cooking')
    expect(document.querySelector('.pi-status')!.textContent).toBe('Still cooking')
  })

  it('renders no chip when a row declares none', () => {
    renderRow()
    expect(document.querySelector('.pi-status')).toBeNull()
  })
})

describe('ProjectIndex', () => {
  it('lists every project as a row, flagship first', () => {
    render(<ProjectIndex />)
    ALL_NAMES.forEach((n) => expect(screen.getByText(n)).toBeInTheDocument())
    expect(screen.getByText('Launch Planner').closest('.pi-row')).toBe(
      document.querySelector('.pi-row'),
    )
  })

  it('opens the flagship on load and leaves the rest closed', () => {
    render(<ProjectIndex />)
    expect(rowButton('Launch Planner')).toHaveAttribute('aria-expanded', 'true')
    expect(rowButton('Dependency Drift Detector')).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelectorAll('.pi-panel')).toHaveLength(1)
  })

  it('toggles a single row without touching the others', () => {
    render(<ProjectIndex />)
    const drift = rowButton('Dependency Drift Detector')
    fireEvent.click(drift)
    expect(drift).toHaveAttribute('aria-expanded', 'true')
    expect(rowButton('Launch Planner')).toHaveAttribute('aria-expanded', 'true')
    expect(document.querySelectorAll('.pi-panel')).toHaveLength(2)

    fireEvent.click(drift)
    expect(drift).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelectorAll('.pi-panel')).toHaveLength(1)
  })

  it('expands and collapses every row from one button', () => {
    render(<ProjectIndex />)
    const all = screen.getByRole('button', { name: 'Expand all' })
    fireEvent.click(all)
    expect(document.querySelectorAll('.pi-panel')).toHaveLength(ALL_NAMES.length)

    const collapse = screen.getByRole('button', { name: 'Collapse all' })
    fireEvent.click(collapse)
    expect(document.querySelectorAll('.pi-panel')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument()
  })

  it('counts the systems in the thesis rather than hardcoding the total', () => {
    render(<ProjectIndex />)
    expect(screen.getByText(/^Twelve shipped systems on one thesis:/)).toBeInTheDocument()
  })

  // RC1-622: no row carries a status now. The API Compatibility Lab gave its
  // chip up because the gap it hedged against — an integration inventory the
  // customer declares rather than one discovered from their code — needs a
  // codebase the project will never be pointed at, so it is a permanent limit
  // on scope and not a stage of work.
  it('counts every row as shipped and drops the still-being-built clause', () => {
    render(<ProjectIndex />)
    expect(document.querySelectorAll('.pi-row')).toHaveLength(12)
    expect(document.querySelectorAll('.pi-status')).toHaveLength(0)
    expect(screen.queryByText(/still being built/)).not.toBeInTheDocument()
  })

  // The figures themselves are pinned in the lab repo's own suite, which
  // re-derives each one from a regenerated artifact. What this test owns is
  // narrower and still worth owning: the card's data reaching the DOM, and
  // the visual's tally agreeing with the rows it was drawn from. Reading the
  // expectations off the data module is deliberate, so a corpus that widens
  // again edits one file instead of two.
  it('leads the compatibility lab row with the caught-of-exercised number', () => {
    render(<ProjectIndex />)
    fireEvent.click(rowButton('API Compatibility Lab'))
    const panel = document.getElementById('compat-lab-panel')!
    const { breaks, result } = apiCompatibilityLab
    expect(result).toMatch(/^Caught (\d+) of the \1 documented behavioral breaks/)
    expect(panel.querySelector('.pi-result')!.textContent).toBe(`Result${result}`)
    // The visual's own argument: most of the caught breaks drew no usable
    // warning from the baseline.
    const blind = breaks.filter((b) => b.blind).length
    expect(blind).toBeGreaterThan(breaks.length / 2)
    expect(within(panel).getByText(`${blind} of ${breaks.length}`)).toBeInTheDocument()
    expect(panel.querySelectorAll('.mb-row.blind')).toHaveLength(blind)
    expect(panel.querySelectorAll('.mb-row')).toHaveLength(breaks.length)
  })

  it('points each row header at the panel it controls', () => {
    render(<ProjectIndex />)
    const head = rowButton('Launch Planner')
    const panelId = head.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    expect(document.getElementById(panelId!)).toBeInTheDocument()
  })

  it('keeps the flagship overview link same-tab and sends the rest out', () => {
    render(<ProjectIndex />)
    const panel = document.getElementById('launch-planner-panel')!
    const overview = within(panel).getByText('Overview →')
    expect(overview).toHaveAttribute('href', '/projects/launch-planner')
    expect(overview).not.toHaveAttribute('target')

    const github = within(panel).getByText('GitHub ↗')
    expect(github).toHaveAttribute('target', '_blank')
    expect(github).toHaveAttribute('rel', 'noreferrer noopener')
  })

  it('shows each drift finding as text rather than a tooltip', () => {
    render(<ProjectIndex />)
    fireEvent.click(rowButton('Dependency Drift Detector'))
    const detail = screen.getByText(/12d overlap/)
    expect(detail).toBeInTheDocument()
    expect(detail).not.toHaveAttribute('title')
  })

  // --- the headline measurement and the promoted row (RC1-410) ----------

  it('places the three FDE rows second to fourth, and the PR Review Agent fifth', () => {
    render(<ProjectIndex />)
    const names = [...document.querySelectorAll('.pi-row .pi-name')].map((n) => n.textContent)
    expect(names[0]).toBe('Launch Planner')
    expect(names[1]).toBe('ESP Migration Agent')
    expect(names[2]).toBe('API Compatibility Lab')
    expect(names[3]).toBe('POC Benchmark Agent')
    expect(names[4]).toBe('PR Review Agent')
  })

  // --- the refusal row (RC1-635) ------------------------------------------

  it('colors only the shapes over the ceiling and counts the ones the best setup leaves', () => {
    render(<ProjectIndex />)
    fireEvent.click(rowButton('POC Benchmark Agent'))
    const { shapes, ceiling } = pocBenchmarkAgent
    const panel = document.querySelector('.mc') as HTMLElement
    expect(panel.querySelectorAll('.mc-row')).toHaveLength(shapes.length)
    const over = shapes.filter((s) => s.best > ceiling).length
    const overToday = shapes.filter((s) => s.today > ceiling).length
    expect(panel.querySelectorAll('.mc-val.over')).toHaveLength(over + overToday)
    expect(panel.querySelector('.mc-tally-value')?.textContent).toBe(`${over} of ${shapes.length}`)
    expect(pocBenchmarkAgent.result).toMatch(/^Refused to recommend/)
  })

  it('renders a result line for a row that carries one', () => {
    render(<ProjectIndex />)
    fireEvent.click(rowButton('PR Review Agent'))
    const panel = document.getElementById('pr-agent-panel')!
    const result = panel.querySelector('.pi-result')!
    expect(result).toBeInTheDocument()
    expect(within(panel).getByText('Result')).toBeInTheDocument()
    expect(result.textContent).toMatch(/13 of 13 planted defects/)
  })

  it('omits the result line on a row without one', () => {
    render(<ProjectIndex />)
    fireEvent.click(rowButton('Dependency Drift Detector'))
    const panel = document.getElementById('drift-panel')!
    expect(panel.querySelector('.pi-result')).toBeNull()
  })

  it('gives the PR Review Agent an overview link, same-tab, ahead of GitHub (RC1-412)', () => {
    render(<ProjectIndex />)
    fireEvent.click(rowButton('PR Review Agent'))
    const panel = document.getElementById('pr-agent-panel')!
    const overview = within(panel).getByText('Overview →')
    expect(overview).toHaveAttribute('href', '/projects/pr-review-agent')
    expect(overview).not.toHaveAttribute('target')
    const links = [...panel.querySelectorAll('.pi-links a')].map((a) => a.textContent)
    expect(links[0]).toBe('Overview →')
  })

  it('describes the multi-agent pipeline, not the single loop it replaced', () => {
    render(<ProjectIndex />)
    fireEvent.click(rowButton('PR Review Agent'))
    const panel = document.getElementById('pr-agent-panel')!
    const tagline = panel.querySelector('.pi-tagline')!.textContent!
    expect(tagline).toMatch(/Three reviewers/)
    expect(tagline).not.toMatch(/explores the repository for context first/)
  })

  it('ranks the fleet bars by spend and labels every value', () => {
    render(<ProjectIndex />)
    fireEvent.click(rowButton('Fleet Observability'))
    const panel = document.getElementById('fleet-obs-panel')!
    const names = [...panel.querySelectorAll('.mfl-name')].map((n) => n.textContent)
    expect(names[0]).toBe('pr-review-agent')
    expect(names[1]).toBe('launch-planner')
    expect(names).toHaveLength(11)
    expect(within(panel).getByText('$20.06')).toBeInTheDocument()
  })

  it('splits each fleet bar into production and test runs', () => {
    render(<ProjectIndex />)
    fireEvent.click(rowButton('Fleet Observability'))
    const panel = document.getElementById('fleet-obs-panel')!
    const rows = [...panel.querySelectorAll('.mfl-row')]
    // pr-review-agent has both; launch-planner ran only as evals this window.
    expect(rows[0].querySelectorAll('.mfl-prod, .mfl-test')).toHaveLength(2)
    expect(rows[1].querySelector('.mfl-prod')).toBeNull()
    expect(rows[1].querySelector('.mfl-test')).not.toBeNull()
    expect(within(panel).getByText(/production \$19\.93/)).toBeInTheDocument()
    expect(within(panel).getByText(/test runs \$9\.83/)).toBeInTheDocument()
    expect(panel.querySelector('.mfl')!.getAttribute('aria-label')).toMatch(
      /pr-review-agent: \$20\.06 \(production \$17\.48, test runs \$2\.57\)/,
    )
  })

  it('keeps the smallest app visible rather than a zero-width bar', () => {
    render(<ProjectIndex />)
    fireEvent.click(rowButton('Fleet Observability'))
    const panel = document.getElementById('fleet-obs-panel')!
    const bars = [...panel.querySelectorAll<HTMLElement>('.mfl-bar')]
    const last = bars[bars.length - 1]
    expect(parseFloat(last.style.width)).toBeGreaterThanOrEqual(1.5)
    expect(last.children.length).toBeGreaterThan(0)
  })

  // --- the two projects added in RC1-226 --------------------------------

  it('renders the Job Scout board with its matched and gap chips', () => {
    render(<ProjectIndex />)
    fireEvent.click(rowButton('Job Scout'))
    const panel = document.getElementById('job-scout-panel')!
    expect(within(panel).getByText('87')).toBeInTheDocument()
    expect(within(panel).getByText('Kubernetes')).toHaveClass('mb-chip-gap')
    expect(within(panel).getByText('Python')).toHaveClass('mb-chip-met')
    expect(within(panel).getByText('GitHub ↗')).toHaveAttribute(
      'href',
      'https://github.com/snacksnack/job-search-agent',
    )
  })

  it('renders the concert scorecard with dimensions summing to the total', () => {
    render(<ProjectIndex />)
    fireEvent.click(rowButton('Concert Intelligence Agent'))
    const panel = document.getElementById('concert-panel')!
    expect(within(panel).getByText('Concert score')).toBeInTheDocument()
    // The bars must actually add up — the visual claims arithmetic, not vibes.
    const points = Array.from(panel.querySelectorAll('.mc-dim')).map((d) =>
      Number(d.querySelector('.mc-points')!.textContent!.split('/')[0]),
    )
    const total = Number(
      panel.querySelector('.mc-total-value')!.textContent!.split('/')[0],
    )
    expect(points.reduce((a, b) => a + b, 0)).toBe(total)
  })

  // --- the eval harness row and its cross-links (RC1-266) ----------------

  it('renders the Agent Evals row with the trend sparkline and live link first', () => {
    render(<ProjectIndex />)
    fireEvent.click(rowButton('Agent Evals'))
    const panel = document.getElementById('agent-evals-panel')!
    expect(within(panel).getByText('pr-review')).toBeInTheDocument()
    expect(panel.querySelector('.mt-chart')).toBeInTheDocument()
    // The flagged run is the story: a score that fell while every version
    // column stayed put, so the cause was outside the subject.
    expect(within(panel).getByText(/every case errored/)).toBeInTheDocument()
    expect(within(panel).getByText(/pr-review · 20 runs/)).toBeInTheDocument()
    expect(within(panel).getByText('Quality trend ↗')).toHaveAttribute(
      'href',
      'https://snacksnack.github.io/agent-evals/',
    )
  })

  it('marks each measured system with an eval line linking the trend page', () => {
    render(<ProjectIndex />)
    // The flagship opens on load; its panel carries the line.
    const panel = document.getElementById('launch-planner-panel')!
    const evals = panel.querySelector('.pi-evals')!
    expect(within(evals as HTMLElement).getByText('Under eval')).toBeInTheDocument()
    expect(within(evals as HTMLElement).getByText('Quality trend ↗')).toHaveAttribute(
      'href',
      'https://snacksnack.github.io/agent-evals/',
    )
  })
})

describe('ProjectIndex teaser (the résumé’s short index)', () => {
  it('shows three rows and links out to the full index', () => {
    render(<ProjectIndex teaser />)
    expect(document.querySelectorAll('.pi-row')).toHaveLength(3)
    ;['Launch Planner', 'AI Incident Summarizer', 'PR Review Agent'].forEach((n) =>
      expect(screen.getByText(n)).toBeInTheDocument(),
    )
    expect(screen.queryByText('Job Scout')).not.toBeInTheDocument()

    const more = screen.getByText('See all twelve projects →')
    expect(more).toHaveAttribute('href', '/work')
  })

  it('still counts every shipped system in the thesis, and drops the expand-all control', () => {
    render(<ProjectIndex teaser />)
    expect(screen.getByText(/^Twelve shipped systems on one thesis:/)).toBeInTheDocument()
    expect(screen.getByText(/Three of them below\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument()
  })

  it('opens the flagship on load, as the full index does', () => {
    render(<ProjectIndex teaser />)
    expect(rowButton('Launch Planner')).toHaveAttribute('aria-expanded', 'true')
    expect(document.querySelectorAll('.pi-panel')).toHaveLength(1)
  })
})
