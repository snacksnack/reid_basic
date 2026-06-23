import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Resume from '../src/components/Resume'
import type { ResumeData } from '../src/components/Resume'
import FitCard, { type FitCardData } from '../src/components/FitCard'

const minimalResume: ResumeData = {
  name: 'Reid Collins',
  title: 'Senior Technical Program Manager',
}

const fullResume: ResumeData = {
  name: 'Reid Collins',
  title: 'Senior Technical Program Manager / Backend Engineer',
  tagline: 'Open to Senior Technical Program Manager roles',
  contact: {
    location: 'Brooklyn, NY',
    email: 'hire.reid.collins@gmail.com',
    linkedin: 'https://linkedin.com/in/reidcollins',
  },
  summary: 'A hybrid background in software engineering and program leadership.',
  skillCategories: [
    { category: 'Languages', items: ['Python', 'Bash'] },
  ],
  experience: [
    {
      company: 'Marigold',
      role: 'Senior TPM',
      period: '2021–2026',
      achievements: ['Led cross-functional initiatives'],
    },
  ],
  education: [
    { school: 'Tulane University', degree: 'BA, International Relations', period: '2004–2008' },
  ],
  certifications: [
    { name: 'Certified Scrum Master', issuer: 'Scrum Alliance' },
  ],
}

describe('Resume component', () => {
  it('renders the name and title', () => {
    render(<Resume data={minimalResume} />)
    expect(screen.getByText('Reid Collins')).toBeInTheDocument()
    expect(screen.getByText('Senior Technical Program Manager')).toBeInTheDocument()
  })

  it('renders all major sections with full data', () => {
    render(<Resume data={fullResume} />)
    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.getByText('Technical Skills')).toBeInTheDocument()
    expect(screen.getByText('Professional Experience')).toBeInTheDocument()
    expect(screen.getByText('Education')).toBeInTheDocument()
    expect(screen.getByText('Certifications')).toBeInTheDocument()
  })

  it('renders contact information', () => {
    render(<Resume data={fullResume} />)
    expect(screen.getByText('Brooklyn, NY')).toBeInTheDocument()
    expect(screen.getByText('hire.reid.collins@gmail.com')).toBeInTheDocument()
  })

  it('renders experience entries', () => {
    render(<Resume data={fullResume} />)
    expect(screen.getAllByText('Marigold').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Senior TPM')).toBeInTheDocument()
    expect(screen.getByText('Led cross-functional initiatives')).toBeInTheDocument()
  })

  it('renders the contact button when callback provided', () => {
    const handler = vi.fn()
    render(<Resume data={minimalResume} onContactClick={handler} />)
    expect(screen.getByLabelText('Contact Reid')).toBeInTheDocument()
  })

  it('renders download links', () => {
    render(<Resume data={minimalResume} />)
    expect(screen.getByLabelText('Download PDF')).toBeInTheDocument()
    expect(screen.getByLabelText('Download DOCX')).toBeInTheDocument()
  })

  it('does not render a role-fit button in the toolbar (entry point lives on the FAB)', () => {
    render(<Resume data={minimalResume} />)
    expect(screen.queryByText('See how I fit your role')).not.toBeInTheDocument()
  })
})

const fitData: FitCardData = {
  roleTitle: 'Senior Backend Engineer',
  verdict: 'good',
  verdictLabel: 'Good fit, some gaps',
  strengths: ['7+ yrs backend (Python/Go)'],
  transferable: ['ECS/Fargate → ramps to K8s fast'],
  gaps: ['No direct Kubernetes in production yet'],
  summary: 'Strong backend fit; the main gap (K8s) is adjacent to proven ECS work.',
  sectionsReviewed: 8,
}

describe('FitCard component', () => {
  it('renders title, verdict pill, and all three sections including honest gaps', () => {
    render(<FitCard data={fitData} />)
    expect(screen.getByText('Fit for Senior Backend Engineer')).toBeInTheDocument()
    expect(screen.getByText('Good fit, some gaps')).toBeInTheDocument()
    expect(screen.getByText('Strengths')).toBeInTheDocument()
    expect(screen.getByText('Transferable')).toBeInTheDocument()
    expect(screen.getByText('Honest gaps')).toBeInTheDocument()
    expect(screen.getByText('No direct Kubernetes in production yet')).toBeInTheDocument()
    expect(screen.getByText(/8 sections reviewed/)).toBeInTheDocument()
  })

  it('hand-off actions: download link + Contact Reid dispatches open-contact', () => {
    render(<FitCard data={fitData} />)
    const download = screen.getByText('Download matching résumé')
    expect(download).toHaveAttribute('href', '/api/download/pdf')
    const listener = vi.fn()
    window.addEventListener('open-contact', listener)
    fireEvent.click(screen.getByText('Contact Reid'))
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener('open-contact', listener)
  })

  it('omits a section when it has no items', () => {
    render(<FitCard data={{ ...fitData, transferable: [] }} />)
    expect(screen.queryByText('Transferable')).not.toBeInTheDocument()
  })

  it('shows a positive "No major gaps" note when a strong fit has no gaps', () => {
    render(<FitCard data={{ ...fitData, verdict: 'strong', gaps: [] }} />)
    expect(screen.getByText('No major gaps')).toBeInTheDocument()
    expect(screen.getByText(/meets the core requirements/i)).toBeInTheDocument()
    expect(screen.queryByText('Honest gaps')).not.toBeInTheDocument()
  })

  it('does not show the no-gaps note for a partial fit', () => {
    render(<FitCard data={{ ...fitData, verdict: 'partial', gaps: [] }} />)
    expect(screen.queryByText('No major gaps')).not.toBeInTheDocument()
  })
})
