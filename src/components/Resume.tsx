import React, { useEffect, useMemo, useRef, useState } from 'react'

type Achievement = string

export interface ExperienceItem {
  company: string
  role: string
  period: string
  location?: string
  summary?: string
  achievements?: Achievement[]
  technologies?: string[]
}

export interface EducationItem {
  school: string
  degree: string
  period: string
}

export interface LinkItem {
  label: string
  url: string
}

export interface ContactInfo {
  email?: string
  phone?: string
  location?: string
  website?: string
  linkedin?: string
  github?: string
}

export interface ProjectItem {
  name: string
  description?: string
  url?: string
  technologies?: string[]
}

export interface CertificationItem {
  name: string
  issuer?: string
  year?: string
}

export interface ResumeData {
  name: string
  title: string
  contact?: ContactInfo
  summary?: string
  skills?: string[]
  experience?: ExperienceItem[]
  education?: EducationItem[]
  links?: LinkItem[]
  projects?: ProjectItem[]
  certifications?: CertificationItem[]
  coverLetter?: string
}

interface ResumeProps {
  data: ResumeData
}

function ContactLine({ contact }: { contact?: ContactInfo }) {
  if (!contact) return null
  const items: Array<{ type: string; node: React.ReactNode }> = []

  if (contact.location) items.push({ type: 'location', node: <span>{contact.location}</span> })
  if (contact.email)
    items.push({
      type: 'email',
      node: (
        <a href={`mailto:${contact.email}`} className="email">
          {contact.email}
        </a>
      ),
    })
  if (contact.website)
    items.push({
      type: 'website',
      node: (
        <a href={contact.website} target="_blank" rel="noreferrer noopener">
          {contact.website.replace(/^https?:\/\//, '')}
        </a>
      ),
    })
  if (contact.linkedin)
    items.push({
      type: 'linkedin',
      node: (
        <a href={contact.linkedin} target="_blank" rel="noreferrer noopener">
          LinkedIn
        </a>
      ),
    })
  if (contact.github)
    items.push({
      type: 'github',
      node: (
        <a href={contact.github} target="_blank" rel="noreferrer noopener">
          GitHub
        </a>
      ),
    })

  return (
    <div className="contact" aria-label="Contact information">
      {items.map((item, idx) => (
        <span key={idx} className={`contact-item ${item.type}`}>
          {idx > 0 && <span className="sep">•</span>}
          {item.node}
        </span>
      ))}
    </div>
  )
}

export default function Resume({ data }: ResumeProps) {
  const [isCompact, setIsCompact] = useState(false)
  const [showCoverLetter, setShowCoverLetter] = useState(false)
  const [isToolbarStuck, setIsToolbarStuck] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const rootClassName = useMemo(() => `resume ${isCompact ? 'compact' : 'detailed'}`, [isCompact])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        setIsToolbarStuck(!entry.isIntersecting)
      },
      { root: null, threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  return (
    <main className={rootClassName}>
      <div ref={sentinelRef} aria-hidden="true" className="toolbar-sentinel" />
      <div className={`toolbar${isToolbarStuck ? ' stuck' : ''}`} role="group" aria-label="Actions">
        <a
          className="toolbar-button"
          href="/docs/reidcollins.pdf"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="View PDF"
        >
          View PDF
        </a>
        <button
          className="toolbar-button"
          onClick={() => setIsCompact((v) => !v)}
          aria-pressed={isCompact}
          aria-label="Toggle compact layout"
        >
          {isCompact ? 'Detailed layout' : 'Compact layout'}
        </button>
        <button
          className="toolbar-button"
          onClick={() => setShowCoverLetter((v) => !v)}
          aria-pressed={showCoverLetter}
          aria-label="Toggle cover letter"
        >
          {showCoverLetter ? 'Hide cover letter' : 'Show cover letter'}
        </button>
        <button className="print-button" onClick={() => window.print()} aria-label="Download PDF">
          Download PDF
        </button>
      </div>
      {showCoverLetter && (
        <section className="section cover-letter">
          <h2 className="section-title">Cover Letter</h2>
          <p>
            {data.coverLetter ||
              'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere erat a ante venenatis dapibus posuere velit aliquet. Maecenas faucibus mollis interdum. Donec ullamcorper nulla non metus auctor fringilla.'}
          </p>
          <p>
            {'Aenean lacinia bibendum nulla sed consectetur. Curabitur blandit tempus porttitor. Sed posuere consectetur est at lobortis. Praesent commodo cursus magna, vel scelerisque nisl consectetur et.'}
          </p>
        </section>
      )}
      <header className="header">
        <h1 className="name">{data.name}</h1>
        <p className="title">{data.title}</p>
        <ContactLine contact={data.contact} />
      </header>

      {data.summary && (
        <section className="section">
          <h2 className="section-title">Summary</h2>
          <p className="summary">{data.summary}</p>
        </section>
      )}

      {data.skills && data.skills.length > 0 && (
        <section className="section">
          <h2 className="section-title">Skills</h2>
          <ul className="skills" aria-label="Skills list">
            {data.skills.map((skill) => (
              <li className="skill-chip" key={skill}>
                {skill}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.experience && data.experience.length > 0 && (
        <section className="section">
          <h2 className="section-title">Experience</h2>
          <ol className="experience" aria-label="Work experience">
            {data.experience.map((item) => (
              <li className="experience-item" key={`${item.company}-${item.role}-${item.period}`}>
                <div className="experience-header">
                  <div className="experience-role-company">
                    <span className="role">{item.role}</span>
                    <span className="at"> at </span>
                    <span className="company">{item.company}</span>
                  </div>
                  <div className="experience-meta">
                    <span className="period">{item.period}</span>
                    {item.location && <span className="sep">•</span>}
                    {item.location && <span className="location">{item.location}</span>}
                  </div>
                </div>
                {item.summary && <p className="experience-summary">{item.summary}</p>}
                {item.achievements && item.achievements.length > 0 && (
                  <ul className="achievements">
                    {item.achievements.map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
                )}
                {item.technologies && item.technologies.length > 0 && (
                  <div className="technologies">
                    <span className="label">Tech:</span>
                    <ul className="tech-list">
                      {item.technologies.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.education && data.education.length > 0 && (
        <section className="section">
          <h2 className="section-title">Education</h2>
          <ul className="education">
            {data.education.map((ed) => (
              <li key={`${ed.school}-${ed.degree}-${ed.period}`} className="education-item">
                <span className="degree">{ed.degree}</span>
                <span className="at"> at </span>
                <span className="school">{ed.school}</span>
                <span className="period"> — {ed.period}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.projects && data.projects.length > 0 && (
        <section className="section">
          <h2 className="section-title">Projects</h2>
          <ul className="projects">
            {data.projects.map((p) => (
              <li key={p.name} className="project-item">
                <div className="project-header">
                  <span className="project-name">{p.name}</span>
                  {p.url && (
                    <a className="project-link" href={p.url} target="_blank" rel="noreferrer noopener">
                      Link
                    </a>
                  )}
                </div>
                {p.description && <p className="project-description">{p.description}</p>}
                {p.technologies && p.technologies.length > 0 && (
                  <div className="technologies">
                    <span className="label">Tech:</span>
                    <ul className="tech-list">
                      {p.technologies.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.certifications && data.certifications.length > 0 && (
        <section className="section">
          <h2 className="section-title">Certifications</h2>
          <ul className="certifications">
            {data.certifications.map((c) => (
              <li key={`${c.name}-${c.issuer}-${c.year}`} className="certification-item">
                <span className="cert-name">{c.name}</span>
                {c.issuer && <span className="issuer"> — {c.issuer}</span>}
                {c.year && <span className="year"> ({c.year})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.links && data.links.length > 0 && (
        <section className="section">
          <h2 className="section-title">Links</h2>
          <ul className="links">
            {data.links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noreferrer noopener">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}


