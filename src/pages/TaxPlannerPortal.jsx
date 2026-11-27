import { useEffect, useRef, useState } from 'react'
import { timeGreeting } from '../lib/greeting'
import { useNavigate } from 'react-router-dom'
import { getSession, clearSession } from '../lib/api'
import PortalHeader from '../components/shared/PortalHeader'
import PlannerNavBar from '../components/tax-planner/PlannerNavBar'
import ChangePasswordCard from '../components/shared/ChangePasswordCard'
import AppearanceCard from '../components/shared/AppearanceCard'
import { SettingsHeader, SETTINGS_WIDTH, useSettingsReturn } from '../components/shared/ProfileKit'
import PlannerClientsList from '../components/tax-planner/PlannerClientsList'
import SdpAtsgPanel from '../components/sdp-atsg/SdpAtsgPanel'
import { usePortalTheme } from '../lib/theme'

export default function TaxPlannerPortal() {
  const navigate = useNavigate()
  // Settings' Back returns to the tab it was opened from (or the page that sent you).
  const settingsReturn = useSettingsReturn(navigate)
  const tabBeforeSettings = useRef('')
  const session = getSession()
  usePortalTheme()
  // ?tab= wins (a bell can open a tab, e.g. the SDP heads-up's ?tab=sdp_atsg&case=N).
  const [tab, setTab] = useState(() => {
    try { const t = new URLSearchParams(window.location.search).get('tab'); if (t) return t } catch { /* no URL */ }
    return sessionStorage.getItem('taxPlannerActiveTab') || ''
  })

  useEffect(() => {
    if (!session || session.role !== 'tax_planner') navigate('/tax-planner/login')
  }, [])
  // Settings is never the remembered tab: the tab under it is, so a reload or a
  // later return to the portal lands there, not on Settings.
  useEffect(() => { sessionStorage.setItem('taxPlannerActiveTab', tab === 'settings' ? tabBeforeSettings.current : tab) }, [tab])

  if (!session || session.role !== 'tax_planner') return null

  function signOut() { clearSession(); navigate('/tax-planner/login') }

  function openSettings() { if (tab !== 'settings') { settingsReturn.open(); tabBeforeSettings.current = tab } setTab('settings') }
  function closeSettings() { settingsReturn.back(() => setTab(tabBeforeSettings.current)) }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>
      <PortalHeader name={session.name || session.email} onTitleClick={() => setTab('')} actions={[
        { key: 'settings', label: 'Settings', active: tab === 'settings', onClick: openSettings },
        { key: 'signout', label: 'Sign Out', onClick: signOut },
      ]}>
        {tab !== 'settings' && <PlannerNavBar activeTab={tab} onSelect={setTab} />}
      </PortalHeader>

      {tab === '' && (
        <div style={{ textAlign: 'center', padding: '60px 24px 0' }}>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', marginBottom: '10px' }}>{timeGreeting()}</p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.02em', fontSize: '38px', color: 'var(--vfo-heading)', margin: 0 }}>{session.name || session.email}</p>
          <div style={{ width: '46px', height: '4px', borderRadius: '99px', background: '#fb895a', margin: '18px auto 0' }} />
        </div>
      )}

      {tab === 'planning' && <PlannerClientsList />}

      {tab === 'sdp_atsg' && <SdpAtsgPanel mode="planner" />}

      {tab === 'settings' && (
        <div style={{ maxWidth: SETTINGS_WIDTH, margin: '0 auto', padding: '28px 24px' }}>
          <SettingsHeader name={getSession()?.name} email={getSession()?.email} onBack={closeSettings} />
          <ChangePasswordCard action="tax_planner_update_login" />
          <AppearanceCard />
        </div>
      )}
    </div>
  )
}
