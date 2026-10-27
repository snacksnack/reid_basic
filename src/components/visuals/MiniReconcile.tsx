import type { ReconcileCheck } from '../../data/espMigrationAgent'
import './MiniReconcile.css'

interface MiniReconcileProps {
  checks: ReconcileCheck[]
  caption: string
}

// The acceptance table from the live run (RC1-549): the reconciliation
// report is the artifact the customer signs, so the visual draws the report
// itself rather than another pipeline strip. Every row is an enumerated
// check with its measured count; the PASS badge is the row of the story.
export default function MiniReconcile({ checks, caption }: MiniReconcileProps) {
  return (
    <figure
      className="mr"
      role="img"
      aria-label={`Reconciliation report, overall PASS: ${checks
        .map((c) => `${c.label} ${c.measured}`)
        .join('; ')}`}
    >
      <div className="mr-head">
        <span className="mr-title">Reconciliation report</span>
        <span className="mr-pass">PASS</span>
      </div>
      <ul className="mr-rows">
        {checks.map((c) => (
          <li className="mr-row" key={c.label}>
            <span className="mr-check" aria-hidden="true" />
            <span className="mr-label">{c.label}</span>
            <span className="mr-measured">{c.measured}</span>
          </li>
        ))}
      </ul>
      <figcaption className="mr-caption">{caption}</figcaption>
    </figure>
  )
}
