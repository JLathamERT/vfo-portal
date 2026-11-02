// Which copy of the portal this build is (docs/plans/staging/README.md, S4).
// `npm run build` / `npm run deploy` = LIVE (vfoportal.com): nothing below is set,
// so every value is today's. `npm run build:staging` (vite --mode staging, values
// from .env.staging) = the STAGING copy at staging.vfoportal.com, the team's test
// mode: its own backend, a TEST banner, never indexed.

export const IS_STAGING = import.meta.env.MODE === 'staging'

// The Supabase project behind this build: storage links (headshots, logos, the
// website widget). API calls follow VITE_API_URL, which .env.staging also sets.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co'
export const HEADSHOTS_URL = `${SUPABASE_URL}/storage/v1/object/public/headshots/`

// This website's own address, for links the screens show or copy.
export const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://vfoportal.com'
