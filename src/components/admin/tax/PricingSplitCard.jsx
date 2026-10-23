import { useState, useEffect } from 'react'
import { callApi } from '../../../lib/api'
import { formatDate } from '../../../lib/dates'
import { HELD_SUSPENDED_NOTE, HELD_PAUSED_NOTE, HELD_ARREARS_NOTE } from '../shareLegState'
import { licenceDisbursementFor, isThreePaymentPlan, feeArrangementBaseFor, revshareBaseFor, retainerShareGrossFor, retainerRemainderFor, feeReductionOwedFor } from '../taxShared'

// Pricing + revenue-split summary for a tax plan, sitting directly under the Tax Plan
// hero. ADMIN (VFOS/ERT) SURFACE ONLY — the caller gates it out of the member and
// tax-planner views of the same track entirely, so neither ever sees VFO's own cut.
// Every admin may READ it; `isSuperadmin` gates the Edit button alone, and
// tax_update_split re-checks superadmin server-side so the button is convenience, not
// the security boundary.
//
// It exists because the fee amounts and the split were previously rendered ONLY inside
// the Tax 3 "AI PC Admin" cascade, which is gated on livePlan.tax_decision. A client
// migrated in through the Payment Continuation tool never gets a tax_decision (that
// decision happened on the old system), so for every migrated client the entire money
// picture was invisible on the portal while still being live.
//
// It also hosts the only place a split can be corrected after pricing: automation_TAX_pricing
// refuses once agreement_sent='Yes', which is true for every migrated row and every
// organic client past Tax 3.
//
// UNITS. Shares are STORED as dollars of the TOTAL engagement and prorated per payment
// (portion = share / total * payment). Operators think in per-payment dollars, so the
// table always shows the prorated figures and the editor takes whichever base is still
// live — implementation-only once the retainer legs are settled, total otherwise.
//
// STRATEGIC PARTNER. A plan sold through a strategic member (Tax Plan IQ, Action Coach,
// …) carries a FOURTH leg in strategic_partner_share, paid to the partner company's
// Connect account by actions/tax/revshare.ts on the SAME dollar-of-total proration as
// the member and planner legs. It had no row here, and because VFO Services is rendered
// as the residual of the payment, the partner's cut was silently reported as VFO income
// (plan 91: $488.75 of the retainer's "$1,466.25" was Tax Plan IQ's, already transferred).
// The row is conditional — the vast majority of plans have no partner and gain nothing
// from an always-dashed line. Mirrors Map1PricingSplitCard, which has always had it.

const TERMINAL = ['Yes', 'Money Mapping', 'N/A — No Share Due']
const WITHHELD = 'Awaiting Planner Allocation'
// Member leg only, and non-terminal like WITHHELD: the share is due but the member has no
// payout account. The nightly sweep pays it as soon as one exists.
const AWAITING_CONNECT = 'Awaiting Connect Setup'
// Member leg only, non-terminal too: the share is parked while the member is suspended,
// paused or in arrears on membership fees, and is released automatically on reinstatement.
const HELD_MEMBER = ['Held - Member Suspended', 'Held - Member Paused', 'Held - Member In Arrears']

const money = v => parseFloat(String(v ?? '0').replace(/[,$]/g, '')) || 0
const round2 = x => Math.round(x * 100) / 100
const fmt = n => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// For the one figure that can legitimately be negative (VFO handing back retainer it
// held, on a fee arrangement plan): "−$1,666.68", never "$-1,666.68".
const fmtSigned = n => ((n || 0) < 0 ? `−${fmt(Math.abs(n))}` : fmt(n))

// Short human label for a leg's payout status. Null/blank means the payment hasn't
// reached its payout yet, which reads better as nothing than as "pending".
function legNote(status) {
  if (!status) return ''
  if (status === 'Yes') return 'paid'
  if (status === 'Money Mapping') return 'money mapping'
  if (status === 'N/A — No Share Due') return 'no share due'
  if (status === WITHHELD) return 'withheld'
  if (status === AWAITING_CONNECT) return 'awaiting payout setup'
  if (status === 'Failed') return 'failed — retrying'
  if (status === 'Pending') return 'in progress'
  // Both holds need an explicit case: the lowercase fallthrough below would print the
  // raw column value, which is not the wording Accounting shows for the same leg.
  if (status === 'Held - Member Suspended') return HELD_SUSPENDED_NOTE
  if (status === 'Held - Member Paused') return HELD_PAUSED_NOTE
  if (status === 'Held - Member In Arrears') return HELD_ARREARS_NOTE
  return String(status).toLowerCase()
}

function noteColor(status) {
  if (status === 'Yes') return '#1b9254'
  if (status === WITHHELD || status === AWAITING_CONNECT || status === 'Failed' || HELD_MEMBER.includes(status)) return '#b9451d'
  return 'var(--vfo-muted)'
}

// Fee arrangement accent — the same orange as the Refund on Stop chip.
const ARR_TEXT = '#e06717'
const ARR_BG = 'rgba(224,103,23,0.08)'
const ARR_BORDER = 'rgba(224,103,23,0.35)'

