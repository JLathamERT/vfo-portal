// Shared helper for Accounting > VFO Services > Additional PIP views. Flattens enriched
// client_priority_tracks PIP-purchase rows into cleared payments. PIP stores its split
// directly (member_share / vfos_share / amount), so no recompute is needed.
//
// Each emitted purchase also carries memberState — the payout state of the member share
// — plus a paymentNote for a payment still in flight. VFOS has no payout leg of its own,
// but a payment that is still clearing has not landed as VFOS income either, so the
// purchase carries a vfosState for that case. PIP has no per-leg *_rev_paid columns: the
// whole engagement carries one pip_rev_share_status, written by
// actions/msm/pip-revshare.ts.
import { parseNum } from './holisticShared'
import { paymentNoteFor, HELD_SUSPENDED_NOTE, HELD_PAUSED_NOTE, HELD_ARREARS_NOTE } from './shareLegState'

const PAID = new Set(['succeeded', 'processing'])

// The VFOS slice has no leg to pay out, but a payment still in flight has not become VFOS
// income yet either. PAID above admits only 'processing' as in-flight here.
function vfosStateFor(status) {
  return paymentNoteFor(status) ? { note: 'payment clearing', tone: 'pending' } : null
}

function pipMemberState(r) {
  const s = r.pip_rev_share_status
  if (s === 'Completed - Revenue Share') return { note: 'paid', tone: 'done' }
  if (s === 'Completed - Money Mapping') return { note: 'money mapping', tone: 'done' }
  if (s === 'Completed - No Share Due') return { note: 'no share due', tone: null }
  if (s === 'Pending') return { note: 'in progress', tone: 'pending' }
  // PIP writes its own status vocabulary, so the two member-holds need their own cases
  // here — the lowercase fallthrough below would render the raw column value instead.
  if (s === 'Held - Member Suspended') return { note: HELD_SUSPENDED_NOTE, tone: 'pending' }
  if (s === 'Held - Member Paused') return { note: HELD_PAUSED_NOTE, tone: 'pending' }
  if (s === 'Held - Member In Arrears') return { note: HELD_ARREARS_NOTE, tone: 'pending' }
  if (s) return { note: String(s).toLowerCase(), tone: 'pending' }
  return { note: r.pip_payment_status === 'processing' ? 'payment clearing' : 'not yet paid', tone: 'pending' }
}

export function pipKindLabel(r) {
  if (r.pip_purchase_kind === 'tax_planning') return 'Tax Planning'
  if (r.pip_purchase_kind === 'additional_pip') {
    const n = r.pip_purchase_pip_count || 0
    return `${n} additional PIP meeting${n === 1 ? '' : 's'}`
  }
  return r.pip_purchase_kind || '—'
}

export function clearedPipPurchases(rows) {
  const out = []
  for (const r of rows || []) {
    if (!PAID.has(r.pip_payment_status)) continue
    if (!r.pip_payment_completed_at) continue
    out.push({
      id: r.id,
      clearedAt: r.pip_payment_completed_at,
      amount: parseNum(r.pip_purchase_amount),
      member: parseNum(r.pip_purchase_member_share),
      vfos: parseNum(r.pip_purchase_vfos_share),
      clientName: r.client_name || `Client #${r.client_id}`,
      clientId: r.client_id,
      memberNumber: r.member_number || null,
      memberName: r.member_name || '',
      decision: r.member_revenue_decision || null,
      kindLabel: pipKindLabel(r),
      status: r.pip_payment_status,
      memberState: pipMemberState(r),
      vfosState: vfosStateFor(r.pip_payment_status),
      paymentNote: paymentNoteFor(r.pip_payment_status),
    })
  }
  return out
}
