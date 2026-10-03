import { useEffect, useState, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, getSession, clearSession, getLastSeen, setLastSeen } from '../lib/api'
import SpecialistVault from '../components/specialist/SpecialistVault'
import SpecialistShared from '../components/specialist/SpecialistShared'
import ChangePasswordCard from '../components/shared/ChangePasswordCard'
import AppearanceCard from '../components/shared/AppearanceCard'
import { usePortalTheme } from '../lib/theme'
import VfoWordmark from '../components/shared/VfoWordmark'
import MemberShowroom from '../components/member/MemberShowroom'
import { ShowroomSkeleton } from '../components/shared/Skeleton'

// The specialist portal: two content tabs — their own document vault, and
// "Shared with Me" (client documents the VFO team shared with them to review).
export default function SpecialistPortal() {
  const navigate = useNavigate()
  const session = getSession()
  usePortalTheme()
  const [tab, setTab] = useState(() => sessionStorage.getItem('specialistActiveTab') || 'showroom')
  const [unread, setUnread] = useState(0)
  const [showroom, setShowroom] = useState(null)
  const [loadError, setLoadError] = useState(null)

  useLayoutEffect(() => {
    if (!session || session.role !== 'specialist') { navigate('/specialist/login'); return }
    // Re-mount: draw the last showroom + badge at once, refresh behind them.
    const unreadSnap = getLastSeen(`specialistportal:unread:${session.email}`)
    if (unreadSnap) setUnread(unreadSnap.unread || 0)
    const snap = getLastSeen(`specialistportal:showroom:${session.email}`)
    if (snap) applyShowroom(snap)
    refreshUnread()
    loadShowroom(!!snap)
  }, [])

  useEffect(() => { sessionStorage.setItem('specialistActiveTab', tab) }, [tab])

  async function refreshUnread() {
    try {
      const d = await callApi('specialist_shared_unread_count', {}); setUnread(d.unread || 0)
      setLastSeen(`specialistportal:unread:${session.email}`, d)
    }
    catch { /* badge is best-effort */ }
  }

  function applyShowroom(d) {
    const eco = {}
    ;(d.ecosystems || []).forEach(e => { if (!eco[e.expert_id]) eco[e.expert_id] = []; eco[e.expert_id].push(e.name) })
    setShowroom({ experts: d.experts || [], ecoMap: eco })
  }

  async function loadShowroom(quiet) {
    try {
      setLoadError(null)
      const d = await callApi('specialist_showroom_load', {})
      applyShowroom(d)
      setLastSeen(`specialistportal:showroom:${session.email}`, d)
    } catch (err) {
      console.error('Showroom load error:', err)
      if (quiet === true) return
      setLoadError(err.message || 'Something went wrong')
      setShowroom({ experts: [], ecoMap: {} })
    }
  }

  if (!session || session.role !== 'specialist') return null

  function signOut() { clearSession(); navigate('/specialist/login') }

  const TABS = [['showroom', 'Showroom'], ['vault', 'Vault'], ['shared', 'Shared with Me']]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: 'linear-gradient(90deg, #002973 0%, #125ecc 100%)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '58px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 12px rgba(0,41,115,0.25)' }}>
        <VfoWordmark size={17} light onClick={() => setTab('showroom')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.88)', fontWeight: 500, whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.name || session.email}</span>
          <button onClick={() => setTab('settings')} style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: tab === 'settings' ? 'rgba(255,255,255,0.18)' : 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Settings</button>
          <button onClick={signOut} style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      {tab !== 'settings' && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', padding: '0 24px', background: 'var(--vfo-card)', position: 'relative', zIndex: 100 }}>
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: tab === key ? '2px solid #125ecc' : '2px solid transparent', color: tab === key ? '#125ecc' : 'var(--vfo-muted)', fontSize: '14px', fontWeight: tab === key ? '600' : '400', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
              {label}
              {key === 'shared' && unread > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '18px', height: '18px', padding: '0 5px', borderRadius: '999px', background: '#e74c3c', color: '#fff', fontSize: '11px', fontWeight: 700 }}>{unread}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {loadError && (
        <div style={{ maxWidth: '880px', margin: '20px auto 0', padding: '0 24px' }}>
          <div style={{ background: 'rgba(217,48,37,0.10)', border: '1px solid rgba(217,48,37,0.32)', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#d93025', marginBottom: '6px' }}>We couldn't load your portal</div>
            <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', wordBreak: 'break-word' }}>{loadError}</div>
            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '6px' }}>Please refresh the page — if this keeps happening, contact your VFO team.</div>
          </div>
        </div>
      )}

      {tab === 'showroom' && (
        showroom
          ? <MemberShowroom experts={showroom.experts} exclusions={[]} ecoMap={showroom.ecoMap} />
          : <ShowroomSkeleton />
      )}
      {tab === 'vault' && (
        <div style={{ maxWidth: '880px', margin: '0 auto', padding: '28px 24px' }}>
          <SpecialistVault />
        </div>
      )}
      {tab === 'shared' && (
        <div style={{ maxWidth: '880px', margin: '0 auto', padding: '28px 24px' }}>
          <SpecialistShared onUnreadChange={refreshUnread} />
        </div>
      )}
      {tab === 'settings' && (
        <div style={{ maxWidth: '880px', margin: '0 auto', padding: '28px 24px' }}>
          <ChangePasswordCard action="specialist_update_login" />
          <div style={{ maxWidth: '460px', margin: '20px auto 0' }}>
            <AppearanceCard />
          </div>
        </div>
      )}
    </div>
  )
}
