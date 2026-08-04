import type { DriftChain, DriftSeverity } from '../../data/driftDetector'
import './MiniDag.css'

interface MiniDagProps {
  chains: DriftChain[]
}

const BUCKET_LABEL: Record<DriftSeverity, string> = {
  red: 'collision imminent',
  yellow: 'at risk',
  white: 'watch',
}

// A small dependency graph: one row per drifting chain, upstream → downstream,
// coloured by the severity bucket the scorer put it in. Pure presentation.
export default function MiniDag({ chains }: MiniDagProps) {
  const counts = chains.reduce<Record<string, number>>((acc, c) => {
    acc[c.severity] = (acc[c.severity] ?? 0) + 1
    return acc
  }, {})

  return (
    <div
      className="md"
      role="img"
      aria-label={`Dependency chains flagged by the drift detector: ${chains
        .map((c) => `${c.nodes.join(' blocks ')} — ${c.rule}`)
        .join('; ')}`}
    >
      {chains.map((c) => (
        <div className={`md-row md-${c.severity}`} key={c.nodes.join('-')}>
          <span className="md-chain">
            {c.nodes.map((n, i) => (
              <span className="md-node-wrap" key={n}>
                {i > 0 && <span className="md-arrow" aria-hidden="true" />}
                <span className="md-node">{n}</span>
              </span>
            ))}
          </span>
          <span className="md-detail">{c.detail}</span>
          <span className="md-rule">{c.rule}</span>
        </div>
      ))}

      <div className="md-legend">
        {(['red', 'yellow', 'white'] as DriftSeverity[])
          .filter((s) => counts[s])
          .map((s) => (
            <span className={`md-key md-key-${s}`} key={s}>
              {counts[s]} {BUCKET_LABEL[s]}
            </span>
          ))}
      </div>
    </div>
  )
}
