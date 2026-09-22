import { Fragment, useEffect, useState } from 'react'
import { callApi } from '../../lib/api'
import { StepCard, Detail, Badge, Pending, fmtDate, PanelHero, EmptyState, TableCard } from './automation/StepKit'
import { AutomationTrackerSkeleton } from '../shared/Skeleton'
import { CONFIRMATION_CARD_SKIP } from '../../lib/confirmationStatus'
import { ClientNameLink, MemberNameLink } from '../shared/personLinks'
import { formatDate } from '../../lib/dates'

const STAGE_LABELS = {
  not_started:     'Not Started',
  ready_for_tax3:  'Ready for Tax 3 sent',
  decision:        'Tax 3 — Decision',
  final_decision:  'Final Decision',
  agreement:       'Agreement Sent',
  signed:          'Both Signed',
  payment:         'Payment',
  confirmation:    'Confirmation',
  invoice:         'Invoice & Receipt',
  tax4:            'Tax 4 — Continue/Stop',
  revshare:        'Revenue Share',
  refunded:        'Refunded',
  implementation:  'Implementation Charged',
  complete:        'Complete',
  closed:          'Closed',
}

const STAGE_COLORS = {
  not_started: 'var(--vfo-muted)',
  ready_for_tax3: '#0095ff',
  decision: '#7c3aed',
  final_decision: '#e06717',
  agreement: '#4f46e5',
  signed: '#4f46e5',
  payment: '#db2777',
  confirmation: '#0d9488',
  invoice: '#0d9488',
  tax4: '#0095ff',
  revshare: '#16a34a',
  refunded: '#ef4444',
  implementation: '#16a34a',
  complete: '#16a34a',
  closed: '#ef4444',
}

const DECISION_COLORS = { Yes: '#1b9254', No: '#e74c3c', Undecided: '#e06717', ExtraMeeting: '#0095ff' }

function getCurrentStage(p) {
  if (p.implementation_announcement_email_sent) return 'complete'
  if (p.implementation_charge_status === 'succeeded') return 'implementation'
  if (p.refund_status === 'succeeded') return 'refunded'
  if (p.retainer_rev_paid === 'Yes') return 'revshare'
  if (p.post_review_decision) return 'tax4'
  if (p.retainer_invoice_email_sent || p.retainer_receipt_status === 'Sent') return 'invoice'
  if (p.retainer_confirmation_status === 'Sent') return 'confirmation'
  if (p.retainer_status) return 'payment'
  if (p.client_signed === 'Yes' && p.ceo_signed === 'Yes') return 'signed'
  if (p.agreement_sent === 'Yes') return 'agreement'
  if (p.tax_final_decision === 'No' || (p.tax_decision === 'No' && p.tax_decision_email_sent === 'Yes')) return 'closed'
  if (p.tax_final_decision) return 'final_decision'
  if (p.tax_decision) return 'decision'
  if (p.ready_for_tax3_decision) return 'ready_for_tax3'
  return 'not_started'
}

function fmtMoney(n) {
  return n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null
}

function PaymentButtons({ plan, onRefresh }) {
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState('')

  async function clickPayByCheck() {
    if (!window.confirm('Mark this client as paying by check?\n\n• Sets retainer_status to "check_pending"\n• Blocks the Stripe /tax-pay link\n• Drafts a Gmail with check mailing instructions\n\nProceed?')) return
    setBusy('paidbycheck'); setErr('')
    try { await callApi('automation_TAX_paidbycheck', { tax_plan_id: plan.id }); await onRefresh() }
    catch (e) { setErr(e.message || String(e)) } finally { setBusy(null) }
  }
  async function clickCheckCleared() {
    if (!window.confirm('Mark check as cleared?\n\nSets retainer_status to "succeeded" and chains confirmation + invoice/receipt.\nOnly click AFTER your bank has cleared the check.')) return
    setBusy('cleared'); setErr('')
    try { await callApi('automation_TAX_checkcleared', { tax_plan_id: plan.id }); await onRefresh() }
    catch (e) { setErr(e.message || String(e)) } finally { setBusy(null) }
  }

  const btnStyle = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: 'rgba(34,197,94,0.15)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit' }
  const btnDisabled = { ...btnStyle, opacity: 0.5, cursor: 'not-allowed' }

  const showPayByCheck = plan.checkout_token && !plan.retainer_status
  const showCleared = plan.payment_method_type === 'check' && plan.retainer_status === 'check_pending'
  if (!showPayByCheck && !showCleared && !err) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {showPayByCheck && <button onClick={clickPayByCheck} disabled={!!busy} style={busy ? btnDisabled : btnStyle}>{busy === 'paidbycheck' ? 'Working…' : 'Pay via check'}</button>}
      {showCleared && <button onClick={clickCheckCleared} disabled={!!busy} style={busy ? btnDisabled : btnStyle}>{busy === 'cleared' ? 'Working…' : 'Mark check cleared'}</button>}
      {err && <span style={{ fontSize: 11, color: '#d93025', fontWeight: 600, width: '100%', marginTop: 4 }}>{err}</span>}
    </div>
  )
}

