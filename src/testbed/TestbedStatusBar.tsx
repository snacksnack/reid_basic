interface TestbedStatusBarProps {
  location?: string
  onContactClick?: () => void
  currentPath?: string // marks the matching nav link as the current page
}

// Slim mono status bar: availability on the left, Work/PDF/DOCX/Contact on the
// right. (The name was dropped — it's redundant with the large name block
// directly below.) Replaces the Resume component's plain button toolbar.
//
// The Work link (RC1-226) is the site's only nav: this bar is the one piece of
// chrome that renders on both the résumé and /work.
export default function TestbedStatusBar({
  location,
  onContactClick,
  currentPath,
}: TestbedStatusBarProps) {
  const onWork = currentPath === '/work'

  return (
    <div className="tb-statusbar">
      <span className="tb-status">
        <span className="tb-dot" />
        Available for work — {location ?? 'New York, NY'}
      </span>
      <span className="tb-toolbar">
        <a className="tb-btn" href="/work" aria-current={onWork ? 'page' : undefined}>Work</a>
        <a className="tb-btn" href="/api/download/pdf">PDF</a>
        <a className="tb-btn" href="/api/download/docx">DOCX</a>
        {onContactClick && (
          <button className="tb-btn" type="button" onClick={onContactClick}>Contact</button>
        )}
      </span>
    </div>
  )
}
