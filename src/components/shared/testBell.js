import { IS_STAGING } from '../../lib/environment'

// Staging only: every bell is re-addressed to the tester, and its message starts with
// who it was meant for on live (edge repo utils/staging-email-guard.ts,
// stagingBellRoute — the prefix must match STAGING_BELL_PREFIX there). The bell and
// the Notifications page colour such a bell teal, apart from ACTION orange and
// REMINDER violet. Live builds never match.
const PREFIX = 'TEST - meant for: '

export const TEST_BELL_TEAL = '#0f766e'
export const TEST_BELL_TINT = 'rgba(15,118,110,0.08)'

/** { meantFor, rest } for a staging test bell's message, else null. */
export function splitTestBell(message) {
  if (!IS_STAGING || typeof message !== 'string' || !message.startsWith(PREFIX)) return null
  const nl = message.indexOf('\n')
  const head = nl === -1 ? message : message.slice(0, nl)
  return { meantFor: head.slice(PREFIX.length), rest: nl === -1 ? '' : message.slice(nl + 1) }
}
