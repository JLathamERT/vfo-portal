import { useEffect, useState, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { StepCard, Detail, Badge, Pending, SubBlock, fmtDate, PanelHero, EmptyState } from './automation/StepKit'
import SandboxModeToggle from './SandboxModeToggle'
import { AutomationTrackerSkeleton } from '../shared/Skeleton'

// Which button the client clicked, mapped to human labels.
const DECISION_RESPONSE = { vfo_ft: 'VFO Fast Track', vfo_associate: 'VFO Associate', no: 'No Thank You' }
const FT_RESPONSE = { confirm: 'Confirm onboarding — no further meeting', another_meeting: "I'd like another meeting" }

const DECLINE_STATUSES = ['Meeting declined', 'Declined by Member', 'Declined by ERT/VFOS']

function meetingColor(status) {
  if (!status) return 'var(--vfo-muted)'
  if (DECLINE_STATUSES.includes(status)) return '#e74c3c'
  return '#0d9488'
}

function meetingCardStatus(cell) {
  if (!cell?.status) return 'pending'
  return DECLINE_STATUSES.includes(cell.status) ? 'declined' : 'sent'
}

// Overall per-client stage badge (furthest point reached).
function pftStage(row) {
  if (row.onboarding) return { label: `Onboarding · ${row.onboarding.stage}`, color: '#16a34a' }
  const dec = row.decision_step?.status
  if (dec === 'No confirmed') return { label: 'Declined', color: '#e74c3c' }
  if (dec === 'VFO FT confirmed') return { label: 'VFO Fast Track', color: '#16a34a' }
  if (dec === 'VFO Associate confirmed') return { label: 'VFO Associate', color: '#16a34a' }
  const eng = row.engagement || {}
  if (dec === 'Undecided - awaiting client' || (eng.decision_email_sent_at && !eng.decision_response)) {
    return { label: 'Awaiting Decision', color: '#0095ff' }
  }
  if (eng.ft_email_sent_at && !eng.ft_response) return { label: 'Awaiting Client', color: '#0095ff' }
  const furthest = row.meeting3 || row.meeting2 || row.meeting1
  if (furthest && DECLINE_STATUSES.includes(furthest.status)) return { label: 'Declined', color: '#e74c3c' }
  if (row.meeting1 || row.meeting2 || row.meeting3) return { label: 'In Meetings', color: '#e06717' }
  return { label: 'Started', color: 'var(--vfo-muted)' }
}

function MeetingCard({ title, cell }) {
  return (
    <StepCard title={title} status={meetingCardStatus(cell)}>
      {cell?.status ? (
        <SubBlock label="Selected & sent">
          <Detail l="Outcome" v={<Badge text={cell.status} color={meetingColor(cell.status)} />} showEmpty />
          <Detail l="Date" v={fmtDate(cell.date)} />
        </SubBlock>
      ) : <Pending />}
    </StepCard>
  )
}

function PftPipelineRow({ row, expanded, onToggle, navigate }) {
  const name = `${row.first_name} ${row.last_name}`.trim() || 'Unknown'
  const stage = pftStage(row)
  const eng = row.engagement || {}
  const decEmailSent = !!eng.decision_email_sent_at
  const decResp = eng.decision_response
  const ftEmailSent = !!eng.ft_email_sent_at
  const ftResp = eng.ft_response

  const discoveryStatus = eng.discovery_submitted_at ? 'done' : eng.discovery_email_sent_at ? 'awaiting' : (row.meeting2 ? 'pending' : 'pending')
  const decStatus = row.decision_step?.status === 'No confirmed' ? 'declined'
    : (row.decision_step?.status === 'VFO FT confirmed' || row.decision_step?.status === 'VFO Associate confirmed') ? 'done'
    : (decEmailSent && !decResp) ? 'awaiting'
    : (decEmailSent || row.decision_step?.status) ? 'sent' : 'pending'
  const ftStatus = ftResp ? 'done' : ftEmailSent ? 'awaiting' : 'pending'

  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '15px', fontWeight: '600', color: 'var(--vfo-ink)' }}>{name}</span>
          {row.member_number && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontFamily: 'monospace' }}>#{row.member_number}</span>}
          {row.assigned_pf && <Badge text={`PF: ${row.assigned_pf}`} color="#0095ff" />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Badge text={stage.label} color={stage.color} />
          <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: expanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '12px 18px 16px', borderTop: '1px solid var(--vfo-border-soft)', background: 'var(--vfo-tint)' }}>
          {row.tracking_owner === 'Member' && <MeetingCard title="Meeting 1 confirmation email" cell={row.meeting1} />}

          <StepCard title="Meeting 2 confirmation email + Discovery form" status={meetingCardStatus(row.meeting2)}>
            {row.meeting2?.status ? (
              <SubBlock label="Selected & sent">
                <Detail l="Outcome" v={<Badge text={row.meeting2.status} color={meetingColor(row.meeting2.status)} />} showEmpty />
                <Detail l="Date" v={fmtDate(row.meeting2.date)} />
              </SubBlock>
            ) : <Pending />}
            {(eng.discovery_email_sent_at || eng.discovery_submitted_at) && (
              <SubBlock label="Discovery form">
                <Detail l="Form emailed" v={fmtDate(eng.discovery_email_sent_at)} />
                <Detail l="Client submitted" v={fmtDate(eng.discovery_submitted_at)} showEmpty />
                <Detail l="2-business-day reminder sent" v={fmtDate(eng.discovery_reminder_sent_at)} />
                <Detail l="4-business-day PF notified" v={fmtDate(eng.discovery_pf_notified_at)} />
              </SubBlock>
            )}
          </StepCard>

          {row.meeting3 && <MeetingCard title="Meeting 3 confirmation email" cell={row.meeting3} />}

          <StepCard title="Decision email" status={decStatus}>
            {(row.decision_step?.status || decEmailSent) ? (
              <>
                <SubBlock label="Admin selected">
                  <Detail l="Decision" v={<Badge text={row.decision_step?.status} />} showEmpty />
                  <Detail l="Recorded" v={fmtDate(row.decision_step?.date)} />
                </SubBlock>
                {decEmailSent && (
                  <SubBlock label="Undecided email — client buttons">
                    <Detail l="Email sent" v={fmtDate(eng.decision_email_sent_at)} />
                    <Detail l="Button clicked" v={decResp ? <Badge text={DECISION_RESPONSE[decResp] || decResp} color={decResp === 'no' ? '#e74c3c' : '#16a34a'} /> : null} />
                    <Detail l="Clicked at" v={fmtDate(eng.decision_response_at)} />
                    <Detail l="2-business-day reminder sent" v={fmtDate(eng.decision_reminder_sent_at)} />
                    <Detail l="4-business-day PF notified" v={fmtDate(eng.decision_pf_notified_at)} />
                  </SubBlock>
                )}
              </>
            ) : <Pending />}
          </StepCard>

          <StepCard title="FT follow-up email" status={ftStatus}>
            {ftEmailSent ? (
              <SubBlock label="Follow-up email — client buttons">
                <Detail l="Email sent" v={fmtDate(eng.ft_email_sent_at)} />
                <Detail l="Button clicked" v={ftResp ? <Badge text={FT_RESPONSE[ftResp] || ftResp} color={ftResp === 'confirm' ? '#16a34a' : '#0095ff'} /> : null} />
                <Detail l="Clicked at" v={fmtDate(eng.ft_response_at)} />
                <Detail l="2-business-day reminder sent" v={fmtDate(eng.ft_reminder_sent_at)} />
                <Detail l="4-business-day PF notified" v={fmtDate(eng.ft_pf_notified_at)} />
              </SubBlock>
            ) : <Pending />}
          </StepCard>

          <StepCard title="Accountant Onboarding handoff" status={row.onboarding ? 'done' : 'pending'}>
            {row.onboarding ? (
              <>
                <Detail l="Stage" v={<Badge text={row.onboarding.stage} color="#16a34a" />} showEmpty />
                <Detail l="Member number" v={row.onboarding.member_number} mono />
                <div style={{ marginTop: '8px' }}>
                  <button
                    onClick={() => { sessionStorage.setItem('accountantOnboardingOpenId', String(row.onboarding.id)); navigate('/admin?tab=accountants&section=accountant_onboarding') }}
                    style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600 }}
                  >View onboarding →</button>
                </div>
              </>
            ) : <Pending text="Not handed off (no VFO FT / VFO Associate decision yet)" />}
          </StepCard>

          <div style={{ marginTop: '10px', fontSize: '10px', color: 'var(--vfo-faint)' }}>
            Client #{row.client_id} · {row.email || 'no email'}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PFTAutomationPanel() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [sandboxConfig, setSandboxConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)

  // Re-open draws the last pipeline at once, refreshes behind it.
  useLayoutEffect(() => {
    const snap = getLastSeen('pftautomation:')
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
      const data = await callApi('automation_load_pft_pipelines')
      apply(data)
      setLastSeen('pftautomation:', data)
    } catch (err) { if (quiet === true) console.error(err); else setError(err.message) }
    finally { setLoading(false) }
  }

  if (loading) return <AutomationTrackerSkeleton cols={6} />

  const stats = [
    { label: 'TOTAL', value: rows.length, color: 'var(--vfo-ink)' },
    { label: 'AWAITING CLIENT', value: rows.filter(r => pftStage(r).color === '#0095ff').length, color: '#0095ff' },
    { label: 'VFO FT', value: rows.filter(r => r.decision_step?.status === 'VFO FT confirmed').length, color: '#16a34a' },
    { label: 'VFO ASSOCIATE', value: rows.filter(r => r.decision_step?.status === 'VFO Associate confirmed').length, color: '#16a34a' },
    { label: 'DECLINED', value: rows.filter(r => pftStage(r).label === 'Declined').length, color: '#e74c3c' },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <PanelHero
        eyebrow="Automation Pipeline"
        title="Partnership Fast Track"
        action={
          <SandboxModeToggle
            pipeline="PARTNERSHIP_FAST_TRACK"
            label="Partnership Fast Track"
            sandboxConfig={sandboxConfig}
            onChange={setSandboxConfig}
          />
        }
        stats={stats}
      />

      {error && <div style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

      {rows.length === 0 ? (
        <EmptyState title="No Partnership Fast Track email activity yet" hint="Accountants appear here once a PFT meeting or decision email has been sent" />
      ) : (
        rows.map(r => (
          <PftPipelineRow
            key={r.client_id}
            row={r}
            expanded={expandedRow === r.client_id}
            onToggle={() => setExpandedRow(expandedRow === r.client_id ? null : r.client_id)}
            navigate={navigate}
          />
        ))
      )}
    </div>
  )
}
