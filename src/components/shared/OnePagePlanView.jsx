import { useState } from 'react'

// Portal licensing L4 (2026-10-16, decision 41): the READ-ONLY One Page Plan —
// what a Premium client sees on their portal's My Plan tab. (The member client
// screen's copy and member_mirrored_ciq_plan_load were retired 2026-10-20 - that
// screen has a CIQ tab now.) It draws the payload of
// client_ciq_plan_load (utils/ciq-plan-view.ts):
// plans = [{ ciq_id, priorities_completed_at, items, history: [{ saved_at, items }] }],
// item = { key, label, section, detail, decision, notes, progress }.
// Same sections and wording as the member's own One Page Plan in MemberCIQ.jsx,
// which this deliberately does NOT replace — no Update Progress, no Park / Drop.

const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
const subTabStyle = active => ({ padding: '8px 20px', borderRadius: '6px', border: active ? '1px solid #0095ff' : '1px solid var(--vfo-border)', background: active ? 'rgba(0,149,255,0.15)' : 'transparent', color: active ? 'var(--vfo-ink)' : 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' })

function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${m}/${d}/${y}`
}

function itemText(item) {
  const isOther = item.key?.includes('other_focus')
  const bizMatch = item.section?.match(/Business Advisory — (.+)/)
  const mainText = isOther ? (item.detail || item.label) : item.label
  return {
    label: bizMatch ? `${mainText} — ${bizMatch[1]}` : mainText,
    section: bizMatch ? 'Business Advisory' : item.section,
  }
}

function Items({ items }) {
  if (items.length === 0) return <div style={{ color: 'var(--vfo-muted)', fontSize: '14px', padding: '12px 0' }}>None</div>
  return items.map(item => {
    const { label, section } = itemText(item)
    return (
      <div key={item.key} style={{ padding: '10px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
        <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{label}{item.notes ? ` — ${item.notes}` : ''}</div>
        <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{section}</div>
        {item.progress === 'in_progress' && <div style={{ fontSize: '11px', color: '#e06717', fontWeight: 600, marginTop: '4px' }}>In Progress</div>}
      </div>
    )
  })
}

function PlanSections({ items, showCompleted }) {
  const immediate = items.filter(p => p.decision === 'prioritize' && p.progress !== 'completed')
  const parked = items.filter(p => p.decision === 'park')
  const completed = items.filter(p => p.decision === 'prioritize' && p.progress === 'completed')
  return (
    <>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--vfo-heading)', marginBottom: '2px' }}>Immediate Priorities</div>
        <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontStyle: 'italic', marginBottom: '12px' }}>We will begin to address these priorities with immediate effect</div>
        <div style={sectionStyle}><Items items={immediate} /></div>
      </div>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--vfo-heading)', marginBottom: '2px' }}>Parked Priorities</div>
        <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontStyle: 'italic', marginBottom: '12px' }}>We will reconsider these parked priorities at our next Partners In Planning Meeting</div>
        <div style={sectionStyle}><Items items={parked} /></div>
      </div>
      {showCompleted && completed.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--vfo-success-text)', marginBottom: '2px' }}>Completed</div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontStyle: 'italic', marginBottom: '12px' }}>Priorities that have been addressed and completed</div>
          <div style={sectionStyle}><Items items={completed} /></div>
        </div>
      )}
    </>
  )
}

export default function OnePagePlanView({ plans, title, subtitle, emptyText }) {
  const [planIdx, setPlanIdx] = useState(0)
  const [subTab, setSubTab] = useState('latest')
  const [snapshot, setSnapshot] = useState(null)

  if (!plans || plans.length === 0) {
    return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)', fontSize: '14px' }}>{emptyText || 'No One Page Plan yet.'}</div>
  }
  const plan = plans[Math.min(planIdx, plans.length - 1)]

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        {title !== '' && <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--vfo-ink)' }}>{title || 'One Page Plan'}{subtitle && <span style={{ fontSize: '14px', fontWeight: '400', color: 'var(--vfo-muted)' }}> {subtitle}</span>}</div>}
        {plans.length > 1 && (
          <select value={planIdx} onChange={e => { setPlanIdx(Number(e.target.value)); setSubTab('latest'); setSnapshot(null) }}
            style={{ marginTop: '10px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif' }}>
            {plans.map((p, i) => <option key={p.ciq_id} value={i}>Plan completed {fmtDate(p.priorities_completed_at)}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px' }}>
        <button onClick={() => { setSubTab('latest'); setSnapshot(null) }} style={subTabStyle(subTab === 'latest')}>Latest Version</button>
        <button onClick={() => setSubTab('history')} style={subTabStyle(subTab === 'history')}>History</button>
      </div>

      {subTab === 'latest' && (
        <div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '12px' }}>Plan Completed on {fmtDate(plan.priorities_completed_at)}</div>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: '1.8', marginBottom: '24px', paddingLeft: '4px' }}>
            Having completed: Client Information Questionnaire to identify areas of interest, and Prioritization Process to determine immediate / later areas of focus.
          </div>
          <PlanSections items={plan.items} showCompleted />
        </div>
      )}

      {subTab === 'history' && (
        snapshot ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>Version from {fmtDate(snapshot.saved_at)}</div>
              <button onClick={() => setSnapshot(null)} style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '12px', cursor: 'pointer' }}>← Back to list</button>
            </div>
            <PlanSections items={snapshot.items} showCompleted={false} />
          </div>
        ) : (
          plan.history.length === 0
            ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)' }}>No earlier versions yet.</div>
            : plan.history.map((snap, i) => (
              <div key={`${snap.saved_at}-${i}`} onClick={() => setSnapshot(snap)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', marginBottom: '4px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '8px', cursor: 'pointer' }}>
                <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{fmtDate(snap.saved_at)} at {String(snap.saved_at || '').split('T')[1]?.substring(0, 5)}</div>
                <span style={{ color: '#0095ff', fontWeight: 600, fontSize: '12px' }}>View →</span>
              </div>
            ))
        )
      )}
    </div>
  )
}
