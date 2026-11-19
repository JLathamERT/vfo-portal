// Shared helpers for the Accounting > VFO Services > Holistic Planning views.
// Flattens enriched pipeline_map1 rows into per-installment CLEARED payments (money
// that actually hit the bank) with each payment split into member vs VFOS revenue.
//
// Each emitted installment also carries the payout state of its member and strategic
// legs (memberState, strategicState) plus a paymentNote for a payment still in flight.
// VFOS has no payout leg of its own, but a payment that is still clearing has not landed
// as VFOS income either, so the installment carries a vfosState for that case. The
// dollars are unchanged — the panels use those states purely to mark which slices have
// not actually left the VFO balance yet.
import { legState, paymentNoteFor } from './shareLegState'

const PAID = new Set(['succeeded', 'processing', 'check_pending'])

// The VFOS slice has no leg to pay out, but a payment still in flight has not become VFOS
// income yet either — same in-flight statuses that give the payment its own note.
function vfosStateFor(status) {
  return paymentNoteFor(status) ? { note: 'payment clearing', tone: 'pending' } : null
}

export function parseNum(v) {
  return parseFloat(String(v ?? '0').replace(/[,$]/g, '')) || 0
}

// One entry per cleared installment across all engagements. Each has the cleared date,
// the amount that came in, and the member/VFOS split of that amount.
export function clearedPayments(rows) {
  const out = []
  for (const r of rows || []) {
    const net = parseNum(r.net_invoice)
    const q = r.payment_plan === 'Quarterly'
    const n = q ? 4 : 1
    const amount = n ? net / n : net
    const memberRaw = parseNum(r.member_share)
    const memberPortion = (() => {
      let mp = memberRaw > 100 ? (q ? memberRaw / 4 : memberRaw) : (memberRaw / 100) * amount
      return Math.min(Math.max(mp, 0), amount)
    })()
    // Strategic Partner Share (strategic members only): a flat $ spread across
    // installments like the member share. For strategic rows net = gross, so the
    // strategic slice comes out of what would otherwise be counted as VFOS.
    const stratRaw = parseNum(r.strategic_partner_share)
    const stratPortion = Math.min(Math.max(q ? stratRaw / 4 : stratRaw, 0), amount)
    const tier = r.service_level || r.c15_service_level || ''
    for (let i = 1; i <= n; i++) {
      const status = r[`pay${i}_status`]
      if (!PAID.has(status)) continue
      const clearedAt = i === 1 ? (r.invoice_email_sent_at || r.pay1_date) : (r[`pay${i}_paid_at`] || r[`pay${i}_date`])
      if (!clearedAt) continue
      const revPaid = r[`rec${i}_rev_paid`]
      // A migrated installment settled on the old system pays nothing here and never
      // will, so it must not read as an unpaid share. Mirrors Map1PricingSplitCard.
      const memberState = r.legacy_source && revPaid === 'N/A — No Share Due'
        ? { note: 'settled on old system', tone: null }
        : legState(revPaid, { revShare: r[`rec${i}_rev_share`], paymentStatus: status })
      out.push({
        id: `${r.id}-${i}`,
        installment: i,
        fee: Number(r.installment_card_fees?.[i - 1]) || 0,
        plan: q ? 'Quarterly' : 'Pay in full',
        clearedAt,
        amount,
        member: memberPortion,
        strategic: stratPortion,
        vfos: Math.max(amount - memberPortion - stratPortion, 0),
        memberState,
        strategicState: stratPortion > 0 ? legState(r[`rec${i}_strat_paid`], { paymentStatus: status }) : null,
        vfosState: vfosStateFor(status),
        paymentNote: paymentNoteFor(status),
        clientName: r.client_name || `Client #${r.client_id}`,
        clientId: r.client_id,
        memberNumber: r.member_number || null,
        memberName: r.member_name || '',
        decision: r.member_revenue_decision || null,
        tier,
        status,
      })
    }
  }
  return out
}

export function inPeriod(dateStr, year, month) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (d.getFullYear() !== year) return false
  if (month >= 0 && d.getMonth() !== month) return false
  return true
}
