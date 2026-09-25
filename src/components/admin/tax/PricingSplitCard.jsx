import { useState, useEffect } from 'react'
import { callApi } from '../../../lib/api'
import { HELD_SUSPENDED_NOTE, HELD_PAUSED_NOTE, HELD_ARREARS_NOTE } from '../shareLegState'

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

  const retAmt = money(plan?.retainer_amount)
  const implAmt = money(plan?.implementation_amount)
  const totalFee = money(plan?.total_fee) > 0 ? money(plan?.total_fee) : retAmt + implAmt
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
  const implSettled = TERMINAL.includes(plan?.implementation_rev_paid) || TERMINAL.includes(plan?.implementation_planner_paid)
  const locked = chargeInFlight || implSettled
  // The editor and tax_update_split both know three legs only, and the handler refuses
  // unless member + planner + vfos equals the WHOLE total — which a strategic plan never
  // does, the partner holding the rest. So Save was already impossible here; hiding the
  // button says so instead of walking the operator into a red sum they can only "fix" by
  // handing VFO the partner's dollars. Teaching both sides the fourth leg is a backend
  // change, deliberately out of scope for this display fix.
  const canEdit = isSuperadmin && !readOnly && hasPricing && !locked && !hasStrategic

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
  const retVfos = round2(retAmt - legAmt(storedMember, plan?.retainer_rev_paid, retAmt) - legAmt(storedPlanner, plan?.retainer_planner_paid, retAmt) - legAmt(storedStrat, plan?.retainer_strat_paid, retAmt))
  const implVfos = round2(implAmt - legAmt(storedMember, plan?.implementation_rev_paid, implAmt) - legAmt(storedPlanner, plan?.implementation_planner_paid, implAmt) - legAmt(storedStrat, plan?.implementation_strat_paid, implAmt))

  const rows = [
    { key: 'member', name: 'Member', stored: storedMember, retStatus: plan?.retainer_rev_paid, implStatus: plan?.implementation_rev_paid },
    { key: 'planner', name: plannerName ? `Tax planner — ${plannerName}` : 'Tax planner', stored: storedPlanner, retStatus: plan?.retainer_planner_paid, implStatus: plan?.implementation_planner_paid },
    // Sits above VFO Services so the residual stays the last line, the way it reads on
    // MAP 1 and the way the arithmetic runs.
    // Unnamed on purpose: the partner company is members.member_type, which this
    // payload does not carry, and split_type is the preset LABEL ("Strategic Partner"),
    // not the company. Same wording as Map1PricingSplitCard.
    ...(hasStrategic ? [{ key: 'strat', name: 'Strategic partner', stored: storedStrat, retStatus: plan?.retainer_strat_paid, implStatus: plan?.implementation_strat_paid }] : []),
    { key: 'vfos', name: 'VFO Services', stored: storedVfos, retStatus: null, implStatus: null },
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
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', padding: '14px 18px', marginBottom: '10px', fontFamily: 'Inter, sans-serif' }}>
      <div onClick={() => setExpanded(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--vfo-heading)', textTransform: 'uppercase', letterSpacing: '1px' }}>Pricing &amp; revenue split</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>
          {hasPricing ? `${fmt(totalFee)} · ${plan?.split_type || 'no split set'}` : 'No pricing entered yet'}
        </span>
        {plan?.legacy_source && (
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Migrated</span>
        )}
        {locked && hasPricing && (
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', border: '1px solid rgba(27,146,84,0.3)', color: '#1b9254', fontWeight: 600 }}>Locked — charged</span>
        )}
        {refundOverride > 0 && !refunded && (
          <span title="A Refund click at Client decision 1 returns this amount instead of the full retainer" style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(224,103,23,0.12)', border: '1px solid rgba(224,103,23,0.35)', color: '#e06717', fontWeight: 600 }}>Refund on Stop: {fmt(refundOverride)}</span>
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

      {expanded && !hasPricing && (
        <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '10px' }}>No pricing entered for this plan yet.</div>
      )}

      {expanded && hasPricing && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px 20px', marginBottom: '14px' }}>
            <div>
              <div style={label}>Retainer</div>
              <div style={value}>{fmt(retAmt)}</div>
              <div style={{ fontSize: '10px', color: 'var(--vfo-muted)' }}>
                {plan?.legacy_source ? `Paid ${plan?.retainer_date || ''} (old system)` : plan?.retainer_status === 'succeeded' ? `Paid ${plan?.retainer_date || ''}` : 'Not yet paid'}
              </div>
            </div>
            <div>
              <div style={label}>Implementation</div>
              <div style={value}>{fmt(implAmt)}</div>
              <div style={{ fontSize: '10px', color: 'var(--vfo-muted)' }}>
                {plan?.implementation_charge_status === 'succeeded' ? 'Charged'
                  : plan?.implementation_charge_status === 'processing' ? 'Charge in progress'
                    : plan?.implementation_charge_status === 'declined' ? 'Charge declined — pay link sent'
                      : 'Not yet charged'}
              </div>
            </div>
            <div>
              <div style={label}>Total fee</div>
              <div style={value}>{fmt(totalFee)}</div>
              <div style={{ fontSize: '10px', color: 'var(--vfo-muted)' }}>{plan?.split_type || 'No split type set'}</div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '420px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--vfo-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--vfo-border-soft)' }}>Pays out to</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--vfo-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--vfo-border-soft)' }}>Retainer {fmt(retAmt)}</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--vfo-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--vfo-border-soft)' }}>Implementation {fmt(implAmt)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key}>
                    <td style={{ padding: '7px 8px', color: 'var(--vfo-ink)', borderBottom: '1px solid var(--vfo-border-soft)' }}>{r.name}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: retainerIsHistoric ? 'var(--vfo-muted)' : 'var(--vfo-ink)', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                      {/* A migrated retainer was collected on the old system, under the
                          two-way policy that predates the tax planner share. Deriving a
                          figure from today's split would invent a payout that never
                          happened and never will — those legs are settled and locked. */}
                      {retainerIsHistoric || noShare(r.retStatus) ? '—' : fmt(r.key === 'vfos' ? retVfos : portion(r.stored, retAmt))}
                      <div style={{ fontSize: '10px', color: retainerIsHistoric ? 'var(--vfo-muted)' : noteColor(r.retStatus) }}>
                        {retainerIsHistoric ? 'settled on old system' : legNote(r.retStatus)}
                      </div>
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--vfo-ink)', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                      {noShare(r.implStatus) ? '—' : fmt(r.key === 'vfos' ? implVfos : portion(r.stored, implAmt))}
                      {legNote(r.implStatus) && <div style={{ fontSize: '10px', color: noteColor(r.implStatus) }}>{legNote(r.implStatus)}</div>}
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
                <button disabled={refundBusy} onClick={() => saveRefundOverride(false)} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: refundBusy ? 'not-allowed' : 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600 }}>{refundBusy ? 'Saving…' : 'Save'}</button>
                {refundOverride > 0 && (
                  <button disabled={refundBusy} onClick={() => saveRefundOverride(true)} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: refundBusy ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Clear</button>
                )}
              </div>
              <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--vfo-muted)' }}>
                If the client clicks <b>Refund</b> on their decision email, Stripe returns this amount instead of the full retainer{capturedBase > 0 ? ` (${fmt(capturedBase)})` : ''}. It changes nothing else — Continue, rev-share and the implementation fee all run as normal. Blank = full retainer.
              </div>
              {refundErr && <div style={{ marginTop: '6px', fontSize: '11px', color: '#e74c3c' }}>{refundErr}</div>}
              {refundOk && <div style={{ marginTop: '6px', fontSize: '11px', color: '#1b9254' }}>{refundOk}</div>}
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

              <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 600, color: sumOk ? '#1b9254' : '#e74c3c' }}>
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
                <button disabled={busy || !sumOk} onClick={save} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '11px', cursor: (busy || !sumOk) ? 'not-allowed' : 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600, opacity: (busy || !sumOk) ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save split'}</button>
                <button disabled={busy} onClick={() => setEditing(false)} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
