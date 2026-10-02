import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import { applyThemeForCurrentRoute } from './lib/theme'

// GitHub Pages serves an emitted route page (scripts/emit-route-pages.mjs) at
// /admin/ with a trailing slash; several checks compare the path exactly
// (=== '/admin', !== '/member/login'), so drop the slash before anything reads it.
if (window.location.pathname.length > 1 && window.location.pathname.endsWith('/')) {
  window.history.replaceState(null, '', window.location.pathname.replace(/\/+$/, '') + window.location.search + window.location.hash)
}

// Apply the saved light/dark preference before first paint — portal routes
// only; login and public token pages always render light.
applyThemeForCurrentRoute()

// Sentry error tracking (H3). The DSN is a public ingest-only key (safe to ship,
// like the anon key) — it can only SEND error reports to this project, not read
// anything. Error monitoring only: no Session Replay (would capture client PII)
// and no performance tracing, which keeps us within the free tier.
// enabled: PROD only — dev `npm run dev` sessions were reporting hot-reload
// errors as environment=production and polluting the dashboard (2026-07-08).
// ignoreErrors: browser-extension fetch noise, not app code.
Sentry.init({
  dsn: 'https://8901dcdcf290d054228b1611f2a929ec@o4511588768088064.ingest.us.sentry.io/4511588781654017',
  environment: 'production',
  enabled: import.meta.env.PROD,
  ignoreErrors: [/non ISO-8859-1 code point/],
})

const redirect = sessionStorage.getItem('vfo_redirect')
if (redirect) {
  sessionStorage.removeItem('vfo_redirect')
  window.history.replaceState(null, '', '/' + redirect)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter basename="/">
      <App />
    </BrowserRouter>
  </ErrorBoundary>
)