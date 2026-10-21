// Member signing + paying on behalf of the client (2026-10-21): the member keeps
// no revenue share, and the split is LOCKED - not chosen on the form.
//   Tax (both programs): 50% Tax Planner / 50% VFOS (VFOS takes the rounding residual).
//   MAP 1 / Holistic:   100% VFOS.
//
// CROSS-REPO CONTRACT: vfo-edge-functions utils/member-pays-split.ts stores the
// same values server-side whatever the form sends. Keep the two identical.

export const MEMBER_PAYS_SPLIT_TYPE = 'Member Paying - 50% Tax Planner, 50% VFOS'

/** The tax shares on a member-pays plan: planner half rounded to the cent, VFOS the rest. */
export function memberPaysTaxShares(total) {
  const cents = Math.round((Number(total) || 0) * 100)
  const planner = Math.round(cents / 2)
  return { planner: (planner / 100).toFixed(2), vfos: ((cents - planner) / 100).toFixed(2) }
}
