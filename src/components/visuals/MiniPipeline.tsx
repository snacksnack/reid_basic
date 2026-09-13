import type { PipelineStage } from '../../data/prReviewAgent'
import './MiniPipeline.css'

interface MiniPipelineProps {
  stages: readonly PipelineStage[]
}

// The review pipeline as a left-to-right flow (RC1-412): one box per stage,
// the fan-out drawn as three stacked reviewers on one prefix. Python stages
// and model stages are told apart by style, because that split — Python
// decides, the model judges — is the design, and the index row's MiniReview
// shows only the output shape.
export default function MiniPipeline({ stages }: MiniPipelineProps) {
  const label = stages
    .map((s) =>
      s.branches
        ? `${s.label} (${s.actor}): ${s.branches.map((b) => b.name).join(', ')}`
        : `${s.label} (${s.actor})`,
    )
    .join(' → ')

  return (
    <div className="mp" role="img" aria-label={`Review pipeline: ${label}`}>
      <div className="mp-flow">
        {stages.map((s, i) => (
          <span className="mp-item" key={s.key}>
            {i > 0 && <span className="mp-sep" aria-hidden="true" />}
            {s.branches ? (
              <span className={`mp-fan mp-${s.actor}`}>
                <span className="mp-fan-label">{s.label}</span>
                <span className="mp-branches">
                  {s.branches.map((b) => (
                    <span className="mp-branch" key={b.name}>
                      <span className="mp-branch-name">{b.name}</span>
                      <span className="mp-branch-evidence">{b.evidence}</span>
                    </span>
                  ))}
                </span>
              </span>
            ) : (
              <span className={`mp-stage mp-${s.actor}`}>{s.label}</span>
            )}
          </span>
        ))}
      </div>
      <div className="mp-legend" aria-hidden="true">
        <span className="mp-key">
          <span className="mp-swatch mp-python" /> Python decides
        </span>
        <span className="mp-key">
          <span className="mp-swatch mp-model" /> the model judges
        </span>
        <span className="mp-key mp-key-note">no stage after the router calls a tool</span>
      </div>
    </div>
  )
}
