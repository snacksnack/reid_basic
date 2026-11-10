import type { FleetApp } from '../../data/fleetObservability'
import './MiniFleet.css'

interface MiniFleetProps {
  apps: FleetApp[]
  caption: string
}

// The fleet's spend at index-row size (RC1-410, split in RC1-637): one bar per
// ml_app, ranked by total, each split into production and test runs. Two
// series, so a legend sits in the header and every row carries its total as
// text: color is never the only way to read it. The value sits beside each
// bar rather than in a tooltip, so it survives print, keyboard and screen
// readers; the per-segment split is in the row's title and the aria label.

const money = (n: number) => (n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`)

const total = (a: FleetApp) => a.production + a.test

const split = (a: FleetApp) =>
  `${a.app}: ${money(total(a))} (production ${money(a.production)}, test runs ${money(a.test)})`

export default function MiniFleet({ apps, caption }: MiniFleetProps) {
  const max = Math.max(...apps.map(total))
  const production = apps.reduce((sum, a) => sum + a.production, 0)
  const test = apps.reduce((sum, a) => sum + a.test, 0)

  const label = `Cost by ml_app over the window, production and test runs: ${apps
    .map(split)
    .join('; ')}. Total ${money(production + test)} across ${apps.length} apps: production ${money(
    production,
  )}, test runs ${money(test)}. ${caption}`

  return (
    <div className="mfl" role="img" aria-label={label}>
      <div className="mfl-head">
        <span className="mfl-title">cost by ml_app · 30 days</span>
        <span className="mfl-scope">
          {apps.length} apps · {money(production + test)}
        </span>
      </div>

      <div className="mfl-legend" aria-hidden="true">
        <span className="mfl-key">
          <span className="mfl-swatch mfl-prod" /> production {money(production)}
        </span>
        <span className="mfl-key">
          <span className="mfl-swatch mfl-test" /> test runs {money(test)}
        </span>
      </div>

      <ul className="mfl-rows">
        {apps.map((a) => {
          // Floor the visible width so the smallest app is still present: a
          // zero-width bar would read as "not running".
          const width = Math.max((total(a) / max) * 100, 1.5)
          const prodShare = total(a) ? (a.production / total(a)) * 100 : 0
          return (
            <li className="mfl-row" key={a.app} title={split(a)}>
              <span className="mfl-name">{a.app}</span>
              <span className="mfl-track">
                <span className="mfl-bar" style={{ width: `${width}%` }}>
                  {a.production > 0 && (
                    <span className="mfl-seg mfl-prod" style={{ flexBasis: `${prodShare}%` }} />
                  )}
                  {a.test > 0 && (
                    <span className="mfl-seg mfl-test" style={{ flexBasis: `${100 - prodShare}%` }} />
                  )}
                </span>
              </span>
              <span className="mfl-val">{money(total(a))}</span>
            </li>
          )
        })}
      </ul>

      <div className="mfl-caption">{caption}</div>
    </div>
  )
}
