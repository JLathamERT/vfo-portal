import { useEffect, useState } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { StepCard, Detail, Badge, Pending, fmtMoney, fmtDate, PanelHero, EmptyState } from './automation/StepKit'
import SandboxModeToggle from './SandboxModeToggle'
import { AutomationTrackerSkeleton } from '../shared/Skeleton'

const STAGE_LABELS = {
  new: 'New', sif_sent: 'SIF Sent', sif_review: 'SIF Submitted', voting: 'Exec Voting',
  approved: 'Approved', declined: 'Declined', stopped: 'Stopped',
  awaiting_payment: 'Awaiting Payment', payment_processing: 'Payment Processing',
  paid: 'Paid', complete: 'Complete',
}
const STAGE_COLORS = {
  new: 'var(--vfo-muted)', sif_sent: '#0095ff', sif_review: '#0095ff', voting: '#9333ea',
  approved: '#0d9488', declined: '#ef4444', stopped: '#ef4444',
  awaiting_payment: '#db2777', payment_processing: '#e06717', paid: '#16a34a', complete: '#16a34a',
}

const EXECS = ['Anton Anderson', 'Paul Latham']

// Derive the round-1 / round-2 outcome from the attached votes.
function voteOutcome(votes) {
  const r1 = {}, r2 = {}
  ;(votes || []).forEach(v => { (v.vote_round === 2 ? r2 : r1)[v.voter_name] = v.vote })
  const r1Both = EXECS.every(e => r1[e]), r2Both = EXECS.every(e => r2[e])
  if (r2Both) {
    if (EXECS.every(e => r2[e] === 'Approved')) return { outcome: 'approved', round: 2, r1, r2 }
    if (EXECS.every(e => r2[e] === 'Denied')) return { outcome: 'denied', round: 2, r1, r2 }
    return { outcome: 'mismatch', round: 2, r1, r2 }
  }
  if (r1Both) {
    if (EXECS.every(e => r1[e] === 'Approved')) return { outcome: 'approved', round: 1, r1, r2 }
    if (r1['Anton Anderson'] === 'Further Questions' || r1['Paul Latham'] === 'Further Questions') return { outcome: 'further_questions', round: 1, r1, r2 }
  }
  if ((votes || []).length > 0) return { outcome: 'voting', round: r2Both || Object.keys(r2).length ? 2 : 1, r1, r2 }
  return { outcome: 'none', round: 1, r1, r2 }
}

function getCurrentStage(row) {
  if (row.status === 'stopped') return 'stopped'
  if (row.status === 'completed') return 'complete'
  if (row.bg_payment_status === 'succeeded') return 'paid'
  if (row.bg_payment_status === 'processing') return 'payment_processing'
  if (row.bg_step3_email_sent_at) return 'awaiting_payment'
  const vo = voteOutcome(row.votes).outcome
  if (vo === 'approved') return 'approved'
  if (vo === 'denied') return 'declined'
  if (vo === 'voting' || vo === 'further_questions' || vo === 'mismatch') return 'voting'
  if (row.sif_submitted_at) return 'sif_review'
  if (row.sif_token) return 'sif_sent'
  return 'new'
}

// Colored badge for a single exec's vote value (admin oversight — full visibility).
function voteBadge(v) {
  if (!v) return <span style={{ color: 'var(--vfo-muted)', fontSize: '12px' }}>Awaiting</span>
  const c = v === 'Approved' ? '#16a34a' : v === 'Denied' ? '#ef4444' : '#e06717'
  return <Badge text={v} color={c} />
}

