import { useEffect } from 'react'
import { incidentSummarizer as inc } from '../data/incidentSummarizer'
import MiniFunnel from '../components/visuals/MiniFunnel'
import './ProjectPage.css'

// Self-hosted overview of the AI Incident Summarizer (RC1-225) — the same shape
// as LaunchPlannerPage, sharing ProjectPage.css. Rendered by App.tsx when the
// path is /projects/incident-summarizer (no router dep; Flask's catch-all
// serves index.html for the deep link).
export default function IncidentSummarizerPage() {
  useEffect(() => {
    document.title = 'AI Incident Summarizer — Reid Collins'
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="tb-skin pp-page">
      <nav className="pp-nav">
        <a className="pp-nav-back" href="/">← Reid Collins</a>
        <span className="pp-nav-links">
          <a href="/work">All work</a>
          <a href={inc.demoUrl} target="_blank" rel="noreferrer noopener">Live demo ↗</a>
          <a href={inc.repoUrl} target="_blank" rel="noreferrer noopener">GitHub ↗</a>
        </span>
      </nav>

      <header className="pp-hero">
        <span className="pp-kicker">{inc.kicker}</span>
        <h1 className="pp-hero-title">{inc.name}</h1>
        <p className="pp-hero-tagline">{inc.tagline}</p>
        <p className="pp-hero-principle">{inc.principle}</p>
        <div className="pp-hero-cta">
          <a className="pp-btn pp-btn-primary" href={inc.demoUrl} target="_blank" rel="noreferrer noopener">
            Open the live demo ↗
          </a>
          <a className="pp-btn" href={inc.repoUrl} target="_blank" rel="noreferrer noopener">
            Read the source ↗
          </a>
        </div>
      </header>

      <section className="pp-section">
        <h2 className="pp-h2">Many alerts in, one incident out</h2>
        <p className="pp-lede">
          Three observability sources fire independently during the same failure. Rather
          than paging on each, they are collapsed into a single incident with one summary
          and one thread:
        </p>
        <div className="pp-visual">
          <MiniFunnel sources={inc.sources} collapse={inc.collapse} incident={inc.incident} />
        </div>
      </section>

      <section className="pp-section">
        <h2 className="pp-h2">Alert in, incident out</h2>
        <ol className="pp-pipeline">
          {inc.pipeline.map((s, i) => (
            <li className="pp-stage" key={s.key}>
              <span className="pp-stage-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="pp-stage-label">{s.label}</span>
              <span className="pp-stage-blurb">{s.blurb}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="pp-section">
        <h2 className="pp-h2">Decisions the design turns on</h2>
        <div className="pp-principles">
          {inc.principles.map((p) => (
            <div className="pp-principle" key={p.title}>
              <h3 className="pp-principle-title">{p.title}</h3>
              <p className="pp-principle-blurb">{p.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pp-section">
        <h2 className="pp-h2">Built with</h2>
        <ul className="pp-tech">
          {inc.technologies.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <footer className="pp-foot">
        <a className="pp-btn pp-btn-primary" href={inc.demoUrl} target="_blank" rel="noreferrer noopener">
          Open the live demo ↗
        </a>
        <a className="pp-btn" href={inc.repoUrl} target="_blank" rel="noreferrer noopener">GitHub ↗</a>
        <a className="pp-nav-back" href="/">← Back to résumé</a>
      </footer>
    </div>
  )
}
