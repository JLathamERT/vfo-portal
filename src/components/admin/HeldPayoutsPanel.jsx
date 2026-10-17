import { useState, useLayoutEffect } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { money } from './specialistRevenueShared'
import { AccountingTableSkeleton } from '../shared/Skeleton'
import { useNavigate } from 'react-router-dom'
import { MemberNameLink, ClientNameLink, clientPagePath } from '../shared/personLinks'

// Accounting > ... > "Held - No Payout Account" (one per engine: Holistic, Tax,
// PIP, VFO Specialist Revenue). Member revenue shares the payout engine could not
// transfer because the member has no usable Stripe payout account. The member is
// emailed automatically when a share is first held (with everything waiting for
// them), reminded after 2 business days, and Tracy is asked to chase after 4; each
// share pays itself on the nightly sweep once they connect and moves to Released.

const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}

const hoverRowProps = {
  onMouseEnter: e => { e.currentTarget.style.background = 'var(--vfo-tint)' },
  onMouseLeave: e => { e.currentTarget.style.background = 'var(--vfo-card)' },
}

function emailedNote(r) {
  if (!r.asked_at) return { text: 'Not emailed', tone: 'var(--vfo-faint)' }
  const parts = [r.asked_by_hand ? `Setup link sent by hand ${fmtDate(r.asked_at)}` : `Emailed ${fmtDate(r.asked_at)}`]
  if (r.reminded_at) parts.push(`reminded ${fmtDate(r.reminded_at)}`)
  if (r.tracy_notified_at) parts.push('Tracy asked to chase')
  return { text: parts.join(' · '), tone: 'var(--vfo-muted)' }
}

function SourceCell({ r, engine }) {
  const program = engine === 'map1' || engine === 'pip' ? 1 : engine === 'tax' ? (r.program_id || undefined) : undefined
  return (
    <span>
      {r.client_id && r.client_name
        ? <>{r.source_label.split(' - ')[0]} - <ClientNameLink clientId={r.client_id} program={program}>{r.client_name}</ClientNameLink></>
        : r.source_label}
      {r.detail && <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{r.detail}</div>}
      {r.sandbox && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', background: 'rgba(224,103,23,0.14)', color: '#e06717' }}>Sandbox</span>}
    </span>
  )
}

export default function HeldPayoutsPanel({ engine, embedded = false }) {
  const navigate = useNavigate()
  // A row opens the client's plan / track the held money came from (Client
  // Overview's rule; the client's NAME opens their profile). SpecRev has no client.
  const TAB_BY_ENGINE = { map1: 'map1', tax: 'tax', pip: 'pip' }
  const rowProps = (r) => (r.client_id && TAB_BY_ENGINE[engine]
    ? { onClick: () => navigate(clientPagePath(r.client_id, { program: engine === 'tax' ? r.program_id || undefined : 1, tab: TAB_BY_ENGINE[engine] })), title: 'Open plan', ...hoverRowProps }
    : {})
  const snapKey = `heldpayouts:${engine}:`
  const [data, setData] = useState({ open: [], released: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showReleased, setShowReleased] = useState(false)

  useLayoutEffect(() => {
    const snap = getLastSeen(snapKey)
    if (snap) { setData({ open: snap.open || [], released: snap.released || [] }); setLoading(false) }
    load(!!snap)
  }, [engine])

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const res = await callApi('member_held_shares_load', { engine })
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      setData({ open: res.open || [], released: res.released || [] })
      setLastSeen(snapKey, res)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1150px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }
  const grid = '100px 1fr 1.4fr 130px 1.7fr'
  const head = { display: 'grid', gridTemplateColumns: grid, gap: '18px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }
  const row = { display: 'grid', gridTemplateColumns: grid, gap: '18px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)' }
  const card = { border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', overflow: 'hidden', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }
  const openTotal = data.open.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <button onClick={load} style={{ ...sel, color: 'var(--vfo-accent-text)', fontWeight: 600 }}>Refresh</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--vfo-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showReleased} onChange={e => setShowReleased(e.target.checked)} style={{ accentColor: 'var(--vfo-primary)' }} />
          Show released (last 180 days)
        </label>
      </div>

      {loading && <AccountingTableSkeleton cols={5} />}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}
      {!loading && !error && (
        <div style={card}>
          <div style={head}>
            <span>Held Since</span><span>Member</span><span>From</span><span style={{ textAlign: 'right' }}>Amount</span><span>Member Emailed</span>
          </div>
          <div style={{ ...row, borderBottom: '2px solid var(--vfo-border)', background: 'var(--vfo-input)', fontWeight: 800, color: 'var(--vfo-heading)' }}>
            <span />
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>Total Waiting</span>
            <span />
            <span style={{ textAlign: 'right' }}>{money(openTotal)}</span>
            <span />
          </div>
          {data.open.map(r => {
            const note = emailedNote(r)
            return (
              <div key={r.id} style={{ ...row, cursor: r.client_id && TAB_BY_ENGINE[engine] ? 'pointer' : undefined }} {...rowProps(r)}>
                <span style={{ color: 'var(--vfo-muted)' }}>{fmtDate(r.held_at)}</span>
                <span><MemberNameLink memberNumber={r.member_number} style={{ fontWeight: 600 }}>{r.member_name}</MemberNameLink><span style={{ color: 'var(--vfo-muted)' }}> · {r.member_number}</span></span>
                <SourceCell r={r} engine={engine} />
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{money(r.amount)}</span>
                <span style={{ fontSize: '12px', color: note.tone }}>{note.text}</span>
              </div>
            )
          })}
          {data.open.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No member shares are waiting on payout setup.</div>}
        </div>
      )}

      {!loading && !error && showReleased && (
        <div style={{ ...card, marginTop: '18px' }}>
          <div style={head}>
            <span>Released</span><span>Member</span><span>From</span><span style={{ textAlign: 'right' }}>Amount</span><span>Outcome</span>
          </div>
          {data.released.map(r => (
            <div key={r.id} style={{ ...row, cursor: r.client_id && TAB_BY_ENGINE[engine] ? 'pointer' : undefined }} {...rowProps(r)}>
              <span style={{ color: 'var(--vfo-muted)' }}>{fmtDate(r.released_at)}</span>
              <span><MemberNameLink memberNumber={r.member_number} style={{ fontWeight: 600 }}>{r.member_name}</MemberNameLink><span style={{ color: 'var(--vfo-muted)' }}> · {r.member_number}</span></span>
              <SourceCell r={r} engine={engine} />
              <span style={{ textAlign: 'right', fontWeight: 700 }}>{money(r.amount)}</span>
              <span style={{ fontSize: '12px', color: r.release_reason === 'paid' ? 'var(--vfo-success-text)' : 'var(--vfo-muted)' }}>{r.release_reason === 'paid' ? 'Paid' : (r.release_reason || '—')} · held {fmtDate(r.held_at)}</span>
            </div>
          ))}
          {data.released.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--vfo-faint)', fontSize: '14px' }}>Nothing released in the last 180 days.</div>}
        </div>
      )}

      <p style={{ fontSize: '11.5px', color: 'var(--vfo-faint)', marginTop: '12px' }}>Member revenue shares held because the member has no usable Stripe payout account. The member is emailed automatically when a share is first held (listing everything waiting for them), reminded after 2 business days, and Tracy is asked to follow up after 4. Each share pays automatically on the nightly sweep once they finish payout setup.</p>
    </div>
  )
}
