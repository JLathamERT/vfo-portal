import { useState, useEffect } from 'react'
import { callApi } from '../../../lib/api'
import { hasStrategicSplit, computeStrategicShares } from '../../../lib/strategicSplits'
import { formatDate } from '../../../lib/dates'

// Jake-only per-client migration tool: backfill an in-flight MAP 1 / Tax plan from the
// old system so the native engine resumes charging the rest. Two Stripe modes:
//   existing    — client already on Stripe; look up + reference their saved card.
//   setup_link  — client not on Stripe (QBO); save dormant + email a /connect-card link.
// Nothing is charged here. Preview shows the exact row before any write.

const PLAN_OPTIONS = [
  { key: 'map1', label: 'MAP 1 (Holistic — quarterly)', action: 'migration_backfill_map1', sbPipeline: 'MAP 1', pipeline: 'MAP 1' },
  { key: 'tax1', label: 'Tax Priorities (Holistic)', action: 'migration_backfill_tax', program_id: 1, sbPipeline: 'TAX', pipeline: 'TAX' },
  { key: 'tax4', label: 'Tax Planning', action: 'migration_backfill_tax', program_id: 4, sbPipeline: 'TAX', pipeline: 'TAX' },
]

const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
const sectionTitle = { fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px', fontWeight: 700 }
const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px', fontWeight: 600 }
const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
const readonlyInput = { ...inputStyle, background: 'var(--vfo-tint)', opacity: 0.85, cursor: 'not-allowed' }
const primaryBtn = (disabled) => ({ padding: '10px 24px', borderRadius: '8px', background: disabled ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '14px', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600 })
const ghostBtn = { padding: '10px 22px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '14px', cursor: 'pointer', fontWeight: 600 }
const warnBox = { border: '1.5px solid rgba(224,103,23,0.55)', background: 'rgba(224,103,23,0.08)', borderRadius: '12px', padding: '16px', marginBottom: '14px' }

function Field({ label, children }) {
  return <div style={{ flex: 1, minWidth: '150px' }}><label style={labelStyle}>{label}</label>{children}</div>
}

// Overwrite hazard readout for an existing row that a save would replace. Rendered
// both for a fresh preview whose action is 'update' and for a conflict surfaced at
// save time. The force checkbox appears only when requiresForce is true.
function HazardPanel({ existingRow, requiresForce, forceAck, onToggle, note }) {
  const known = new Set(['id', 'legacy_source', 'legacy_migrated_at', 'stripe_customer_id', 'payment_method_type'])
  const statusEntries = existingRow
    ? Object.entries(existingRow).filter(([k, v]) => !known.has(k) && v !== null && v !== undefined && v !== '')
    : []
  return (
    <div style={warnBox}>
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#b9451d', marginBottom: existingRow ? '10px' : 0 }}>
        This will OVERWRITE existing row{existingRow && existingRow.id != null ? ` #${existingRow.id}` : ''}.
      </div>
      {existingRow && (
        <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: 1.75 }}>
          <div>Source: <strong>{existingRow.legacy_source || 'organic row (no migration signature)'}</strong></div>
          {existingRow.legacy_migrated_at && <div>Migrated: <strong>{formatDate(existingRow.legacy_migrated_at)}</strong></div>}
          <div>Stripe customer: <strong>{existingRow.stripe_customer_id ? 'yes' : 'no'}</strong></div>
          {existingRow.payment_method_type && <div>Payment method: <strong>{existingRow.payment_method_type}</strong></div>}
          {statusEntries.map(([k, v]) => <div key={k}>{k}: <strong>{String(v)}</strong></div>)}
        </div>
      )}
      {note && <div style={{ fontSize: '13px', color: '#b9451d', marginTop: '8px', fontWeight: 600 }}>{note}</div>}
      {requiresForce && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '12px', cursor: 'pointer', fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: 600 }}>
          <input type="checkbox" checked={forceAck} onChange={e => onToggle(e.target.checked)} style={{ marginTop: '2px' }} />
          <span>I understand this replaces a row this tool did not write - overwrite it.</span>
        </label>
      )}
    </div>
  )
}

