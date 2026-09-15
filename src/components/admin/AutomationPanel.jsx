import { Fragment, useEffect, useState } from 'react'
import { callApi } from '../../lib/api'
import { StepCard, Detail, Badge, Pending, fmtMoney, fmtDate, PanelHero, EmptyState, TableCard } from './automation/StepKit'
import { AutomationTrackerSkeleton } from '../shared/Skeleton'
import { CONFIRMATION_CARD_SKIP } from '../../lib/confirmationStatus'
import { ClientNameLink } from '../shared/personLinks'

const STAGE_LABELS = {
  c81: 'PIP 1 — Reconfirmation Email',
  c13: 'PIP Follow Up — Decision',
  c14: 'PC Admin — Follow-up Email',
  c15: 'PC Admin — Final Decision',
  c16: 'PC Admin — Agreement Sent',
  c17: 'PC Admin — Client Signed',
  c18: 'PC Admin — CEO Signed',
  payment: 'Payment',
  confirmation: 'Confirmation',
  invoice: 'Invoice',
  receipts: 'Receipts',
  revshare: 'Rev Share',
  complete: 'Complete',
  closed: 'Closed'
}

const STAGE_COLORS = {
  c81: '#0095ff', c13: '#7c3aed', c14: '#e06717', c15: '#e06717',
  c16: '#4f46e5', c17: '#4f46e5', c18: '#4f46e5',
  payment: '#db2777', confirmation: '#0d9488', invoice: '#0d9488',
  receipts: '#0d9488', revshare: '#16a34a', complete: '#16a34a', closed: '#ef4444'
}

function getCurrentStage(row) {
  if (row.c24_email_sent) return 'complete'
  if (row.c13_decision === 'No' && row.c14_email_sent === 'Yes') return 'closed'
  if (row.rec1_status || row.rec1_number) return 'receipts'
  if (row.invoice_number) return 'invoice'
  if (row.confirmation_status) return 'confirmation'
  if (row.pay1_status) return 'payment'
  if (row.c18_ceo_signed) return 'c18'
  if (row.c17_client_signed) return 'c17'
  if (row.c16_sent && row.c16_sent !== 'No') return 'c16'
  if (row.c15_final_decision) return 'c15'
  if (row.c14_email_sent && row.c14_email_sent !== 'No') return 'c14'
  if (row.c13_decision) return 'c13'
  if (row.c81_decision) return 'c81'
  return 'c81'
}

function tryParseJSON(str) {
  if (!str) return null
  try { return JSON.parse(str) } catch { return str }
}

// true if any of the given values is present (non-empty)
function has(...vals) {
  return vals.some(v => v !== null && v !== undefined && v !== '')
}

function PaymentButtons({ row, onRefresh }) {
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState('')

  async function clickPaidByCheck() {
    if (!window.confirm('Mark this client as paying by check?\n\nThis will:\n  • Set pay1_status to "check_pending"\n  • Block the Stripe /pay link (customer can no longer pay online unless this is undone manually in SQL)\n  • Draft a Gmail to the client with the check mailing address\n\nProceed?')) return
    setBusy('paidbycheck'); setErr('')
    try {
      await callApi('automation_CONTRACT_paidbycheck', { client_id: row.client_id })
      await onRefresh()
    } catch (e) { setErr(e.message || String(e)) }
    finally { setBusy(null) }
  }

  async function clickCheckCleared(n) {
    const note = n === 1
      ? 'This sets pay1_status to "succeeded" and fires the confirmation email, invoice/receipt PDFs, and revshare chain.'
      : `This sets pay${n}_status to "succeeded" and fires the invoice/receipt PDFs and revshare chain for P${n}.`
    if (!window.confirm(`Mark P${n} check as cleared?\n\n${note}\n\nOnly click this AFTER your bank has actually cleared the check.`)) return
    setBusy(`cleared-${n}`); setErr('')
    try {
      await callApi('automation_CONTRACT_checkcleared', { client_id: row.client_id, payment_number: n })
      await onRefresh()
    } catch (e) { setErr(e.message || String(e)) }
    finally { setBusy(null) }
  }

  const btnStyle = {
    padding: '4px 10px', fontSize: '11px', fontWeight: '600',
    background: 'rgba(34,197,94,0.15)', color: '#16a34a',
    border: '1px solid rgba(34,197,94,0.4)', borderRadius: '4px',
    cursor: 'pointer', fontFamily: 'inherit',
  }
  const btnDisabledStyle = { ...btnStyle, opacity: 0.5, cursor: 'not-allowed' }

  const buttons = []

  if (row.checkout_token && !row.pay1_status) {
    buttons.push(
      <button key="paidbycheck" onClick={clickPaidByCheck} disabled={!!busy} style={busy ? btnDisabledStyle : btnStyle}>
        {busy === 'paidbycheck' ? 'Working...' : 'Pay via check'}
      </button>
    )
  }

  if (row.payment_method_type === 'check') {
    for (const n of [1, 2, 3, 4]) {
      const status = row[`pay${n}_status`]
      const date = row[`pay${n}_date`]
      if (!date) continue
      if (status === 'succeeded') continue
      buttons.push(
        <button key={`cleared-${n}`} onClick={() => clickCheckCleared(n)} disabled={!!busy} style={busy ? btnDisabledStyle : btnStyle}>
          {busy === `cleared-${n}` ? 'Working...' : `Check cleared P${n}`}
        </button>
      )
    }
  }

  if (buttons.length === 0 && !err) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
      {buttons}
      {err && <span style={{ fontSize: '11px', color: '#d93025', fontWeight: 600, width: '100%', marginTop: '4px' }}>{err}</span>}
    </div>
  )
}

