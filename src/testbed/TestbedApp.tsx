import App from '../App'

// /ui-testbed now renders the same App as the live site (the redesign is the
// default). Kept as a gated route so it stays available as a staging slot —
// to trial future changes here independently, give it its own layout again.
export default function TestbedApp() {
  return <App />
}
