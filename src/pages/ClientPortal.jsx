import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession, clearSession, callApi, getLastSeen, setLastSeen } from '../lib/api'
import ClientVault from '../components/client/ClientVault'
import MemberShowroom from '../components/member/MemberShowroom'
import CollapsibleNavBar from '../components/shared/CollapsibleNavBar'
import PortalHeader from '../components/shared/PortalHeader'
import ChangePasswordCard from '../components/shared/ChangePasswordCard'
import AppearanceCard from '../components/shared/AppearanceCard'
import { usePortalTheme } from '../lib/theme'
import { ShowroomSkeleton } from '../components/shared/Skeleton'
import OnePagePlanView from '../components/shared/OnePagePlanView'

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
  // Portal licensing L2: { [expert_id]: requested_at } — present only while
  // client_basic_portal is on (intro_requests key); null = no intro button at all.
  const [introRequested, setIntroRequested] = useState(null)
  // Portal licensing L4: the My Plan tab (a read-only One Page Plan) — granted the
  // same way as the Vault: only the LIVE answer may show it (ciq_plan === true,
  // sent only while ciq_licence is on), a snapshot can only take it away.
  const [planAllowed, setPlanAllowed] = useState(false)
  const [plan, setPlan] = useState(null)

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
      const planOn = data.ciq_plan === true
      if (live || !planOn) setPlanAllowed(planOn)
      if (!planOn) setTab(t => (t === 'plan' ? 'showroom' : t))
      if (Array.isArray(data.intro_requests)) {
        const map = {}
        data.intro_requests.forEach(r => { map[r.expert_id] = r.requested_at })
        setIntroRequested(map)
      } else {
        setIntroRequested(null)
      }
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

  useEffect(() => {
    if (tab !== 'plan' || !planAllowed || plan) return
    callApi('client_ciq_plan_load', {})
      .then(d => setPlan({ plans: d.plans || [], member_name: d.member_name || null }))
      .catch(err => setPlan({ error: err.message || 'Could not load your plan.' }))
  }, [tab, planAllowed])

  if (!session || session.role !== 'client') return null

  function signOut() { clearSession(); navigate('/client/login') }

  // Returns an error message for the button to show, or null on success.
  async function requestIntroduction(expertId) {
    try {
      const d = await callApi('client_request_introduction', { expert_id: expertId })
      if (!d?.ok) return d?.error || 'Could not send your request.'
      setIntroRequested(m => ({ ...(m || {}), [expertId]: d.requested_at }))
      return null
    } catch (e) {
      return e.message || 'Could not send your request.'
    }
  }
  const introRequest = introRequested ? { requested: introRequested, onRequest: requestIntroduction } : null
  const navTabs = [['showroom', 'Showroom'], ...(planAllowed ? [['plan', 'My One Page Plan']] : []), ...(vaultAllowed ? [['vault', 'Vault']] : [])]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>
      <PortalHeader name={session.name || session.email} showBell={false} onTitleClick={() => chooseTab(licensingOn ? 'home' : 'showroom')} actions={[
        { key: 'settings', label: 'Settings', active: tab === 'settings', onClick: () => chooseTab('settings') },
        { key: 'signout', label: 'Sign Out', onClick: signOut },
      ]}>
        {tab !== 'settings' && (
          <CollapsibleNavBar items={navTabs.map(([key, label]) => ({ key, label, active: tab === key, onSelect: () => chooseTab(key) }))}
            currentLabel={Object.fromEntries(navTabs)[tab]}>
            {navTabs.map(([key, label]) => (
              <button key={key} onClick={() => chooseTab(key)} style={{ padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: tab === key ? '2px solid var(--vfo-accent-text)' : '2px solid transparent', color: tab === key ? 'var(--vfo-accent-text)' : 'var(--vfo-muted)', fontSize: '14px', fontWeight: tab === key ? '600' : '400', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>{label}</button>
            ))}
          </CollapsibleNavBar>
        )}
      </PortalHeader>

      {tab === 'home' && (
        <div style={{ textAlign: 'center', padding: '60px var(--vfo-gutter) 0' }}>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', marginBottom: '10px' }}>Welcome back</p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.02em', fontSize: '38px', color: 'var(--vfo-heading)', margin: 0 }}>{session.name || session.email}</p>
          <div style={{ width: '46px', height: '4px', borderRadius: '99px', background: '#fb895a', margin: '18px auto 0' }} />
          {licence && (
            <p style={{ fontSize: '14px', color: 'var(--vfo-muted)', marginTop: '28px' }}>
              {licence.status === 'active' && licence.monthly
                ? <>Your VFO client portal membership is active.</>
                : licence.status === 'active'
                ? <>Your VFO client portal membership is active until <strong style={{ color: 'var(--vfo-ink)' }}>{fmtLicenceDate(licence.ends_on)}</strong>.</>
                : licence.status === 'expired'
                  ? <>Your VFO client portal membership ended on <strong style={{ color: 'var(--vfo-ink)' }}>{fmtLicenceDate(licence.ends_on)}</strong>.</>
                  : <>Your VFO client portal membership has ended.</>}
            </p>
          )}
        </div>
      )}

      {loadError && (
        <div style={{ maxWidth: '880px', margin: '20px auto 0', padding: '0 var(--vfo-gutter)' }}>
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
          : <MemberShowroom experts={showroom.experts} exclusions={showroom.exclusions} ecoMap={showroom.ecoMap} introRequest={introRequest} clientView />
      )}
      {tab === 'plan' && planAllowed && (
        <div style={{ maxWidth: '880px', margin: '0 auto', padding: '28px var(--vfo-gutter)' }}>
          {!plan
            ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)', fontSize: '14px' }}>Loading your plan…</div>
            : plan.error
              ? <div style={{ textAlign: 'center', padding: '40px', color: '#d93025', fontSize: '14px' }}>{plan.error}</div>
              : <OnePagePlanView plans={plan.plans} title="My One Page Plan" subtitle={plan.member_name ? `with ${plan.member_name}` : ''} emptyText="Your One Page Plan will appear here once it has been prepared with you." />}
        </div>
      )}
      {tab === 'vault' && vaultAllowed && (
        <div style={{ maxWidth: '880px', margin: '0 auto', padding: '28px var(--vfo-gutter)' }}>
          <ClientVault />
        </div>
      )}
      {tab === 'settings' && (
        <div style={{ maxWidth: '880px', margin: '0 auto', padding: '28px var(--vfo-gutter)' }}>
          <ChangePasswordCard action="client_update_login" />
          <div style={{ maxWidth: '460px', margin: '20px auto 0' }}>
            <AppearanceCard />
          </div>
        </div>
      )}
    </div>
  )
}
