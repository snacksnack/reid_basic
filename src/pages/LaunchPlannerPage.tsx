import { useEffect } from 'react'
import { launchPlanner as lp } from '../data/launchPlanner'
import MiniGantt from '../components/MiniGantt'
import './ProjectPage.css'

// Self-hosted overview of the Launch Planner project (RC1-206) — the richer,
// on-domain version of the RC1-204 quick-start, in the site's own aesthetic.
// Rendered by App.tsx when the path is /projects/launch-planner (no router dep;
// Flask's catch-all serves index.html for the deep link).
export default function LaunchPlannerPage() {
  useEffect(() => {
    document.title = 'Launch Planner — Reid Collins'
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="tb-skin pp-page">
      <nav className="pp-nav">
        <a className="pp-nav-back" href="/">← Reid Collins</a>
        <span className="pp-nav-links">
          <a href={lp.demoUrl} target="_blank" rel="noreferrer noopener">Live demo ↗</a>
          <a href={lp.repoUrl} target="_blank" rel="noreferrer noopener">GitHub ↗</a>
        </span>
      </nav>

      <header className="pp-hero">
        <span className="pp-kicker">{lp.kicker}</span>
        <h1 className="pp-hero-title">{lp.name}</h1>
        <p className="pp-hero-tagline">{lp.tagline}</p>
        <p className="pp-hero-principle">{lp.principle}</p>
        <div className="pp-hero-cta">
          <a className="pp-btn pp-btn-primary" href={lp.demoUrl} target="_blank" rel="noreferrer noopener">
            Open the live demo ↗
          </a>
          <a className="pp-btn" href={lp.repoUrl} target="_blank" rel="noreferrer noopener">
            Read the source ↗
          </a>
        </div>
      </header>

      <section className="pp-section">
        <h2 className="pp-h2">The plan it produces</h2>
        <p className="pp-lede">
          A deterministic critical-path schedule — float, deadlines, and the critical
          path that actually drives the launch date. Illustrative slice of the flagship
          On-Prem&nbsp;Jira&nbsp;→&nbsp;Jira&nbsp;Cloud migration:
        </p>
        <MiniGantt tasks={lp.gantt} />
      </section>

      <section className="pp-section">
        <h2 className="pp-h2">PRD in, plan out</h2>
        <ol className="pp-pipeline">
          {lp.pipeline.map((s, i) => (
            <li className="pp-stage" key={s.key}>
              <span className="pp-stage-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="pp-stage-label">{s.label}</span>
              <span className="pp-stage-blurb">{s.blurb}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="pp-section">
        <h2 className="pp-h2">Eight surfaces</h2>
        <div className="pp-surfaces">
          {lp.surfaces.map((s) => (
            <div className="pp-surface" key={s.name}>
              <span className="pp-surface-name">{s.name}</span>
              <span className="pp-surface-blurb">{s.blurb}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="pp-section">
        <h2 className="pp-h2">An audit trail, not a black box</h2>
        <div className="pp-principles">
          {lp.principles.map((p) => (
            <div className="pp-principle" key={p.title}>
              <h3 className="pp-principle-title">{p.title}</h3>
              <p className="pp-principle-blurb">{p.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="pp-foot">
        <a className="pp-btn pp-btn-primary" href={lp.demoUrl} target="_blank" rel="noreferrer noopener">
          Open the live demo ↗
        </a>
        <a className="pp-btn" href={lp.repoUrl} target="_blank" rel="noreferrer noopener">GitHub ↗</a>
        <a className="pp-nav-back" href="/">← Back to résumé</a>
      </footer>
    </div>
  )
}
