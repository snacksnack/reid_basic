interface TestbedStatusBarProps {
  name: string
  location?: string
  onContactClick?: () => void
}

// Slim mono status bar adopted from the merged mockup: name on the left;
// availability + the same PDF/DOCX/Contact actions on the right. It replaces
// the Resume component's plain button toolbar (hidden via .tb-skin in CSS).
export default function TestbedStatusBar({ name, location, onContactClick }: TestbedStatusBarProps) {
  return (
    <div className="tb-statusbar">
      <span className="tb-statusbar-name">{name}</span>
      <div className="tb-statusbar-right">
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
    </div>
  )
}
