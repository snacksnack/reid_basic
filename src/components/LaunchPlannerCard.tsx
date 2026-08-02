import { launchPlanner as lp } from '../data/launchPlanner'
import MiniGantt from './MiniGantt'
import './LaunchPlannerCard.css'

// The flagship project card for the résumé's Projects section (RC1-206). A
// compact teaser — kicker, tagline, a mini-Gantt with the critical path, tech,
// and the chain out: overview page → live demo → source.
export default function LaunchPlannerCard() {
  return (
    <div className="lp-card">
      <div className="lp-card-head">
        <span className="lp-kicker">{lp.kicker}</span>
        <h3 className="lp-card-title">{lp.name}</h3>
      </div>
      <p className="lp-card-tagline">{lp.tagline}</p>

      <MiniGantt tasks={lp.gantt} compact />

      <ul className="lp-tech">
        {lp.technologies.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      <div className="lp-card-links">
        <a className="lp-btn lp-btn-primary" href={lp.overviewPath}>
          View the overview →
        </a>
        <a className="lp-btn" href={lp.demoUrl} target="_blank" rel="noreferrer noopener">
          Live demo ↗
        </a>
        <a className="lp-btn" href={lp.repoUrl} target="_blank" rel="noreferrer noopener">
          GitHub ↗
        </a>
      </div>
    </div>
  )
}
