// Shared helper for the Accounting > VFO Services > Tax Planning views. Flattens
// enriched client_tax_plans rows into per-payment CLEARED entries (retainer +
// implementation — initial retainer + final retainer + implementation on a revised-
// process 3-payment plan), each split into member, tax planner and VFOS revenue. Covers
// both program_id=1 (Tax Priorities) and program_id=4 (Tax Planning).
//
// Each emitted row also carries the payout state of its member / planner / strategic leg
// (memberState, plannerState, strategicState) plus a paymentNote for a payment still in
// flight. VFOS has no payout leg of its own, but a payment that is still clearing has not
// landed as VFOS income either, so the row carries a vfosState for that case. The dollars
// are unchanged — the panels use those states purely to mark which slices have not
// actually left the VFO balance yet.
import { parseNum } from './holisticShared'
import { legState, isTerminalLeg, paymentNoteFor } from './shareLegState'

const PAID = new Set(['succeeded', 'processing', 'check_pending'])

// Revised fee process (2026-08-25). At $31,000 and above the retainer is COLLECTED in
// two payments: initial_retainer_amount at the retainer step, then
// final_retainer_amount. retainer_amount stays the SUM of the two, so it must never be
// booked as one cleared payment. Mirrors the edge constants/tax-fee-process.ts
// isThreePaymentPlan — a legacy or 2-payment row can never carry
// final_retainer_amount, so every such row takes the untouched single-Retainer path
// below.
const KNOWN_FEE_PROCESS_VERSIONS = ['2026-08-25']
// Keyed on FINAL (mirrors the edge constant), never on initial: a 2-payment row CAN
// carry initial_retainer_amount — a Tax 4 amendment below $31,000 converts a plan by
// nulling final only, and a buffer-band plan ($30,000.01-$30,999.99) is written that
// way from the outset — with initial kept as the reversibility marker in both cases.
// Final is the one truthful discriminator.
export function isThreePaymentPlan(r) {
  return KNOWN_FEE_PROCESS_VERSIONS.includes(r?.fee_process_version) && r?.final_retainer_amount != null
}

function programLabel(pid) { return Number(pid) === 4 ? 'Tax Planning' : 'Tax Priorities' }

// The VFOS slice has no leg to pay out, but a payment still in flight has not become VFOS
// income yet either — same in-flight statuses that give the payment its own note.
function vfosStateFor(status) {
  return paymentNoteFor(status) ? { note: 'payment clearing', tone: 'pending' } : null
}

// EVERY share on a tax plan — member, tax planner, strategic partner — is stored as
// DOLLARS OF THE TOTAL engagement, and all three payout legs prorate it by what THIS
// payment actually received (gotcha #252):
//
//   portion = (share / total) * payment,  falling back to share / 2 when total is
//                                         unusable
//
// which is verbatim actions/tax/revshare.ts (member + strategic) and
// utils/tax-planner-payout.ts (planner). One helper for all three, so this panel and the
// money cannot drift apart again.
//
// It replaces two helpers that each assumed the retainer and implementation were EQUAL
// HALVES and so hard-split the share `/ 2`. That held while every plan was a 50:50 pair;
// it stopped holding the moment uneven splits became normal, and on Lorente (plan 91,
// $4,887.50 / $10,112.50) it booked the member $3,750 against the $2,443.75 really
// transferred, the partner $750 against $488.75, and drove the VFO residual to -$590
// which `Math.max(…, 0)` then displayed as a clean $0.00.
//
// The old member helper also carried a `share <= 100 ? percent-of-this-payment` arm.
// That is DELETED, not ported: revshare.ts states "There is no percent interpretation",
// and 0 of 58 live plans store a share small enough to reach it — it was unreachable
// code describing a convention the engine does not implement.
// Client portal licence (portal licensing, unit 4) — the MIRROR of the payout
// engine's utils/client-portal-licence.ts licenceDisbursementFor / revshareBaseFor
// (keep them identical): the disbursement comes off the RETAINER before the split,
// every retainer leg is prorated on retainer - disbursement, and the disbursement is
// VFO PORTAL's own payee (row.licence) — NOT part of the VFOS residual. 0 on every
// plan without a licence.
export function licenceDisbursementFor(plan, paymentKind) {
  if (paymentKind !== 'retainer') return 0
  const d = parseNum(plan?.licence_disbursement)
  return d > 0 ? d : 0
}

