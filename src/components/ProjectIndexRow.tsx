import type { ReactNode } from 'react'
import type { ProjectCardContent } from '../data/projectCard'

interface ProjectIndexRowProps {
  id: string
  content: ProjectCardContent
  open: boolean
  onToggle: () => void
  children: ReactNode // the project's visual
}

// One row of the Projects index (RC1-216): a button header that reads as a
// single scannable line, and — when open — the full spec sheet beneath it.
// The header is a real <button> so it is keyboard-reachable and announces its
// expanded state.
export default function ProjectIndexRow({
  id,
  content,
  open,
  onToggle,
  children,
}: ProjectIndexRowProps) {
  const panelId = `${id}-panel`

  return (
    <div className="pi-row">
      <button
        type="button"
        className="pi-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="pi-id">
          <span className={`pi-kicker${content.flagship ? ' pi-kicker-flagship' : ''}`}>
            {content.kicker}
          </span>
          <span className="pi-name">{content.name}</span>
        </span>
        <span className="pi-lead">{content.lead}</span>
        <span className="pi-mark" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <div className="pi-panel" id={panelId}>
          <p className="pi-tagline">{content.tagline}</p>

          <div className="pi-visual">{children}</div>

          {content.note && <p className="pi-note">{content.note}</p>}

          {content.evals && (
            <p className="pi-evals">
              <span className="pi-evals-kicker">Under eval</span>
              {content.evals.blurb}{' '}
              <a
                className="pi-evals-link"
                href={content.evals.href}
                target="_blank"
                rel="noreferrer noopener"
              >
                Quality trend ↗
              </a>
            </p>
          )}

          <div className="pi-meta">
            <ul className="pi-tech">
              {content.technologies.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>

            <div className="pi-links">
              {content.links.map((l) => (
                <a
                  key={l.href}
                  className={`pi-btn${l.primary ? ' pi-btn-primary' : ''}`}
                  href={l.href}
                  {...(l.internal ? {} : { target: '_blank', rel: 'noreferrer noopener' })}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
