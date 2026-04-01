import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initPostHog } from './lib/posthog'
import './index.css'

initPostHog()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
