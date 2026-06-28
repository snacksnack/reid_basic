import { useEffect, useState } from 'react'
import Resume from '../components/Resume'
import ChatBot from '../components/ChatBot'
import ContactModal from '../components/ContactModal'
import TestbedStatusBar from './TestbedStatusBar'
import TestbedHeader from './TestbedHeader'
import resume from '../data/resume'
import '../resume.css' // base resume layout (the live site loads this via App.tsx)
import './testbed.css' // skin overrides — imported AFTER resume.css so they win

// Testbed = the LIVE resume layout (real Resume component, same content/order)
// with three opt-in cosmetic touches applied via the .tb-skin wrapper:
//   1. warm #FAFAF7 background   2. Space Grotesk / Space Mono type
//   3. a slim mono status bar above the existing name block.
// The live "/" page is unaffected — these styles ship only in this bundle.
export default function TestbedApp() {
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
        name={resume.name}
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
