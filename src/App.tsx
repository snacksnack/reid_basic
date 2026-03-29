import Resume from './components/Resume'
import ChatBot from './components/ChatBot'
import resume from './data/resume'
import './resume.css'

function App() {
  return (
    <>
      <Resume data={resume} />
      <ChatBot />
    </>
  )
}

export default App
