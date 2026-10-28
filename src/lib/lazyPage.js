import { lazy } from 'react'

// Each portal and each emailed-link page is its own chunk, so a client or a
// specialist no longer downloads the whole admin app. A deploy deletes the old
// chunk files, so a tab still running the previous build reloads once to pick
// up the new one instead of failing on a page it has not opened yet. Moved out of
// App.jsx on 2026-10-28 so a portal can lazy-load a heavy tab the same way (the
// client portal's My Progress, portal licensing L8).
const CHUNK_RELOAD_KEY = 'vfo_chunk_reload'
export function lazyPage(load) {
  return lazy(() => load().then(
    mod => { try { sessionStorage.removeItem(CHUNK_RELOAD_KEY) } catch { /* private mode */ } return mod },
    err => {
      let reloaded = false
      try { reloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1' } catch { /* private mode */ }
      if (!reloaded) {
        try { sessionStorage.setItem(CHUNK_RELOAD_KEY, '1') } catch { /* private mode */ }
        window.location.reload()
        return new Promise(() => {})
      }
      throw err
    },
  ))
}
