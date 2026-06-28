import { useEffect, useState } from 'react'
import Resume from './components/Resume'
import ChatBot from './components/ChatBot'
import ContactModal from './components/ContactModal'
import TestbedStatusBar from './testbed/TestbedStatusBar'
import TestbedHeader from './testbed/TestbedHeader'
import resume from './data/resume'
import './resume.css'
import './testbed/testbed.css'

// The redesigned "spec-sheet" layout (developed under /ui-testbed) is now the
// default site: warm paper, Space Mono, slim status bar, compact header.
function App() {
  const [contactOpen, setContactOpen] = useState(false)

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
