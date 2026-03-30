import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Resume from '../src/components/Resume'
import type { ResumeData } from '../src/components/Resume'

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
})
