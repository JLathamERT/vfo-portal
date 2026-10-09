import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession, clearSession, callApi, getLastSeen, setLastSeen } from '../lib/api'
import ClientVault from '../components/client/ClientVault'
import MemberShowroom from '../components/member/MemberShowroom'
import VfoWordmark from '../components/shared/VfoWordmark'
import ChangePasswordCard from '../components/shared/ChangePasswordCard'
import AppearanceCard from '../components/shared/AppearanceCard'
import { usePortalTheme } from '../lib/theme'
import { ShowroomSkeleton } from '../components/shared/Skeleton'

function fmtLicenceDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${m}/${d}/${y}`
}

export default function ClientPortal() {
  const navigate = useNavigate()
  const session = getSession()
  usePortalTheme()
  const [tab, setTab] = useState(sessionStorage.getItem('clientActiveTab') || 'showroom')
  // A tab the client picked (this visit or earlier in the session) always wins
  // over the Home landing — a ref, so the load below sees a click made while it ran.
  const tabChosen = useRef(!!sessionStorage.getItem('clientActiveTab'))
  const [showroom, setShowroom] = useState(null)
  const [showroomLoading, setShowroomLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  // Portal licensing (unit 4). client_showroom_load carries a `licence` key only
  // while the switch is on for this client's member (null = never held one). On:
  // the portal gains a Home screen (the wordmark and the landing page) showing the
  // licence. Off: exactly the old portal — lands on Showroom, no Home.
  const [licensingOn, setLicensingOn] = useState(false)
  const [licence, setLicence] = useState(null)
  // Portal licensing L2: tier 'basic' (sent only while client_basic_portal is on
  // for this client's member) = Showroom only — no Vault tab. The Vault is OFF
  // until the server's answer arrives (Jake): a Basic client must never see the
  // tab, not even for the moment before the load returns. A failed load with no
  // snapshot leaves it off. The client_vault_* actions refuse a Basic client too.
  const [vaultAllowed, setVaultAllowed] = useState(false)

  useEffect(() => {
    if (!session || session.role !== 'client') navigate('/client/login')
  }, [])
  useEffect(() => { if (tabChosen.current) sessionStorage.setItem('clientActiveTab', tab) }, [tab])
  function chooseTab(t) { tabChosen.current = true; setTab(t) }

  // Showroom of the member this client is connected to (their enabled specialists).
  useLayoutEffect(() => {
    if (!session || session.role !== 'client') return
    let cancelled = false
    // live = the fresh server answer. Only that may GRANT the Vault; a last-seen
    // snapshot (possibly saved before the switch) can only take it away.
    function apply(data, live) {
      const eco = {}
      ;(data.ecosystems || []).forEach(e => {
        if (!eco[e.expert_id]) eco[e.expert_id] = []
        eco[e.expert_id].push(e.name)
      })
      setShowroom({ experts: data.experts || [], exclusions: data.exclusions || [], ecoMap: eco })
      const on = Object.prototype.hasOwnProperty.call(data, 'licence')
      setLicensingOn(on)
      setLicence(data.licence || null)
      if (on && !tabChosen.current) setTab('home')
      if (!on) setTab(t => (t === 'home' ? 'showroom' : t))
      const allowed = data.tier !== 'basic'
      if (live || !allowed) setVaultAllowed(allowed)
      if (!allowed) setTab(t => (t === 'vault' ? 'showroom' : t))
    }
    // Re-mount: draw the last showroom at once, refresh behind it.
    const key = `clientportal:showroom:${session.email}`
    const snap = getLastSeen(key)
    if (snap) { apply(snap, false); setShowroomLoading(false) }
    ;(async () => {
      try {
        setLoadError(null)
        const data = await callApi('client_showroom_load', {})
        if (!cancelled) { apply(data, true); setLastSeen(key, data) }
      } catch (err) {
        console.error('Showroom load error:', err)
        // Keep the empty substitute: the render below reads showroom.experts
        // unguarded once loading flips false. The banner above says WHY it's empty.
        if (!cancelled && !snap) { setLoadError(err.message || 'Something went wrong'); setShowroom({ experts: [], exclusions: [], ecoMap: {} }) }
      } finally {
        if (!cancelled) setShowroomLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (!session || session.role !== 'client') return null

  function signOut() { clearSession(); navigate('/client/login') }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: 'linear-gradient(90deg, #002973 0%, #125ecc 100%)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '58px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 12px rgba(0,41,115,0.25)' }}>
        <VfoWordmark size={17} light onClick={() => chooseTab(licensingOn ? 'home' : 'showroom')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.88)', fontWeight: 500, whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.name || session.email}</span>
          <button onClick={() => chooseTab('settings')} style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: tab === 'settings' ? 'rgba(255,255,255,0.18)' : 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Settings</button>
          <button onClick={signOut} style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      {tab !== 'settings' && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', padding: '0 24px', background: 'var(--vfo-card)', position: 'relative', zIndex: 100 }}>
          {[['showroom', 'Showroom'], ...(vaultAllowed ? [['vault', 'Vault']] : [])].map(([key, label]) => (
            <button key={key} onClick={() => chooseTab(key)} style={{ padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: tab === key ? '2px solid #125ecc' : '2px solid transparent', color: tab === key ? '#125ecc' : 'var(--vfo-muted)', fontSize: '14px', fontWeight: tab === key ? '600' : '400', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>{label}</button>
          ))}
        </div>
      )}

      {tab === 'home' && (
        <div style={{ textAlign: 'center', padding: '60px 24px 0' }}>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', marginBottom: '10px' }}>Welcome back</p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.02em', fontSize: '38px', color: 'var(--vfo-heading)', margin: 0 }}>{session.name || session.email}</p>
          <div style={{ width: '46px', height: '4px', borderRadius: '99px', background: '#fb895a', margin: '18px auto 0' }} />
          {licence && (
            <p style={{ fontSize: '14px', color: 'var(--vfo-muted)', marginTop: '28px' }}>
              {licence.status === 'active'
                ? <>Your VFO client portal membership is active until <strong style={{ color: 'var(--vfo-ink)' }}>{fmtLicenceDate(licence.ends_on)}</strong>.</>
                : licence.status === 'expired'
                  ? <>Your VFO client portal membership ended on <strong style={{ color: 'var(--vfo-ink)' }}>{fmtLicenceDate(licence.ends_on)}</strong>.</>
                  : <>Your VFO client portal membership has ended.</>}
            </p>
          )}
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
        showroomLoading
          ? <ShowroomSkeleton />
          : <MemberShowroom experts={showroom.experts} exclusions={showroom.exclusions} ecoMap={showroom.ecoMap} />
      )}
      {tab === 'vault' && vaultAllowed && (
        <div style={{ maxWidth: '880px', margin: '0 auto', padding: '28px 24px' }}>
          <ClientVault />
        </div>
      )}
      {tab === 'settings' && (
        <div style={{ maxWidth: '880px', margin: '0 auto', padding: '28px 24px' }}>
          <ChangePasswordCard action="client_update_login" />
          <div style={{ maxWidth: '460px', margin: '20px auto 0' }}>
            <AppearanceCard />
          </div>
        </div>
      )}
    </div>
  )
}
