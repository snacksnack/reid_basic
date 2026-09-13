import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import App from '../src/App'
import PrReviewAgentPage from '../src/pages/PrReviewAgentPage'
import { prReviewAgent } from '../src/data/prReviewAgent'
import { launchPlanner } from '../src/data/launchPlanner'

// /projects/pr-review-agent — the detail page behind the index row (RC1-412):
// the decisions a single row cannot hold, each stated as a decision with the
// numbers, and each figure traced to a record in the repository.

const goto = (path: string) => window.history.pushState({}, '', path)

describe('PrReviewAgentPage', () => {
  it('renders the hero from the shared card content and sets its title', () => {
    render(<PrReviewAgentPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'PR Review Agent' })).toBeInTheDocument()
    expect(screen.getByText(prReviewAgent.principle)).toBeInTheDocument()
    expect(document.title).toBe('PR Review Agent — Reid Collins')
  })

  it('links the index, a posted review and the source, the last two in a new tab', () => {
    render(<PrReviewAgentPage />)
    expect(screen.getByText('All work')).toHaveAttribute('href', '/work')
    const review = screen.getByText('A posted review ↗')
    expect(review).toHaveAttribute('href', 'https://github.com/snacksnack/pr_agent/pull/60')
    expect(review).toHaveAttribute('target', '_blank')
    expect(review).toHaveAttribute('rel', 'noreferrer noopener')
    expect(screen.getAllByText('GitHub ↗')[0]).toHaveAttribute(
      'href',
      'https://github.com/snacksnack/pr_agent',
    )
  })

  it('shows the posted-review shape and the headline result', () => {
    render(<PrReviewAgentPage />)
    expect(document.querySelector('.mr')).toBeInTheDocument()
    expect(screen.getByText(/13 of 13 planted defects/)).toBeInTheDocument()
  })

  it('draws the pipeline with the fan-out and the verifier, no scout', () => {
    render(<PrReviewAgentPage />)
    const flow = document.querySelector('.mp')!
    expect(flow).toHaveAttribute('role', 'img')
    const names = [...flow.querySelectorAll('.mp-branch-name')].map((n) => n.textContent)
    expect(names).toEqual(['diff-local', 'repo-context', 'change-intent'])
    expect(within(flow as HTMLElement).getByText('Verifier')).toHaveClass('mp-model')
    expect(within(flow as HTMLElement).getByText('Router')).toHaveClass('mp-python')
    expect(flow.textContent).not.toMatch(/scout/i)
    // The numbered stage list carries the blurbs, one per stage.
    expect(document.querySelectorAll('.pp-pipeline-stages .pp-stage')).toHaveLength(
      prReviewAgent.pipeline.length,
    )
  })

  it('states the LangGraph result as a decision — evaluated, measured, declined', () => {
    render(<PrReviewAgentPage />)
    const article = document.getElementById('decision-langgraph')!
    expect(within(article).getByText(/LangGraph, evaluated and declined/)).toBeInTheDocument()
    expect(within(article).getByText('$0.709 vs $0.705')).toBeInTheDocument()
    expect(within(article).getByText('0 vs 22 packages, 26.9 MB')).toBeInTheDocument()
    expect(within(article).getByText(/Production stays on asyncio/)).toBeInTheDocument()
  })

  it('carries all four decisions, each linking its record in the repository docs', () => {
    render(<PrReviewAgentPage />)
    const records = [...document.querySelectorAll<HTMLAnchorElement>('.pp-record')]
    expect(records).toHaveLength(4)
    const hrefs = records.map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([
      'https://github.com/snacksnack/pr_agent/blob/main/docs/rc1-391-langgraph-spike.md',
      'https://github.com/snacksnack/pr_agent/blob/main/docs/rc1-398-category-tiebreak.md',
      'https://github.com/snacksnack/pr_agent/blob/main/docs/rc1-393-cheap-exploration.md',
      'https://github.com/snacksnack/pr_agent/blob/main/docs/rc1-396-conventions-files.md',
    ])
    records.forEach((a) => expect(a).toHaveAttribute('target', '_blank'))
  })

  it('lands the tie-break study on "no rule", with the positional number', () => {
    render(<PrReviewAgentPage />)
    const article = document.getElementById('decision-tiebreak')!
    expect(within(article).getByText('28 (74%)')).toBeInTheDocument()
    expect(within(article).getByText(/No category preference order/)).toBeInTheDocument()
  })

  it('shows the cost sequence from the single loop to production', () => {
    render(<PrReviewAgentPage />)
    const article = document.getElementById('decision-cost')!
    expect(within(article).getByText(/48\.3¢ \/ 70\.0¢ \/ \$1\.10/)).toBeInTheDocument()
    expect(within(article).getByText(/p50 3\.7¢ and 13 s/)).toBeInTheDocument()
  })

  it('names the conventions-file trap: a docs-only PR cannot prove its own fix', () => {
    render(<PrReviewAgentPage />)
    const article = document.getElementById('decision-conventions')!
    expect(within(article).getByText('28.3¢ / 61 s → 8.5¢ / 19 s')).toBeInTheDocument()
    expect(within(article).getByText(/can never demonstrate its own fix/)).toBeInTheDocument()
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

  it('serves /projects/pr-review-agent from the path', () => {
    goto('/projects/pr-review-agent/')
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'PR Review Agent' })).toBeInTheDocument()
    expect(document.getElementById('decision-langgraph')).toBeInTheDocument()
  })
})

// The unrelated item the ticket carries: the Launch Planner's MCP server is
// real and evaluated but has no client wired to it, and the card must not
// imply otherwise.
describe('launchPlanner MCP mention', () => {
  it('names the MCP server without claiming a wired client', () => {
    const mcp = launchPlanner.surfaces.find((s) => s.name === 'MCP server')!
    expect(mcp).toBeDefined()
    expect(mcp.blurb).toMatch(/Nine read-only planning tools/)
    expect(mcp.blurb).toMatch(/No client is wired to it/)
    expect(mcp.blurb).not.toMatch(/production|live|integrated/i)
  })
})
