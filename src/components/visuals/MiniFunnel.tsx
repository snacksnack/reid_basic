import type { FunnelIncident, FunnelSource } from '../../data/incidentSummarizer'
import './MiniFunnel.css'

interface MiniFunnelProps {
  sources: FunnelSource[]
  collapse: string
  incident: FunnelIncident
}

// Many alerts in, one incident out: source chips converge through the
// dedup/correlation band into a single summarized incident card.
export default function MiniFunnel({ sources, collapse, incident }: MiniFunnelProps) {
  return (
    <div
      className="mf"
      role="img"
      aria-label={`Alerts from ${sources
        .map((s) => s.name)
        .join(', ')} converge through ${collapse} into one ${incident.severity} incident on ${
        incident.service
      }, delivered to ${incident.destinations.join(' and ')}.`}
    >
      <div className="mf-sources">
        {sources.map((s) => (
          <span className="mf-source" key={s.name}>
            <span className="mf-source-name">{s.name}</span>
            <span className="mf-source-blurb">{s.blurb}</span>
          </span>
        ))}
      </div>

      <div className="mf-converge" aria-hidden="true" />

      <div className="mf-collapse">{collapse}</div>

      <div className="mf-stem" aria-hidden="true" />

      <div className="mf-incident">
        <div className="mf-incident-head">
          <span className="mf-sev">{incident.severity}</span>
          <span className="mf-service">{incident.service}</span>
        </div>
        <p className="mf-summary">{incident.summary}</p>
        <div className="mf-dests">
          {incident.destinations.map((d) => (
            <span className="mf-dest" key={d}>
              {d}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