function sharePortion(shareRaw, total, amount) {
  if (!(shareRaw > 0)) return 0
  const p = total > 0 ? (shareRaw / total) * amount : shareRaw / 2
  return Math.min(Math.max(p, 0), amount)
}

export function clearedTaxPayments(rows) {
  const out = []
  for (const r of rows || []) {
    const memberRaw = parseNum(r.member_share)
    // Strategic Partner Share (strategic members) and the tax planner share both come
    // out of the VFOS slice, which used to absorb them. retainerIsHistoric mirrors
    // PricingSplitCard's rule: a migrated plan whose retainer was SETTLED on the old
    // two-way system carries a stored split describing the implementation only, so its
    // retainer pays the planner nothing.
    const stratRaw = parseNum(r.strategic_partner_share)
    const label = programLabel(r.program_id)
    const ret = parseNum(r.retainer_amount)
    const imp = parseNum(r.implementation_amount)
    const plannerRaw = parseNum(r.tax_planner_share)
    const total = parseNum(r.total_fee) > 0 ? parseNum(r.total_fee) : ret + imp
    // All three legs, one rule — see sharePortion. Declared together so a future edit
    // to one is visibly an edit to all three.
    const memberPortion = (amt) => sharePortion(memberRaw, total, amt)
    const stratPer = (amt) => sharePortion(stratRaw, total, amt)
    const plannerPortion = (amt) => sharePortion(plannerRaw, total, amt)
    const retainerIsHistoric = !!r.legacy_source && r.retainer_rev_paid === 'N/A — No Share Due'
    const retLicence = licenceDisbursementFor(r, 'retainer')
    const retShareBase = Math.max(ret - retLicence, 0)
    const base = {
      clientName: r.client_name || `Client #${r.client_id}`,
      clientId: r.client_id,
      // Row click → this plan on the client page. The program must ride along (see
      // clientPagePath) or a Tax Planning plan opens on the Holistic tab and is hidden.
      programId: Number(r.program_id) || 1,
      planId: r.id,
      memberNumber: r.member_number || null,
      memberName: r.member_name || '',
      decision: r.member_revenue_decision || null,
      tier: label,
    }

    // A share is due but no planner is allocated: the payout engine stamps
    // "Awaiting Planner Allocation", but the sweep may not have run yet, so an
    // unallocated plan reads as awaiting-planner regardless of what the leg says.
    const plannerUnallocated = r.tax_planner_id == null
    const plannerStateFor = (slice, status, paymentStatus, context) => {
      if (!(slice > 0)) return null
      if (plannerUnallocated && !isTerminalLeg(status)) return { note: 'awaiting planner', tone: 'pending' }
      return legState(status, { paymentStatus, context })
    }

    // 3-payment shape: the retainer step collected initial_retainer_amount only, and NO
    // revenue share fires on it — all three retainer legs pay out once, on the FULL
    // retainer_amount, when the final retainer settles. So this row books the cash and
    // shows every share leg as still awaiting; the split rides on the Final Retainer row
    // below, which is where the transfers actually happen.
    const threePayment = isThreePaymentPlan(r)
    const retainerBlock = threePayment ? `${r.id}-retainer` : null

    if (PAID.has(r.retainer_status) && threePayment && parseNum(r.initial_retainer_amount) > 0) {
      const clearedAt = r.retainer_invoice_email_sent_at || r.retainer_date
      if (clearedAt) {
        // Computed but not displayed: a leg that will never carry money keeps its plain
        // dash, exactly as everywhere else on this tab.
        const willPayMember = memberPortion(ret) > 0
        const willPayStrat = stratPer(ret) > 0
        const willPayPlanner = plannerPortion(ret) > 0
        // Same reading a blank retainer leg gets today: the share is waiting on the
        // client, not lost. 'payment clearing' still wins while the cash is in flight.
        const deferred = legState(null, { paymentStatus: r.retainer_status, context: 'tax_retainer' })
        out.push({
          id: `${r.id}-ret`, kind: 'Initial Retainer', clearedAt, amount: parseNum(r.initial_retainer_amount),
          member: 0, strategic: 0, planner: 0, vfos: 0, status: r.retainer_status,
          retainerBlock, sharesDeferred: true,
          memberState: willPayMember ? deferred : null,
          plannerState: willPayPlanner ? deferred : null,
          strategicState: willPayStrat ? deferred : null,
          vfosState: deferred,
          paymentNote: paymentNoteFor(r.retainer_status),
          ...base,
        })
      }
    }

    // The final retainer settles → the whole retainer's split books here, computed on
    // retainer_amount (initial + final) exactly as the payout engine pays it, off the
    // same retainer_* leg columns. Its own RECEIVED is only this payment's cash.
    if (threePayment && PAID.has(r.final_retainer_status) && parseNum(r.final_retainer_amount) > 0) {
      const clearedAt = r.final_retainer_charge_date || r.final_retainer_receipt_email_sent_at
      if (clearedAt) {
        const mp = memberPortion(retShareBase)
        const sp = stratPer(retShareBase)
        const pp = plannerPortion(retShareBase)
        out.push({
          id: `${r.id}-fret`, licence: retLicence, kind: 'Final Retainer', clearedAt, amount: parseNum(r.final_retainer_amount),
          member: mp, strategic: sp, planner: pp,
          vfos: Math.max(ret - retLicence - mp - sp - pp, 0), status: r.final_retainer_status,
          retainerBlock,
          memberState: legState(r.retainer_rev_paid, { revShare: r.retainer_rev_share, paymentStatus: r.final_retainer_status, context: 'tax_retainer' }),
          plannerState: plannerStateFor(pp, r.retainer_planner_paid, r.final_retainer_status, 'tax_retainer'),
          strategicState: sp > 0 ? legState(r.retainer_strat_paid, { paymentStatus: r.final_retainer_status, context: 'tax_retainer' }) : null,
          vfosState: vfosStateFor(r.final_retainer_status),
          paymentNote: paymentNoteFor(r.final_retainer_status),
          ...base,
        })
      }
    }

    if (PAID.has(r.retainer_status) && !threePayment && ret > 0) {
      const clearedAt = r.retainer_invoice_email_sent_at || r.retainer_date
      if (clearedAt) {
        const mp = memberPortion(retShareBase)
        const sp = stratPer(retShareBase)
        const pp = retainerIsHistoric ? 0 : plannerPortion(retShareBase)
        out.push({
          id: `${r.id}-ret`, licence: retLicence, kind: 'Retainer', clearedAt, amount: ret, member: mp, strategic: sp, planner: pp,
          vfos: Math.max(ret - retLicence - mp - sp - pp, 0), status: r.retainer_status,
          // The retainer's revenue share fires on the client's decision after the
          // review, not on the charge — hence its own context. ALL THREE legs fire on
          // that one trigger, so all three carry it: without it a blank strategic leg
          // reads "not yet paid" beside siblings reading "awaiting client decision",
          // which describes the same wait two different ways.
          memberState: legState(r.retainer_rev_paid, { revShare: r.retainer_rev_share, paymentStatus: r.retainer_status, context: 'tax_retainer' }),
          plannerState: plannerStateFor(pp, r.retainer_planner_paid, r.retainer_status, 'tax_retainer'),
          strategicState: sp > 0 ? legState(r.retainer_strat_paid, { paymentStatus: r.retainer_status, context: 'tax_retainer' }) : null,
          vfosState: vfosStateFor(r.retainer_status),
          paymentNote: paymentNoteFor(r.retainer_status),
          ...base,
        })
      }
    }

    if (PAID.has(r.implementation_charge_status) && imp > 0) {
      const clearedAt = r.implementation_charge_date || r.implementation_confirmation_email_sent_at
      if (clearedAt) {
        const mp = memberPortion(imp)
        const sp = stratPer(imp)
        const pp = plannerPortion(imp)
        out.push({
          id: `${r.id}-imp`, kind: 'Implementation', clearedAt, amount: imp, member: mp, strategic: sp, planner: pp,
          vfos: Math.max(imp - mp - sp - pp, 0), status: r.implementation_charge_status,
          memberState: legState(r.implementation_rev_paid, { revShare: r.implementation_rev_share, paymentStatus: r.implementation_charge_status }),
          plannerState: plannerStateFor(pp, r.implementation_planner_paid, r.implementation_charge_status),
          strategicState: sp > 0 ? legState(r.implementation_strat_paid, { paymentStatus: r.implementation_charge_status }) : null,
          vfosState: vfosStateFor(r.implementation_charge_status),
          paymentNote: paymentNoteFor(r.implementation_charge_status),
          ...base,
        })
      }
    }
  }
  return out
}
