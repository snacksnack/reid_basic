import type { ResumeData } from '../components/Resume'

interface TestbedHeaderProps {
  data: ResumeData
}

// Testbed-only compact header. Reuses the live class names so the existing
// .tb-skin header styles apply, but renders short link labels (LinkedIn ↗ /
// GitHub ↗) instead of full URLs. The live Resume's own header is hidden on
// this page via CSS, so this renders in its place.
export default function TestbedHeader({ data }: TestbedHeaderProps) {
  const c = data.contact ?? {}
  const items: React.ReactNode[] = []

  if (c.location) items.push(<span key="loc">{c.location}</span>)
  if (c.email)
    items.push(
      <a key="email" className="email" href={`mailto:${c.email}`}>{c.email}</a>
    )
  if (c.website)
    items.push(
      <a key="site" href={c.website} target="_blank" rel="noreferrer noopener">
        {c.website.replace(/^https?:\/\//, '')}
      </a>
    )
  if (c.linkedin)
    items.push(
      <a key="li" href={c.linkedin} target="_blank" rel="noreferrer noopener">LinkedIn ↗</a>
    )
  if (c.github)
    items.push(
      <a key="gh" href={c.github} target="_blank" rel="noreferrer noopener">GitHub ↗</a>
    )

  return (
    <header className="header tb-header">
      <div className="name-row">
        <h1 className="name">{data.name}</h1>
        <a
          className="badge-link"
          href="https://www.credly.com/badges/afef4bbc-373d-4f44-ab8d-bf019db67384/public_url"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="AWS Solutions Architect – Associate (Credly)"
        >
          <img className="badge-icon" src="/images/aws-saa-badge.png" alt="AWS Solutions Architect – Associate" />
        </a>
      </div>
      {data.title && <p className="title">{data.title}</p>}
      <div className="contact" aria-label="Contact information">
        {items.map((node, idx) => (
          <span className="contact-item" key={idx}>
            {idx > 0 && <span className="sep">·</span>}
            {node}
          </span>
        ))}
      </div>
    </header>
  )
}
