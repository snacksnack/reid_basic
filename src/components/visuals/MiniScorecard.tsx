import type { ScoreDimension, ScoredShow } from '../../data/concertIntelligence'
import './MiniScorecard.css'

interface MiniScorecardProps {
  show: ScoredShow
  dimensions: ScoreDimension[]
  caption: string
}

// One scored show, broken out the way the workflow stores it: five weighted
// dimensions, each a bar against its own ceiling, summing to the total. The
// visual exists to show that the ranking is arithmetic — every point is
// attributable, and the model never touches it.
export default function MiniScorecard({ show, dimensions, caption }: MiniScorecardProps) {
  // Two lengths per row, so the picture carries both facts: the track is as
  // long as the dimension is heavy (against the heaviest one), and the fill is
  // the share earned. A 10/10 venue therefore reads as a short full bar, not as
  // the equal of a 30/30 — which is what a per-row normalization would imply.
  const heaviest = Math.max(...dimensions.map((d) => d.max))

  return (
    <div
      className="mc"
      role="img"
      aria-label={`Scorecard for ${show.artist} at ${show.venue} ${show.when}: ${dimensions
        .map((d) => `${d.label} ${d.points} of ${d.max} — ${d.detail}`)
        .join('; ')}. Total ${show.total} out of ${show.max}. ${caption}`}
    >
      <div className="mc-head">
        <span className="mc-artist">{show.artist}</span>
        <span className="mc-where">
          {show.venue} · {show.when}
        </span>
      </div>

      <ul className="mc-dims">
        {dimensions.map((d) => (
          <li className="mc-dim" key={d.label}>
            <span className="mc-label">{d.label}</span>
            <span className="mc-track" style={{ width: `${(d.max / heaviest) * 100}%` }}>
              <span
                className={`mc-fill${d.points === d.max ? ' mc-fill-full' : ''}`}
                style={{ width: `${(d.points / d.max) * 100}%` }}
              />
            </span>
            <span className="mc-points">
              {d.points}
              <span className="mc-max">/{d.max}</span>
            </span>
            <span className="mc-detail">{d.detail}</span>
          </li>
        ))}
      </ul>

      <div className="mc-total">
        <span className="mc-total-label">Concert score</span>
        <span className="mc-total-value">
          {show.total}
          <span className="mc-max">/{show.max}</span>
        </span>
      </div>

      <div className="mc-caption">{caption}</div>
    </div>
  )
}
