import type { TrendSeries } from '../../data/agentEvals'
import './MiniTrend.css'

interface MiniTrendProps {
  series: TrendSeries[]
  caption: string
}

// The quality trend at index-row size (RC1-266): one polyline per subject,
// every run a dot, in the same flat construction as the other mini-visuals.
// The one red dot is the point of the whole harness — a regression that was
// caught, attributed, and gone by the next run.

const COLORS = ['#2f6bff', '#9db4e8']

const W = 320
const H = 96
const PAD = 10

export default function MiniTrend({ series, caption }: MiniTrendProps) {
  // The y-range hugs the data (plus breathing room) rather than spanning 0–1;
  // at this size a full-range plot flattens a 0.62 dip into noise.
  const all = series.flatMap((s) => s.scores)
  const lo = Math.min(...all) - 0.04
  const hi = Math.max(...all) + 0.04
  const runs = Math.max(...series.map((s) => s.scores.length))

  const x = (i: number) => PAD + (i / (runs - 1)) * (W - 2 * PAD)
  const y = (score: number) => PAD + (1 - (score - lo) / (hi - lo)) * (H - 2 * PAD)

  const flagged = series.find((s) => s.flag)

  const label = [
    `Suite score per run: ${series
      .map(
        (s) =>
          `${s.subject} from ${s.scores[0]} to ${s.scores[s.scores.length - 1]} across ${s.scores.length} runs`,
      )
      .join('; ')}.`,
    flagged?.flag ? `Run ${flagged.flag.at + 1}: ${flagged.flag.note}` : '',
    caption,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="mt" role="img" aria-label={label}>
      <div className="mt-head">
        <span className="mt-title">suite score · per run</span>
        <span className="mt-scope">two subjects shown</span>
      </div>

      <svg className="mt-chart" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {series.map((s, si) => (
          <g key={s.subject}>
            <polyline
              className="mt-line"
              points={s.scores.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              stroke={COLORS[si % COLORS.length]}
            />
            {s.scores.map((v, i) => {
              const isFlag = s.flag?.at === i
              return (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r={isFlag ? 3.5 : 2}
                  fill={isFlag ? '#c0392b' : COLORS[si % COLORS.length]}
                />
              )
            })}
          </g>
        ))}
      </svg>

      <div className="mt-legend">
        {series.map((s, si) => (
          <span className="mt-key" key={s.subject}>
            <span className="mt-swatch" style={{ background: COLORS[si % COLORS.length] }} />
            {s.subject}
            <span className="mt-latest">{s.scores[s.scores.length - 1].toFixed(2)}</span>
          </span>
        ))}
      </div>

      {flagged?.flag && (
        <div className="mt-flag">
          <span className="mt-flag-dot" />
          run {flagged.flag.at + 1} · {flagged.flag.note}
        </div>
      )}

      <div className="mt-caption">{caption}</div>
    </div>
  )
}
