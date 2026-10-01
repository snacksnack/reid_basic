import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import App from '../src/App'
import WorkPage from '../src/pages/WorkPage'

// /work — the project index on its own shareable URL (RC1-226).

const goto = (path: string) => window.history.pushState({}, '', path)

describe('WorkPage', () => {
  it('renders the full index, not the résumé teaser', () => {
    render(<WorkPage />)
    expect(screen.getByRole('heading', { name: 'Selected work' })).toBeInTheDocument()
    expect(document.querySelectorAll('.pi-row')).toHaveLength(9)
    expect(screen.getByText('Job Scout')).toBeInTheDocument()
    expect(screen.getByText('Agent Evals')).toBeInTheDocument()
    expect(screen.getByText('Fleet Observability')).toBeInTheDocument()
    expect(screen.queryByText(/See all nine projects/)).not.toBeInTheDocument()
  })

  it('keeps the thesis framing on the page', () => {
    render(<WorkPage />)
    expect(
      screen.getByText(/the model proposes, deterministic code decides, a human approves/),
    ).toBeInTheDocument()
  })

  it('carries the status bar with Work marked as the current page', () => {
    render(<WorkPage />)
    const work = screen.getByRole('link', { name: 'Work' })
    expect(work).toHaveAttribute('href', '/work')
    expect(work).toHaveAttribute('aria-current', 'page')
  })

  it('offers a way back to the résumé and a contact route', () => {
    render(<WorkPage />)
    expect(screen.getByText('← Back to résumé')).toHaveAttribute('href', '/')
    const foot = document.querySelector('.pp-foot')!
    fireEvent.click(within(foot as HTMLElement).getByText('Contact Reid'))
    expect(document.querySelector('.contact-modal, [role="dialog"]')).toBeTruthy()
  })

  it('sets its own document title', () => {
    render(<WorkPage />)
    expect(document.title).toBe('Work — Reid Collins')
  })

  // RC1-481 — the chatbot lives here too, with chips that lead with the
  // page's subject (projects) instead of the résumé defaults.
  it('mounts the chatbot with projects-first starter chips', () => {
    render(<WorkPage />)
    fireEvent.click(screen.getByLabelText('Open chat'))
    expect(screen.getByRole('dialog', { name: 'Resume chat' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Walk me through these projects' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'See how he fits your role' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Is he senior enough?' })).not.toBeInTheDocument()
  })
})

describe('routing', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    goto('/')
  })

  it('serves /work from the path, tolerating a trailing slash', () => {
    goto('/work/')
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Selected work' })).toBeInTheDocument()
  })

  it('serves the résumé at / — with the teaser index and a Work nav link', () => {
    goto('/')
    render(<App />)
    expect(screen.queryByRole('heading', { name: 'Selected work' })).not.toBeInTheDocument()
    expect(document.querySelectorAll('.pi-row')).toHaveLength(3)
    const work = screen.getByRole('link', { name: 'Work' })
    expect(work).toHaveAttribute('href', '/work')
    expect(work).not.toHaveAttribute('aria-current')
  })
})
