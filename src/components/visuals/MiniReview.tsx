import type { ReviewFinding } from '../../data/prReviewAgent'
import './MiniReview.css'

interface MiniReviewProps {
  summary: string
  findings: ReviewFinding[]
  verdict: string
}

// A miniature of what the agent actually posts on a PR: one summary comment,
// then severity-tagged inline findings anchored at file:line, GitHub-review
// style, closing on the verdict.
export default function MiniReview({ summary, findings, verdict }: MiniReviewProps) {
  return (
    <div
      className="mr"
      role="img"
      aria-label={`An example posted review: ${summary} ${findings
        .map((f) => `${f.severity} at ${f.location} — ${f.message}`)
        .join(' ')} ${verdict}`}
    >
      <div className="mr-head">
        <span className="mr-avatar" aria-hidden="true">
          PR
        </span>
        <span className="mr-actor">pr-review-agent</span>
        <span className="mr-action">reviewed</span>
      </div>

      <p className="mr-summary">{summary}</p>

      <ul className="mr-findings">
        {findings.map((f) => (
          <li className={`mr-finding mr-${f.severity}`} key={f.location}>
            <span className="mr-sev">{f.severity}</span>
            <span className="mr-loc">{f.location}</span>
            <span className="mr-cat">{f.category}</span>
            <span className="mr-msg">{f.message}</span>
          </li>
        ))}
      </ul>

      <div className="mr-verdict">{verdict}</div>
    </div>
  )
}