function SpecialistPipelineRow({ row, expanded, onToggle }) {
  const name = row.specialist_name || 'Unknown'
  const stage = getCurrentStage(row)
  const vo = voteOutcome(row.votes)
  const isTax = (row.sif_data && row.sif_data.is_tax_specialist) === 'Yes'
  const checkProcess = row.background_check_type === 'Max' ? 'Scherzer International' : row.background_check_type === 'Core' ? 'Checkr' : null

  const sifStatus = row.sif_submitted_at ? 'done' : row.sif_token ? 'awaiting' : 'pending'
  const metStatus = (row.meetings || []).length === 0 ? 'pending' : (row.final_rev_proposal && row.final_rev_proposal.at) ? 'done' : 'awaiting'
  const voteStatus = vo.outcome === 'approved' ? 'done' : vo.outcome === 'denied' ? 'declined'
    : (vo.outcome === 'voting' || vo.outcome === 'further_questions' || vo.outcome === 'mismatch') ? 'awaiting' : 'pending'
  const payStatus = row.bg_payment_status === 'succeeded' ? 'done'
    : (row.bg_checkout_token || row.bg_payment_status) ? 'awaiting' : 'pending'
  const recStatus = row.bg_receipt_email_sent_at ? 'done' : (row.bg_confirmation_email_sent_at || row.bg_invoice_number) ? 'sent' : 'pending'

  const outcomeBadge = {
    approved: <Badge text="Approved" color="#16a34a" />, denied: <Badge text="Denied" color="#ef4444" />,
    further_questions: <Badge text="Further Questions" color="#e06717" />, mismatch: <Badge text="Split — re-vote" color="#e06717" />,
    voting: <Badge text="Voting in progress" color="#9333ea" />, none: null,
  }[vo.outcome]

  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '15px', fontWeight: '600', color: 'var(--vfo-ink)' }}>{name}</span>
          {isTax && <Badge text="Tax Specialist" color="#0095ff" />}
          {row.background_check_type && <span style={{ fontSize: '12px', color: 'var(--vfo-ink-2)' }}>{row.background_check_type} · {fmtMoney(row.background_check_type === 'Max' ? 950 : 350)}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Badge text={STAGE_LABELS[stage]} color={STAGE_COLORS[stage]} />
          <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: expanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '12px 18px 16px', borderTop: '1px solid var(--vfo-border-soft)', background: 'var(--vfo-tint)' }}>
          <StepCard title="SIF Form" status={sifStatus}>
            {row.sif_token ? (
              <>
                <Detail l="SIF form sent" v={!!row.sif_token} />
                <Detail l="Submitted" v={fmtDate(row.sif_submitted_at)} showEmpty />
                <Detail l="Tax specialist" v={row.sif_data ? (row.sif_data.is_tax_specialist || '—') : null} />
              </>
            ) : <Pending />}
          </StepCard>

          <StepCard title="Stage 2 — Detail Meetings" status={metStatus}>
            {(row.meetings || []).length > 0 ? (
              <>
                {row.meetings.map((m, i) => {
                  const items = (m.items_discussed || []).length
                  const respColor = m.rev_proposal_response === 'Approved' ? '#16a34a' : m.rev_proposal_response ? '#e06717' : 'var(--vfo-muted)'
                  return (
                    <div key={m.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
                      <div style={{ fontSize: '12px', color: 'var(--vfo-ink-2)' }}>
                        Meeting {i + 1} · {m.meeting_date} · {m.outcome === 'stopped' ? 'Stopped' : 'Still interested'} · {items} item{items === 1 ? '' : 's'} covered
                      </div>
                      {m.rev_proposal_text && (
                        <div style={{ fontSize: '11px', color: respColor, marginTop: '3px' }}>
                          ↳ Revenue share proposal emailed {fmtDate(m.rev_proposal_email_sent_at) || 'pending'} · Response: {m.rev_proposal_response || 'Awaiting'}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div style={{ marginTop: '6px' }}>
                  <Detail l="Final revenue share proposal" v={fmtDate(row.final_rev_proposal && row.final_rev_proposal.at)} showEmpty />
                </div>
              </>
            ) : <Pending />}
          </StepCard>

          <StepCard title="Executive Approval" status={voteStatus}>
            {(row.votes || []).length > 0 ? (
              <>
                <Detail l="Outcome" v={outcomeBadge} showEmpty />
                <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '8px 0 2px' }}>Round 1 — Initial vote</div>
                <Detail l="Anton Anderson" v={voteBadge(vo.r1['Anton Anderson'])} showEmpty />
                <Detail l="Paul Latham" v={voteBadge(vo.r1['Paul Latham'])} showEmpty />
                {Object.keys(vo.r2).length > 0 && (
                  <>
                    <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '10px 0 2px' }}>Round 2 — After further questions</div>
                    <Detail l="Anton Anderson" v={voteBadge(vo.r2['Anton Anderson'])} showEmpty />
                    <Detail l="Paul Latham" v={voteBadge(vo.r2['Paul Latham'])} showEmpty />
                  </>
                )}
              </>
            ) : <Pending />}
          </StepCard>

          <StepCard title="Stage 3 Email" status={row.bg_step3_email_sent_at ? 'done' : 'pending'}>
            {row.bg_step3_email_sent_at ? (
              <Detail l="Sent to specialist" v={fmtDate(row.bg_step3_email_sent_at)} />
            ) : <Pending />}
          </StepCard>

          {row.further_questions_requested_at && (
            <StepCard title="Further Questions" status={row.further_questions_resolved_at ? 'done' : 'awaiting'}>
              <Detail l="Requested" v={fmtDate(row.further_questions_requested_at)} />
              <Detail l="Resolution" v={row.further_questions_resolution} showEmpty />
              <Detail l="Resolved" v={fmtDate(row.further_questions_resolved_at)} showEmpty />
            </StepCard>
          )}

          <StepCard title="Payment" status={payStatus}>
            {row.bg_checkout_token || row.bg_payment_status ? (
              <>
                <Detail l="Background check" v={row.background_check_type} />
                <Detail l="Method" v={row.bg_payment_method_type} />
                <Detail l="Account" v={row.bg_acct_last4 ? `****${row.bg_acct_last4}` : null} />
                <Detail l="Status" v={row.bg_payment_status} />
                <Detail l="Confirmation email sent" v={fmtDate(row.bg_confirmation_email_sent_at)} />
                <Detail l="Payment cleared" v={fmtDate(row.bg_payment_completed_at)} />
                <Detail l="Routed to" v={checkProcess} />
              </>
            ) : <Pending />}
          </StepCard>

          <StepCard title="Invoice & Receipt" status={recStatus}>
            {row.bg_confirmation_email_sent_at || row.bg_invoice_number ? (
              <>
                <Detail l="Receipt email sent" v={fmtDate(row.bg_receipt_email_sent_at)} showEmpty />
                <Detail l="Invoice #" v={row.bg_invoice_number} mono />
                <Detail l="Receipt #" v={row.bg_receipt_number} mono />
              </>
            ) : <Pending />}
          </StepCard>

          <div style={{ marginTop: '10px', fontSize: '10px', color: 'var(--vfo-faint)' }}>
            Onboarding #{row.id} · Started {fmtDate(row.created_at)} · {row.specialist_email || 'no email'}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SpecialistAutomationPanel() {
  const [rows, setRows] = useState([])
  const [sandboxConfig, setSandboxConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)

  // Re-open draws the last pipeline at once, refreshes behind it.
  useEffect(() => {
    const snap = getLastSeen('specialistautomation:')
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
      const data = await callApi('automation_load_specialist_pipelines')
      apply(data)
      setLastSeen('specialistautomation:', data)
    } catch (err) { if (quiet === true) console.error(err); else setError(err.message) }
    finally { setLoading(false) }
  }

  if (loading) return <AutomationTrackerSkeleton cols={7} />

  const stats = [
    { label: 'TOTAL', value: rows.length, color: 'var(--vfo-ink)' },
    { label: 'IN PROGRESS', value: rows.filter(r => { const s = getCurrentStage(r); return s !== 'complete' && s !== 'stopped' && s !== 'declined' }).length, color: '#0095ff' },
    { label: 'APPROVED', value: rows.filter(r => voteOutcome(r.votes).outcome === 'approved').length, color: '#0d9488' },
    { label: 'PAID', value: rows.filter(r => r.bg_payment_status === 'succeeded').length, color: '#16a34a' },
    { label: 'STOPPED', value: rows.filter(r => r.status === 'stopped').length, color: '#ef4444' },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <PanelHero
        eyebrow="Automation Pipeline"
        title="Specialist Onboarding Pipeline"
        action={
          <SandboxModeToggle
            pipeline="SPECIALIST_ONBOARDING"
            label="Specialist Onboarding"
            sandboxConfig={sandboxConfig}
            onChange={setSandboxConfig}
          />
        }
        stats={stats}
      />

      {error && <div style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

      {rows.length === 0 ? (
        <EmptyState title="No specialist onboarding records yet" hint="Specialists appear here as they enter the onboarding flow" />
      ) : (
        rows.map(r => (
          <SpecialistPipelineRow key={r.id} row={r} expanded={expandedRow === r.id} onToggle={() => setExpandedRow(expandedRow === r.id ? null : r.id)} />
        ))
      )}
    </div>
  )
}
