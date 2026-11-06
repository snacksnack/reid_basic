import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ProjectIndex from '../src/components/ProjectIndex'
import { apiCompatibilityLab } from '../src/data/apiCompatibilityLab'

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
]

const rowButton = (name: string | RegExp) =>
  screen.getByRole('button', { name: typeof name === 'string' ? new RegExp(name) : name })

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
    expect(screen.getByText(/^Ten shipped systems on one thesis:/)).toBeInTheDocument()
  })

  // RC1-612: a system still being built must not be counted among the shipped
  // ones, and the page has to say which one it is.
  it('counts an in-progress row separately from the shipped ones', () => {
    render(<ProjectIndex />)
    expect(document.querySelectorAll('.pi-row')).toHaveLength(11)
    expect(
      screen.getByText(/One more is still being built, and says so\./),
    ).toBeInTheDocument()
  })

  it('marks the in-progress row with a status chip, and marks only that row', () => {
    render(<ProjectIndex />)
    const chips = [...document.querySelectorAll('.pi-status')]
    expect(chips.map((c) => c.textContent)).toEqual(['In progress'])
    expect(chips[0]!.closest('.pi-row')!.querySelector('.pi-name')!.textContent).toBe(
      'API Compatibility Lab',
    )
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

  it('places the two FDE rows second and third, and the PR Review Agent fourth', () => {
    render(<ProjectIndex />)
    const names = [...document.querySelectorAll('.pi-row .pi-name')].map((n) => n.textContent)
    expect(names[0]).toBe('Launch Planner')
    expect(names[1]).toBe('ESP Migration Agent')
    expect(names[2]).toBe('API Compatibility Lab')
    expect(names[3]).toBe('PR Review Agent')
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
    const names = [...panel.querySelectorAll('.mf-name')].map((n) => n.textContent)
    expect(names[0]).toBe('pr-review-agent')
    expect(names[1]).toBe('launch-planner')
    expect(names).toHaveLength(9)
    expect(within(panel).getByText('$34.94')).toBeInTheDocument()
  })

  it('keeps the smallest app visible rather than a zero-width bar', () => {
    render(<ProjectIndex />)
    fireEvent.click(rowButton('Fleet Observability'))
    const panel = document.getElementById('fleet-obs-panel')!
    const bars = [...panel.querySelectorAll<HTMLElement>('.mf-bar')]
    const last = bars[bars.length - 1]
    expect(parseFloat(last.style.width)).toBeGreaterThan(0)
    expect(within(panel).getAllByText('<$0.01').length).toBeGreaterThan(0)
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

    const more = screen.getByText('See all eleven projects →')
    expect(more).toHaveAttribute('href', '/work')
  })

  it('still counts every shipped system in the thesis, and drops the expand-all control', () => {
    render(<ProjectIndex teaser />)
    expect(screen.getByText(/^Ten shipped systems on one thesis:/)).toBeInTheDocument()
    expect(screen.getByText(/Three of them below\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument()
  })

  it('opens the flagship on load, as the full index does', () => {
    render(<ProjectIndex teaser />)
    expect(rowButton('Launch Planner')).toHaveAttribute('aria-expanded', 'true')
    expect(document.querySelectorAll('.pi-panel')).toHaveLength(1)
  })
})
