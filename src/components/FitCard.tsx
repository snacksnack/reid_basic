export type Verdict = 'strong' | 'good' | 'partial'

export interface FitCardData {
  roleTitle: string
  verdict: Verdict
  verdictLabel: string
  strengths: string[]
  transferable: string[]
  gaps: string[]
  summary: string
  sectionsReviewed?: number
}

const SECTIONS: Array<{
  key: 'strengths' | 'transferable' | 'gaps'
  label: string
  glyph: string
  tone: 'success' | 'info' | 'caution'
}> = [
  { key: 'strengths', label: 'Strengths', glyph: '✓', tone: 'success' },
  { key: 'transferable', label: 'Transferable', glyph: '~', tone: 'info' },
  { key: 'gaps', label: 'Honest gaps', glyph: '!', tone: 'caution' },
]

function openContact() {
  window.dispatchEvent(new CustomEvent('open-contact'))
}

export default function FitCard({ data }: { data: FitCardData }) {
  const provenance =
    data.sectionsReviewed && data.sectionsReviewed > 0
      ? `Based on Reid's résumé · ${data.sectionsReviewed} sections reviewed`
      : "Based on Reid's résumé"

  return (
    <div className="fit-card" role="group" aria-label={`Fit assessment for ${data.roleTitle}`}>
      <div className="fit-card-head">
        <span className="fit-card-title">Fit for {data.roleTitle}</span>
        <span className={`fit-pill ${data.verdict}`}>{data.verdictLabel}</span>
      </div>
      <p className="fit-card-provenance">{provenance}</p>

      {SECTIONS.map(({ key, label, glyph, tone }) => {
        const items = data[key]
        if (!items || items.length === 0) return null
        return (
          <div className={`fit-section ${tone}`} key={key}>
            <div className="fit-section-label">
              <span className="fit-section-glyph" aria-hidden="true">
                {glyph}
              </span>
              {label}
            </div>
            <ul className="fit-section-items">
              {items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )
      })}

      {data.gaps.length === 0 && data.verdict !== 'partial' && (
        <div className="fit-section success">
          <div className="fit-section-label">
            <span className="fit-section-glyph" aria-hidden="true">
              ✓
            </span>
            No major gaps
          </div>
          <p className="fit-verdict-text">Reid meets the core requirements for this role.</p>
        </div>
      )}

      {data.summary && (
        <div className="fit-section verdict">
          <div className="fit-section-label">Verdict</div>
          <p className="fit-verdict-text">{data.summary}</p>
        </div>
      )}

      <div className="fit-actions">
        <a className="fit-btn primary" href="/api/download/pdf">
          Download matching résumé
        </a>
        <button className="fit-btn secondary" type="button" onClick={openContact}>
          Contact Reid
        </button>
      </div>
    </div>
  )
}
