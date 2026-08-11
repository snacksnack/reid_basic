import { useEffect, useState } from 'react'
import TestbedStatusBar from '../testbed/TestbedStatusBar'
import ProjectIndex from '../components/ProjectIndex'
import ContactModal from '../components/ContactModal'
import resume from '../data/resume'
import './ProjectPage.css'

// The project index on its own shareable URL (RC1-226). Unlike the two project
// overview pages, this one carries the site's status bar rather than the
// pp-nav — /work is a top-level destination, so the availability line and the
// PDF/DOCX/Contact actions belong on it. (Only one sticky bar: the status bar
// and .pp-nav both pin to top: 0 and would overlap.)
//
// The index below renders its own thesis line, so the hero deliberately stops
// at the title instead of repeating it.
export default function WorkPage() {
  const [contactOpen, setContactOpen] = useState(false)

  useEffect(() => {
    document.title = 'Work — Reid Collins'
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="tb-skin pp-page">
      <TestbedStatusBar
        location={resume.contact?.location}
        onContactClick={() => setContactOpen(true)}
        currentPath="/work"
      />

      <header className="pp-hero wp-hero">
        <a className="pp-nav-back wp-back" href="/">
          ← Reid Collins
        </a>
        <span className="pp-kicker">Projects</span>
        <h1 className="pp-hero-title">Selected work</h1>
      </header>

      <ProjectIndex />

      <footer className="pp-foot">
        <a className="pp-btn pp-btn-primary" href="/api/download/pdf">
          Download résumé
        </a>
        <button className="pp-btn" type="button" onClick={() => setContactOpen(true)}>
          Contact Reid
        </button>
        <a className="pp-nav-back" href="/">
          ← Back to résumé
        </a>
      </footer>

      <ContactModal isOpen={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  )
}
