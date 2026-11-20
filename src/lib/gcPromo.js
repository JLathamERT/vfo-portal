import { useEffect, useState } from 'react'
import { callApi } from './api'

// The Growth Credits sale (gc_promotions, 2026-11-20 Black Friday). The server
// says which sale is running or next, and its clock; the countdown runs on the
// server's time so a wrong computer clock can't show the wrong phase. One fetch
// is shared by every component on the page.

let cache = null        // { promo, offset } once loaded
let inflight = null

function loadPromo() {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = callApi('gc_promo_status', {}, 1)
      .then(res => {
        const offset = res?.server_now ? Date.parse(res.server_now) - Date.now() : 0
        cache = { promo: res?.promo || null, offset }
        return cache
      })
      .catch(() => ({ promo: null, offset: 0 }))
      .finally(() => { inflight = null })
  }
  return inflight
}

export function promoPhaseAt(promo, now) {
  if (!promo) return null
  if (now < Date.parse(promo.starts_at)) return 'upcoming'
  if (now < Date.parse(promo.ends_at)) return 'live'
  return 'ended'
}

// { promo, phase: 'upcoming' | 'live' | 'ended' | null, remainingMs, bonusFor(credits) }
export function useGcPromo() {
  const [state, setState] = useState(cache)
  const [now, setNow] = useState(() => Date.now() + (cache?.offset || 0))
  useEffect(() => {
    let alive = true
    loadPromo().then(s => { if (alive) setState(s) })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (!state?.promo) return
    const tick = () => setNow(Date.now() + (state.offset || 0))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [state])
  const promo = state?.promo || null
  const phase = promoPhaseAt(promo, now)
  const target = phase === 'upcoming' ? Date.parse(promo.starts_at) : phase === 'live' ? Date.parse(promo.ends_at) : now
  // The deal (2026-11-20): buy 1 to maxFree credits at creditPrice each, get the
  // same number free, up to maxFree free credits per member per sale. Display
  // only - the server decides at checkout.
  const maxFree = Number(promo?.bonus?.max_free) || 0
  const creditPrice = Number(promo?.bonus?.credit_price) || 0
  const deal = maxFree > 0 && creditPrice > 0 ? { maxFree, creditPrice } : null
  return { loaded: !!state, promo, phase, live: phase === 'live', remainingMs: Math.max(0, target - now), deal }
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

// "Offer ends November 30 at 11:59 PM PST": the sale's last minute, Pacific time
// (ends_at is midnight at the start of the next day).
export function promoEndsLine(iso) {
  try {
    const last = new Date(Date.parse(iso) - 60 * 1000)
    const day = last.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })
    const time = last.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' })
    return `Offer ends ${day} at ${time}`
  } catch { return '' }
}

// The last day of the sale: ends_at is midnight at the START of the next day.
export function promoLastDayLabel(iso) {
  try { return promoDayLabel(new Date(Date.parse(iso) - 60 * 1000).toISOString()) } catch { return '' }
}
