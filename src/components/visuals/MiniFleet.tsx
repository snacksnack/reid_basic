import type { FleetApp } from '../../data/fleetObservability'
import './MiniFleet.css'

interface MiniFleetProps {
  apps: FleetApp[]
  caption: string
}

// The fleet's spend at index-row size (RC1-410): one bar per ml_app, ranked.
// A single measure across nine entities, so one hue for every bar — colour
// would otherwise track rank, which changes whenever the window does. The
// value sits beside each bar rather than in a tooltip: nine rows read as a
// table, and a direct label survives print, keyboard and screen readers.

const money = (n: number) => (n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`)

export default function MiniFleet({ apps, caption }: MiniFleetProps) {
  const max = Math.max(...apps.map((a) => a.cost))
  const total = apps.reduce((sum, a) => sum + a.cost, 0)

  const label = `Cost by ml_app over the window: ${apps
    .map((a) => `${a.app} ${money(a.cost)}`)
    .join(', ')}. Total ${money(total)} across ${apps.length} apps. ${caption}`

  return (
    <div className="mf" role="img" aria-label={label}>
      <div className="mf-head">
        <span className="mf-title">cost by ml_app · 30 days</span>
        <span className="mf-scope">
          {apps.length} apps · {money(total)}
        </span>
      </div>

      <ul className="mf-rows">
        {apps.map((a) => (
          <li className="mf-row" key={a.app}>
            <span className="mf-name">{a.app}</span>
            <span className="mf-track">
              {/* Floor the width so the smallest app is still visibly present
                  — a zero-width bar would read as "not running". */}
              <span
                className="mf-bar"
                style={{ width: `${Math.max((a.cost / max) * 100, 1.5)}%` }}
              />
            </span>
            <span className="mf-val">{money(a.cost)}</span>
          </li>
        ))}
      </ul>

      <div className="mf-caption">{caption}</div>
    </div>
  )
}
