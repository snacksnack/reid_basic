import { useState } from 'react'
import type { ExperienceItem, TimelineEntry } from './Resume'
import './CareerTimeline.css'

interface Segment {
  company: string
  role: string
  startYear: number
  endYear: number
  years: number
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

interface TimelineProps {
  experience: ExperienceItem[]
  timelineEntries?: TimelineEntry[]
  linkedCompanies?: string[]
}

function parseEntries(entries: Array<{ company: string; role: string; period: string }>): Segment[] {
  const currentYear = new Date().getFullYear()
  return entries
    .map((item) => {
      const parts = item.period.split(/\s*[—–-]\s*/)
      const startYear = parseInt(parts[0], 10)
      const endYear = parts[1]?.toLowerCase() === 'present' || !parts[1]
        ? currentYear
        : parseInt(parts[1], 10)
      return {
        company: item.company,
        role: item.role,
        startYear,
        endYear,
        years: endYear - startYear,
      }
    })
    .sort((a, b) => a.startYear - b.startYear)
}

const SHADES = ['#c0d6fa', '#93b8f7', '#5a94f5', '#0f62fe']

function findBestMatch(segCompany: string, companies: string[]): string | null {
  const segWords = segCompany.toLowerCase().split(/[\s/()]+/).filter(Boolean)
  for (const c of companies) {
    const cWords = c.toLowerCase().split(/[\s/()]+/).filter(Boolean)
    if (segWords.some((w) => w.length > 2 && cWords.some((cw) => cw.includes(w) || w.includes(cw)))) {
      return c
    }
  }
  return null
}

export default function CareerTimeline({ experience, timelineEntries, linkedCompanies }: TimelineProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const source = timelineEntries && timelineEntries.length > 0 ? timelineEntries : experience
  const segments = parseEntries(source)
  const expCompanies = linkedCompanies || experience.map((e) => e.company)
  const totalYears = segments.reduce((sum, s) => sum + s.years, 0)

  if (segments.length === 0) return null

  return (
    <div className="timeline" aria-label="Career timeline">
      <div className="timeline-bar">
        {segments.map((seg, i) => {
          const widthPct = (seg.years / totalYears) * 100
          return (
            <div
              key={i}
              className={`timeline-segment${hovered === i ? ' active' : ''}`}
              style={{
                width: `${widthPct}%`,
                background: SHADES[i % SHADES.length],
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => {
                const match = findBestMatch(seg.company, expCompanies)
                if (match) {
                  const el = document.getElementById(`exp-${slugify(match)}`)
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              }}
            >
              <span className="timeline-segment-label">
                {seg.company.split(/[/(]/)[0].trim()}
              </span>
            </div>
          )
        })}
      </div>
      <div className="timeline-years">
        <span>{segments[0].startYear}</span>
        <span>{segments[segments.length - 1].endYear}</span>
      </div>
      {hovered !== null && (
        <div className="timeline-tooltip">
          <strong>{segments[hovered].company}</strong>
          <span>{segments[hovered].role}</span>
          <span>{segments[hovered].startYear}–{segments[hovered].endYear} ({segments[hovered].years} yr{segments[hovered].years !== 1 ? 's' : ''})</span>
        </div>
      )}
    </div>
  )
}
