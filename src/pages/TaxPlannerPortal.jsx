import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession, clearSession } from '../lib/api'
import PortalHeader from '../components/shared/PortalHeader'
import PlannerNavBar from '../components/tax-planner/PlannerNavBar'
import ChangePasswordCard from '../components/shared/ChangePasswordCard'
import AppearanceCard from '../components/shared/AppearanceCard'
import PlannerClientsList from '../components/tax-planner/PlannerClientsList'
import { usePortalTheme } from '../lib/theme'

export default function TaxPlannerPortal() {
  const navigate = useNavigate()
  const session = getSession()
  usePortalTheme()
  const [tab, setTab] = useState(() => sessionStorage.getItem('taxPlannerActiveTab') || '')

  useEffect(() => {
    if (!session || session.role !== 'tax_planner') navigate('/tax-planner/login')
  }, [])
  useEffect(() => { sessionStorage.setItem('taxPlannerActiveTab', tab) }, [tab])

  if (!session || session.role !== 'tax_planner') return null

  function signOut() { clearSession(); navigate('/tax-planner/login') }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>
      <PortalHeader name={session.name || session.email} onTitleClick={() => setTab('')} actions={[
        { key: 'settings', label: 'Settings', active: tab === 'settings', onClick: () => setTab('settings') },
        { key: 'signout', label: 'Sign Out', onClick: signOut },
      ]}>
        {tab !== 'settings' && <PlannerNavBar activeTab={tab} onSelect={setTab} />}
      </PortalHeader>

      {tab === '' && (
        <div style={{ textAlign: 'center', padding: '60px 24px 0' }}>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', marginBottom: '10px' }}>Welcome back</p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.02em', fontSize: '38px', color: 'var(--vfo-heading)', margin: 0 }}>{session.name || session.email}</p>
          <div style={{ width: '46px', height: '4px', borderRadius: '99px', background: '#fb895a', margin: '18px auto 0' }} />
        </div>
      )}

      {tab === 'planning' && <PlannerClientsList />}

      {tab === 'settings' && (
        <div style={{ maxWidth: '880px', margin: '0 auto', padding: '28px 24px' }}>
          <ChangePasswordCard action="tax_planner_update_login" />
          <div style={{ maxWidth: '460px', margin: '20px auto 0' }}>
            <AppearanceCard />
          </div>
        </div>
      )}
    </div>
  )
}
