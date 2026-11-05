import type { BreakRow } from '../../data/apiCompatibilityLab'
import './MiniBlindspot.css'

interface MiniBlindspotProps {
  breaks: BreakRow[]
  caption: string
}

// The scorecard's central comparison (RC1-612), drawn as the two columns that
// disagree: what the schema-diff baseline said about each documented break,
// and what replaying real traffic found. Three of the four rows are the
// project's whole argument, so the blind rows carry the emphasis and the one
// the baseline did report is left plain.
export default function MiniBlindspot({ breaks, caption }: MiniBlindspotProps) {
  const blind = breaks.filter((b) => b.blind).length

  return (
    <figure
      className="mb"
      role="img"
      aria-label={`Documented behavioral breaks, schema diff versus replay: ${breaks
        .map((b) => `${b.label}, schema diff ${b.baseline}, replay caught`)
        .join('; ')}`}
    >
      <div className="mb-head">
        <span className="mb-head-label">Documented behavioral break</span>
        <span className="mb-head-col">Schema diff</span>
        <span className="mb-head-col">Replay</span>
      </div>

      <ul className="mb-rows">
        {breaks.map((b) => (
          <li className={`mb-row${b.blind ? ' blind' : ''}`} key={b.label}>
            <span className="mb-label">{b.label}</span>
            <span className="mb-base">{b.baseline}</span>
            <span className="mb-caught">caught</span>
          </li>
        ))}
      </ul>

      <div className="mb-tally">
        <span className="mb-tally-value">
          {blind} of {breaks.length}
        </span>
        <span className="mb-tally-note">
          caught with no usable warning from the schema diff
        </span>
      </div>

      <figcaption className="mb-caption">{caption}</figcaption>
    </figure>
  )
}
