import type { AutomationStage } from '../../data/automationSuite'
import './MiniStageStrip.css'

interface MiniStageStripProps {
  stages: AutomationStage[]
}

// A left-to-right run of the automation, with the human approval gate marked —
// the point of the visual is that the send does not happen without it.
export default function MiniStageStrip({ stages }: MiniStageStripProps) {
  return (
    <div
      className="ms"
      role="img"
      aria-label={`Run stages: ${stages
        .map((s) => (s.gate ? `${s.label} (human approval gate)` : s.label))
        .join(' → ')}`}
    >
      {stages.map((s, i) => (
        <span className="ms-item" key={s.label}>
          {i > 0 && <span className="ms-sep" aria-hidden="true" />}
          <span className={`ms-stage${s.gate ? ' ms-gate' : ''}`}>
            {s.gate && <span className="ms-gate-mark" aria-hidden="true" />}
            {s.label}
          </span>
        </span>
      ))}
    </div>
  )
}
