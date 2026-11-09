import type { ShapeRow } from '../../data/pocBenchmarkAgent'
import './MiniCeiling.css'

interface MiniCeilingProps {
  shapes: ShapeRow[]
  ceiling: number
  caption: string
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

// Why the agent refused (RC1-635): each query shape's failure rate today and
// on the strongest setup the space allows, against the 1% ceiling. A value
// over the ceiling is the one colored thing on its line, so the reader sees
// the strong setup clear most of the page and the three shapes it could not.
export default function MiniCeiling({ shapes, ceiling, caption }: MiniCeilingProps) {
  const over = shapes.filter((s) => s.best > ceiling).length

  return (
    <figure
      className="mc"
      role="img"
      aria-label={`Errors and timeouts at 32 sessions, today versus the best tested setup: ${shapes
        .map((s) => `${s.label}, today ${pct(s.today)}, best ${pct(s.best)}`)
        .join('; ')}`}
    >
      <div className="mc-head">
        <span>Query shape</span>
        <span className="mc-col">Today</span>
        <span className="mc-col">4 CU, all 8</span>
      </div>

      <ul className="mc-rows">
        {shapes.map((s) => (
          <li className="mc-row" key={s.label}>
            <span className="mc-label">{s.label}</span>
            <span className={`mc-val${s.today > ceiling ? ' over' : ''}`}>{pct(s.today)}</span>
            <span className={`mc-val${s.best > ceiling ? ' over' : ''}`}>{pct(s.best)}</span>
          </li>
        ))}
      </ul>

      <div className="mc-tally">
        <span className="mc-tally-value">
          {over} of {shapes.length}
        </span>
        <span className="mc-tally-note">
          shapes still over the {Math.round(ceiling * 100)}% ceiling on the strongest permitted setup
        </span>
      </div>

      <figcaption className="mc-caption">{caption}</figcaption>
    </figure>
  )
}