function ExpandedRow({ row, onRefresh }) {
  const money = (v) => fmtMoney(v) ? `$${fmtMoney(v)}` : null

  const sReady = !row.ready_for_tax3_decision ? 'pending' : (row.ready_for_tax3_email_sent === 'Yes' ? 'done' : 'awaiting')
  const sDecision = !row.tax_decision ? 'pending' : row.tax_decision === 'No' ? 'declined' : 'done'
  const sFinal = !row.tax_final_decision ? (row.tax_decision === 'Undecided' ? 'awaiting' : 'pending')
    : row.tax_final_decision === 'No' ? 'declined' : 'done'
  const sContract = row.agreement_sent === 'Yes' ? (row.ceo_signed === 'Yes' ? 'done' : 'awaiting') : 'pending'
  const sPay = row.retainer_status === 'succeeded' ? 'done' : (row.checkout_token || row.retainer_status) ? 'awaiting' : 'pending'
  const sConfirm = (row.retainer_confirmation_email_sent_at || row.retainer_confirmation_status === 'Sent') ? 'done'
    : row.retainer_confirmation_status === CONFIRMATION_CARD_SKIP ? 'skipped' : 'pending'
  const sInvoice = row.retainer_invoice_email_sent ? 'done' : row.retainer_invoice_number ? 'sent' : 'pending'
  const sTax4 = !row.post_review_decision ? 'pending' : (/refund|stop/i.test(row.post_review_decision) ? 'declined' : 'done')
  const sRetRev = (row.retainer_rev_paid === 'Yes' || row.retainer_rev_paid === 'Money Mapping') ? 'done' : row.retainer_rev_share ? 'awaiting' : 'pending'
  const sImpl = row.implementation_charge_status === 'succeeded' ? 'done' : row.implementation_charge_status ? 'awaiting' : 'pending'
  const sImplRev = (row.implementation_rev_paid === 'Yes' || row.implementation_rev_paid === 'Money Mapping') ? 'done' : row.implementation_rev_share ? 'awaiting' : 'pending'
  const sWrap = row.implementation_announcement_email_sent ? 'done' : 'pending'

  const retRevDecision = row.retainer_rev_paid === 'Money Mapping' ? 'Money Mapping'
    : (row.retainer_rev_paid === 'Yes' || row.retainer_rev_paid === 'Failed' || row.member_share) ? 'Revenue Share' : null
  const implRevDecision = row.implementation_rev_paid === 'Money Mapping' ? 'Money Mapping'
    : (row.implementation_rev_paid === 'Yes' || row.implementation_rev_paid === 'Failed') ? 'Revenue Share' : null

  const pricing = () => (
    <>
      <Detail l="Risk mindset" v={row.risk_mindset} />
      <Detail l="Retainer" v={money(row.retainer_amount)} />
      <Detail l="Implementation fee" v={money(row.implementation_amount)} />
      <Detail l="Total fee" v={money(row.total_fee)} />
      <Detail l="Split type" v={row.split_type} />
      <Detail l="Member share" v={money(row.member_share)} />
      <Detail l="VFOS share" v={money(row.vfos_share)} />
      {Number(row.discount_applied) > 0 && <Detail l="Discount applied" v={money(row.discount_applied)} />}
    </>
  )

  return (
    <div style={{ padding: '12px 24px 18px 48px', background: 'var(--vfo-tint)', borderBottom: '1px solid var(--vfo-tint)' }}>

      <StepCard title="Ready for Tax 3 — Email" status={sReady}>
        {row.ready_for_tax3_decision ? (
          <>
            <Detail l="Decision" v={<Badge text={row.ready_for_tax3_decision} />} showEmpty />
            <Detail l="Email" v={fmtDate(row.ready_for_tax3_email_sent_at) || (row.ready_for_tax3_email_sent === 'Yes' ? 'Sent' : null)} showEmpty />
          </>
        ) : <Pending />}
      </StepCard>

      <StepCard title="Tax 3 — Decision" status={sDecision}>
        {row.tax_decision ? (
          <>
            <Detail l="Decision" v={<Badge text={row.tax_decision} />} showEmpty />
            {row.tax_decision === 'Yes' && pricing()}
            {row.tax_decision === 'Undecided' && (
              <>
                <Detail l="Potential tax savings" v={money(row.potential_tax_savings)} />
                <Detail l="Initial retainer quoted" v={money(row.initial_retainer_quoted)} />
              </>
            )}
            <Detail l="Decision email sent" v={fmtDate(row.tax_decision_email_sent_at) || row.tax_decision_email_sent} />
            <Detail l="2-business-day reminder sent" v={fmtDate(row.tax_decision_reminder_sent_at)} />
            <Detail l="4-business-day PF notified" v={fmtDate(row.tax_decision_pf_notified_at)} />
            <Detail l="Presentation link" v={row.presentation_link} />
            <Detail l="Meeting notes" v={row.meeting_notes} />
            <Detail l="Extra CC" v={row.extra_cc} />
          </>
        ) : <Pending />}
      </StepCard>

      <StepCard title="Client — Final Decision (Undecided path)" status={sFinal}>
        {row.tax_final_decision ? (
          <>
            {row.tax_via_extra_meeting && <Detail l="Resolved" v="Via extra meeting" />}
            <Detail l="Final decision" v={<Badge text={row.tax_final_decision} />} showEmpty />
            {(row.tax_final_decision === 'Yes' || (row.tax_final_decision === 'ExtraMeeting' && row.retainer_amount)) && pricing()}
          </>
        ) : <Pending text={row.tax_decision === 'Undecided' ? 'Awaiting client decision via /tax-decide' : 'N/A (direct Yes/No path)'} />}
      </StepCard>

      <StepCard title="Agreement" status={sContract}>
        {row.agreement_sent === 'Yes' ? (
          <>
            <Detail l="Agreement sent" v={fmtDate(row.agreement_sent_at) || 'Sent'} showEmpty />
            <Detail l="Signing follow-up" v={fmtDate(row.signed_followup_sent_date)} />
            <Detail l="2-business-day reminder sent" v={fmtDate(row.signed_reminder_sent_at)} />
            <Detail l="4-business-day PF notified" v={fmtDate(row.signed_pf_notified_at)} />
            <Detail l="Client signed" v={fmtDate(row.client_signed_at) || (row.client_signed === 'Yes' ? 'Signed' : null)} showEmpty />
            <Detail l="CEO countersigned" v={fmtDate(row.ceo_signed_at) || (row.ceo_signed === 'Yes' ? 'Signed' : null)} showEmpty />
          </>
        ) : <Pending />}
      </StepCard>

      <StepCard title="Payment" status={sPay}>
        {row.checkout_token || row.retainer_status ? (
          <>
            <Detail l="Payment link emailed" v={fmtDate(row.payment_email_sent_at)} />
            <Detail l="2-business-day reminder sent" v={fmtDate(row.payment_reminder_sent_at)} />
            <Detail l="4-business-day PF notified" v={fmtDate(row.payment_pf_notified_at)} />
            <Detail l="Method" v={row.payment_method_type} />
            <Detail l="Account" v={row.acct_last4 ? `****${row.acct_last4}` : null} />
            <Detail l="Payment amount" v={money(row.retainer_amount)} />
            <Detail l="Retainer status" v={row.retainer_status} />
            <Detail l="Retainer paid" v={fmtDate(row.retainer_date)} />
            <PaymentButtons plan={row} onRefresh={onRefresh} />
          </>
        ) : (
          <>
            <Pending />
            <PaymentButtons plan={row} onRefresh={onRefresh} />
          </>
        )}
      </StepCard>

      <StepCard title="Confirmation Email" status={sConfirm}>
        {(row.retainer_confirmation_email_sent_at || row.retainer_confirmation_status)
          ? <Detail l="Confirmation email" v={fmtDate(row.retainer_confirmation_email_sent_at) || row.retainer_confirmation_status} />
          : <Pending />}
      </StepCard>

      <StepCard title="Invoice & Receipt" status={sInvoice}>
        {row.retainer_invoice_number ? (
          <>
            <Detail l="Invoice emailed" v={fmtDate(row.retainer_invoice_email_sent_at) || (row.retainer_invoice_email_sent ? 'Yes' : null)} showEmpty />
            <Detail l="Invoice #" v={row.retainer_invoice_number} mono />
            <Detail l="Receipt #" v={row.retainer_receipt_number} mono />
            <Detail l="Receipt status" v={row.retainer_receipt_status} />
          </>
        ) : <Pending />}
      </StepCard>

      <StepCard title="Tax 4 — Continue / Stop" status={sTax4}>
        {row.post_review_decision ? (
          <>
            <Detail l="Decision" v={<Badge text={row.post_review_decision} color={/refund|stop/i.test(row.post_review_decision) ? '#e74c3c' : '#1b9254'} />} showEmpty />
            <Detail l="Decision email sent" v={fmtDate(row.post_review_decision_email_sent_at)} />
            <Detail l="2-business-day reminder sent" v={fmtDate(row.post_review_reminder_sent_at)} />
            <Detail l="4-business-day PF notified" v={fmtDate(row.post_review_pf_notified_at)} />
            <Detail l="Client decision" v={row.post_review_client_decision} />
            {row.refund_status && (
              <>
                <Detail l="Refund status" v={row.refund_status} />
                <Detail l="Refund amount" v={money(row.refund_amount)} />
                <Detail l="Refund date" v={fmtDate(row.refund_date)} />
                <Detail l="Refund email sent" v={row.refund_email_sent ? 'Sent' : null} />
              </>
            )}
          </>
        ) : <Pending text="Awaiting Tax 4 meeting + admin decision" />}
      </StepCard>

      <StepCard title="Retainer Revenue Share" status={sRetRev}>
        {row.retainer_rev_share ? (
          <>
            <Detail l="Revenue decision" v={retRevDecision} showEmpty />
            <Detail l="Revenue share completed" v={fmtDate(row.retainer_rev_completed_at) || ((row.retainer_rev_paid === 'Yes' || row.retainer_rev_paid === 'Money Mapping') ? row.retainer_rev_paid : null)} />
            <Detail l="Revenue share amount" v={money(row.member_share)} />
            <Detail l="Rev share confirmation email" v={fmtDate(row.retainer_rev_email_sent_at) || (row.retainer_rev_email_sent ? 'Sent' : null)} showEmpty />
            <Detail l="Tracy intro sent" v={row.tracy_intro_email_sent ? 'Sent' : null} />
          </>
        ) : <Pending />}
      </StepCard>

      <StepCard title="Implementation Fee" status={sImpl}>
        {row.implementation_charge_status ? (
          <>
            <Detail l="Charge status" v={row.implementation_charge_status} />
            <Detail l="Charged" v={fmtDate(row.implementation_charge_date)} />
            <Detail l="Receipt #" v={row.implementation_receipt_number} mono />
            <Detail l="Receipt status" v={row.implementation_receipt_status} />
          </>
        ) : <Pending text={'Awaiting first "Proceed with Implementation" in Tax 5'} />}
      </StepCard>

      <StepCard title="Implementation Revenue Share" status={sImplRev}>
        {row.implementation_rev_share ? (
          <>
            <Detail l="Revenue decision" v={implRevDecision} showEmpty />
            <Detail l="Revenue share completed" v={fmtDate(row.implementation_rev_completed_at) || ((row.implementation_rev_paid === 'Yes' || row.implementation_rev_paid === 'Money Mapping') ? row.implementation_rev_paid : null)} />
            <Detail l="Rev share confirmation email" v={fmtDate(row.implementation_rev_email_sent_at) || (row.implementation_rev_email_sent ? 'Sent' : null)} showEmpty />
          </>
        ) : <Pending />}
      </StepCard>

      <StepCard title="Wrap-up Announcement" status={sWrap}>
        {row.implementation_announcement_email_sent
          ? <Detail l="Announcement email" v={fmtDate(row.implementation_announcement_email_sent_at) || 'Sent'} />
          : <Pending />}
      </StepCard>

      <div style={{ marginTop: '10px', fontSize: '10px', color: 'var(--vfo-faint)' }}>
        Plan #{row.id} · Created {fmtDate(row.created_at)}
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
    <button onClick={onClick} title="Click to toggle"
      style={{ padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: palette.bg, color: palette.text, border: `1px solid ${palette.border}`, letterSpacing: '0.5px', cursor: 'pointer', fontFamily: 'inherit' }}>
      {palette.label}
    </button>
  )
}

