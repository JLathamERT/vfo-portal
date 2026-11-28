import { useState } from 'react'
import { useIsPhone } from '../../lib/useMediaQuery'
import { TrackHero } from './TrackKit'
import { BackLink, DotText, ProfileCard, formInput } from './ProfileKit'
import { formatDate } from '../../lib/dates'

// Portal licensing L4 (2026-10-16, decision 41): the READ-ONLY One Page Plan —
// what a Premium client sees on their portal's My Plan tab. (The member client
// screen's copy and member_mirrored_ciq_plan_load were retired 2026-10-20 - that
// screen has a CIQ tab now.) It draws the payload of
// client_ciq_plan_load (utils/ciq-plan-view.ts):
// plans = [{ ciq_id, priorities_completed_at, items, history: [{ saved_at, items }] }],
// item = { key, label, section, detail, decision, notes, progress }.
// Same sections and wording as the member's own One Page Plan in MemberCIQ.jsx,
// which this deliberately does NOT replace — no Update Progress, no Park / Drop.
// The look matches it too (2026-11-27 house style): a hero, the round sub-tab
// pills, the three ProfileKit boxes, history rows as soft tiles.

const pillTab = (on) => ({ padding: '8px 16px', borderRadius: '99px', border: '1px solid ' + (on ? 'transparent' : 'var(--vfo-border-strong)'), background: on ? 'linear-gradient(90deg, #002973 0%, #125ecc 100%)' : 'var(--vfo-card)', color: on ? '#fff' : 'var(--vfo-ink-2)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' })
const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '11px 14px', marginBottom: '6px', background: 'var(--vfo-input)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', cursor: 'pointer' }
const PhoneChevron = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--vfo-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><polyline points="9 6 15 12 9 18" /></svg>

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
  if (items.length === 0) return <div style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>None</div>
  return items.map((item, i) => {
    const { label, section } = itemText(item)
    return (
      <div key={item.key} style={{ paddingTop: i > 0 ? '11px' : 0, paddingBottom: i < items.length - 1 ? '11px' : 0, borderTop: i > 0 ? '1px solid var(--vfo-border-soft)' : 'none' }}>
        <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{label}{item.notes ? ` — ${item.notes}` : ''}</div>
        <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{section}</div>
        {item.progress === 'in_progress' && <DotText color="#e06717" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vfo-ink)', marginTop: '6px' }}><span>In Progress</span></DotText>}
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
      <ProfileCard icon="flag" title="Immediate Priorities" sub="We will begin to address these priorities with immediate effect"><Items items={immediate} /></ProfileCard>
      <ProfileCard icon="lock" title="Parked Priorities" sub="We will reconsider these parked priorities at our next Partners In Planning Meeting"><Items items={parked} /></ProfileCard>
      {showCompleted && completed.length > 0 && (
        <ProfileCard icon="award" tone="green" title="Completed" sub="Priorities that have been addressed and completed"><Items items={completed} /></ProfileCard>
      )}
    </>
  )
}

export default function OnePagePlanView({ plans, title, subtitle, emptyText }) {
  const [planIdx, setPlanIdx] = useState(0)
  const [subTab, setSubTab] = useState('latest')
  const [snapshot, setSnapshot] = useState(null)
  const isPhone = useIsPhone()

  if (!plans || plans.length === 0) {
    return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)', fontSize: '14px' }}>{emptyText || 'No One Page Plan yet.'}</div>
  }
  const plan = plans[Math.min(planIdx, plans.length - 1)]

  return (
    <div>
      {/* The title: the hero on a computer; on a phone a plain heading (a card
          holding only a title is a card for one value). */}
      {title !== '' && (isPhone ? (
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-heading)', lineHeight: 1.2, marginBottom: '14px' }}>
          {title || 'One Page Plan'}{subtitle && <span style={{ fontSize: '14px', fontWeight: 500, letterSpacing: 0, color: 'var(--vfo-muted)' }}> {subtitle}</span>}
        </div>
      ) : (
        <TrackHero title={<>{title || 'One Page Plan'}{subtitle && <span style={{ fontSize: '14px', fontWeight: 500, letterSpacing: 0, color: 'var(--vfo-muted)' }}> {subtitle}</span>}</>} />
      ))}
      {plans.length > 1 && (
        <select value={planIdx} onChange={e => { setPlanIdx(Number(e.target.value)); setSubTab('latest'); setSnapshot(null) }}
          style={{ ...formInput, width: 'auto', maxWidth: '100%', marginBottom: '14px' }}>
          {plans.map((p, i) => <option key={p.ciq_id} value={i}>Plan completed {formatDate(p.priorities_completed_at)}</option>)}
        </select>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <button onClick={() => { setSubTab('latest'); setSnapshot(null) }} style={pillTab(subTab === 'latest')}>Latest Version</button>
        <button onClick={() => setSubTab('history')} style={pillTab(subTab === 'history')}>History</button>
      </div>

      {subTab === 'latest' && (
        <div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '14px' }}>Plan Completed on {formatDate(plan.priorities_completed_at)}</div>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: '1.8', marginBottom: '18px' }}>
            Having completed: Client Information Questionnaire to identify areas of interest, and Prioritization Process to determine immediate / later areas of focus.
          </div>
          <PlanSections items={plan.items} showCompleted />
        </div>
      )}

      {subTab === 'history' && (
        snapshot ? (
          <div>
            <BackLink onClick={() => setSnapshot(null)}>Back to list</BackLink>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '16px' }}>Version from {formatDate(snapshot.saved_at)}</div>
            <PlanSections items={snapshot.items} showCompleted={false} />
          </div>
        ) : (
          plan.history.length === 0
            ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)' }}>No earlier versions yet.</div>
            : plan.history.map((snap, i) => (
              <div key={`${snap.saved_at}-${i}`} onClick={() => setSnapshot(snap)} style={rowStyle}>
                <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{formatDate(snap.saved_at)} at {String(snap.saved_at || '').split('T')[1]?.substring(0, 5)}</div>
                {isPhone ? <PhoneChevron /> : <span style={{ color: 'var(--vfo-link)', fontWeight: 600, fontSize: '12px' }}>View →</span>}
              </div>
            ))
        )
      )}
    </div>
  )
}
