import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css' // same base as the live site, for an exact-match layout
import TestbedApp from './TestbedApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TestbedApp />
  </StrictMode>,
)
