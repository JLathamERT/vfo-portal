import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession, clearSession, callApi } from '../lib/api'
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
  const [showroom, setShowroom] = useState(null)
  const [showroomLoading, setShowroomLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  // Portal licence (portal_licensing, unit 4). Absent unless the switch is on for
  // this client's member AND they have held a licence.
  const [licence, setLicence] = useState(null)

  useEffect(() => {
    if (!session || session.role !== 'client') navigate('/client/login')
  }, [])
  useEffect(() => { sessionStorage.setItem('clientActiveTab', tab) }, [tab])

  // Showroom of the member this client is connected to (their enabled specialists).
  useEffect(() => {
    if (!session || session.role !== 'client') return
    let cancelled = false
    ;(async () => {
      try {
        setLoadError(null)
        const data = await callApi('client_showroom_load', {})
        const eco = {}
        ;(data.ecosystems || []).forEach(e => {
          if (!eco[e.expert_id]) eco[e.expert_id] = []
          eco[e.expert_id].push(e.name)
        })
        if (!cancelled) setShowroom({ experts: data.experts || [], exclusions: data.exclusions || [], ecoMap: eco })
        if (!cancelled) setLicence(data.licence || null)
      } catch (err) {
        console.error('Showroom load error:', err)
        // Keep the empty substitute: the render below reads showroom.experts
        // unguarded once loading flips false. The banner above says WHY it's empty.
        if (!cancelled) { setLoadError(err.message || 'Something went wrong'); setShowroom({ experts: [], exclusions: [], ecoMap: {} }) }
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
        <VfoWordmark size={17} light onClick={() => setTab('showroom')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.88)', fontWeight: 500, whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.name || session.email}</span>
          <button onClick={() => setTab('settings')} style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: tab === 'settings' ? 'rgba(255,255,255,0.18)' : 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Settings</button>
          <button onClick={signOut} style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      {tab !== 'settings' && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', padding: '0 24px', background: 'var(--vfo-card)', position: 'relative', zIndex: 100 }}>
          {[['showroom', 'Showroom'], ['vault', 'Vault']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: tab === key ? '2px solid #125ecc' : '2px solid transparent', color: tab === key ? '#125ecc' : 'var(--vfo-muted)', fontSize: '14px', fontWeight: tab === key ? '600' : '400', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>{label}</button>
          ))}
        </div>
      )}

      {licence && tab !== 'settings' && (
        <div style={{ maxWidth: '880px', margin: '16px auto 0', padding: '0 24px' }}>
          <div style={{ background: licence.status === 'active' ? 'rgba(18,94,204,0.08)' : 'rgba(100,116,139,0.10)', border: `1px solid ${licence.status === 'active' ? 'rgba(18,94,204,0.25)' : 'rgba(100,116,139,0.28)'}`, borderRadius: '12px', padding: '10px 16px', fontSize: '13px', color: 'var(--vfo-ink)' }}>
            {licence.status === 'active'
              ? <>Your VFO client portal membership is active until <strong>{fmtLicenceDate(licence.ends_on)}</strong>.</>
              : licence.status === 'expired'
                ? <>Your VFO client portal membership ended on <strong>{fmtLicenceDate(licence.ends_on)}</strong>.</>
                : <>Your VFO client portal membership has ended.</>}
          </div>
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
      {tab === 'vault' && (
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
