interface TestbedStatusBarProps {
  location?: string
  onContactClick?: () => void
}

// Slim mono status bar: availability on the left, PDF/DOCX/Contact on the
// right. (The name was dropped — it's redundant with the large name block
// directly below.) Replaces the Resume component's plain button toolbar.
export default function TestbedStatusBar({ location, onContactClick }: TestbedStatusBarProps) {
  return (
    <div className="tb-statusbar">
      <span className="tb-status">
        <span className="tb-dot" />
        Available for work — {location ?? 'New York, NY'}
      </span>
      <span className="tb-toolbar">
        <a className="tb-btn" href="/api/download/pdf">PDF</a>
        <a className="tb-btn" href="/api/download/docx">DOCX</a>
        {onContactClick && (
          <button className="tb-btn" type="button" onClick={onContactClick}>Contact</button>
        )}
      </span>
    </div>
  )
}
