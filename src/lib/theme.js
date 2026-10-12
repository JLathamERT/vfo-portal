// Light/dark theme preference, shared by all four portals. The choice is
// persisted in localStorage (survives browser restarts, unlike the
// sessionStorage session) and applied as a data-theme attribute on <html>,
// which index.css uses to swap the --vfo-* palette.
//
// Dark mode is a LOGGED-IN experience only: the login pages, portal picker
// and public token pages (/pay, /decide, setup links…) always render light.
// Portal pages opt in via usePortalTheme(); everything else stays light.
import { useEffect } from 'react'

const KEY = 'vfo_theme'

export function getTheme() {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme) } catch { /* private mode — apply without persisting */ }
  applyTheme(theme)
}

export function applyTheme(theme = getTheme()) {
  document.documentElement.dataset.theme = theme
}

// Mounted by the four portal shells (+ the client-detail page). Applies the
// saved preference while the portal is on screen. On unmount the theme follows
// the route being navigated TO (the URL has already changed): light on a login /
// public page, kept on another portal page. A blanket reset to light painted the
// whole screen light while the next portal page's lazy chunk loaded - a white
// flash in dark mode on every first visit to a section (2026-10-12).
export function usePortalTheme() {
  useEffect(() => {
    applyTheme()
    return () => applyThemeForCurrentRoute()
  }, [])
}

// Called once at boot so a hard reload straight into a portal doesn't flash
// light first. Any /login route and all public token pages stay light.
export function applyThemeForCurrentRoute() {
  const p = window.location.pathname
  const isPortal = /\/(admin|member|client|specialist|tax-planner)(\/|$)/.test(p) && !p.includes('/login')
  applyTheme(isPortal ? getTheme() : 'light')
}
