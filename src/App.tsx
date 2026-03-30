import { useEffect, useState } from 'react'
import Resume from './components/Resume'
import ChatBot from './components/ChatBot'
import ContactModal from './components/ContactModal'
import resume from './data/resume'
import './resume.css'

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

  return (
    <>
      <Resume data={resume} onContactClick={() => setContactOpen(true)} />
      <ChatBot />
      <ContactModal isOpen={contactOpen} onClose={() => setContactOpen(false)} />
    </>
  )
}

export default App