const label = { fontSize: '11px', color: 'var(--vfo-muted)' }
const value = { fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: 600 }
const inputStyle = { width: '100%', padding: '7px 9px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }
const readonlyInput = { ...inputStyle, background: 'var(--vfo-tint)', color: 'var(--vfo-muted)' }

export default function PricingSplitCard({ plan, plannerName = '', isSuperadmin = false, readOnly = false, onSaved }) {
  // Collapsed by default — this sits on every tax plan and would otherwise shout over
  // the phase list it is introducing. The withheld-share warning is the one thing that
  // renders outside the fold, because that is money sitting still.
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [splitType, setSplitType] = useState('')
  const [memberShare, setMemberShare] = useState('')
  const [plannerShare, setPlannerShare] = useState('')
  const [vfosShare, setVfosShare] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [warnings, setWarnings] = useState([])
  // Negotiated partial refund (superadmin). Read only by the backend refund
  // handler, so it changes nothing else on this card.
  const [refundDraft, setRefundDraft] = useState('')
  const [refundBusy, setRefundBusy] = useState(false)
  const [refundErr, setRefundErr] = useState('')
  const [refundOk, setRefundOk] = useState('')
  // Fee arrangement editor (superadmin) — tax_set_fee_arrangement.
  const [arrEditing, setArrEditing] = useState(false)
  const [arrDraft, setArrDraft] = useState({})
  const [arrBusy, setArrBusy] = useState(false)
  const [arrErr, setArrErr] = useState('')
  // The refund of a final fee set below what was collected (superadmin).
  const [feeRefundBusy, setFeeRefundBusy] = useState(false)
  const [feeRefundErr, setFeeRefundErr] = useState('')
  const [feeRefundMsg, setFeeRefundMsg] = useState('')

  const retAmt = money(plan?.retainer_amount)
  // Client portal licence (unit 4): the retainer legs split retainer - disbursement and
  // the disbursement is its own payee, VFO Portal (a row below; NOT in VFO Services'
  // residual) — the same rule as the payout engine, via the mirror in taxShared.jsx.
  const retLicence = licenceDisbursementFor(plan, 'retainer')
  const retShareBase = revshareBaseFor(plan, 'retainer', retAmt)
  const implAmt = money(plan?.implementation_amount)
  const implShareBase = revshareBaseFor(plan, 'implementation', implAmt)
  const totalFee = money(plan?.total_fee) > 0 ? money(plan?.total_fee) : retAmt + implAmt

  // Fee arrangement (superadmin, 2026-10-23): while on, a payment with an agreed base
  // pays its revenue share on that figure and the rest stays with VFO Services, held
  // pending the final fee — the same rule as the payout engine (taxShared mirror).
  const arrOn = plan?.fee_arrangement_active === true
  const retAgreed = feeArrangementBaseFor(plan, 'retainer')
  const implAgreed = feeArrangementBaseFor(plan, 'implementation')
  // A final fee below what was collected (2026-10-23): the refund owed is recorded
  // by the Amend fee step and only refunded by the superadmin's button below.
  const refundOwed = feeReductionOwedFor(plan)
  const refundIssued = plan?.fee_reduction_refund_status === 'succeeded' || plan?.fee_reduction_refund_status === 'pending'
  const refundInProgress = plan?.fee_reduction_refund_status === 'processing'
  // A full retainer refund at Client decision 1 stopped the plan — nothing separate
  // is owed any more.
  const planRefundedInFull = plan?.refund_status === 'succeeded'
  const retGross = retainerShareGrossFor(plan, retAmt)
  // The part of the kept retainer the retainer payout does not share; it is paid with
  // the implementation leg so every party ends at its share of the final fee.
  const retRemainder = retainerRemainderFor(plan)
  const retHeld = Math.max(retAmt - retGross, 0)
  const implHeld = implAgreed == null ? 0 : Math.max(implAmt - Math.min(implAgreed, implAmt), 0)

  // 3-payment shape (revised fee process, >= $31,000): the retainer is COLLECTED as an
  // initial + a final payment, but its revenue share pays out ONCE, when the final
  // retainer settles, on the FULL retainer_amount (flows/tax-fee-process.md "The
  // deferred retainer revenue share"). So the initial column pays nobody and the final
  // column carries the whole retainer's split — the same reading as the Accounting
  // Payments rows (clearedTaxPayments). Every other plan keeps the one Retainer column.
  const threePayment = isThreePaymentPlan(plan)
  const initAmt = money(plan?.initial_retainer_amount)
  const finalAmt = money(plan?.final_retainer_amount)
  const finalCancelled = plan?.final_retainer_status === 'cancelled' || !!plan?.final_retainer_cancelled_at
  const finalNote = finalCancelled ? 'Cancelled'
    : plan?.final_retainer_status === 'succeeded' ? `Paid ${plan?.final_retainer_charge_date || ''}`
      : plan?.final_retainer_status === 'processing' ? 'Payment in progress'
        : plan?.final_retainer_status === 'declined' ? 'Charge declined — pay link sent'
          : 'Not yet charged'
  const hasPricing = totalFee > 0

  const storedMember = money(plan?.member_share)
  const storedPlanner = money(plan?.tax_planner_share)
  const storedVfos = money(plan?.vfos_share)
  const storedStrat = money(plan?.strategic_partner_share)
  const hasStrategic = storedStrat > 0

  // The editor's base: once the retainer legs are settled they can never pay again, so
  // the only dollars in play are the implementation's — which is also how the operator
  // entered them in the Payment Continuation tool.
  const retainerSettled = TERMINAL.includes(plan?.retainer_rev_paid) && TERMINAL.includes(plan?.retainer_planner_paid)
  const basisIsImpl = retainerSettled && implAmt > 0
  const basisAmt = basisIsImpl ? implAmt : totalFee
  const scale = basisIsImpl && implAmt > 0 ? totalFee / implAmt : 1

  const chargeInFlight = plan?.implementation_charge_status === 'succeeded' || plan?.implementation_charge_status === 'processing'
  const implNotCharged = implAmt > 0 && !chargeInFlight && !plan?.implementation_cancelled_at
  // A $0 implementation whose shares were settled at the client's Proceed (fee
  // arrangement, 2026-10-23): locked like a charged one, but nothing was charged.
  const implSettledNoCharge = !!plan?.implementation_settlement_at && implAmt === 0
  const implSettled = TERMINAL.includes(plan?.implementation_rev_paid) || TERMINAL.includes(plan?.implementation_planner_paid)
  const locked = chargeInFlight || implSettled
  // The editor and tax_update_split both know three legs only, and the handler refuses
  // unless member + planner + vfos equals the WHOLE total — which a strategic plan never
  // does, the partner holding the rest. So Save was already impossible here; hiding the
  // button says so instead of walking the operator into a red sum they can only "fix" by
  // handing VFO the partner's dollars. Teaching both sides the fourth leg is a backend
  // change, deliberately out of scope for this display fix.
  // Hidden while a fee arrangement is on: the arrangement is the agreed picture, and a
  // split edit underneath it would change what the agreed figures pay without saying so.
  const canEdit = isSuperadmin && !readOnly && hasPricing && !locked && !hasStrategic && !arrOn

  // What the client's Refund click would return. The captured base mirrors
  // refund.ts: the initial retainer on a 3-payment plan, the retainer otherwise.
  const refundOverride = money(plan?.refund_override_amount)
  const refunded = plan?.refund_status === 'succeeded'
  const revPaid = plan?.retainer_rev_paid === 'Yes'
  const capturedBase = money(plan?.initial_retainer_amount) > 0 && money(plan?.final_retainer_amount) > 0
    ? money(plan?.initial_retainer_amount)
    : retAmt
  const canSetRefund = isSuperadmin && !readOnly && hasPricing && !refunded && !revPaid

  useEffect(() => {
    setRefundDraft(refundOverride > 0 ? refundOverride.toFixed(2) : '')
    setRefundErr('')
    setRefundOk('')
  }, [plan?.id, plan?.refund_override_amount])

  async function saveRefundOverride(clear = false) {
    setRefundBusy(true)
    setRefundErr('')
    setRefundOk('')
    try {
      const amount = clear ? '' : refundDraft
      if (!clear) {
        const n = money(amount)
        if (!(n > 0)) { setRefundErr('Enter an amount greater than 0, or use Clear.'); return }
        if (capturedBase > 0 && n > capturedBase + 0.005) { setRefundErr(`Cannot exceed the retainer collected (${fmt(capturedBase)}).`); return }
      }
      const res = await callApi('tax_set_refund_override', { tax_plan_id: plan.id, amount })
      if (res?.error) { setRefundErr(res.error); return }
      setRefundOk(clear ? 'Override cleared — a Refund click returns the full retainer.' : `Saved — a Refund click now returns ${fmt(money(amount))}.`)
      if (onSaved) await onSaved()
    } catch (e) {
      setRefundErr(e?.message || 'Save failed')
    } finally {
      setRefundBusy(false)
    }
  }

  // A payment's agreed base is frozen once any of its legs has paid out — the money
  // moved on the old figure (the handler refuses the same change with a 409).
  const retLegsPaid = [plan?.retainer_rev_paid, plan?.retainer_planner_paid, plan?.retainer_strat_paid].some(s => TERMINAL.includes(s))
  const implLegsPaid = [plan?.implementation_rev_paid, plan?.implementation_planner_paid, plan?.implementation_strat_paid].some(s => TERMINAL.includes(s))
  const canSetArrangement = isSuperadmin && !readOnly && hasPricing

  function openArrangement() {
    setArrDraft({
      active: arrOn || !plan?.fee_arrangement_set_at,
      note: plan?.fee_arrangement_note || '',
      retainer_base: plan?.fee_arrangement_retainer_base != null ? money(plan.fee_arrangement_retainer_base).toFixed(2) : '',
      implementation_base: plan?.fee_arrangement_implementation_base != null ? money(plan.fee_arrangement_implementation_base).toFixed(2) : '',
      client_note: plan?.fee_arrangement_client_note || '',
      note_tax4: plan?.fee_arrangement_note_tax4 === true,
      note_tax5: plan?.fee_arrangement_note_tax5 === true,
    })
    setArrErr('')
    setArrEditing(true)
  }

  async function saveArrangement() {
    setArrBusy(true)
    setArrErr('')
    try {
      const res = await callApi('tax_set_fee_arrangement', { tax_plan_id: plan.id, ...arrDraft })
      if (res?.error) { setArrErr(res.error); return }
      setArrEditing(false)
      if (onSaved) await onSaved()
    } catch (e) {
      setArrErr(e?.message || 'Save failed')
    } finally {
      setArrBusy(false)
    }
  }

  // Issue (or finish) the fee-reduction refund: Stripe refund, credit note, revised
  // invoice and the client email (Draft). Re-runnable — each stage is skipped once
  // done, and the refund itself can never be issued twice.
  async function issueFeeRefund(byHand = false) {
    const who = plan?.client_name || 'the client'
    const question = refundIssued
      ? 'Finish the credit note, revised invoice and client email?'
      : byHand
        ? `Record that ${fmt(refundOwed)} was refunded to ${who} OUTSIDE the portal, and create the credit note? Nothing is sent to Stripe.`
        : `Refund ${fmt(refundOwed)} to ${who} now, and create the credit note? This cannot be undone.`
    if (!window.confirm(question)) return
    setFeeRefundBusy(true)
    setFeeRefundErr('')
    setFeeRefundMsg('')
    try {
      const res = await callApi('tax_issue_fee_reduction_refund', { tax_plan_id: plan.id, ...(byHand ? { by_hand: true } : {}) })
      if (res?.error) setFeeRefundErr(res.error)
      else setFeeRefundMsg(`Refund ${res?.refund_status === 'pending' ? 'sent (bank refund — settles in a few days)' : 'issued'} · credit note ${res?.credit_note_number || ''} · client email drafted in Gmail for review.`)
      if (onSaved) await onSaved()
    } catch (e) {
      setFeeRefundErr(e?.message || 'Refund failed')
    } finally {
      setFeeRefundBusy(false)
    }
  }

  // What the draft would pay, so the superadmin sees the figures before saving.
  const draftPreview = (kind, payment) => {
    const raw = arrDraft[`${kind}_base`]
    if (!arrDraft.active || raw == null || String(raw).trim() === '' || !(payment > 0)) return null
    const b = revshareBaseFor({ ...plan, fee_arrangement_active: true, [`fee_arrangement_${kind}_base`]: raw }, kind, payment)
    const m = noShareDraft(kind, 'rev') ? 0 : portion(storedMember, b)
    const p = noShareDraft(kind, 'planner') ? 0 : portion(storedPlanner, b)
    const s = noShareDraft(kind, 'strat') ? 0 : portion(storedStrat, b)
    return { member: m, planner: p, strat: s, vfo: round2(payment - (kind === 'retainer' ? retLicence : 0) - m - p - s) }
  }
  const noShareDraft = (kind, leg) => plan?.[`${kind}_${leg}_paid`] === 'N/A — No Share Due'

  // Seed the form from the stored values, converted back into the active base.
  useEffect(() => {
    if (!editing) return
    setSplitType(plan?.split_type || '')
    setMemberShare(storedMember ? round2(storedMember / scale).toFixed(2) : '0.00')
    setPlannerShare(storedPlanner ? round2(storedPlanner / scale).toFixed(2) : '0.00')
    setVfosShare(storedVfos ? round2(storedVfos / scale).toFixed(2) : '0.00')
    setErr('')
    setWarnings([])
  }, [editing])

  // Preset auto-calculates equal thirds of the active base; VFOS absorbs the rounding
  // remainder, mirroring the Payment Continuation tool. Driven from the dropdown's
  // onChange rather than an effect on splitType — an effect would also fire on the
  // seed above, silently rewriting the saved figures of any plan already stamped with
  // the preset label before the operator had touched anything.
  function pickSplitType(next) {
    setSplitType(next)
    if (next === '1/3 Member, 1/3 Tax Planner, 1/3 VFOS') {
      const third = round2(basisAmt / 3)
      setMemberShare(third.toFixed(2))
      setPlannerShare(third.toFixed(2))
      setVfosShare(round2(basisAmt - third - third).toFixed(2))
    }
  }

  const draftMember = money(memberShare)
  const draftPlanner = money(plannerShare)
  const draftVfos = money(vfosShare)
  const draftSum = round2(draftMember + draftPlanner + draftVfos)
  const sumOk = Math.abs(draftSum - basisAmt) <= 0.01

  // What the entered numbers become in storage (dollars of total). VFOS takes the
  // remainder so the three always sum to the total exactly.
  const toStored = () => {
    const m = round2(draftMember * scale)
    const p = round2(draftPlanner * scale)
    return { member_share: m, tax_planner_share: p, vfos_share: round2(totalFee - m - p) }
  }

  // Prorated payout for one payment from a stored (of-total) share.
  const portion = (share, payment) => (totalFee > 0 ? round2((share / totalFee) * payment) : 0)

  // A leg settled as no-share-due pays nothing on that payment, ever — deriving a
  // dollar figure from the split would invent a payout (e.g. a planner share that only
  // exists on the implementation rendering under the retainer). Dash it; the note says why.
  const noShare = s => s === 'N/A — No Share Due'

  // VFO Services keeps whatever the payment holds once the legs that actually pay are
  // out — a dead (no-share-due) leg's portion stays with VFO, so the column still sums
  // to the payment. Identical to the configured vfos_share whenever all legs are live.
  const legAmt = (stored, status, payment) => (noShare(status) ? 0 : portion(stored, payment))
  const retVfos = round2(retAmt - retLicence - legAmt(storedMember, plan?.retainer_rev_paid, retShareBase) - legAmt(storedPlanner, plan?.retainer_planner_paid, retShareBase) - legAmt(storedStrat, plan?.retainer_strat_paid, retShareBase))
  const implVfos = round2(implAmt - legAmt(storedMember, plan?.implementation_rev_paid, implShareBase) - legAmt(storedPlanner, plan?.implementation_planner_paid, implShareBase) - legAmt(storedStrat, plan?.implementation_strat_paid, implShareBase))

  // Display order (Jake, 2026-09-28, every plan): VFO Services, Member, Tax planner,
  // Strategic partner, VFO Portal. Order is display-only — VFO Services is still the
  // RESIDUAL (retVfos / implVfos), computed after every other payee.
  // The strategic partner is unnamed on purpose: the partner company is
  // members.member_type, which this payload does not carry, and split_type is the
  // preset LABEL ("Strategic Partner"), not the company. Same wording as Map1PricingSplitCard.
  const rows = [
    { key: 'vfos', name: 'VFO Services', stored: storedVfos, retStatus: null, implStatus: null },
    { key: 'member', name: 'Member', stored: storedMember, retStatus: plan?.retainer_rev_paid, implStatus: plan?.implementation_rev_paid },
    { key: 'planner', name: plannerName ? `Tax planner — ${plannerName}` : 'Tax planner', stored: storedPlanner, retStatus: plan?.retainer_planner_paid, implStatus: plan?.implementation_planner_paid },
    ...(hasStrategic ? [{ key: 'strat', name: 'Strategic partner', stored: storedStrat, retStatus: plan?.retainer_strat_paid, implStatus: plan?.implementation_strat_paid }] : []),
    ...(retLicence > 0 ? [{ key: 'portal', name: 'VFO Portal (client portal licence)', stored: 0, retStatus: null, implStatus: null }] : []),
  ]

  const plannerUnallocated = storedPlanner > 0 && plan?.tax_planner_id == null

  // A migrated plan's retainer was collected on the old system under a policy that had
  // no tax planner share; when the migration SETTLED its legs (rev_paid stamped
  // no-share-due) the stored split describes the implementation only, so the retainer
  // column must not derive dollars from it. But a migrated retainer whose legs were left
  // LIVE (the "revenue share not paid yet" checkbox — rev_paid NULL until Client
  // decision 1 pays it) carries a genuine split across both payments, same as an
  // organic client. Mirrors Map1PricingSplitCard's isHistoric rule.
  const retainerIsHistoric = !!plan?.legacy_source && plan?.retainer_rev_paid === 'N/A — No Share Due'

  async function save() {
    setBusy(true)
    setErr('')
    setWarnings([])
    try {
      const stored = toStored()
      const res = await callApi('tax_update_split', {
        tax_plan_id: plan.id,
        split_type: splitType || null,
        ...stored,
      })
      if (res?.error) { setErr(res.error); return }
      setWarnings(res?.warnings || [])
      setEditing(false)
      if (onSaved) await onSaved()
    } catch (e) {
      setErr(e?.message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ background: 'var(--vfo-plan-tool-bg)', border: '1px solid var(--vfo-plan-tool-border)', borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', padding: '14px 18px', marginBottom: '10px', fontFamily: 'Inter, sans-serif' }}>
      {/* A fee arrangement adds chips; keep them and the chevron on the one header
          row (the summary text gives way instead). Every other plan is unchanged. */}
      <div onClick={() => setExpanded(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flexWrap: arrOn ? 'nowrap' : 'wrap' }}>
        <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--vfo-heading)', textTransform: 'uppercase', letterSpacing: '1px', ...(arrOn ? { whiteSpace: 'nowrap', flexShrink: 0 } : {}) }}>Pricing &amp; revenue split</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', ...(arrOn ? { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : {}) }}>
          {hasPricing ? `${fmt(totalFee)} · ${plan?.split_type || 'no split set'}` : 'No pricing entered yet'}
        </span>
        {plan?.legacy_source && (
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Migrated</span>
        )}
        {locked && hasPricing && (
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', border: '1px solid rgba(27,146,84,0.3)', color: 'var(--vfo-success-text)', fontWeight: 600, ...(arrOn ? { whiteSpace: 'nowrap', flexShrink: 0 } : {}) }}>{implSettledNoCharge ? 'Locked — settled' : 'Locked — charged'}</span>
        )}
        {refundOverride > 0 && !refunded && (
          <span title="A Refund click at Client decision 1 returns this amount instead of the full retainer" style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(224,103,23,0.12)', border: '1px solid rgba(224,103,23,0.35)', color: '#e06717', fontWeight: 600 }}>Refund on Stop: {fmt(refundOverride)}</span>
        )}
        {refundOwed > 0 && !planRefundedInFull && (
          <span title={refundIssued ? 'The refund for the reduced fee has been issued' : 'The final fee was set below what was collected — the refund has NOT been issued'} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: refundIssued ? 'var(--vfo-tint)' : 'rgba(224,103,23,0.12)', border: `1px solid ${refundIssued ? 'var(--vfo-border-chip)' : ARR_BORDER}`, color: refundIssued ? 'var(--vfo-muted)' : ARR_TEXT, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>{refundIssued ? `Refunded ${fmt(refundOwed)}` : `Refund owed ${fmt(refundOwed)}`}</span>
        )}
        {arrOn && (
          <span title="This plan has an agreed fee arrangement — see the box below" style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(224,103,23,0.12)', border: `1px solid ${ARR_BORDER}`, color: ARR_TEXT, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>Fee arrangement</span>
        )}
        {refunded && (
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)', fontWeight: 600 }}>Refunded {fmt(money(plan?.refund_amount))}</span>
        )}
        {expanded && canEdit && !editing && (
          <button onClick={e => { e.stopPropagation(); setEditing(true) }} style={{ padding: '4px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600 }}>Edit split</button>
        )}
        <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: expanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
      </div>

      {/* Outside the fold on purpose — a held share is money that has stopped moving. */}
      {plannerUnallocated && (
        <div style={{ marginTop: '9px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(185,69,29,0.08)', border: '1px solid rgba(185,69,29,0.25)', fontSize: '11px', color: '#b9451d' }}>
          No tax planner allocated. {chargeInFlight
            ? `Their ${fmt(portion(storedPlanner, implAmt))} share is being held — allocate a planner and it pays out immediately.`
            : `Their ${fmt(portion(storedPlanner, implAmt))} share will be held when the implementation is charged, and paid as soon as you allocate one.`}
        </div>
      )}

      {/* Outside the fold too: the agreed picture must be read before anything on this
          plan is acted on. */}
      {arrOn && !arrEditing && (
        <div style={{ marginTop: '9px', padding: '10px 14px', borderRadius: '8px', background: ARR_BG, border: `1px solid ${ARR_BORDER}`, fontSize: '12px', color: 'var(--vfo-ink)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontWeight: 700, color: ARR_TEXT }}>Agreed fee arrangement</span>
            <span style={{ flex: 1 }} />
            {canSetArrangement && (
              <button onClick={() => { setExpanded(true); openArrangement() }} style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', border: `1px solid ${ARR_BORDER}`, background: 'transparent', color: ARR_TEXT, fontWeight: 600 }}>Edit</button>
            )}
          </div>
          {plan?.fee_arrangement_note && <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{plan.fee_arrangement_note}</div>}
          <div style={{ marginTop: '6px', lineHeight: 1.55 }}>
            {retAgreed != null && (
              <div>• Retainer revenue share {retLegsPaid ? 'was paid' : 'is paid'} on {fmt(retAmt - retHeld)}{retHeld > 0
                ? (refundOwed > 0 || plan?.fee_amended_at_tax5
                  ? `, not the ${fmt(retAmt)} received. Of the other ${fmt(retHeld)}: ${[retRemainder > 0 && `${fmt(retRemainder)} is shared at the implementation`, refundOwed > 0 && `${fmt(refundOwed)} is ${refundIssued ? 'refunded' : 'owed back'} to the client`].filter(Boolean).join(' and ')}`
                  : `, not the ${fmt(retAmt)} received — ${fmt(retHeld)} held by VFO Services pending the final fee`)
                : ''}.</div>
            )}
            {implAgreed != null && (
              <div>• Implementation revenue share {implLegsPaid ? 'was paid' : 'is paid'} on {fmt(implAmt - implHeld)}{implHeld > 0 ? `, not the ${fmt(implAmt)} charged — ${fmt(implHeld)} held by VFO Services` : ''}.</div>
            )}
            {implNotCharged && <div>• The implementation fee ({fmt(implAmt)}) is not changed by this — amend it before the implementation decision goes out.</div>}
            <div>• Client sentence: {plan?.fee_arrangement_client_note && (plan?.fee_arrangement_note_tax4 || plan?.fee_arrangement_note_tax5)
              ? `added to the ${[plan?.fee_arrangement_note_tax4 && 'Client decision 1 email', plan?.fee_arrangement_note_tax5 && 'implementation decision email'].filter(Boolean).join(' and the ')}.`
              : 'not added to any email.'}</div>
          </div>
          {plan?.fee_arrangement_client_note && (plan?.fee_arrangement_note_tax4 || plan?.fee_arrangement_note_tax5) && (
            <div style={{ marginTop: '6px', padding: '6px 10px', borderLeft: `3px solid ${ARR_BORDER}`, color: 'var(--vfo-muted)', whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>{plan.fee_arrangement_client_note}</div>
          )}
          {plan?.fee_arrangement_set_at && (
            <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--vfo-muted)' }}>
              Set by {plan?.fee_arrangement_set_by || 'an admin'} on {formatDate(plan.fee_arrangement_set_at)}
            </div>
          )}
        </div>
      )}

      {/* Outside the fold: money owed back to a client must never be missed. */}
      {refundOwed > 0 && planRefundedInFull && (
        <div style={{ marginTop: '9px', fontSize: '11px', color: 'var(--vfo-muted)' }}>
          The retainer was refunded in full at Client decision 1, so the {fmt(refundOwed)} recorded as owed for the reduced fee no longer applies.
        </div>
      )}
      {refundOwed > 0 && !planRefundedInFull && (
        <div style={{ marginTop: '9px', padding: '10px 14px', borderRadius: '8px', background: refundIssued ? 'var(--vfo-tint)' : ARR_BG, border: `1px solid ${refundIssued ? 'var(--vfo-border-chip)' : ARR_BORDER}`, fontSize: '12px', color: 'var(--vfo-ink)', lineHeight: 1.55 }}>
          {!refundIssued ? (
            <>
              <div style={{ fontWeight: 700, color: ARR_TEXT }}>Refund owed to the client: {fmt(refundOwed)} — not issued</div>
              <div>The final fee was set to {fmt(totalFee)}, below the {fmt(retAmt)} collected. The money stays with VFO until the final fee is confirmed; nothing is refunded until the button below is pressed.</div>
              {plan?.fee_reduction_refund_status === 'failed' && <div style={{ color: '#e74c3c', fontWeight: 600 }}>The last refund attempt failed — check the bell before trying again. Pressing the button again never repeats a refund that already went through.</div>}
              {refundInProgress && <div style={{ fontWeight: 600 }}>A refund is being issued right now — reload in a minute.</div>}
              {!refundInProgress && !plan?.fee_amended_at_tax5 && <div style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>The button works once the final fee has been entered at the Tax 5 "Amend implementation fee" step.</div>}
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700 }}>Refunded {fmt(refundOwed)}{plan?.fee_reduction_refunded_at ? ` on ${formatDate(plan.fee_reduction_refunded_at)}` : ''}{plan?.fee_reduction_refunded_by ? ` by ${plan.fee_reduction_refunded_by}` : ''}{plan?.fee_reduction_refund_status === 'pending' ? ' (bank refund settling)' : ''}</div>
              <div>
                {plan?.fee_reduction_credit_note_number ? `Credit note ${plan.fee_reduction_credit_note_number}` : 'Credit note not created yet'}
                {' · '}
                {plan?.fee_reduction_email_sent_at ? `client email drafted ${formatDate(plan.fee_reduction_email_sent_at)}` : 'client email not drafted yet'}
                {plan?.fee_reduction_refund_ids && plan.fee_reduction_refund_ids !== 'by hand' ? ` · Stripe ${plan.fee_reduction_refund_ids}` : plan?.fee_reduction_refund_ids === 'by hand' ? ' · refunded by hand' : ''}
              </div>
            </>
          )}
          {isSuperadmin && !readOnly && !refundInProgress && (!refundIssued || !plan?.fee_reduction_credit_note_drive_id || !plan?.fee_reduction_email_sent_at) && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              <button disabled={feeRefundBusy} onClick={() => issueFeeRefund(false)} style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', cursor: feeRefundBusy ? 'not-allowed' : 'pointer', border: `1px solid ${ARR_BORDER}`, background: 'rgba(224,103,23,0.12)', color: ARR_TEXT, fontWeight: 700 }}>
                {feeRefundBusy ? 'Working…' : refundIssued ? 'Finish credit note and email' : 'Issue refund and credit note'}
              </button>
              {!refundIssued && (
                <button disabled={feeRefundBusy} onClick={() => issueFeeRefund(true)} style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', cursor: feeRefundBusy ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Mark refunded by hand</button>
              )}
            </div>
          )}
          {feeRefundErr && <div style={{ marginTop: '6px', fontSize: '11px', color: '#e74c3c' }}>{feeRefundErr}</div>}
          {feeRefundMsg && <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--vfo-success-text)' }}>{feeRefundMsg}</div>}
        </div>
      )}

      {expanded && !hasPricing && (
        <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '10px' }}>No pricing entered for this plan yet.</div>
      )}

      {expanded && hasPricing && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px 20px', marginBottom: '14px' }}>
            <div>
              <div style={label}>{threePayment ? 'Initial retainer' : 'Retainer'}</div>
              <div style={value}>{fmt(threePayment ? initAmt : retAmt)}</div>
              <div style={{ fontSize: '10px', color: 'var(--vfo-muted)' }}>
                {plan?.legacy_source ? `Paid ${plan?.retainer_date || ''} (old system)` : plan?.retainer_status === 'succeeded' ? `Paid ${plan?.retainer_date || ''}` : 'Not yet paid'}
              </div>
            </div>
            {threePayment && (
              <div>
                <div style={label}>Final retainer</div>
                <div style={value}>{fmt(finalAmt)}</div>
                <div style={{ fontSize: '10px', color: finalCancelled ? '#b9451d' : 'var(--vfo-muted)' }}>{finalNote}</div>
              </div>
            )}
            <div>
              <div style={label}>Implementation</div>
              <div style={value}>{fmt(implAmt)}</div>
              <div style={{ fontSize: '10px', color: 'var(--vfo-muted)' }}>
                {plan?.implementation_charge_status === 'succeeded' ? 'Charged'
                  : plan?.implementation_charge_status === 'processing' ? 'Charge in progress'
                    : plan?.implementation_charge_status === 'declined' ? 'Charge declined — pay link sent'
                      : implSettledNoCharge || (arrOn && implAmt === 0) ? 'No payment due' : 'Not yet charged'}
              </div>
              {arrOn && implNotCharged && <div style={{ fontSize: '10px', color: ARR_TEXT, fontWeight: 600 }}>Fee under review — amend before the implementation decision</div>}
            </div>
            <div>
              <div style={label}>Total fee</div>
              <div style={value}>{fmt(totalFee)}</div>
              <div style={{ fontSize: '10px', color: 'var(--vfo-muted)' }}>{plan?.split_type || 'No split type set'}{threePayment ? ' · 3 payments' : ''}</div>
              {refundOwed > 0 && <div style={{ fontSize: '10px', color: ARR_TEXT, fontWeight: 600 }}>{refundIssued ? `Refunded ${fmt(refundOwed)}` : `Refund owed ${fmt(refundOwed)} — not issued`}</div>}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '420px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--vfo-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--vfo-border-soft)' }}>Pays out to</th>
                  {threePayment ? (
                    <>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--vfo-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--vfo-border-soft)' }}>Initial retainer {fmt(initAmt)}</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--vfo-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                        Final retainer {fmt(finalAmt)}
                        <div style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>pays the split on the full {fmt(retAmt)} retainer</div>
                        {retHeld > 0 && <div style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: ARR_TEXT }}>shares on {fmt(retGross)}{retAgreed != null ? ' by agreement' : ' kept'}</div>}
                      </th>
                    </>
                  ) : (
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--vfo-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                      Retainer {fmt(retAmt)}
                      {retHeld > 0 && <div style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: ARR_TEXT }}>shares on {fmt(retGross)}{retAgreed != null ? ' by agreement' : ' kept'}</div>}
                    </th>
                  )}
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--vfo-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                    Implementation {fmt(implAmt)}
                    {retRemainder > 0
                      ? <div style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: ARR_TEXT }}>{implAmt > 0 ? `shares on ${fmt(implShareBase)} incl. ${fmt(retRemainder)} held back from the retainer` : `shares on the ${fmt(retRemainder)} held back from the retainer`}</div>
                      : implHeld > 0
                        ? <div style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: ARR_TEXT }}>shares on {fmt(implAmt - implHeld)} by agreement</div>
                        : arrOn && implNotCharged && <div style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: ARR_TEXT }}>fee under review — may change</div>}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key}>
                    <td style={{ padding: '7px 8px', color: 'var(--vfo-ink)', borderBottom: '1px solid var(--vfo-border-soft)' }}>{r.name}</td>
                    {threePayment && (
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--vfo-muted)', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                        —
                        <div style={{ fontSize: '10px', color: 'var(--vfo-muted)' }}>{r.key === 'vfos' ? 'held until final retainer' : 'paid with final retainer'}</div>
                      </td>
                    )}
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: retainerIsHistoric ? 'var(--vfo-muted)' : 'var(--vfo-ink)', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                      {/* A migrated retainer was collected on the old system, under the
                          two-way policy that predates the tax planner share. Deriving a
                          figure from today's split would invent a payout that never
                          happened and never will — those legs are settled and locked. */}
                      {retainerIsHistoric || noShare(r.retStatus) ? '—' : fmt(r.key === 'vfos' ? retVfos : r.key === 'portal' ? retLicence : portion(r.stored, retShareBase))}
                      <div style={{ fontSize: '10px', color: retainerIsHistoric ? 'var(--vfo-muted)' : noteColor(r.retStatus) }}>
                        {retainerIsHistoric ? 'settled on old system' : legNote(r.retStatus)}
                      </div>
                      {r.key === 'vfos' && retRemainder > 0 && !retainerIsHistoric && <div style={{ fontSize: '10px', color: 'var(--vfo-muted)' }}>incl. {fmt(retRemainder)} shared with the implementation</div>}
                      {r.key === 'vfos' && refundOwed > 0 && !retainerIsHistoric && <div style={{ fontSize: '10px', color: ARR_TEXT }}>incl. {fmt(refundOwed)} {refundIssued ? 'refunded to the client' : 'refund owed to the client'}</div>}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--vfo-ink)', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                      {noShare(r.implStatus) || r.key === 'portal' ? '—' : r.key === 'vfos' ? fmtSigned(implVfos) : fmt(portion(r.stored, implShareBase))}
                      {legNote(r.implStatus) && <div style={{ fontSize: '10px', color: noteColor(r.implStatus) }}>{legNote(r.implStatus)}</div>}
                      {r.key === 'vfos' && implHeld > 0 && <div style={{ fontSize: '10px', color: 'var(--vfo-muted)' }}>incl. {fmt(implHeld)} held pending final fee</div>}
                      {r.key === 'vfos' && retRemainder > 0 && implVfos < 0 && <div style={{ fontSize: '10px', color: 'var(--vfo-muted)' }}>paid out of the retainer held back</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canSetRefund && (
            <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ ...label, fontWeight: 600, color: 'var(--vfo-ink)' }}>Refund override ($)</div>
                <input value={refundDraft} onChange={e => setRefundDraft(e.target.value)} placeholder={capturedBase > 0 ? `full retainer ${fmt(capturedBase)}` : 'full retainer'} inputMode="decimal" style={{ ...inputStyle, width: '150px' }} />
                <button disabled={refundBusy} onClick={() => saveRefundOverride(false)} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: refundBusy ? 'not-allowed' : 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: 'var(--vfo-success-text)', fontWeight: 600 }}>{refundBusy ? 'Saving…' : 'Save'}</button>
                {refundOverride > 0 && (
                  <button disabled={refundBusy} onClick={() => saveRefundOverride(true)} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: refundBusy ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Clear</button>
                )}
              </div>
              <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--vfo-muted)' }}>
                If the client clicks <b>Refund</b> on their decision email, Stripe returns this amount instead of the full retainer{capturedBase > 0 ? ` (${fmt(capturedBase)})` : ''}. It changes nothing else — Continue, rev-share and the implementation fee all run as normal. Blank = full retainer.
              </div>
              {refundErr && <div style={{ marginTop: '6px', fontSize: '11px', color: '#e74c3c' }}>{refundErr}</div>}
              {refundOk && <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--vfo-success-text)' }}>{refundOk}</div>}
            </div>
          )}

          {canSetArrangement && !arrEditing && !arrOn && !locked && (
            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button onClick={openArrangement} style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', border: `1px solid ${ARR_BORDER}`, background: 'transparent', color: ARR_TEXT, fontWeight: 600 }}>
                {plan?.fee_arrangement_set_at ? 'Turn fee arrangement back on' : 'Set up fee arrangement'}
              </button>
              <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>For an agreed fee change: pay the revenue share on an agreed figure and tell the client in their decision email.</span>
            </div>
          )}

          {arrEditing && (
            <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '10px', background: ARR_BG, border: `1px solid ${ARR_BORDER}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontWeight: 700, fontSize: '12px', color: ARR_TEXT }}>Fee arrangement</span>
                <span style={{ flex: 1 }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--vfo-ink)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!arrDraft.active} onChange={e => setArrDraft(d => ({ ...d, active: e.target.checked }))} />
                  Arrangement on
                </label>
              </div>
              {!arrDraft.active && (
                <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginBottom: '8px' }}>Off: every payment's revenue share is worked out on the amount received again, and no sentence is added to any email. Shares already paid stay as they are.</div>
              )}

              <div style={{ ...label, marginBottom: '3px' }}>What has been agreed (internal — shown on this card)</div>
              <textarea value={arrDraft.note || ''} onChange={e => setArrDraft(d => ({ ...d, note: e.target.value }))} rows={4} placeholder="What was agreed with the client and by whom: the fee now expected, what VFO is holding and until when, and how revenue shares are paid in the meantime." style={{ ...inputStyle, resize: 'vertical', marginBottom: '10px' }} />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '6px' }}>
                {[['retainer', retAmt, retLegsPaid, 'Retainer'], ['implementation', implAmt, implLegsPaid, 'Implementation']].map(([kind, payment, paid, title]) => {
                  const pv = draftPreview(kind, payment)
                  return (
                    <div key={kind}>
                      <div style={{ ...label, marginBottom: '3px' }}>{title} revenue share worked out on ($)</div>
                      <input value={arrDraft[`${kind}_base`] || ''} onChange={e => setArrDraft(d => ({ ...d, [`${kind}_base`]: e.target.value }))} disabled={paid} inputMode="decimal" placeholder={`blank = the full ${fmt(payment)}`} style={paid ? readonlyInput : inputStyle} />
                      <div style={{ fontSize: '10px', color: 'var(--vfo-muted)', marginTop: '3px' }}>
                        {paid ? `Locked — the ${title.toLowerCase()} revenue share has already been paid.`
                          : pv ? `Pays member ${fmt(pv.member)} · planner ${fmt(pv.planner)}${hasStrategic ? ` · partner ${fmt(pv.strat)}` : ''} · VFO keeps ${fmt(pv.vfo)}`
                            : kind === 'retainer' ? 'Blank = shares on the full retainer.' : 'Blank = normal: shares on the implementation payment plus anything the retainer held back, so everyone ends at their share of the final fee.'}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{ ...label, marginTop: '8px', marginBottom: '3px' }}>Client sentence (goes after the first sentence of the email)</div>
              <textarea value={arrDraft.client_note || ''} onChange={e => setArrDraft(d => ({ ...d, client_note: e.target.value }))} rows={3} placeholder="The sentence the client reads in their decision email, e.g. the fee now expected and that VFO will hold the payment already made until the final fee is confirmed." style={{ ...inputStyle, resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '6px' }}>
                {[['note_tax4', 'Client decision 1 email (Tax 4)', plan?.post_review_decision_email_sent_at], ['note_tax5', 'Implementation decision email (Tax 5)', plan?.implementation_decision_email_sent_at]].map(([key, text, sentAt]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--vfo-ink)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!arrDraft[key]} onChange={e => setArrDraft(d => ({ ...d, [key]: e.target.checked }))} />
                    {text}{sentAt ? <span style={{ fontSize: '10px', color: 'var(--vfo-muted)' }}>(already sent {formatDate(sentAt)})</span> : null}
                  </label>
                ))}
              </div>

              {arrErr && <div style={{ marginTop: '8px', fontSize: '11px', color: '#e74c3c' }}>{arrErr}</div>}
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <button disabled={arrBusy} onClick={saveArrangement} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '11px', cursor: arrBusy ? 'not-allowed' : 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: 'var(--vfo-success-text)', fontWeight: 600 }}>{arrBusy ? 'Saving…' : 'Save arrangement'}</button>
                <button disabled={arrBusy} onClick={() => setArrEditing(false)} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Cancel</button>
              </div>
            </div>
          )}

          {arrOn && isSuperadmin && !readOnly && hasPricing && !locked && !hasStrategic && (
            <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--vfo-muted)' }}>
              Edit split is hidden while the fee arrangement is on. Turn the arrangement off first if the split itself needs correcting.
            </div>
          )}

          {/* Says why there is no Edit button, rather than leaving a superadmin to
              wonder. Only shown to someone who would otherwise have had one. */}
          {hasStrategic && isSuperadmin && !readOnly && !locked && (
            <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--vfo-muted)' }}>
              This engagement pays a strategic partner, which the split editor does not yet handle — the split can only be corrected in the database. Every figure above is what the payout engine actually uses.
            </div>
          )}

          {warnings.length > 0 && (
            <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--vfo-muted)' }}>
              {warnings.map((w, i) => <div key={i}>• {w}</div>)}
            </div>
          )}

          {editing && (
            <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '10px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)' }}>
              <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginBottom: '10px' }}>
                {basisIsImpl
                  ? `Enter what each party receives from the ${fmt(implAmt)} implementation fee. The retainer was settled outside this system and pays nothing.`
                  : `Enter what each party receives across the ${fmt(totalFee)} engagement. Each payment pays out its proportional share.`}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                <div>
                  <div style={{ ...label, marginBottom: '3px' }}>Split</div>
                  <select value={splitType} onChange={e => pickSplitType(e.target.value)} style={inputStyle}>
                    <option value="">-- Select --</option>
                    <option value="1/3 Member, 1/3 Tax Planner, 1/3 VFOS">1/3 Member, 1/3 Tax Planner, 1/3 VFOS</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>
                <div>
                  <div style={{ ...label, marginBottom: '3px' }}>Member ($)</div>
                  <input value={memberShare} onChange={e => setMemberShare(e.target.value)} readOnly={splitType !== 'Custom'} style={splitType === 'Custom' ? inputStyle : readonlyInput} />
                </div>
                <div>
                  <div style={{ ...label, marginBottom: '3px' }}>Tax Planner ($)</div>
                  <input value={plannerShare} onChange={e => setPlannerShare(e.target.value)} readOnly={splitType !== 'Custom'} style={splitType === 'Custom' ? inputStyle : readonlyInput} />
                </div>
                <div>
                  <div style={{ ...label, marginBottom: '3px' }}>VFO Services ($)</div>
                  <input value={vfosShare} onChange={e => setVfosShare(e.target.value)} readOnly={splitType !== 'Custom'} style={splitType === 'Custom' ? inputStyle : readonlyInput} />
                </div>
              </div>

              <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 600, color: sumOk ? 'var(--vfo-success-text)' : '#e74c3c' }}>
                {sumOk
                  ? `Sums to ${fmt(basisAmt)}`
                  : `${fmt(draftSum)} entered — must sum to ${fmt(basisAmt)}`}
              </div>

              {sumOk && basisIsImpl && (
                <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--vfo-muted)' }}>
                  Stored as dollars of the {fmt(totalFee)} total: member {fmt(toStored().member_share)} · planner {fmt(toStored().tax_planner_share)} · VFOS {fmt(toStored().vfos_share)}.
                </div>
              )}

              {err && <div style={{ marginTop: '8px', fontSize: '11px', color: '#e74c3c' }}>{err}</div>}

              <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <button disabled={busy || !sumOk} onClick={save} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '11px', cursor: (busy || !sumOk) ? 'not-allowed' : 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: 'var(--vfo-success-text)', fontWeight: 600, opacity: (busy || !sumOk) ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save split'}</button>
                <button disabled={busy} onClick={() => setEditing(false)} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