function SandboxToggleModal({ currentlySandbox, onConfirm, onCancel, saving }) {
  const switchingTo = currentlySandbox ? 'LIVE' : 'SANDBOX'
  const isGoingLive = switchingTo === 'LIVE'
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,25,60,0.45)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, fontFamily: '"Inter", sans-serif' }}>
      <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: 16, padding: 32, maxWidth: 440, width: '90%', boxShadow: '0 24px 64px rgba(10,25,60,0.25)' }}>
        <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-heading)', margin: '0 0 12px' }}>Switch Tax pipeline to {switchingTo} mode?</h2>
        <p style={{ fontSize: 14, color: 'var(--vfo-muted)', lineHeight: 1.6, margin: '0 0 24px' }}>
          {isGoingLive
            ? 'This will switch the TAX automation pipeline to use LIVE Stripe + BoldSign keys. Real emails will be sent to real clients and real cards will be charged. Are you sure?'
            : 'This will switch back to sandbox mode. Emails route to sandbox_email and Stripe/BoldSign use test keys.'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onCancel} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: 14, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={onConfirm} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: isGoingLive ? '#ef4444' : '#e06717', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : `Switch to ${switchingTo}`}</button>
        </div>
      </div>
    </div>
  )
}

export default function TaxAutomationPanel({ programScope = 'holistic' }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sandboxConfig, setSandboxConfig] = useState(null)
  const [expandedRow, setExpandedRow] = useState(null)
  const [showModeModal, setShowModeModal] = useState(false)
  const [savingMode, setSavingMode] = useState(false)

  // Both views share the same backend tax pipeline; program_id is the only
  // thing that distinguishes the standalone Tax Planning program (4) from the
  // Holistic Planning tax track (1, or legacy NULL).
  function inScope(p) {
    return programScope === 'standalone'
      ? p.program_id === 4
      : p.program_id == null || p.program_id === 1
  }

  async function load() {
    setLoading(true); setError('')
    try {
      const data = await callApi('automation_load_tax_plans')
      setRows((data.rows || []).filter(inScope))
      setSandboxConfig(data.sandbox_config || null)
    } catch (err) { setError(err.message || String(err)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function toggleSandboxMode() {
    if (!sandboxConfig) return
    const next = !sandboxConfig.sandbox_mode
    setSavingMode(true)
    try {
      await callApi('save_sandbox_config', {
        pipeline: 'TAX',
        sandbox_mode: next,
        stripe_test_mode: next,
        boldsign_test_mode: next,
      })
      setSandboxConfig({ ...sandboxConfig, sandbox_mode: next, stripe_test_mode: next, boldsign_test_mode: next })
      setShowModeModal(false)
    } catch (err) { setError(err.message) }
    finally { setSavingMode(false) }
  }

  const stats = {
    total: rows.length,
    active: rows.filter(p => { const s = getCurrentStage(p); return s !== 'complete' && s !== 'closed' && s !== 'refunded' }).length,
    complete: rows.filter(p => getCurrentStage(p) === 'complete').length,
    closed: rows.filter(p => { const s = getCurrentStage(p); return s === 'closed' || s === 'refunded' }).length,
    sandbox: rows.filter(p => p.sandbox).length,
  }

  if (loading) return <AutomationTrackerSkeleton cols={8} />

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <PanelHero
        eyebrow="Automation Pipeline"
        title={programScope === 'standalone' ? 'Tax Planning Automation' : 'Holistic Tax Priorities Automation'}
        action={<SandboxBadge config={sandboxConfig} onClick={() => setShowModeModal(true)} />}
        stats={[
          { label: 'TOTAL', value: stats.total, color: 'var(--vfo-ink)' },
          { label: 'ACTIVE', value: stats.active, color: '#0095ff' },
          { label: 'COMPLETE', value: stats.complete, color: '#16a34a' },
          { label: 'CLOSED', value: stats.closed, color: '#ef4444' },
          { label: 'SANDBOX', value: stats.sandbox, color: '#e06717' },
        ]}
      />

      {error && <div style={{ color: '#d93025', fontWeight: 500, fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {rows.length === 0 ? (
        <EmptyState title="No tax plans yet" hint="Tax plans appear here as they enter the automation flow" />
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--vfo-border)', background: 'var(--vfo-input)' }}>
                {['', 'Client', 'Member', 'PF', 'Stage', 'Decision', 'Retainer', 'Payment', 'Started'].map(h => (
                  <th key={h} style={{ padding: '11px 12px', textAlign: 'left', fontSize: 10, color: 'var(--vfo-muted)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, width: h === '' ? 30 : undefined }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const stage = getCurrentStage(row)
                const stageColor = STAGE_COLORS[stage] || 'var(--vfo-muted)'
                const isExpanded = expandedRow === row.id
                return (
                  <Fragment key={row.id}>
                    <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--vfo-tint)', cursor: 'pointer', background: isExpanded ? 'var(--vfo-tint)' : 'transparent' }}
                      onClick={() => setExpandedRow(isExpanded ? null : row.id)}
                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--vfo-tint)' }}
                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}>
                      <td style={{ padding: '12px 8px', fontSize: 10, color: 'var(--vfo-muted)' }}>
                        <span style={{ display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                      </td>
                      <td style={{ padding: 12, fontSize: 14, color: 'var(--vfo-ink)' }}>
                        <div><ClientNameLink clientId={row.client_id} tab="tax">{row.client_name || row.client_ref || '—'}</ClientNameLink></div>
                        {row.client_ref && row.client_name && <div style={{ fontSize: 11, color: 'var(--vfo-muted)' }}>{row.client_ref}</div>}
                        {row.sandbox && <span style={{ fontSize: 10, color: '#e06717', fontWeight: 600, fontStyle: 'italic' }}>sandbox</span>}
                      </td>
                      <td style={{ padding: 12, fontSize: 13, color: 'var(--vfo-muted)' }}><MemberNameLink memberNumber={row.member_number}>{row.member_name || row.member_number || '—'}</MemberNameLink></td>
                      <td style={{ padding: 12, fontSize: 13, color: 'var(--vfo-muted)' }}>{row.assigned_pf || '—'}</td>
                      <td style={{ padding: 12 }}>
                        <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${stageColor}18`, color: stageColor, border: `1px solid ${stageColor}33` }}>
                          {STAGE_LABELS[stage] || stage}
                        </span>
                      </td>
                      <td style={{ padding: 12, fontSize: 13, color: 'var(--vfo-muted)' }}>{row.tax_final_decision || row.tax_decision || '—'}</td>
                      <td style={{ padding: 12, fontSize: 13, color: 'var(--vfo-muted)' }}>{fmtMoney(row.retainer_amount) ? `$${fmtMoney(row.retainer_amount)}` : '—'}</td>
                      <td style={{ padding: 12, fontSize: 13, color: 'var(--vfo-muted)' }}>{row.retainer_status || '—'}</td>
                      <td style={{ padding: 12, fontSize: 12, color: 'var(--vfo-muted)' }}>{row.created_at ? formatDate(row.created_at) : '—'}</td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={9} style={{ padding: 0 }}><ExpandedRow row={row} onRefresh={load} /></td>
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
        <SandboxToggleModal currentlySandbox={!!sandboxConfig?.sandbox_mode} onConfirm={toggleSandboxMode} onCancel={() => setShowModeModal(false)} saving={savingMode} />
      )}
    </div>
  )
}
