const EDGE_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqcHNwcnNtaHB1ZndvZ2JteGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDcwNjksImV4cCI6MjA4NzYyMzA2OX0.sdMVsnXePSH8zgstt82O1dhpMxYZq5QivyIrCHMbECU'

const REQUEST_TIMEOUT_MS = 20000
// automation_* WRITE actions chain external services (BoldSign, Gmail, Stripe)
// and can legitimately run past 20s — a premature "failed, try again" invites a
// manual resubmit that double-sends. Reads keep the short timeout (they
// auto-retry safely).
const SLOW_WRITE_TIMEOUT_MS = 60000
// Per-action overrides for the handful of calls that legitimately outrun even the
// slow-write budget above. tax_generate_presentation renders the client ROI deck
// and uploads ~27 MB to Google Drive — 30-60s is the normal case, so a 20s (or
// even 60s) abort would report a failure while the deck is still being written.
// These stay WRITES: isReadAction() does not match them, so a timeout still never
// auto-retries.
const LONG_TIMEOUT_ACTIONS = {
  tax_generate_presentation: 90000,
  // The member tax-intake submit. On the WAIVED branch it creates the
  // enrollment, client, junction row and tax plan, then drafts the confirmation
  // Gmail (OAuth + drafts.create) before it answers — comfortably past a cold
  // start plus 20s. It is a WRITE: isReadAction() does not match it, so a
  // timeout still never auto-retries.
  tax_intake_submit: 30000,
  // Same shape on the client-link route: it mints the token, writes the row and
  // drafts the TAX_intake_link Gmail (OAuth + drafts.create) before answering.
  tax_intake_send_link: 30000,
}
function timeoutFor(action) {
  if (LONG_TIMEOUT_ACTIONS[action]) return LONG_TIMEOUT_ACTIONS[action]
  return action?.startsWith('automation_') && !isReadAction(action)
    ? SLOW_WRITE_TIMEOUT_MS
    : REQUEST_TIMEOUT_MS
}

// An action is considered an idempotent READ if it matches one of the load-style
// naming conventions (load_*, *_load_*, *_load) or appears in the explicit list
// below. Read actions are safe to auto-retry on timeout because re-running them
// has no server-side side effects.
function isReadAction(action) {
  if (!action) return false
  if (/^load_|_load(_|$)/.test(action)) return true
  return action === 'vault_list'
}

// Login actions return 401 on bad credentials — that's a wrong-password, NOT an
// expired session, so callApi must surface it inline on the login page instead of
// redirecting to the portal-selection page.
const LOGIN_ACTIONS = ['admin_login', 'member_login', 'client_login', 'specialist_login', 'tax_planner_login', 'login']

export async function callApi(action, payload = {}, retries = 3) {
  const session = JSON.parse(sessionStorage.getItem('vfo_session') || 'null')
  for (let attempt = 1; attempt <= retries; attempt++) {
    let res = null
    let timedOut = false
    const controller = new AbortController()
    const timeoutMs = timeoutFor(action)
    const timeoutId = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    try {
      res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`
        },
        body: JSON.stringify({ action, token: session?.token, ...payload }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      const data = await res.json()
      if (res.status === 401) {
        // A 401 on a login action means bad credentials — surface it inline rather
        // than treating it as an expired session and bouncing to the portal.
        if (LOGIN_ACTIONS.includes(action)) {
          throw new Error(data.error || 'Invalid credentials')
        }
        clearSession()
        window.location.href = window.location.origin + '/'
        throw new Error('Session expired — please log in again.')
      }
      if (!res.ok) throw new Error(data.error || 'Request failed')
      return data
    } catch (err) {
      clearTimeout(timeoutId)
      if (timedOut) {
        // Idempotent reads can safely retry on timeout — the server may have just
        // been cold-starting. Writes never retry on timeout because the server
        // may have already processed the request and a retry would double-write.
        if (isReadAction(action) && attempt < 2) {
          await new Promise(r => setTimeout(r, 1000))
          continue
        }
        throw new Error(`Request timed out after ${timeoutMs / 1000}s. Please try again.`)
      }
      // Only retry if the request never reached the server (fetch itself failed —
      // network blip, CORS, offline). If we got ANY response, the server may have
      // already processed the request; retrying could double-write non-idempotent
      // actions like ciq_create, msm_add_client, etc.
      const fetchFailed = res === null
      if (!fetchFailed || attempt === retries) throw err
      await new Promise(r => setTimeout(r, 2000))
    }
  }
}

// ─── Outstanding Payment Links — manual "Resend email" actions ───
// Both are WRITES (each drafts a Gmail), so they deliberately do NOT match the
// isReadAction() naming convention above and never auto-retry on timeout: a retry
// after the server already processed the call would double-draft the email.

// Payment-continuation setup link: mints a FRESH 7-day /connect-card token and drafts
// the CLIENT_PAYMENT_CONTINUATION `setup_link_reminder` copy. pipeline is the migration
// action's own spelling — 'MAP 1' (with the space) or 'TAX'.
export function resendContinuationSetupLink({ pipeline, rowId }) {
  return callApi('migration_send_setup_link', { pipeline, row_id: rowId, reminder: true })
}

// First payment link: re-runs the nightly first-payment reminder for one row.
// pipeline is 'MAP1' or 'TAX'.
export function resendFirstPaymentLink({ pipeline, rowId }) {
  return callApi('accounting_resend_first_payment_link', { pipeline, row_id: rowId })
}

// Failed MAP 1 quarterly installment: re-drafts the charge-failure email carrying the
// /pay link. Which installment is DERIVED server-side from the same resolver the /pay
// page runs, so no payment number is sent — the button cannot ask for one the link
// would not collect.
export function redraftInstallmentEmail({ rowId }) {
  return callApi('accounting_redraft_installment_link', { row_id: rowId })
}

export function getSession() {
  return JSON.parse(sessionStorage.getItem('vfo_session') || 'null')
}

export function setSession(session) {
  sessionStorage.setItem('vfo_session', JSON.stringify(session))
}

export function clearSession() {
  sessionStorage.removeItem('vfo_session')
  cachedDataPromise = null
  keyedCaches.clear()
}

let cachedDataPromise = null

export function loadCachedData({ refresh = false } = {}) {
  if (refresh || !cachedDataPromise) {
    cachedDataPromise = callApi('load_data').catch(err => {
      cachedDataPromise = null
      throw err
    })
  }
  return cachedDataPromise
}

export function clearCachedData() {
  cachedDataPromise = null
}

const keyedCaches = new Map()

export function loadCachedAction(action, payload = {}, { refresh = false } = {}) {
  let bucket = keyedCaches.get(action)
  if (!bucket) { bucket = new Map(); keyedCaches.set(action, bucket) }
  const key = JSON.stringify(payload)
  if (refresh || !bucket.has(key)) {
    const p = callApi(action, payload).catch(err => {
      bucket.delete(key)
      throw err
    })
    bucket.set(key, p)
  }
  return bucket.get(key)
}

export function clearActionCache(action) {
  if (action) keyedCaches.delete(action)
  else keyedCaches.clear()
}