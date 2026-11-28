import { useMemo } from 'react'
import { btnSecondary, btnState } from '../../shared/buttonStyles'
import { hexA } from '../KpiKit'
import { departmentChipStyle } from './portalDepartments'
import { byReleaseThenNewest, isTask } from './backlogModel'
import { TaskTag } from './TaskBits'
import { GOLD, ReleaseImportancePill } from './BigNewsBadge'
import { formatDate } from '../../../lib/dates'

// The What's new tab (Backlog 5a, named by Paxton 2026-11-23): what is waiting
// to be announced and what has gone Live (until it is archived), each section
// newest first, as full-width announcement cards with the whole write-up so the
// team knows what to tell members. Release importance (Backlog 5b) orders each
// section Big news, Normal, Minor, and styles the cards: Big news stands out in
// gold, Minor is muted. A card opens the drawer; the buttons are superadmin-only.
export default function AnnounceTab({ requests, people, canManage, busyId, onOpen, onAnnounce, onArchive }) {
  const { ready, live } = useMemo(() => {
    const onBoard = requests.filter((r) => r.review_status === 'approved' && !r.archived_at)
    return {
      ready: onBoard.filter((r) => r.progress === 'ready_to_announce').sort(byReleaseThenNewest('ready_at')),
      live: onBoard.filter((r) => r.progress === 'live').sort(byReleaseThenNewest('live_at')),
    }
  }, [requests])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', minWidth: 0 }}>
      <Section title="Ready to announce" count={ready.length} empty="Nothing waiting to be announced.">
        {ready.map((r) => (
          <AnnouncementCard key={r.id} request={r} people={people} onOpen={onOpen} section="ready"
            action={canManage ? <button style={btnState(btnSecondary, busyId === r.id)} disabled={busyId === r.id} onClick={() => onAnnounce(r)}>Mark as announced</button> : null} />
        ))}
      </Section>
      <Section title="Live" count={live.length} empty="Nothing live yet.">
        {live.map((r) => (
          <AnnouncementCard key={r.id} request={r} people={people} onOpen={onOpen} section="live"
            action={canManage ? <button style={btnState(btnSecondary, busyId === r.id)} disabled={busyId === r.id} onClick={() => onArchive(r)}>Archive</button> : null} />
        ))}
      </Section>
    </div>
  )
}

function Section({ title, count, empty, children }) {
  return (
    <section style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{title}</h3>
        <span style={{ fontSize: '12px', fontWeight: 700, padding: '1px 9px', borderRadius: '999px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{count}</span>
      </div>
      {count === 0
        ? <div style={{ fontSize: '13px', color: 'var(--vfo-faint)', padding: '14px 16px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px' }}>{empty}</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{children}</div>}
    </section>
  )
}

const isoDay = (ts) => (ts ? formatDate(String(ts).slice(0, 10), '–') : null)

function AnnouncementCard({ request: r, people, onOpen, section, action }) {
  const level = r.release_importance || 'normal'
  const big = level === 'big'
  const minor = level === 'minor'
  const doneBy = r.assignee_admin_id != null ? (people[r.assignee_admin_id] || 'a former admin') : null
  const writeup = String(r.announcement || '').trim()

  const meta = []
  if (section === 'ready') {
    if (doneBy) meta.push(`Done by ${doneBy}`)
    if (r.ready_at) meta.push(`Ready since ${isoDay(r.ready_at)}`)
  } else {
    if (r.live_at) meta.push(`Live ${isoDay(r.live_at)}`)
    if (doneBy) meta.push(`Done by ${doneBy}`)
  }
  if (r.announced_on) meta.push(`Announced ${formatDate(r.announced_on, '–')}`)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(r)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r) }}
      style={{
        display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap', cursor: 'pointer', minWidth: 0,
        padding: big ? '17px 19px' : '16px 18px', borderRadius: '14px',
        background: big ? `linear-gradient(${hexA(GOLD, 0.06)}, ${hexA(GOLD, 0.06)}), var(--vfo-card)` : 'var(--vfo-card)',
        border: big ? `2px solid ${GOLD}` : '1px solid var(--vfo-border-soft)',
        boxShadow: minor ? 'none' : 'var(--vfo-shadow-card)',
      }}>
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '6px' }}>
          {isTask(r) && <TaskTag />}
          <ReleaseImportancePill request={r} />
        </div>
        <div style={{ fontSize: big ? '18px' : '16px', fontWeight: 700, color: minor ? 'var(--vfo-muted)' : 'var(--vfo-ink)', lineHeight: 1.35, letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>
          {r.title}
        </div>
        {(r.departments || []).length > 0 && (
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '8px', opacity: minor ? 0.75 : 1 }}>
            {r.departments.map((d) => <span key={d} style={departmentChipStyle(d)}>{d}</span>)}
          </div>
        )}
        {writeup ? (
          <div style={{ fontSize: minor ? '13px' : '14px', color: minor ? 'var(--vfo-muted)' : 'var(--vfo-ink)', lineHeight: 1.6, marginTop: '10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {writeup}
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: 'var(--vfo-faint)', fontStyle: 'italic', marginTop: '10px' }}>No write-up — minor change.</div>
        )}
        {meta.length > 0 && (
          <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', fontWeight: 600, marginTop: '10px', overflowWrap: 'anywhere' }}>{meta.join(' · ')}</div>
        )}
        {r.announce_note && (
          <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '3px', overflowWrap: 'anywhere' }}>{r.announce_note}</div>
        )}
      </div>
      {action && <div onClick={(e) => e.stopPropagation()} style={{ flex: '0 0 auto' }}>{action}</div>}
    </div>
  )
}
