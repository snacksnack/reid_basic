import type { BoardRole } from '../../data/jobSearchAgent'
import './MiniBoard.css'

interface MiniBoardProps {
  roles: BoardRole[]
  sortNote: string // what the board is sorted on, shown in the header
  caption: string
}

// The local job board in miniature: each role carries its match percent, the
// skill match's green/amber chips, and the status the dropdown wrote back. The
// point of the visual is that the ranking is explained on the card — the score
// and the gaps sit next to each other, not in a log somewhere.
export default function MiniBoard({ roles, sortNote, caption }: MiniBoardProps) {
  return (
    <div
      className="mb"
      role="img"
      aria-label={`An illustrative job board. ${roles
        .map(
          (r) =>
            `${r.title}, ${r.domain}, ${r.meta}, scoring ${r.score} out of 100 — matched on ${r.matched.join(
              ', ',
            )}; gaps: ${r.gaps.join(', ')}; marked ${r.status}.`,
        )
        .join(' ')} ${caption}`}
    >
      <div className="mb-head">
        <span className="mb-title">jobs.json</span>
        <span className="mb-count">{sortNote}</span>
      </div>

      <ul className="mb-roles">
        {roles.map((r) => (
          <li className="mb-role" key={r.title}>
            <span className="mb-score">{r.score}</span>

            <span className="mb-body">
              <span className="mb-line">
                <span className="mb-role-title">{r.title}</span>
                <span className="mb-domain">{r.domain}</span>
              </span>

              <span className="mb-meta">{r.meta}</span>

              <span className="mb-chips">
                {r.matched.map((s) => (
                  <span className="mb-chip mb-chip-met" key={s}>
                    {s}
                  </span>
                ))}
                {r.gaps.map((s) => (
                  <span className="mb-chip mb-chip-gap" key={s}>
                    {s}
                  </span>
                ))}
              </span>
            </span>

            <span className={`mb-status mb-status-${r.status.toLowerCase()}`}>{r.status}</span>
          </li>
        ))}
      </ul>

      <div className="mb-caption">{caption}</div>
    </div>
  )
}
