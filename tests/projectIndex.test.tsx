import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ProjectIndex from '../src/components/ProjectIndex'

// The Projects section is an aligned index that expands in place (RC1-216).
// These cover the behaviour the old static cards didn't have.

const rowButton = (name: string | RegExp) =>
  screen.getByRole('button', { name: typeof name === 'string' ? new RegExp(name) : name })

describe('ProjectIndex', () => {
  it('lists every project as a row, flagship first', () => {
    render(<ProjectIndex />)
    const names = ['Launch Planner', 'Dependency Drift Detector', 'AI Incident Summarizer', 'PR Review Agent', 'TPM Workflow Automation']
    names.forEach((n) => expect(screen.getByText(n)).toBeInTheDocument())
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

  it('expands and collapses all five from one button', () => {
    render(<ProjectIndex />)
    const all = screen.getByRole('button', { name: 'Expand all' })
    fireEvent.click(all)
    expect(document.querySelectorAll('.pi-panel')).toHaveLength(5)

    const collapse = screen.getByRole('button', { name: 'Collapse all' })
    fireEvent.click(collapse)
    expect(document.querySelectorAll('.pi-panel')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument()
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
})
