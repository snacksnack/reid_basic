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

  // The fit card's "Contact Reid" action opens the same modal as the toolbar,
  // decoupled via a window event so ChatBot/FitCard need no shared state.
  useEffect(() => {
    const open = () => setContactOpen(true)
    window.addEventListener('open-contact', open)
    return () => window.removeEventListener('open-contact', open)
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
