import { useEffect, useState } from 'react'
import { callApi } from './api'

// The Growth Credits sale (gc_promotions, 2026-11-20 Black Friday). The server
// says which sale is running or next, and its clock; the countdown runs on the
// server's time so a wrong computer clock can't show the wrong phase. One fetch
// is shared by every component on the page.

let cache = null        // { promo, offset, failed: 0 } once loaded
let inflight = false
let failures = 0        // tries in a row that got no answer
let retryTimer = null
const listeners = new Set()

// No answer is not "no sale" (2026-11-24): the status is asked for again, quickly
// then every 10 seconds (and at once when the connection returns), until it answers
// or nothing on screen needs it. `failed` is how many tries have missed so far.
const RETRY_MS = [1500, 3000, 6000, 10000]

function loadPromo() {
  clearTimeout(retryTimer)
  if (cache || inflight || !listeners.size) return
  inflight = true
  callApi('gc_promo_status', {}, 1)
    .then(res => {
      const offset = res?.server_now ? Date.parse(res.server_now) - Date.now() : 0
      failures = 0
      cache = { promo: res?.promo || null, offset, failed: 0 }
      listeners.forEach(fn => fn(cache))
    })
    .catch(() => {
      failures++
      listeners.forEach(fn => fn({ promo: null, offset: 0, failed: failures }))
      if (listeners.size) retryTimer = setTimeout(loadPromo, RETRY_MS[Math.min(failures, RETRY_MS.length) - 1])
    })
    .finally(() => { inflight = false })
}

function watchPromo(fn) {
  if (!listeners.size) window.addEventListener('online', loadPromo)
  listeners.add(fn)
  if (cache) fn(cache)
  else loadPromo()
  return () => {
    listeners.delete(fn)
    if (listeners.size) return
    clearTimeout(retryTimer)
    failures = 0
    window.removeEventListener('online', loadPromo)
  }
}

export function promoPhaseAt(promo, now) {
  if (!promo) return null
  if (now < Date.parse(promo.starts_at)) return 'upcoming'
  if (now < Date.parse(promo.ends_at)) return 'live'
  return 'ended'
}

// The sale's first ending (gc_promotions.bonus.first_ends_at), or null. Until it
// passes every countdown runs to it; from then to ends_at the sale is "extended"
// (Sunday night, then Cyber Monday - Jake, 2026-11-24). Display only: the server
// sells the deal from starts_at to ends_at throughout.
export function promoFirstEnd(promo) {
  const t = Date.parse(promo?.bonus?.first_ends_at || '')
  return t > Date.parse(promo?.starts_at) && t < Date.parse(promo?.ends_at) ? t : null
}

// { loaded, failed, retry, promo, phase: 'upcoming' | 'live' | 'ended' | null, live, extended,
//   endsLine, remainingMs, deal }
export function useGcPromo() {
  const [state, setState] = useState(cache)
  const [now, setNow] = useState(() => Date.now() + (cache?.offset || 0))
  useEffect(() => watchPromo(setState), [])
  useEffect(() => {
    if (!state?.promo) return
    const tick = () => setNow(Date.now() + (state.offset || 0))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [state])
  const promo = state?.promo || null
  const phase = promoPhaseAt(promo, now)
  const firstEnd = promoFirstEnd(promo)
  const extended = phase === 'live' && firstEnd !== null && now >= firstEnd
  const weekend = firstEnd !== null && !extended
  const endsAt = weekend ? firstEnd : Date.parse(promo?.ends_at)
  const target = phase === 'upcoming' ? Date.parse(promo.starts_at) : phase === 'live' ? endsAt : now
  // The deal (2026-11-20): buy 1 to maxFree credits at creditPrice each, get the
  // same number free, up to maxFree free credits per member per sale. Display
  // only - the server decides at checkout.
  const maxFree = Number(promo?.bonus?.max_free) || 0
  const creditPrice = Number(promo?.bonus?.credit_price) || 0
  const deal = maxFree > 0 && creditPrice > 0 ? { maxFree, creditPrice } : null
  const endsLine = promo ? promoEndsLine(endsAt, weekend ? 'Weekend offer ends' : 'Offer ends') : ''
  return { loaded: !!state, failed: state?.failed || 0, retry: loadPromo, promo, phase, live: phase === 'live', extended, endsLine, remainingMs: Math.max(0, target - now), deal }
}

export function splitCountdown(ms) {
  const s = Math.floor(ms / 1000)
  return { days: Math.floor(s / 86400), hours: Math.floor(s / 3600) % 24, minutes: Math.floor(s / 60) % 60, seconds: s % 60 }
}

export const pad2 = n => String(n).padStart(2, '0')

// "Fri, Nov 27" in Pacific time, the sale's own clock.
export function promoDayLabel(iso) {
  try { return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }) } catch { return '' }
}

// "Starts Fri, Nov 27 at 12:00 AM PST".
export const promoStartsLine = iso => `Starts ${promoDayLabel(iso)} at 12:00 AM PST`

// "Offer ends Monday, November 30 at 11:59 PM PST": the last minute before `end` (ms),
// Pacific time (an ending is stored as midnight at the start of the next day).
export function promoEndsLine(end, lead = 'Offer ends') {
  try {
    const last = new Date(end - 60 * 1000)
    const day = last.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })
    const time = last.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' })
    return `${lead} ${day} at ${time}`
  } catch { return '' }
}
