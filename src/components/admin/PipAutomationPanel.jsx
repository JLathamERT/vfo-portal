import { useEffect, useState } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { StepCard, Detail, Badge, Pending, fmtMoney, fmtDate, PanelHero, EmptyState } from './automation/StepKit'
import SandboxModeToggle from './SandboxModeToggle'
import { AutomationTrackerSkeleton } from '../shared/Skeleton'
import { ClientNameLink } from '../shared/personLinks'

const STAGE_LABELS = {
  purchase: 'Purchase',
  payment_pending: 'Payment Pending',
  paid: 'Paid',
  invoice: 'Invoice & Receipt',
  revshare: 'Rev Share',
  complete: 'Complete',
}

const STAGE_COLORS = {
  purchase: '#7c3aed',
  payment_pending: '#db2777',
  paid: '#0d9488',
  invoice: '#0d9488',
  revshare: '#16a34a',
  complete: '#16a34a',
}

function getCurrentStage(row) {
  if (row.pip_rev_member_email_sent_at && row.pip_rev_share_completed_at) return 'complete'
  if (row.pip_rev_share_status && row.pip_rev_share_status.startsWith('Completed')) return 'revshare'
  if (row.pip_invoice_receipt_email_sent_at) return 'invoice'
  if (row.pip_payment_status === 'succeeded') return 'paid'
  if (row.pip_payment_status === 'pending' || row.pip_payment_status === 'processing') return 'payment_pending'
  return 'purchase'
}

function purchaseLabel(row) {
  if (row.pip_purchase_kind === 'tax_planning') return 'Tax Planning'
  if (row.pip_purchase_kind === 'additional_pip') {
    const n = row.pip_purchase_pip_count || 0
    return `${n} Additional PIP Meeting${n === 1 ? '' : 's'}`
  }
  return '—'
}

