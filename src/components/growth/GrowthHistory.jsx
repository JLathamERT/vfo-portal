import { useState, useEffect } from 'react'
import { callApi } from '../../lib/api'
import { TrackHero } from '../shared/TrackKit'
import { INK, MUTED, BLUE, rowRule } from './ui'
import { ProfileCard } from '../shared/ProfileKit'
import { Skeleton, SkeletonText, HeroSkeleton, ProfileCardSkeleton } from '../shared/Skeleton'
import { formatDateTime, formatDate } from '../../lib/dates'

const EVENT_LABEL = {
  scored: 'Plan scored',
  summary_updated: 'Summary score updated',
  actions_edited: 'Possible actions edited',
  prioritized: 'Priorities updated',
  plan_built: 'One-page plan built',
  parking_moved: 'Parking Garage updated',
  progress_set: 'Progress updated',
  accountability_on: 'Accountability Mode turned on',
  accountability_off: 'Accountability Mode turned off',
  due_date_set: 'Due dates set',
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—' }
function detailSummary(h) {
  const d = h.detail || {}
  if (h.event === 'scored' && d.composite != null) return ` — score ${d.composite}`
  if (d.count != null) return ` — ${d.count} ${d.count === 1 ? 'item' : 'items'}`
  return ''
}

export default function GrowthHistory({ memberNumber, onNavigate }) {
  const [history, setHistory] = useState([])
  const [archived, setArchived] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      callApi('growth_plan_load_audit', { member_number: memberNumber }),
      callApi('growth_plan_load_history', { member_number: memberNumber }),
    ]).then(([a, h]) => {
      if (!alive) return
      setHistory(a?.history || [])
      setArchived(h?.scores || [])
      setError('')
    }).catch(e => { if (alive) setError(e?.message || 'Failed to load history') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [memberNumber])

  if (loading) return (
    <div>
      <HeroSkeleton />
      {[0, 1].map(c => (
        <ProfileCardSkeleton key={c} titleWidth={c ? 110 : 120}>
          {[0, 1, 2].map(i => <div key={i} style={{ padding: '11px 0', borderTop: i ? '1px solid var(--vfo-border-soft)' : 'none' }}><Skeleton width={i % 2 ? '40%' : '55%'} height={13} /><Skeleton width={200} height={10} style={{ marginTop: '6px' }} /></div>)}
        </ProfileCardSkeleton>
      ))}
    </div>
  )
  if (error) return <GpMsg text={error} />

  return (
    <div>
      <TrackHero eyebrow="Growth Plan" title="Growth History" meta={<>Every change to this growth plan, newest first.</>} />

      <ProfileCard icon="history" title="Activity Log" bodyStyle={history.length ? { paddingTop: '4px', paddingBottom: '4px' } : undefined}>
        {history.length === 0
          ? <div style={emptyText}>No activity recorded yet.</div>
          : history.map((h, i) => <HistoryRow key={h.id} h={h} i={i} />)}
      </ProfileCard>

      <ProfileCard icon="layers" title="Past Plans" bodyStyle={archived.length ? { paddingTop: '2px', paddingBottom: '2px' } : undefined}>
        {archived.length === 0
          ? <div style={emptyText}>No archived plans yet — re-scoring archives the previous plan here.</div>
          : archived.map((s, i) => <ArchivedRow key={s.id} s={s} i={i} memberNumber={memberNumber} />)}
      </ProfileCard>
    </div>
  )
}

function HistoryRow({ h, i }) {
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '11px 0', ...rowRule(i) }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: BLUE, flexShrink: 0, marginTop: '6px' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{EVENT_LABEL[h.event] || h.event}{detailSummary(h)}</div>
        <div style={{ fontSize: '11.5px', color: MUTED, marginTop: '3px' }}>
          {formatDateTime(h.created_at)} · {h.actor_name || 'Unknown'}<RoleText role={h.actor_role} />
        </div>
      </div>
    </div>
  )
}

// Who made the change, as plain text: every row has one, so it is not a tag
// (TEAM_RULES section 9, tags are rare).
function RoleText({ role }) {
  return <span> · {role === 'member' ? 'Member' : 'Admin'}</span>
}

function ArchivedRow({ s, i, memberNumber }) {
  const [open, setOpen] = useState(false)
  const [snap, setSnap] = useState(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && !snap) {
      setLoading(true)
      try { const res = await callApi('growth_plan_load', { member_number: memberNumber, score_id: s.id }); setSnap(res) }
      catch { setSnap({ actions: [] }) }
      finally { setLoading(false) }
    }
  }

  const onePage = (snap?.actions || []).filter(a => a.g3_status === 'one_page_plan').sort((a, b) => a.action_number - b.action_number)

  return (
    <div style={rowRule(i)}>
      <button onClick={toggle} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{formatDate(s.completed_at || s.created_at)}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '12px', color: MUTED }}>Score <strong style={{ color: 'var(--vfo-heading)' }}>{s.composite_score ?? 'N/A'}</strong></span>
          <span style={{ color: MUTED, fontSize: '11px' }}>{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 0 14px' }}>
          {loading ? <SkeletonText lines={3} /> : (
            onePage.length === 0
              ? <div style={emptyText}>No one-page items in this plan.</div>
              : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '440px' }}>
                    <thead><tr><th style={th(34)}>#</th><th style={th()}>Action</th><th style={th(120)}>Owned By</th><th style={th(80)}>Value</th><th style={th(80)}>Effort</th></tr></thead>
                    <tbody>
                      {onePage.map((a, i) => (
                        <tr key={a.id}>
                          <td style={{ ...td, fontWeight: 700, color: 'var(--vfo-heading)' }}>{i + 1}</td>
                          <td style={td}>{a.action_text}</td>
                          <td style={td}>{a.owned_by || '—'}</td>
                          <td style={td}>{cap(a.value_level)}</td>
                          <td style={td}>{cap(a.effort_level)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}
        </div>
      )}
    </div>
  )
}

function GpMsg({ text }) {
  return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '14px' }}>{text}</div>
}

const emptyText = { fontSize: '12.5px', color: MUTED }
// ListTable's header row and rows.
const th = (w) => ({ textAlign: 'left', fontSize: '10px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--vfo-muted)', padding: '10px 12px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', width: w ? `${w}px` : 'auto' })
const td = { fontSize: '12.5px', color: INK, padding: '9px 12px', borderBottom: '1px solid var(--vfo-border-soft)', verticalAlign: 'top', lineHeight: 1.4 }
