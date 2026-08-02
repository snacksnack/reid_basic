import type { GanttTask } from '../data/launchPlanner'
import './MiniGantt.css'

interface MiniGanttProps {
  tasks: GanttTask[]
  compact?: boolean // tighter rows for the homepage card
}

// A small, static Gantt: one row per task, bars positioned on a shared time
// axis, with the critical path highlighted. Mirrors the CareerTimeline bar
// idiom but as horizontal tracks. Pure presentation — no interactivity.
export default function MiniGantt({ tasks, compact = false }: MiniGanttProps) {
  const total = Math.max(...tasks.map((t) => t.start + t.span), 1)

  return (
    <div className={`mg${compact ? ' mg-compact' : ''}`} role="img" aria-label="Illustrative project schedule with the critical path highlighted">
      {tasks.map((t) => (
        <div className="mg-row" key={t.name}>
          <span className="mg-label" title={t.name}>{t.name}</span>
          <span className="mg-track">
            <span
              className={`mg-bar${t.critical ? ' mg-crit' : ''}`}
              style={{ left: `${(t.start / total) * 100}%`, width: `${(t.span / total) * 100}%` }}
            />
          </span>
        </div>
      ))}
      <div className="mg-legend">
        <span className="mg-key mg-key-crit">critical path</span>
        <span className="mg-key mg-key-par">parallel work</span>
      </div>
    </div>
  )
}
