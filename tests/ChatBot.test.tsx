import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import ChatBot from '../src/components/ChatBot'

const fetchMock = vi.fn()

function mockReply(body: Record<string, unknown>) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => body })
}

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
})

const input = () => screen.getByRole('textbox') as HTMLTextAreaElement
const openPanel = () => fireEvent.click(screen.getByLabelText('Open chat'))
const send = () => fireEvent.click(screen.getByLabelText('Send message'))
const type = (text: string) => fireEvent.change(input(), { target: { value: text } })
const matchChip = () => screen.getByRole('button', { name: 'See how he fits your role' })

describe('ChatBot', () => {
  it('opens the panel from the FAB and shows the greeting and starter chips', () => {
    render(<ChatBot />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    openPanel()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/paste a job description to see how he fits/i)).toBeInTheDocument()
    expect(matchChip()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Is he senior enough?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "What's his AWS experience?" })).toBeInTheDocument()
  })

  it('match chip enters role-fit mode without leaking /match or sending', () => {
    render(<ChatBot />)
    openPanel()
    fireEvent.click(matchChip())
    // No "/match" text dumped into the input.
    expect(input().value).toBe('')
    // A muted hint + a job-description placeholder guide the recruiter.
    expect(screen.getByText('Role Fit')).toBeInTheDocument()
    expect(input().placeholder).toMatch(/paste the job description/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('auto-send chip posts a message and hides the chips afterward', async () => {
    mockReply({ reply: 'He has deep AWS experience.' })
    render(<ChatBot />)
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: "What's his AWS experience?" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await screen.findByText('He has deep AWS experience.')
    expect(screen.queryByRole('button', { name: 'See how he fits your role' })).not.toBeInTheDocument()
  })

  it('role-fit mode prepends /match for the API but keeps it out of the user bubble', async () => {
    mockReply({
      reply: 'Want me to go deeper on any of these?',
      fitCard: {
        roleTitle: 'Senior Backend Engineer',
        verdict: 'good',
        verdictLabel: 'Good fit, some gaps',
        strengths: ['7+ yrs backend'],
        transferable: ['ECS → K8s ramps fast'],
        gaps: ['No production Kubernetes yet'],
        summary: 'Strong backend fit; main gap is K8s.',
        sectionsReviewed: 8,
      },
    })
    render(<ChatBot />)
    openPanel()
    fireEvent.click(matchChip())
    type('Senior Backend Engineer, Python and Kubernetes')
    send()

    // The API receives the /match-prefixed message…
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.message).toBe('/match Senior Backend Engineer, Python and Kubernetes')
    // …but the user's visible bubble shows the raw JD, never "/match".
    expect(screen.getByText('Senior Backend Engineer, Python and Kubernetes')).toBeInTheDocument()
    expect(screen.queryByText(/\/match/)).not.toBeInTheDocument()

    await screen.findByText('Fit for Senior Backend Engineer')
  })

  it('shows the "Reviewing résumé" label while a role-fit request is in flight', async () => {
    let resolve!: (v: unknown) => void
    fetchMock.mockReturnValue(new Promise((r) => { resolve = r }))
    render(<ChatBot />)
    openPanel()
    fireEvent.click(matchChip())
    type('a backend role')
    send()

    expect(await screen.findByText(/reviewing résumé against the role/i)).toBeInTheDocument()

    await act(async () => {
      resolve({ ok: true, json: async () => ({ reply: 'done' }) })
    })
    await waitFor(() =>
      expect(screen.queryByText(/reviewing résumé against the role/i)).not.toBeInTheDocument()
    )
  })

  it('cancel button exits role-fit mode', () => {
    render(<ChatBot />)
    openPanel()
    fireEvent.click(matchChip())
    expect(screen.getByText('Role Fit')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Cancel role fit'))
    expect(screen.queryByText('Role Fit')).not.toBeInTheDocument()
  })

  it('FAB label opens the panel and enters role-fit mode (no /match in the input)', () => {
    render(<ChatBot />)
    fireEvent.click(screen.getByText(/see how i fit your role/i))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(input().value).toBe('')
    expect(screen.getByText('Role Fit')).toBeInTheDocument()
  })

  it('opens and enters role-fit mode when the open-role-fit event fires', () => {
    render(<ChatBot />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new CustomEvent('open-role-fit'))
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(input().value).toBe('')
    expect(screen.getByText('Role Fit')).toBeInTheDocument()
  })
})
