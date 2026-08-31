import { datadogRum } from '@datadog/browser-rum'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// RC1-343: RUM + Session Replay on real visitors. Prod-only so dev sessions
// never pollute the data; the client token is public by design — it ships in
// the bundle regardless. Inputs are masked by default; there are none anyway.
if (import.meta.env.PROD) {
  datadogRum.init({
    applicationId: 'e2a55e56-e66c-41c8-996b-59bda2bfa011',
    clientToken: 'pub8d0a821d076194c4000b9287ff7fb3b0',
    site: 'datadoghq.com',
    service: 'hihelloreid',
    env: 'prod',
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    defaultPrivacyLevel: 'mask-user-input',
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
