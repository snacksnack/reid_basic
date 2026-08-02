import { useEffect, useState } from 'react'
import Resume from './components/Resume'
import ChatBot from './components/ChatBot'
import ContactModal from './components/ContactModal'
import TestbedStatusBar from './testbed/TestbedStatusBar'
import TestbedHeader from './testbed/TestbedHeader'
import LaunchPlannerPage from './pages/LaunchPlannerPage'
import resume from './data/resume'
import './resume.css'
import './testbed/testbed.css'

// Path-based routing without a router dependency (RC1-206). Flask's catch-all
// serves index.html for deep links, so this deep path resolves to the SPA.
function isLaunchPlannerPath(): boolean {
  return /^\/projects\/launch-planner\/?$/.test(window.location.pathname)
}

// The redesigned "spec-sheet" layout (developed under /ui-testbed) is now the
// default site: warm paper, Space Mono, slim status bar, compact header.
function App() {
  const [contactOpen, setContactOpen] = useState(false)
  const launchPlanner = isLaunchPlannerPath()

  useEffect(() => {
    fetch('/api/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: window.location.pathname,
        referrer: document.referrer,
      }),
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const open = () => setContactOpen(true)
    window.addEventListener('open-contact', open)
    return () => window.removeEventListener('open-contact', open)
  }, [])

  if (launchPlanner) {
    return <LaunchPlannerPage />
  }

  return (
    <div className="tb-skin">
      <TestbedStatusBar
        location={resume.contact?.location}
        onContactClick={() => setContactOpen(true)}
      />
      <TestbedHeader data={resume} />
      <Resume data={resume} onContactClick={() => setContactOpen(true)} />
      <ChatBot />
      <ContactModal isOpen={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  )
}

export default App
