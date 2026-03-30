import React, { useEffect, useRef, useState } from 'react'
import CareerTimeline, { slugify } from './CareerTimeline'

export interface AchievementGroup {
  heading: string
  items: string[]
}

export interface ExperienceItem {
  company: string
  role: string
  period: string
  location?: string
  summary?: string
  achievements?: string[]
  achievementGroups?: AchievementGroup[]
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

export interface SkillCategory {
  category: string
  items: string[]
}

export interface TimelineEntry {
  company: string
  role: string
  period: string
}

export interface ResumeData {
  name: string
  title: string
  tagline?: string
  contact?: ContactInfo
  summary?: string
  skills?: string[]
  skillCategories?: SkillCategory[]
  experience?: ExperienceItem[]
  timelineEntries?: TimelineEntry[]
  education?: EducationItem[]
  links?: LinkItem[]
  projects?: ProjectItem[]
  certifications?: CertificationItem[]
  coverLetter?: string
}

interface ResumeProps {
  data: ResumeData
  onContactClick?: () => void
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
          {contact.linkedin.replace(/^https?:\/\//, '')}
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

export default function Resume({ data, onContactClick }: ResumeProps) {
  const [isToolbarStuck, setIsToolbarStuck] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const rootClassName = 'resume'

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
          href="/api/download/pdf"
          aria-label="Download PDF"
        >
          Download PDF
        </a>
        <a
          className="toolbar-button"
          href="/api/download/docx"
          aria-label="Download DOCX"
        >
          Download DOCX
        </a>
        {onContactClick && (
          <button
            className="toolbar-button"
            onClick={onContactClick}
            aria-label="Contact Reid"
          >
            Contact Reid
          </button>
        )}
      </div>
      <header className="header">
        <h1 className="name">{data.name}</h1>
        <p className="title">{data.title}</p>
        <ContactLine contact={data.contact} />
        {data.tagline && <p className="tagline">{data.tagline}</p>}
      </header>

      {data.summary && (
        <section className="section">
          <h2 className="section-title">Summary</h2>
          <p className="summary">{data.summary}</p>
        </section>
      )}

      {data.skillCategories && data.skillCategories.length > 0 && (
        <section className="section">
          <h2 className="section-title">Technical Skills</h2>
          <dl className="skill-categories" aria-label="Skills list">
            {data.skillCategories.map((cat) => (
              <div className="skill-category" key={cat.category}>
                <dt className="skill-category-label">{cat.category}:</dt>
                <dd className="skill-category-items">{cat.items.join(', ')}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {!data.skillCategories && data.skills && data.skills.length > 0 && (
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
          <h2 className="section-title">Professional Experience</h2>
          <CareerTimeline experience={data.experience} timelineEntries={data.timelineEntries} />
          <ol className="experience" aria-label="Work experience">
            {data.experience.map((item) => (
              <li className="experience-item" id={`exp-${slugify(item.company)}`} key={`${item.company}-${item.role}-${item.period}`}>
                <div className="experience-header">
                  <div className="company">{item.company}</div>
                  <div className="experience-role-period">
                    <span className="role">{item.role}</span>
                    <span className="period">{item.period}</span>
                  </div>
                  {item.location && <div className="experience-location">{item.location}</div>}
                </div>
                {item.summary && <p className="experience-summary">{item.summary}</p>}
                {item.achievementGroups && item.achievementGroups.length > 0 && (
                  <div className="achievement-groups">
                    {item.achievementGroups.map((group) => (
                      <div className="achievement-group" key={group.heading}>
                        <h4 className="achievement-group-heading">{group.heading}</h4>
                        <ul className="achievements">
                          {group.items.map((a, idx) => (
                            <li key={idx}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
                {!item.achievementGroups && item.achievements && item.achievements.length > 0 && (
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
                <span className="school"> — {ed.school}</span>
                {ed.period && <span className="period"> ({ed.period})</span>}
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


