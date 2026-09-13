import { useEffect } from 'react'
import { prReviewAgent as pr } from '../data/prReviewAgent'
import MiniReview from '../components/visuals/MiniReview'
import MiniPipeline from '../components/visuals/MiniPipeline'
import './ProjectPage.css'

// Self-hosted overview of the PR Review Agent (RC1-412) — the same shape as
// LaunchPlannerPage and IncidentSummarizerPage, sharing ProjectPage.css.
// Rendered by App.tsx when the path is /projects/pr-review-agent (no router
// dep; Flask's catch-all serves index.html for the deep link).
//
// The index row is the description; this page is the reasoning a row has no
// field for. Each decision below lands on the decision, with the numbers it
// turned on, and links the record in the repository those numbers came from.
export default function PrReviewAgentPage() {
  useEffect(() => {
    document.title = 'PR Review Agent — Reid Collins'
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="tb-skin pp-page">
      <nav className="pp-nav">
        <a className="pp-nav-back" href="/">← Reid Collins</a>
        <span className="pp-nav-links">
          <a href="/work">All work</a>
          <a href={pr.demoUrl} target="_blank" rel="noreferrer noopener">A posted review ↗</a>
          <a href={pr.repoUrl} target="_blank" rel="noreferrer noopener">GitHub ↗</a>
        </span>
      </nav>

      <header className="pp-hero">
        <span className="pp-kicker">{pr.kicker}</span>
        <h1 className="pp-hero-title">{pr.name}</h1>
        <p className="pp-hero-tagline">{pr.tagline}</p>
        <p className="pp-hero-principle">{pr.principle}</p>
        <div className="pp-hero-cta">
          <a className="pp-btn pp-btn-primary" href={pr.demoUrl} target="_blank" rel="noreferrer noopener">
            See a posted review ↗
          </a>
          <a className="pp-btn" href={pr.repoUrl} target="_blank" rel="noreferrer noopener">
            Read the source ↗
          </a>
        </div>
      </header>

      <section className="pp-section">
        <h2 className="pp-h2">What it posts</h2>
        <p className="pp-lede">
          One summary comment and severity-tagged inline findings anchored at file and
          line, closing on a verdict. Advisory by default; it requests changes only when a
          secret was committed. An illustrative review in the agent&rsquo;s own shape:
        </p>
        <div className="pp-visual">
          <MiniReview summary={pr.reviewSummary} findings={pr.findings} verdict={pr.verdict} />
        </div>
        <p className="pp-result">
          <span className="pp-result-kicker">Result</span>
          {pr.result}
        </p>
      </section>

      <section className="pp-section">
        <h2 className="pp-h2">The pipeline</h2>
        <p className="pp-lede">
          No model explores. Python decides which reviewers run and gathers the evidence
          they need; the reviewers judge one cached prefix; a verifier checks their
          findings against it. The scout that once explored the repository between the
          context and the reviewers was measured and removed.
        </p>
        <div className="pp-visual">
          <MiniPipeline stages={pr.pipeline} />
        </div>
        <ol className="pp-pipeline pp-pipeline-stages">
          {pr.pipeline.map((s, i) => (
            <li className="pp-stage" key={s.key}>
              <span className="pp-stage-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="pp-stage-label">{s.label}</span>
              <span className="pp-stage-blurb">{s.blurb}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="pp-section">
        <h2 className="pp-h2">Decisions, with the numbers</h2>
        <p className="pp-lede">
          Four places the design could have gone another way. Each was measured before it
          was decided, and every figure traces to a decision record in the repository.
        </p>
        <div className="pp-decisions">
          {pr.decisions.map((d) => (
            <article className="pp-decision" key={d.key} id={`decision-${d.key}`}>
              <h3 className="pp-decision-title">
                {d.title}
                <span className="pp-decision-ticket">{d.ticket}</span>
              </h3>
              <p className="pp-decision-question">{d.question}</p>
              <p className="pp-decision-method">{d.method}</p>
              <table className="pp-measures">
                <tbody>
                  {d.measures.map((m) => (
                    <tr key={m.label}>
                      <th scope="row">{m.label}</th>
                      <td>{m.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="pp-decision-verdict">{d.verdict}</p>
              <a
                className="pp-record"
                href={`${pr.repoUrl}/blob/main/${d.record}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                Decision record ↗ <code>{d.record}</code>
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="pp-section">
        <h2 className="pp-h2">Built with</h2>
        <ul className="pp-tech">
          {pr.technologies.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <footer className="pp-foot">
        <a className="pp-btn pp-btn-primary" href={pr.demoUrl} target="_blank" rel="noreferrer noopener">
          See a posted review ↗
        </a>
        <a className="pp-btn" href={pr.repoUrl} target="_blank" rel="noreferrer noopener">GitHub ↗</a>
        <a className="pp-nav-back" href="/">← Back to résumé</a>
      </footer>
    </div>
  )
}
