import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ProjectIndex from '../src/components/ProjectIndex'

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
    expect(screen.getByText(/^Seven shipped systems on one thesis:/)).toBeInTheDocument()
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
})

describe('ProjectIndex teaser (the résumé’s short index)', () => {
  it('shows three rows and links out to the full index', () => {
    render(<ProjectIndex teaser />)
    expect(document.querySelectorAll('.pi-row')).toHaveLength(3)
    ;['Launch Planner', 'AI Incident Summarizer', 'PR Review Agent'].forEach((n) =>
      expect(screen.getByText(n)).toBeInTheDocument(),
    )
    expect(screen.queryByText('Job Scout')).not.toBeInTheDocument()

    const more = screen.getByText('See all seven projects →')
    expect(more).toHaveAttribute('href', '/work')
  })

  it('still counts all seven in the thesis, and drops the expand-all control', () => {
    render(<ProjectIndex teaser />)
    expect(screen.getByText(/^Seven shipped systems on one thesis:/)).toBeInTheDocument()
    expect(screen.getByText(/Three of them below\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument()
  })

  it('opens the flagship on load, as the full index does', () => {
    render(<ProjectIndex teaser />)
    expect(rowButton('Launch Planner')).toHaveAttribute('aria-expanded', 'true')
    expect(document.querySelectorAll('.pi-panel')).toHaveLength(1)
  })
})
