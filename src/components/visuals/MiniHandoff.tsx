import type { HandoffStep } from '../../data/customerInstallKit'
import './MiniHandoff.css'

interface MiniHandoffProps {
  steps: HandoffStep[]
  caption: string
}

// One support case as two lanes (RC1-645): the customer's side and the
// vendor's, with what crossed between them on the line under each step. The
// vendor lane never touches the customer's systems; everything it knows
// arrives as one of those crossings.
export default function MiniHandoff({ steps, caption }: MiniHandoffProps) {
  const crossings = steps.filter((s) => s.sends).length

  return (
    <figure
      className="mho"
      role="img"
      aria-label={`One support case, step by step: ${steps
        .map((s) => `${s.side}: ${s.label}${s.sends ? `, sends ${s.sends}` : ''}`)
        .join('; ')}`}
    >
      <div className="mho-head">
        <span>Customer · runs everything</span>
        <span>Vendor support · no access</span>
      </div>

      <ol className="mho-steps">
        {steps.map((s, i) => (
          <li className={`mho-step mho-${s.side}`} key={i}>
            <span className="mho-label">{s.label}</span>
            {s.sends && (
              <span className="mho-sends">
                {s.side === 'customer' ? '→ to vendor: ' : '← to customer: '}
                {s.sends}
              </span>
            )}
          </li>
        ))}
      </ol>

      <div className="mho-tally">
        <span className="mho-tally-value">{crossings} exchanges</span>
        <span className="mho-tally-note">vendor logins to customer systems: none</span>
      </div>

      <figcaption className="mho-caption">{caption}</figcaption>
    </figure>
  )
}