function ModeChip({ active, onClick, title, sub }) {
  return (
    <button onClick={onClick} style={{ flex: 1, minWidth: '220px', textAlign: 'left', padding: '14px 16px', borderRadius: '12px', cursor: 'pointer', border: `1.5px solid ${active ? '#125ecc' : 'var(--vfo-border-strong)'}`, background: active ? 'rgba(18,94,204,0.06)' : '#fff' }}>
      <div style={{ fontSize: '14px', fontWeight: 700, color: active ? '#125ecc' : 'var(--vfo-ink)' }}>{title}</div>
      <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '3px' }}>{sub}</div>
    </button>
  )
}

export default function PaymentContinuationTab({ clientId, client }) {
  const [planKey, setPlanKey] = useState('map1')
  const plan = PLAN_OPTIONS.find(p => p.key === planKey)
  const isMap1 = planKey === 'map1'
  const [stripeMode, setStripeMode] = useState('existing')
  // Strategic members get a fixed split (Strategic Partner Share + member +
  // VFOS, plus the tax planner on the tax side) auto-computed off the gross —
  // exactly as the native MAP 1 / Tax pricing forms do.
  const isStrategic = client?.member_category === 'strategic_member' && hasStrategicSplit(client?.member_type)

  // pricing
  const [netInvoice, setNetInvoice] = useState('')
  const [memberShare, setMemberShare] = useState('')
  const [taxPlannerShare, setTaxPlannerShare] = useState('')
  const [vfosShare, setVfosShare] = useState('')
  const [strategicShare, setStrategicShare] = useState('')
  const [serviceLevel, setServiceLevel] = useState('')
  const [retainerAmount, setRetainerAmount] = useState('')
  const [implementationAmount, setImplementationAmount] = useState('')
  const [splitType, setSplitType] = useState('')
  const [atpName, setAtpName] = useState('')

  // MAP 1 history
  const [numPaid, setNumPaid] = useState(1)
  const [rows, setRows] = useState([0, 1, 2, 3].map(() => ({ date: '', receipt_number: '' })))
  const [invoiceNumber, setInvoiceNumber] = useState('')
  // Tax retainer
  const [retDate, setRetDate] = useState('')
  const [retReceipt, setRetReceipt] = useState('')
  const [retInvoice, setRetInvoice] = useState('')
  const [retainerShareUnpaid, setRetainerShareUnpaid] = useState(false)

  // Stripe (existing mode)
  const [custId, setCustId] = useState('')
  const [lookup, setLookup] = useState(null)
  const [lookupErr, setLookupErr] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [chosenPm, setChosenPm] = useState(null)

  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')
  // Save is gated on a fresh, reviewed preview. previewSig holds the serialized
  // (preview-flag-independent) payload captured when the preview succeeded; any
  // later input change makes it differ from the live payload and re-locks Save.
  const [previewSig, setPreviewSig] = useState(null)
  // Overwrite acknowledgement — required only when the existing row was NOT
  // written by this tool (preview.requires_force / a surfaced 409).
  const [forceAck, setForceAck] = useState(false)
  // Populated when a save surfaces an overwrite conflict (row changed since
  // preview). Holds the server's existing_row when available.
  const [conflict, setConflict] = useState(null)

  function setRow(i, patch) { setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r)) }
  function resetOutputs() { setPreview(null); setResult(null); setErr(''); setPreviewSig(null); setForceAck(false); setConflict(null); setRetainerShareUnpaid(false) }

  async function doLookup() {
    setLookingUp(true); setLookupErr(''); setLookup(null); setChosenPm(null)
    try {
      // client_id lets the backend resolve sandbox mode per-client (test-member
      // force-sandbox override, gotcha #251/#302) instead of the global toggle.
      const d = await callApi('migration_stripe_lookup', { stripe_customer_id: custId.trim(), pipeline: plan.sbPipeline, client_id: clientId })
      if (d.error) { setLookupErr(d.error); return }
      setLookup(d)
      setChosenPm(d.default_payment_method || (d.payment_methods?.length === 1 ? d.payment_methods[0] : null))
    } catch { setLookupErr('Lookup failed.') }
    finally { setLookingUp(false) }
  }

  function pmLabel(pm) {
    if (!pm) return ''
    if (pm.kind === 'card') return `${(pm.brand || 'Card')} ending ${pm.last4}${pm.exp_month ? ` (exp ${pm.exp_month}/${String(pm.exp_year).slice(-2)})` : ''}`
    if (pm.kind === 'ach') return `${pm.bank || 'Bank'} ending ${pm.last4}`
    return pm.id
  }

  function buildPayload(isPreview) {
    const stripe = stripeMode === 'existing'
      ? { stripe_customer_id: custId.trim(), default_payment_method_id: chosenPm?.id || '', payment_method_type: chosenPm?.kind || '', acct_last4: chosenPm?.last4 || '' }
      : {}
    const base = { client_id: clientId, preview: isPreview, stripe_mode: stripeMode, stripe }
    if (isMap1) {
      const payments = rows.map((r, i) => i < numPaid
        ? { paid: true, date: r.date, receipt_number: r.receipt_number }
        : { paid: false, date: r.date })
      return { ...base, pricing: { net_invoice: netInvoice, member_share: memberShare, vfos_share: vfosShare, ...(isStrategic ? { strategic_partner_share: strategicShare } : {}), service_level: serviceLevel, payment_plan: 'Quarterly' }, invoice_number: invoiceNumber, payments }
    }
    return { ...base, program_id: plan.program_id, pricing: { retainer_amount: retainerAmount, implementation_amount: implementationAmount, total_fee: taxTotal ? taxTotal.toFixed(2) : '', impl_member_share: memberShare, impl_tax_planner_share: taxPlannerShare, impl_vfos_share: vfosShare, ...(isStrategic ? { impl_strategic_share: strategicShare } : {}), split_type: splitType, atp_name: atpName }, ...(retainerShareUnpaid ? { retainer_share_unpaid: true } : {}), retainer: { date: retDate, receipt_number: retReceipt, invoice_number: retInvoice } }
  }

  async function run(isPreview) {
    setBusy(true); setErr(''); setResult(null); setPreview(null)
    // A fresh preview starts from a clean slate: no stale signature, no lingering
    // conflict, unchecked overwrite box.
    if (isPreview) { setPreviewSig(null); setForceAck(false); setConflict(null) }
    try {
      const payload = buildPayload(isPreview)
      if (!isPreview && forceAck) payload.force = true
      const d = await callApi(plan.action, payload)
      // Defensive: the backend may surface an overwrite conflict as a resolved
      // object (in addition to the HTTP 409 handled in catch). Populate the
      // hazard panel from existing_row and force a re-preview before retry.
      if (d && d.conflict) {
        setConflict({ existing_row: d.existing_row || null }); setPreviewSig(null); setForceAck(false)
        setErr('This client’s row changed since your preview. Review the existing row below and Preview again before overwriting.')
        return
      }
      if (d.error) { setErr(d.error + (d.errors ? ' — ' + d.errors.join(' ') : '')); return }
      if (isPreview) { setPreview(d); setPreviewSig(JSON.stringify(buildPayload(false))); return }
      let linkResult = null
      if (stripeMode === 'setup_link') {
        const rowId = d.pipeline_id || d.tax_plan_id
        linkResult = await callApi('migration_send_setup_link', { pipeline: plan.pipeline, row_id: rowId })
      }
      setResult({ ...d, linkResult })
    } catch (e) {
      if (isPreview) { setErr(e?.message ? `Preview failed: ${e.message}` : 'Preview failed.'); return }
      // callApi throws on any non-2xx, incl. the HTTP 409 overwrite-conflict
      // (its body, and thus existing_row, is not recoverable here). Invalidate
      // the preview so the operator must Preview again — the re-preview repopulates
      // the hazard panel from the server's existing_row and re-arms the checkbox.
      setPreviewSig(null); setForceAck(false)
      const conflictish = /conflict|409|overwrite|not written|already exists/i.test(e?.message || '')
      if (conflictish) {
        setConflict({ existing_row: null })
        setErr('Save blocked — this client’s row changed since your preview. Preview again to review the existing row, then confirm the overwrite.')
      } else {
        setErr(e?.message ? `Save failed: ${e.message}` : 'Save failed.')
      }
    }
    finally { setBusy(false) }
  }

  const money = (v) => parseFloat(String(v ?? '').replace(/[,$]/g, '')) || 0
  const round2 = (x) => Math.round(x * 100) / 100
  const taxTotal = money(retainerAmount) + money(implementationAmount)
  const implAmount = money(implementationAmount)
  // Tax split is entered/validated against the IMPLEMENTATION amount (the only leg
  // that pays out here — the retainer was settled on the old system).
  const totalAmount = isMap1 ? money(netInvoice) : implAmount
  const sharesFilled = String(memberShare).trim() !== '' && String(vfosShare).trim() !== ''
  const stratSum = isStrategic ? money(strategicShare) : 0
  const sharesSum = (isMap1 ? money(memberShare) + money(vfosShare) : money(memberShare) + money(taxPlannerShare) + money(vfosShare)) + stratSum
  const sumOk = isMap1
    ? (sharesFilled && totalAmount > 0 && Math.abs(sharesSum - totalAmount) < 0.01)
    : (totalAmount > 0 ? (sharesFilled && Math.abs(sharesSum - totalAmount) < 0.01) : true)
  // Live serialization of the exact save payload (preview flag pinned to false so
  // it is stable across Preview/Save). Compared against previewSig to detect
  // whether the on-screen preview still describes what Save would write.
  const currentSig = JSON.stringify(buildPayload(false))
  const previewFresh = preview !== null && previewSig !== null && previewSig === currentSig
  // Overwriting a row this tool did not write requires an explicit acknowledgement.
  const needsForce = !!(preview && preview.action === 'update' && preview.requires_force)
  const saveDisabled = busy || !sumOk || (stripeMode === 'existing' && !chosenPm) || !previewFresh || (needsForce && !forceAck)
  // Any input change (currentSig moves) drops a stale overwrite acknowledgement and
  // clears a surfaced conflict; the operator must Preview again to re-arm Save.
  useEffect(() => { setForceAck(false); setConflict(null) }, [currentSig])
  useEffect(() => {
    if (isMap1) return
    if (splitType === '1/3 Member, 1/3 Tax Planner, 1/3 VFOS') { const implAmt = money(implementationAmount); const share = (implAmt / 3).toFixed(2); setMemberShare(share); setTaxPlannerShare(share); setVfosShare((implAmt - parseFloat(share) - parseFloat(share)).toFixed(2)) }
  }, [splitType, implementationAmount, isMap1])

  // MAP 1 strategic: the continuation has no gross_fee / member-contribution
  // inputs, so the net invoice IS the gross the split is computed off.
  useEffect(() => {
    if (!isMap1 || !isStrategic) return
    const shares = computeStrategicShares(client?.member_type, 'holistic', netInvoice)
    if (shares) {
      setMemberShare(shares.member.toFixed(2))
      setVfosShare(shares.vfos.toFixed(2))
      setStrategicShare(shares.strategic.toFixed(2))
    } else {
      setMemberShare(''); setVfosShare(''); setStrategicShare('')
    }
  }, [isMap1, isStrategic, client?.member_type, netInvoice])

  // Tax strategic: the split is defined off the WHOLE fee (retainer +
  // implementation) but entered here as per-implementation dollars, so each
  // whole-engagement share is prorated down to the implementation leg.
  useEffect(() => {
    if (isMap1 || !isStrategic) return
    if (splitType !== 'Strategic Partner') setSplitType('Strategic Partner')
    const totals = taxTotal > 0 ? computeStrategicShares(client?.member_type, 'tax', taxTotal) : null
    if (totals && implAmount > 0) {
      const f = implAmount / taxTotal
      const s = round2(totals.strategic * f)
      const m = round2(totals.member * f)
      const p = round2((totals.planner ?? 0) * f)
      // VFOS absorbs the rounding remainder so the four boxes hit the
      // implementation amount exactly (same shape computeStrategicShares uses).
      setStrategicShare(s.toFixed(2)); setMemberShare(m.toFixed(2)); setTaxPlannerShare(p.toFixed(2))
      setVfosShare(round2(implAmount - s - m - p).toFixed(2))
    } else {
      setStrategicShare(''); setMemberShare(''); setTaxPlannerShare(''); setVfosShare('')
    }
  }, [isMap1, isStrategic, client?.member_type, taxTotal, implAmount, splitType])

  return (
    <div>
      {/* Plan + mode */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>What are we continuing?</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
          <Field label="Plan">
            <select value={planKey} onChange={e => { setPlanKey(e.target.value); resetOutputs() }} style={inputStyle}>
              {PLAN_OPTIONS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <ModeChip active={stripeMode === 'existing'} onClick={() => { setStripeMode('existing'); resetOutputs() }} title="Client is on Stripe" sub="Enter their cus_ id — we reference the saved payment method." />
          <ModeChip active={stripeMode === 'setup_link'} onClick={() => { setStripeMode('setup_link'); resetOutputs() }} title="Not on Stripe — send setup link" sub="QBO etc. Save + email a link to add a card." />
        </div>
      </div>

      {/* Pricing */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Pricing</div>
        {isMap1 ? (
          <>
            {isStrategic && (
              <p style={{ fontSize: '13px', color: '#0095ff', fontWeight: 600, marginTop: 0, marginBottom: '10px' }}>Strategic member ({client.member_type}) — the split is auto-calculated from the net invoice.</p>
            )}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Field label="Net invoice — total ($)"><input value={netInvoice} onChange={e => setNetInvoice(e.target.value)} style={inputStyle} placeholder="e.g. 12000" /></Field>
              {isStrategic && <Field label={<span style={{ whiteSpace: 'nowrap' }}>Strategic Partner share ($)</span>}><input value={strategicShare} readOnly style={readonlyInput} placeholder="auto" /></Field>}
              <Field label="Member share ($)"><input value={memberShare} onChange={e => setMemberShare(e.target.value)} readOnly={isStrategic} style={isStrategic ? readonlyInput : inputStyle} placeholder={isStrategic ? 'auto' : 'e.g. 6000'} /></Field>
              <Field label="Our (VFO) share ($)"><input value={vfosShare} onChange={e => setVfosShare(e.target.value)} readOnly={isStrategic} style={isStrategic ? readonlyInput : inputStyle} placeholder={isStrategic ? 'auto' : 'e.g. 6000'} /></Field>
              <Field label="Service level">
                <select value={serviceLevel} onChange={e => setServiceLevel(e.target.value)} style={inputStyle}>
                  <option value="">-- Select --</option>
                  <option value="Lite">Lite</option>
                  <option value="Core">Core</option>
                  <option value="Max">Max</option>
                </select>
              </Field>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Field label="Retainer amount ($)"><input value={retainerAmount} onChange={e => setRetainerAmount(e.target.value)} style={inputStyle} placeholder="e.g. 5000" /></Field>
              <Field label="Implementation amount ($)"><input value={implementationAmount} onChange={e => setImplementationAmount(e.target.value)} style={inputStyle} placeholder="e.g. 5000" /></Field>
              <Field label="Total fee ($)"><input value={taxTotal ? taxTotal.toFixed(2) : ''} readOnly style={readonlyInput} placeholder="retainer + implementation" /></Field>
            </div>
            {implAmount > 0 && (
              <>
                <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '12px', marginBottom: '10px' }}>Implementation split — what pays out when the implementation fee is charged. {retainerShareUnpaid ? 'The retainer was collected on the old system; its member and tax planner revenue shares stay PENDING and pay when Client decision 1 is confirmed.' : 'The retainer was settled on the old system; nothing pays out from it.'}</p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <Field label="Split type">
                    {isStrategic
                      ? <div style={readonlyInput}>Strategic Partner ({client.member_type}) — auto-calculated</div>
                      : <select value={splitType} onChange={e => setSplitType(e.target.value)} style={inputStyle}>
                          <option value="">-- Select --</option>
                          <option value="1/3 Member, 1/3 Tax Planner, 1/3 VFOS">1/3 Member, 1/3 Tax Planner, 1/3 VFOS</option>
                          <option value="Custom">Custom</option>
                        </select>
                    }
                  </Field>
                  {isStrategic && <Field label={<span style={{ whiteSpace: 'nowrap' }}>Strategic Partner share ($)</span>}><input value={strategicShare} readOnly style={readonlyInput} placeholder="auto" /></Field>}
                  <Field label="Member share ($)"><input value={memberShare} onChange={e => setMemberShare(e.target.value)} readOnly={splitType !== 'Custom'} style={splitType === 'Custom' ? inputStyle : readonlyInput} placeholder={splitType === 'Custom' ? 'e.g. 5000' : 'auto'} /></Field>
                  <Field label="Tax Planner share ($)"><input value={taxPlannerShare} onChange={e => setTaxPlannerShare(e.target.value)} readOnly={splitType !== 'Custom'} style={splitType === 'Custom' ? inputStyle : readonlyInput} placeholder={splitType === 'Custom' ? 'e.g. 5000' : 'auto'} /></Field>
                  <Field label="Our (VFO) share ($)"><input value={vfosShare} onChange={e => setVfosShare(e.target.value)} readOnly={splitType !== 'Custom'} style={splitType === 'Custom' ? inputStyle : readonlyInput} placeholder={splitType === 'Custom' ? 'e.g. 5000' : 'auto'} /></Field>
                </div>
              </>
            )}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '14px', cursor: 'pointer', fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: 600 }}>
              <input type="checkbox" checked={retainerShareUnpaid} onChange={e => setRetainerShareUnpaid(e.target.checked)} style={{ marginTop: '2px' }} />
              <span>Retainer revenue share NOT paid yet — leave it pending so Client decision 1 pays the member and tax planner shares when the client confirms.</span>
            </label>
          </>
        )}
        {sharesFilled && totalAmount > 0 && (
          <div style={{ marginTop: '12px', fontSize: '13px', fontWeight: 600, color: sumOk ? '#1b9254' : '#e74c3c' }}>
            {isMap1
              ? (sumOk
                ? `Shares add up to the net invoice ($${sharesSum.toLocaleString()}).`
                : `${isStrategic ? 'Strategic Partner + ' : ''}Member + VFO share ($${sharesSum.toLocaleString()}) must equal the net invoice ($${totalAmount.toLocaleString()}).`)
              : (sumOk
                ? `Split adds up to the implementation amount ($${sharesSum.toLocaleString()}).`
                : `${isStrategic ? 'Strategic Partner + ' : ''}Member + Tax Planner + VFO share ($${sharesSum.toLocaleString()}) must equal the implementation amount ($${totalAmount.toLocaleString()}).`)}
          </div>
        )}
      </div>

      {/* Payment history */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Payments so far</div>
        {isMap1 ? (
          <>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '6px' }}>
              <Field label="How many of the 4 quarterly payments are already made?">
                <select value={numPaid} onChange={e => setNumPaid(parseInt(e.target.value))} style={inputStyle}>
                  <option value={1}>1 of 4</option>
                  <option value={2}>2 of 4</option>
                  <option value={3}>3 of 4</option>
                </select>
              </Field>
              <Field label="Invoice number (issued at payment 1)"><input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} style={inputStyle} /></Field>
            </div>
            {rows.map((r, i) => {
              const paid = i < numPaid
              return (
                <div key={i} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', padding: '12px', borderRadius: '10px', marginTop: '10px', background: paid ? 'rgba(27,146,84,0.06)' : 'var(--vfo-input)', border: `1px solid ${paid ? 'rgba(27,146,84,0.2)' : 'var(--vfo-border-soft)'}` }}>
                  <div style={{ width: '92px', fontSize: '13px', fontWeight: 700, color: paid ? '#1b9254' : 'var(--vfo-muted)' }}>Payment {i + 1}<div style={{ fontSize: '11px', fontWeight: 500 }}>{paid ? 'Paid' : 'Scheduled'}</div></div>
                  <Field label={paid ? 'Date paid' : 'Scheduled date'}><input type="date" value={r.date} onChange={e => setRow(i, { date: e.target.value })} style={inputStyle} /></Field>
                  {paid && <Field label="Receipt number"><input value={r.receipt_number} onChange={e => setRow(i, { receipt_number: e.target.value })} style={inputStyle} /></Field>}
                </div>
              )
            })}
          </>
        ) : (
          <>
            <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: 0, marginBottom: '12px' }}>Record the retainer they already paid. The implementation fee is charged later via the normal Tax 5 step against the saved card.</p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Field label="Retainer date paid"><input type="date" value={retDate} onChange={e => setRetDate(e.target.value)} style={inputStyle} /></Field>
              <Field label="Retainer invoice number"><input value={retInvoice} onChange={e => setRetInvoice(e.target.value)} style={inputStyle} /></Field>
              <Field label="Retainer receipt number"><input value={retReceipt} onChange={e => setRetReceipt(e.target.value)} style={inputStyle} /></Field>
            </div>
          </>
        )}
      </div>

      {/* Stripe */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Payment method</div>
        {stripeMode === 'existing' ? (
          <>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label="Stripe customer ID (cus_…)"><input value={custId} onChange={e => { setCustId(e.target.value); setLookup(null); setChosenPm(null) }} style={inputStyle} placeholder="cus_…" /></Field>
              <button onClick={doLookup} disabled={lookingUp || !custId.trim().startsWith('cus_')} style={primaryBtn(lookingUp || !custId.trim().startsWith('cus_'))}>{lookingUp ? 'Looking up…' : 'Look up payment method'}</button>
            </div>
            {lookupErr && <p style={{ color: '#e74c3c', fontSize: '13px', marginTop: '10px' }}>{lookupErr}</p>}
            {lookup && (
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '8px' }}>{lookup.mode === 'sandbox' ? 'Sandbox account' : 'Live account'} · {lookup.customer?.email || ''}</div>
                {(lookup.payment_methods || []).length === 0 ? (
                  <p style={{ color: '#e06717', fontSize: '13px' }}>No saved card/bank found on this customer{lookup.legacy_default_source ? ' (a legacy source is on file — they may need the setup-link path instead)' : ''}.</p>
                ) : (
                  (lookup.payment_methods || []).map(pm => (
                    <label key={pm.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', marginBottom: '8px', cursor: 'pointer', border: `1.5px solid ${chosenPm?.id === pm.id ? '#1b9254' : 'var(--vfo-border-strong)'}`, background: chosenPm?.id === pm.id ? 'rgba(27,146,84,0.06)' : '#fff' }}>
                      <input type="radio" checked={chosenPm?.id === pm.id} onChange={() => setChosenPm(pm)} />
                      <span style={{ fontSize: '14px', color: 'var(--vfo-ink)', fontWeight: 600 }}>{pmLabel(pm)}</span>
                      {pm.kind === 'ach' ? <span style={tag('#0095ff')}>No fee</span> : <span style={tag('#e06717')}>+ card fee</span>}
                    </label>
                  ))
                )}
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: '14px', color: 'var(--vfo-muted)', margin: 0 }}>
            On save, a Stripe customer is created and a secure setup link is emailed to <strong>{client?.email || 'the client'}</strong>. Once they add a card or bank, the engine starts charging automatically. Setup-link clients pay NO card processing fee — card and bank cost the same (VFO absorbs the fee).
          </p>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
        <button onClick={() => run(true)} disabled={busy || !sumOk} style={ghostBtn}>{busy ? 'Working…' : 'Preview'}</button>
        <button onClick={() => run(false)} disabled={saveDisabled} style={primaryBtn(saveDisabled)}>{busy ? 'Working…' : (stripeMode === 'setup_link' ? 'Save & send setup link' : 'Save')}</button>
        {!sumOk && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{isStrategic ? (isMap1 ? 'Enter the net invoice — the strategic split fills in automatically.' : 'Enter the retainer + implementation amounts — the strategic split fills in automatically.') : (isMap1 ? 'Enter member + VFO share (dollars) that sum to the total.' : 'Enter member + tax planner + VFO implementation split (dollars) that sum to the implementation amount.')}</span>}
        {sumOk && stripeMode === 'existing' && !chosenPm && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Look up + pick a payment method to enable Save.</span>}
        {sumOk && (stripeMode !== 'existing' || chosenPm) && !previewFresh && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Preview first — Save unlocks after you review the exact row.</span>}
        {previewFresh && needsForce && !forceAck && <span style={{ fontSize: '12px', color: '#b9451d', fontWeight: 600 }}>Confirm the overwrite box below to enable Save.</span>}
      </div>

      {err && <div style={{ ...sectionStyle, border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.05)', color: '#c0392b', fontSize: '14px' }}>{err}</div>}

      {conflict && (
        <div style={sectionStyle}>
          <div style={sectionTitle}>Overwrite conflict</div>
          <HazardPanel existingRow={conflict.existing_row} requiresForce={false} forceAck={forceAck} onToggle={setForceAck} note="This client’s row changed since your preview. Preview again to review the current row, then confirm the overwrite before saving." />
        </div>
      )}

      {preview && (
        <div style={sectionStyle}>
          <div style={sectionTitle}>Preview — {preview.action} ({preview.mode}{preview.stripe_mode === 'setup_link' ? ', dormant until card connected' : ''})</div>
          {preview.action === 'update'
            ? <HazardPanel existingRow={preview.existing_row} requiresForce={preview.requires_force} forceAck={forceAck} onToggle={setForceAck} />
            : <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: '0 0 10px' }}>New row — no existing data for this client.</p>}
          {preview.per_installment_amount && <p style={{ fontSize: '14px', color: 'var(--vfo-ink)', margin: '0 0 10px' }}>Per-quarter charge: <strong>${preview.per_installment_amount}</strong></p>}
          {(preview.warnings || []).map((w, i) => <p key={i} style={{ fontSize: '13px', color: '#e06717', margin: '4px 0' }}>• {w}</p>)}
          <details style={{ marginTop: '10px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--vfo-muted)', fontWeight: 600 }}>Exact row to be written</summary>
            <pre style={{ background: '#0f1b33', color: '#cfe0ff', padding: '14px', borderRadius: '10px', fontSize: '12px', overflowX: 'auto', marginTop: '8px' }}>{JSON.stringify(preview.would_write, null, 2)}</pre>
          </details>
        </div>
      )}

      {result && (
        <div style={{ ...sectionStyle, border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.05)' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f7a3d', marginBottom: '6px' }}>Plan {result.action} (id {result.pipeline_id || result.tax_plan_id}) · {result.mode}</div>
          {result.linkResult?.sent && <p style={{ fontSize: '14px', color: 'var(--vfo-ink)', margin: '4px 0' }}>Setup link drafted to <strong>{result.linkResult.to_email}</strong>{result.linkResult.sandbox ? ' (sandbox)' : ''}. Send it from Gmail Drafts.</p>}
          {result.linkResult && !result.linkResult.sent && <p style={{ fontSize: '14px', color: '#e74c3c', margin: '4px 0' }}>Row saved, but setup link failed: {result.linkResult.error || 'unknown'}</p>}
          {(result.warnings || []).map((w, i) => <p key={i} style={{ fontSize: '13px', color: '#e06717', margin: '4px 0' }}>• {w}</p>)}
          {stripeMode === 'existing' && <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: '6px 0 0' }}>The engine will charge the remaining {isMap1 ? 'installments on their dates' : 'implementation via the Tax 5 step'} against the saved payment method.</p>}
        </div>
      )}
    </div>
  )
}

const tag = (color) => ({ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: `${color}1a`, color, border: `1px solid ${color}44` })
