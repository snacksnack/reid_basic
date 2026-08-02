import { useEffect } from 'react'
import { launchPlanner as lp } from '../data/launchPlanner'
import MiniGantt from '../components/MiniGantt'
import './LaunchPlannerPage.css'

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
    <div className="tb-skin lp-page">
      <nav className="lp-nav">
        <a className="lp-nav-back" href="/">← Reid Collins</a>
        <span className="lp-nav-links">
          <a href={lp.demoUrl} target="_blank" rel="noreferrer noopener">Live demo ↗</a>
          <a href={lp.repoUrl} target="_blank" rel="noreferrer noopener">GitHub ↗</a>
        </span>
      </nav>

      <header className="lp-hero">
        <span className="lp-kicker">{lp.kicker}</span>
        <h1 className="lp-hero-title">{lp.name}</h1>
        <p className="lp-hero-tagline">{lp.tagline}</p>
        <p className="lp-hero-principle">{lp.principle}</p>
        <div className="lp-hero-cta">
          <a className="lp-btn lp-btn-primary" href={lp.demoUrl} target="_blank" rel="noreferrer noopener">
            Open the live demo ↗
          </a>
          <a className="lp-btn" href={lp.repoUrl} target="_blank" rel="noreferrer noopener">
            Read the source ↗
          </a>
        </div>
      </header>

      <section className="lp-section">
        <h2 className="lp-h2">The plan it produces</h2>
        <p className="lp-lede">
          A deterministic critical-path schedule — float, deadlines, and the critical
          path that actually drives the launch date. Illustrative slice of the flagship
          On-Prem&nbsp;Jira&nbsp;→&nbsp;Jira&nbsp;Cloud migration:
        </p>
        <MiniGantt tasks={lp.gantt} />
      </section>

      <section className="lp-section">
        <h2 className="lp-h2">PRD in, plan out</h2>
        <ol className="lp-pipeline">
          {lp.pipeline.map((s, i) => (
            <li className="lp-stage" key={s.key}>
              <span className="lp-stage-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="lp-stage-label">{s.label}</span>
              <span className="lp-stage-blurb">{s.blurb}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-section">
        <h2 className="lp-h2">Eight surfaces</h2>
        <div className="lp-surfaces">
          {lp.surfaces.map((s) => (
            <div className="lp-surface" key={s.name}>
              <span className="lp-surface-name">{s.name}</span>
              <span className="lp-surface-blurb">{s.blurb}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <h2 className="lp-h2">An audit trail, not a black box</h2>
        <div className="lp-principles">
          {lp.principles.map((p) => (
            <div className="lp-principle" key={p.title}>
              <h3 className="lp-principle-title">{p.title}</h3>
              <p className="lp-principle-blurb">{p.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="lp-foot">
        <a className="lp-btn lp-btn-primary" href={lp.demoUrl} target="_blank" rel="noreferrer noopener">
          Open the live demo ↗
        </a>
        <a className="lp-btn" href={lp.repoUrl} target="_blank" rel="noreferrer noopener">GitHub ↗</a>
        <a className="lp-nav-back" href="/">← Back to résumé</a>
      </footer>
    </div>
  )
}