function PipPipelineRow({ row, expanded, onToggle }) {
  const client = row.clients || {}
  const clientName = `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Unknown'
  const stage = getCurrentStage(row)
  const stageLabel = STAGE_LABELS[stage]
  const stageColor = STAGE_COLORS[stage]

  const payStatus = row.pip_payment_status === 'succeeded' ? 'done'
    : (row.pip_payment_status === 'pending' || row.pip_payment_status === 'processing' || row.pip_payment_email_sent_at) ? 'awaiting' : 'pending'
  const invStatus = row.pip_invoice_receipt_email_sent_at ? 'done' : row.pip_invoice_number ? 'sent' : 'pending'
  const revStatus = (row.pip_rev_member_email_sent_at || (row.pip_rev_share_status || '').startsWith('Completed')) ? 'done'
    : row.pip_rev_share_status ? 'awaiting' : 'pending'
  const revDecision = /money mapping/i.test(row.pip_rev_share_status || '') ? 'Money Mapping'
    : (row.pip_rev_share_amount || /revenue share/i.test(row.pip_rev_share_status || '')) ? 'Revenue Share' : null

  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <ClientNameLink clientId={row.client_id} tab="pip" style={{ fontSize: '15px', fontWeight: '600' }}>{clientName}</ClientNameLink>
          <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontFamily: 'monospace' }}>{client.client_ref}</span>
          <Badge text={purchaseLabel(row)} color="#0095ff" />
          {row.pip_purchase_amount && <span style={{ fontSize: '12px', color: 'var(--vfo-ink-2)' }}>{fmtMoney(row.pip_purchase_amount)}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {row.sandbox && <Badge text="SANDBOX" color="#e06717" />}
          <Badge text={stageLabel} color={stageColor} />
          <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: expanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '12px 18px 16px', borderTop: '1px solid var(--vfo-border-soft)', background: 'var(--vfo-tint)' }}>
          <StepCard title="Purchase Details" status="done">
            <Detail l="Kind" v={purchaseLabel(row)} />
            <Detail l="Gross service value" v={fmtMoney(row.pip_purchase_gross)} />
            <Detail l="Member contribution" v={fmtMoney(row.pip_purchase_member_contribution)} />
            <Detail l="Net amount due" v={fmtMoney(row.pip_purchase_amount)} />
            <Detail l="Member share" v={fmtMoney(row.pip_purchase_member_share)} />
            <Detail l="VFOs share" v={fmtMoney(row.pip_purchase_vfos_share)} />
            <Detail l="Engagement year" v={row.pip_engagement_year ? `Year ${row.pip_engagement_year}` : null} />
            <Detail l="Purchased" v={fmtDate(row.pip_completed_date)} />
          </StepCard>

          <StepCard title="Payment" status={payStatus}>
            {row.pip_payment_status ? (
              <>
                <Detail l="Payment link emailed" v={fmtDate(row.pip_payment_email_sent_at)} />
                <Detail l="Method" v={row.pip_payment_method_type} />
                <Detail l="Account" v={row.pip_acct_last4 ? `****${row.pip_acct_last4}` : null} />
                <Detail l="Payment amount" v={fmtMoney(row.pip_purchase_amount)} />
                <Detail l="Status" v={row.pip_payment_status} />
                <Detail l="Payment received" v={fmtDate(row.pip_payment_completed_at)} />
              </>
            ) : <Pending />}
          </StepCard>

          {/* Card buyers get the invoice/receipt instead of a confirmation, so a card
              row with nothing sent is resolved, not pending. */}
          <StepCard title="Confirmation Email" status={row.pip_confirmation_email_sent_at ? 'done'
            : row.pip_payment_method_type === 'card' ? 'skipped' : 'pending'}>
            {row.pip_confirmation_email_sent_at
              ? <Detail l="Confirmation email" v={fmtDate(row.pip_confirmation_email_sent_at)} />
              : row.pip_payment_method_type === 'card'
                ? <Detail l="Confirmation email" v="Not sent — card is receipt-only" />
                : <Pending />}
          </StepCard>

          <StepCard title="Invoice & Receipt" status={invStatus}>
            {row.pip_invoice_number ? (
              <>
                <Detail l="Invoice emailed" v={fmtDate(row.pip_invoice_receipt_email_sent_at)} showEmpty />
                <Detail l="Invoice #" v={row.pip_invoice_number} mono />
                <Detail l="Receipt #" v={row.pip_receipt_number} mono />
              </>
            ) : <Pending />}
          </StepCard>

          <StepCard title="Revenue Share" status={revStatus}>
            {row.pip_rev_share_status ? (
              <>
                <Detail l="Revenue decision" v={revDecision} showEmpty />
                <Detail l="Revenue share completed" v={fmtDate(row.pip_rev_share_completed_at)} />
                <Detail l="Revenue share amount" v={fmtMoney(row.pip_rev_share_amount)} />
                <Detail l="Transfer id" v={row.pip_rev_share_transfer_id} mono />
                <Detail l="Rev share confirmation email" v={fmtDate(row.pip_rev_member_email_sent_at)} />
              </>
            ) : <Pending />}
          </StepCard>

          <div style={{ marginTop: '10px', fontSize: '10px', color: 'var(--vfo-faint)' }}>
            Track #{row.id} · Created {fmtDate(row.created_at)}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PipAutomationPanel() {
  const [rows, setRows] = useState([])
  const [sandboxConfig, setSandboxConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)

  // Re-open draws the last pipeline at once, refreshes behind it.
  useEffect(() => {
    const snap = getLastSeen('pipautomation:')
    if (snap) { apply(snap); setLoading(false) }
    loadData(!!snap)
  }, [])

  function apply(data) {
    setRows(data.rows || [])
    setSandboxConfig(data.sandbox_config || null)
  }

  async function loadData(quiet = false) {
    if (quiet !== true) setLoading(true)
    try {
      const data = await callApi('automation_load_pip_pipelines')
      apply(data)
      setLastSeen('pipautomation:', data)
    } catch (err) { if (quiet === true) console.error(err); else setError(err.message) }
    finally { setLoading(false) }
  }

  if (loading) return <AutomationTrackerSkeleton cols={7} />

  const stats = [
    { label: 'TOTAL', value: rows.length, color: 'var(--vfo-ink)' },
    { label: 'PAID', value: rows.filter(r => r.pip_payment_status === 'succeeded').length, color: '#0d9488' },
    { label: 'PENDING REVSHARE', value: rows.filter(r => r.pip_payment_status === 'succeeded' && !r.pip_rev_share_status?.startsWith('Completed')).length, color: '#db2777' },
    { label: 'COMPLETE', value: rows.filter(r => getCurrentStage(r) === 'complete').length, color: '#16a34a' },
    { label: 'SANDBOX', value: rows.filter(r => r.sandbox).length, color: '#e06717' },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <PanelHero
        eyebrow="Automation Pipeline"
        title="PIP Meetings Pipeline"
        action={
          <SandboxModeToggle
            pipeline="MAP 1"
            label="PIP Meetings"
            sandboxConfig={sandboxConfig}
            onChange={setSandboxConfig}
            note="PIP Meetings shares the MAP 1 sandbox flag — switching here also switches the MAP 1 pipeline."
          />
        }
        stats={stats}
      />

      {error && <div style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

      {rows.length === 0 ? (
        <EmptyState title="No PIP purchases yet" hint="Purchases appear here once a PIP follow-on service is bought" />
      ) : (
        rows.map(r => (
          <PipPipelineRow
            key={r.id}
            row={r}
            expanded={expandedRow === r.id}
            onToggle={() => setExpandedRow(expandedRow === r.id ? null : r.id)}
          />
        ))
      )}
    </div>
  )
}
