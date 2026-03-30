import { useEffect } from 'react'
import Resume from './components/Resume'
import ChatBot from './components/ChatBot'
import resume from './data/resume'
import './resume.css'

function App() {
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
      <Resume data={resume} />
      <ChatBot />
    </>
  )
}

export default App
