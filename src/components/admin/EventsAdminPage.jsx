import { useLayoutEffect, useState } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { eventDatesText } from '../../lib/events'
import { PORTAL_URL } from '../../lib/environment'
import CopyLink from '../shared/CopyLink'
import { SearchFilterSkeleton, TableSkeleton } from '../shared/Skeleton'
import MemberEvents from '../member/MemberEvents'
import EventAttendeesTable, { EVENT_GRID, EVENT_MIN_WIDTH } from './EventAttendeesTable'
import EventPurchasesTable from './EventPurchasesTable'
import EventCheckIn from './EventCheckIn'

// More > Events (2026-11-25), open to every admin. The page and its sub-tab pills are
// format-identical to the Growth Credits page (GrowthCreditsRedemptionsPage.jsx).
// Sub-tabs: Attendees (one row per person coming, and the export), Purchases (one row
// per payment: the money, who a public buyer is, refunds), Check-in and Member preview
// (what a paying or a complimentary member sees on their Events tab).

const PUBLIC_PAGE = `${PORTAL_URL}/events`
const NAVY = '#002973'
const BLUE = '#125ecc'
const SUBTABS = [
  { key: 'attendees', label: 'Attendees' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'checkin', label: 'Check-in' },
  { key: 'preview', label: 'Member preview' },
]

export default function EventsAdminPage() {
  const [section, setSection] = useState('attendees')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [previewAs, setPreviewAs] = useState('paying')

  useLayoutEffect(() => {
    const snap = getLastSeen('eventsadmin')
    if (snap) setData(snap)
    load(!!snap)
  }, [])

  async function load(quiet = false) {
    try {
      const res = await callApi('events_admin_load')
      setData(res)
      setLastSeen('eventsadmin', res)
      setError('')
    } catch (e) { if (quiet === true) console.error(e); else setError(e?.message || 'Failed to load the event') }
  }
  function done(msg) {
    if (msg) { setFlash(msg); setTimeout(() => setFlash(''), 6000) }
    return load(true)
  }

  const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '22px', marginBottom: '18px' }
  const pill = (on) => ({ padding: '8px 16px', borderRadius: '99px', border: '1px solid ' + (on ? 'transparent' : 'var(--vfo-border-strong)'), background: on ? `linear-gradient(90deg, ${NAVY} 0%, ${BLUE} 100%)` : 'var(--vfo-card)', color: on ? '#fff' : 'var(--vfo-ink-2)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' })
  const miniTab = (on) => ({ padding: '7px 14px', borderRadius: '8px', border: '1px solid ' + (on ? BLUE : 'var(--vfo-border-strong)'), background: on ? 'rgba(18,94,204,0.1)' : 'var(--vfo-card)', color: on ? 'var(--vfo-accent-text)' : 'var(--vfo-muted)', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' })
  const event = data?.event

  return (
    <div style={{ padding: '24px', maxWidth: '1500px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <div style={card}>
        <p style={{ fontSize: '10.5px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 4px' }}>Admin</p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>Events</h2>
          {event && <span style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>{event.name} · {eventDatesText(event)}{event.location ? ` · ${event.location}` : ''}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '10px', fontSize: '13px', color: 'var(--vfo-muted)' }}>
          <span>Public page:</span>
          <CopyLink url={PUBLIC_PAGE} label={PUBLIC_PAGE.replace('https://', '')} />
          <a href={PUBLIC_PAGE} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--vfo-link)', fontWeight: 600, textDecoration: 'none' }}>Open</a>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {SUBTABS.map(t => <button key={t.key} type="button" onClick={() => setSection(t.key)} style={pill(section === t.key)}>{t.label}</button>)}
      </div>

      {flash && <div role="status" style={{ background: 'var(--vfo-accent-tint)', border: '1px solid var(--vfo-border-mid)', color: 'var(--vfo-accent-text)', borderRadius: '12px', padding: '12px 16px', fontSize: '13px', marginBottom: '14px' }}>{flash}</div>}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

      {!data && !error && <><SearchFilterSkeleton boxes={[84, 150]} /><TableSkeleton cols={EVENT_GRID} rows={6} minWidth={EVENT_MIN_WIDTH} pad="11px 18px" twoLine /></>}
      {data && !event && <div style={{ ...card, textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '13px' }}>No event has been set up yet.</div>}

      {event && section === 'attendees' && <EventAttendeesTable data={data} onOpenPurchases={() => setSection('purchases')} />}
      {event && section === 'purchases' && <EventPurchasesTable data={data} onDone={done} />}
      {event && section === 'checkin' && <EventCheckIn rows={data.rows} onDone={done} />}
      {event && section === 'preview' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
            <button type="button" onClick={() => setPreviewAs('paying')} style={miniTab(previewAs === 'paying')}>Member who pays</button>
            <button type="button" onClick={() => setPreviewAs('complimentary')} style={miniTab(previewAs === 'complimentary')}>Member who comes free</button>
            <span style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginLeft: '6px' }}>What a member sees, on made-up details. Nothing here can be saved or bought.</span>
          </div>
          <div style={{ maxWidth: '980px', margin: '0 auto' }}>
            <MemberEvents key={previewAs} preview={previewAs} previewEvent={event} />
          </div>
        </>
      )}
    </div>
  )
}