function ExpandedRow({ row, onRefresh }) {
  const currentPriorities = tryParseJSON(row.current_priorities)
  const parkedPriorities = tryParseJSON(row.parked_priorities)
  const undecidedReasons = tryParseJSON(row.undecided_reason)
  const extraCc = tryParseJSON(row.extra_cc)

  // ---- derived fields ----
  const revDecision = (paidVal, share) => {
    if (paidVal === 'Money Mapping') return 'Money Mapping'
    if (paidVal === 'N/A — No Share Due') return 'No share due'
    // Non-terminal: the share is due but the member has no Stripe payout account. The
    // nightly sweep pays it once one exists, so say so rather than letting it fall
    // through to the generic "Revenue Share" and read as ordinary.
    if (paidVal === 'Awaiting Connect Setup') return 'Share held — payout setup needed'
    // Same shape: the share is due, but the member is suspended or paused, so it is
    // parked until they are reinstated.
    if (paidVal === 'Held - Member Suspended') return 'Share held — member suspended'
    if (paidVal === 'Held - Member Paused') return 'Share held — member paused'
    if (paidVal === 'Held - Member In Arrears') return 'Share held — membership in arrears'
    if (share || paidVal === 'Yes' || paidVal === 'Failed') return 'Revenue Share'
    return null
  }
  const isQuarterly = /quarter/i.test(row.payment_plan || '')
  const perPaymentAmount = (() => {
    const n = parseFloat(String(row.gross_fee || '').replace(/[^0-9.]/g, ''))
    if (isNaN(n)) return null
    return isQuarterly ? n / 4 : n
  })()
  const priceRows = () => (
    <>
      <Detail l="Service level" v={row.service_level || row.c15_service_level} />
      <Detail l="Gross fee" v={fmtMoney(row.gross_fee)} />
      <Detail l="Member contribution" v={fmtMoney(row.member_contribution)} />
      <Detail l="Net invoice" v={fmtMoney(row.net_invoice)} />
      <Detail l="Member share" v={fmtMoney(row.member_share)} />
      <Detail l="VFOs share" v={fmtMoney(row.vfos_share)} />
      <Detail l="Payment plan" v={row.payment_plan} />
    </>
  )

  // ---- per-step status ----
  const s81 = !row.c81_decision ? 'pending'
    : row.c81_decision === 'No' ? 'declined'
    : row.c81_email_sent === 'Skipped' ? 'skipped' : 'done'

  const s13 = !row.c13_decision ? 'pending'
    : row.c13_decision === 'No' ? 'declined' : 'done'

  const c14Sent = row.c14_email_sent === 'Yes'
  const s14 = !c14Sent ? 'pending'
    : row.c15_final_decision ? 'done' : 'awaiting'

  const s15 = !row.c15_final_decision ? 'pending'
    : row.c15_final_decision === 'No' ? 'declined' : 'done'

  const contractSent = row.c16_sent && row.c16_sent !== 'No'
  const ceoSigned = row.c18_ceo_signed === 'Yes'
  const sContract = !contractSent ? 'pending' : ceoSigned ? 'done' : 'awaiting'

  const paid = row.pay1_status === 'succeeded'
  const payStarted = has(row.pay1_status, row.pay1_email_sent_at, row.checkout_token)
  const sPay = paid ? 'done' : payStarted ? 'awaiting' : 'pending'

  const sConfirm = (row.confirmation_email_sent_at || row.confirmation_status === 'Sent') ? 'done'
    : row.confirmation_status === CONFIRMATION_CARD_SKIP ? 'skipped' : 'pending'

  const sInvoice = row.invoice_email_sent ? 'done' : row.invoice_number ? 'sent' : 'pending'

  const sRev = (row.c24_email_sent || row.rec1_rev_email_sent_at) ? 'done' : has(row.rec1_rev_share) ? 'awaiting' : 'pending'

  return (
    <div style={{ padding: '12px 24px 18px 48px', background: 'var(--vfo-tint)', borderBottom: '1px solid var(--vfo-tint)' }}>

      {/* 1 — PIP 1 reconfirmation / declined email */}
      <StepCard title="PIP 1 — Reconfirmation / Declined Email" status={s81}>
        {row.c81_decision ? (
          <>
            <Detail l="Re-confirmation decision" v={<Badge text={row.c81_decision} />} showEmpty />
            <Detail l="Follow-up meeting date" v={fmtDate(row.followup_meeting_date)} />
            <Detail l={row.c81_decision === 'No' ? 'Declined email' : 'Re-confirmation email'}
              v={row.c81_email_sent === 'Skipped' ? 'Skipped' : (row.c81_email_sent ? 'Sent' : null)} showEmpty />
          </>
        ) : <Pending />}
      </StepCard>

      {/* 2 — PIP Follow Up decision (PF fills the form) */}
      <StepCard title="PIP Follow-Up — Decision" status={s13}>
        {row.c13_decision ? (
          <>
            <Detail l="Decision" v={<Badge text={row.c13_decision} />} showEmpty />
            {row.c13_decision === 'Yes' && priceRows()}
            {row.c13_decision === 'Undecided' && (
              <>
                <Detail l="Reasons" v={Array.isArray(undecidedReasons) ? undecidedReasons.join('; ') : undecidedReasons} />
                <Detail l="Lite" v={fmtMoney(row.lite_membership)} />
                <Detail l="Core" v={fmtMoney(row.core_membership)} />
                <Detail l="Max" v={row.max_membership} />
              </>
            )}
            <Detail l="Current priorities" v={Array.isArray(currentPriorities) ? currentPriorities.join(', ') : null} />
            <Detail l="Parked priorities" v={Array.isArray(parkedPriorities) ? parkedPriorities.join(', ') : null} />
            <Detail l="Extra CC" v={Array.isArray(extraCc) ? extraCc.join(', ') : null} />
          </>
        ) : <Pending />}
      </StepCard>

      {/* 3 — PC Admin undecided email (automated, to client) */}
      <StepCard title="PC Admin — Undecided Email" status={s14}>
        {c14Sent ? (
          <>
            <Detail l="Undecided email" v={fmtDate(row.c14_email_sent_at) || 'Sent'} />
            <Detail l="2-business-day reminder sent" v={fmtDate(row.c14_reminder_sent_at)} />
            <Detail l="4-business-day PF notified" v={fmtDate(row.c14_pf_notified_at)} />
            {!row.c15_final_decision && <Detail l="Client reply" v="Awaiting client" showEmpty />}
          </>
        ) : <Pending text="Not applicable / not sent yet" />}
      </StepCard>

      {/* 4 — PC Admin final decision (client's reply / extra-meeting outcome) */}
      <StepCard title="PC Admin — Final Decision" status={s15}>
        {row.c15_final_decision ? (
          <>
            <Detail l="Final decision" v={<Badge text={row.c15_final_decision} />} showEmpty />
            {row.c15_via_extra_meeting && <Detail l="Resolved" v="Via extra meeting" />}
            {row.c15_final_decision === 'Yes' && priceRows()}
          </>
        ) : <Pending />}
      </StepCard>

      {/* 5 — Agreement / contract */}
      <StepCard title="Agreement" status={sContract}>
        {contractSent ? (
          <>
            <Detail l="Agreement sent" v={fmtDate(row.c16_sent)} showEmpty />
            <Detail l="Signing follow-up" v={fmtDate(row.c17_followup_sent_date)} />
            <Detail l="2-business-day reminder sent" v={fmtDate(row.c17_reminder_sent_at)} />
            <Detail l="4-business-day PF notified" v={fmtDate(row.c17_pf_notified_at)} />
            <Detail l="Client signed" v={fmtDate(row.c17_client_signed)} showEmpty />
            <Detail l="CEO countersigned" v={fmtDate(row.c18_ceo_signed)} showEmpty />
          </>
        ) : <Pending />}
      </StepCard>

      {/* 6 — Payment (P1) */}
      <StepCard title="Payment" status={sPay}>
        {payStarted ? (
          <>
            <Detail l="Payment link emailed" v={fmtDate(row.pay1_email_sent_at)} />
            <Detail l="2-business-day reminder sent" v={fmtDate(row.pay1_reminder_sent_at)} />
            <Detail l="4-business-day PF notified" v={fmtDate(row.pay1_pf_notified_at)} />
            <Detail l="Method" v={row.payment_method_type} />
            <Detail l="Account" v={row.acct_last4 ? `****${row.acct_last4}` : null} />
            <Detail l="Payment amount" v={fmtMoney(perPaymentAmount)} />
            <Detail l="Payment 1 status" v={row.pay1_status} />
            <Detail l="Payment 1 received" v={fmtDate(row.pay1_date)} />
            <PaymentButtons row={row} onRefresh={onRefresh} />
          </>
        ) : (
          <>
            <Pending />
            <PaymentButtons row={row} onRefresh={onRefresh} />
          </>
        )}
      </StepCard>

      {/* 7 — Confirmation email */}
      <StepCard title="Confirmation Email" status={sConfirm}>
        {(row.confirmation_email_sent_at || row.confirmation_status) ? (
          <Detail l="Confirmation email" v={fmtDate(row.confirmation_email_sent_at) || row.confirmation_status} />
        ) : <Pending />}
      </StepCard>

      {/* 8 — Invoice & receipts */}
      <StepCard title="Invoice & Receipts" status={sInvoice}>
        {row.invoice_number ? (
          <>
            <Detail l="Invoice emailed" v={fmtDate(row.invoice_email_sent_at) || (row.invoice_email_sent ? 'Yes' : null)} showEmpty />
            <Detail l="Invoice #" v={row.invoice_number} mono />
            {[1, 2, 3, 4].map(n => {
              const num = row[`rec${n}_number`]
              if (!num) return null
              return <Detail key={n} l={`Receipt ${n}`} v={num} mono />
            })}
          </>
        ) : <Pending />}
      </StepCard>

      {/* 9 — Revenue share (P1) */}
      <StepCard title="Revenue Share" status={sRev}>
        {has(row.rec1_rev_share, revDecision(row.rec1_rev_paid, row.rec1_rev_share)) ? (
          <>
            <Detail l="Revenue decision" v={revDecision(row.rec1_rev_paid, row.rec1_rev_share)} showEmpty />
            <Detail l="Revenue share completed" v={fmtDate(row.rec1_rev_completed_at)} />
            <Detail l="Revenue share amount" v={fmtMoney(row.rec1_rev_share)} />
            <Detail l="Rev share confirmation email"
              v={fmtDate(row.rec1_rev_email_sent_at) || fmtDate(row.c24_email_sent_at) || (row.c24_email_sent ? 'Sent' : null)} showEmpty />
          </>
        ) : <Pending />}
      </StepCard>

      {/* Future / remaining quarterly payments (P2–P4) */}
      {(isQuarterly || has(row.pay2_status, row.pay2_date, row.pay3_status, row.pay4_status)) && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--vfo-muted)', margin: '4px 0 8px' }}>
            Quarterly Payments 2–4
          </div>
          {[2, 3, 4].map(n => {
            const due = row[`pay${n}_date`]
            const received = row[`pay${n}_paid_at`]
            const status = row[`pay${n}_status`]
            const recNum = row[`rec${n}_number`]
            const recAt = row[`rec${n}_email_sent_at`]
            const st = status === 'succeeded' ? 'done' : (due ? 'awaiting' : 'pending')
            return (
              <StepCard key={n} title={`Payment ${n}`} status={st}>
                <Detail l="Date due" v={fmtDate(due)} showEmpty />
                <Detail l="Date received" v={fmtDate(received)} showEmpty />
                <Detail l="Payment amount" v={fmtMoney(perPaymentAmount)} />
                <Detail l="Receipt sent" v={recNum ? `${recNum}${recAt ? ' · ' + fmtDate(recAt) : ''}` : null} mono />
                <Detail l="Revenue share decision" v={revDecision(row[`rec${n}_rev_paid`], row[`rec${n}_rev_share`])} />
                <Detail l="Revenue share sent" v={fmtDate(row[`rec${n}_rev_email_sent_at`]) || fmtDate(row[`rec${n}_rev_completed_at`])} />
              </StepCard>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: '10px', fontSize: '10px', color: 'var(--vfo-faint)' }}>
        Created {fmtDate(row.created_at)} · Updated {fmtDate(row.updated_at)}
      </div>
    </div>
  )
}

function SandboxBadge({ config, onClick }) {
  const sandbox = !!config?.sandbox_mode
  const palette = sandbox
    ? { bg: 'rgba(251,137,90,0.15)', border: 'rgba(251,137,90,0.4)', text: '#e06717', label: 'SANDBOX MODE' }
    : { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', text: '#ef4444', label: 'LIVE MODE' }
  return (
    <button
      onClick={onClick}
      title="Click to toggle"
      style={{
        padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
        background: palette.bg, color: palette.text,
        border: `1px solid ${palette.border}`, letterSpacing: '0.5px',
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      {palette.label}
    </button>
  )
}

function SandboxToggleModal({ currentlySandbox, onConfirm, onCancel, saving }) {
  const switchingTo = currentlySandbox ? 'LIVE' : 'SANDBOX'
  const isGoingLive = switchingTo === 'LIVE'
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,25,60,0.45)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      fontFamily: '"Inter", sans-serif',
    }}>
      <div style={{
        background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', padding: '32px', maxWidth: '440px', width: '90%', boxShadow: '0 24px 64px rgba(10,25,60,0.25)',
      }}>
        <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: '19px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-heading)', margin: '0 0 12px' }}>
          Switch to {switchingTo} mode?
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--vfo-muted)', lineHeight: 1.6, margin: '0 0 24px' }}>
          {isGoingLive
            ? 'This will switch the MAP1 automation pipeline to use LIVE Stripe + BoldSign keys. Real emails will be sent to real clients/members/PFs and real cards will be charged. Are you sure?'
            : 'This will switch back to sandbox mode. All emails route to the sandbox address and Stripe/BoldSign use test keys.'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: '10px 20px', borderRadius: '8px',
              border: '1px solid var(--vfo-border-strong)', background: 'transparent',
              color: 'var(--vfo-muted)', fontSize: '14px', cursor: saving ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            style={{
              padding: '10px 20px', borderRadius: '8px',
              border: 'none', background: isGoingLive ? '#ef4444' : '#e06717',
              color: '#fff', fontSize: '14px', fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              fontFamily: 'inherit',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : `Switch to ${switchingTo}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AutomationPanel({ section }) {
  const [pipelines, setPipelines] = useState([])
  const [selectedPipeline, setSelectedPipeline] = useState(null)
  const [pipelineData, setPipelineData] = useState([])
  const [sandboxConfig, setSandboxConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)
  const [showModeModal, setShowModeModal] = useState(false)
  const [savingMode, setSavingMode] = useState(false)

  useEffect(() => { loadPipelines() }, [])
  useEffect(() => { if (selectedPipeline) loadPipelineData(selectedPipeline) }, [selectedPipeline])

  async function loadPipelines() {
    try {
      const data = await callApi('automation_load_pipelines')
      setPipelines(data.pipelines || [])
      if (data.pipelines?.length > 0) setSelectedPipeline(data.pipelines[0])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function loadPipelineData(pipeline) {
    try {
      const data = await callApi('automation_load_pipeline_data', { table_name: pipeline.table_name })
      setPipelineData(data.rows || [])
      setSandboxConfig(data.sandbox_config || null)
    } catch (err) { setError(err.message) }
  }

  async function toggleSandboxMode() {
    if (!sandboxConfig) return
    const next = !sandboxConfig.sandbox_mode
    setSavingMode(true)
    try {
      await callApi('save_sandbox_config', {
        sandbox_mode: next,
        stripe_test_mode: next,
        boldsign_test_mode: next,
      })
      setSandboxConfig({ ...sandboxConfig, sandbox_mode: next, stripe_test_mode: next, boldsign_test_mode: next })
      setShowModeModal(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingMode(false)
    }
  }

  if (loading) return <AutomationTrackerSkeleton cols={9} />

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <PanelHero
        eyebrow="Automation Pipeline"
        title="MAP 1 Pipeline"
        action={
          <>
            <SandboxBadge config={sandboxConfig} onClick={() => setShowModeModal(true)} />
            {pipelines.length > 1 && (
              <select value={selectedPipeline?.id || ''} onChange={e => { const p = pipelines.find(p => p.id === parseInt(e.target.value)); if (p) setSelectedPipeline(p) }}
                style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}>
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </>
        }
        stats={[
          { label: 'TOTAL', value: pipelineData.length, color: 'var(--vfo-ink)' },
          { label: 'ACTIVE', value: pipelineData.filter(r => { const s = getCurrentStage(r); return s !== 'complete' && s !== 'closed' }).length, color: '#0095ff' },
          { label: 'COMPLETE', value: pipelineData.filter(r => getCurrentStage(r) === 'complete').length, color: '#16a34a' },
          { label: 'CLOSED', value: pipelineData.filter(r => getCurrentStage(r) === 'closed').length, color: '#ef4444' },
          { label: 'SANDBOX', value: pipelineData.filter(r => r.sandbox).length, color: '#e06717' },
        ]}
      />

      {error && <div style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

      {pipelineData.length === 0 ? (
        <EmptyState title="No clients in pipeline yet" hint="Clients will appear here as they enter the automation flow" />
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--vfo-border)', background: 'var(--vfo-input)' }}>
                {['', 'Client', 'Member', 'PF', 'Stage', 'Decision', 'Service', 'Payment', 'Updated'].map(h => (
                  <th key={h} style={{ padding: '11px 12px', textAlign: 'left', fontSize: '10px', color: 'var(--vfo-muted)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: '600', width: h === '' ? '30px' : undefined }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pipelineData.map(row => {
                const stage = getCurrentStage(row)
                const stageColor = STAGE_COLORS[stage] || 'var(--vfo-muted)'
                const isExpanded = expandedRow === row.id
                return (
                  <Fragment key={row.id}>
                    <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--vfo-tint)', cursor: 'pointer', background: isExpanded ? 'var(--vfo-tint)' : 'transparent' }}
                      onClick={() => setExpandedRow(isExpanded ? null : row.id)}
                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--vfo-tint)' }}
                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                    >
                      <td style={{ padding: '12px 8px', fontSize: '10px', color: 'var(--vfo-muted)' }}>
                        <span style={{ display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                      </td>
                      <td style={{ padding: '12px', fontSize: '14px', color: 'var(--vfo-ink)' }}>
                        <div><ClientNameLink clientId={row.client_id} tab="map1">{row.client_name || row.client_ref || '—'}</ClientNameLink></div>
                        {row.client_ref && row.client_name && <div style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{row.client_ref}</div>}
                        {row.sandbox && <span style={{ fontSize: '10px', color: '#e06717', fontWeight: 600, fontStyle: 'italic' }}>sandbox</span>}
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px', color: 'var(--vfo-muted)' }}>{row.member_name || '—'}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: 'var(--vfo-muted)' }}>{row.pf || '—'}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: `${stageColor}18`, color: stageColor, border: `1px solid ${stageColor}33` }}>
                          {STAGE_LABELS[stage] || stage}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px', color: 'var(--vfo-muted)' }}>{row.c15_final_decision || row.c13_decision || '—'}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: 'var(--vfo-muted)' }}>{row.service_level || row.c15_service_level || '—'}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: 'var(--vfo-muted)' }}>{row.pay1_status || '—'}</td>
                      <td style={{ padding: '12px', fontSize: '12px', color: 'var(--vfo-muted)' }}>{row.updated_at ? row.updated_at.split('T')[0] : '—'}</td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={9} style={{ padding: 0 }}><ExpandedRow row={row} onRefresh={() => loadPipelineData(selectedPipeline)} /></td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </TableCard>
      )}
      {showModeModal && (
        <SandboxToggleModal
          currentlySandbox={!!sandboxConfig?.sandbox_mode}
          onConfirm={toggleSandboxMode}
          onCancel={() => setShowModeModal(false)}
          saving={savingMode}
        />
      )}
    </div>
  )
}
