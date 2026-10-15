import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession, clearSession } from '../lib/api'
import VfoWordmark from '../components/shared/VfoWordmark'
import NotificationBell from '../components/NotificationBell'
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

  const TABS = [['planning', 'Tax Planning']]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: 'linear-gradient(90deg, #002973 0%, #125ecc 100%)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '58px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 12px rgba(0,41,115,0.25)' }}>
        <VfoWordmark size={17} light onClick={() => setTab('')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <NotificationBell />
          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.88)', fontWeight: 500, whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.name || session.email}</span>
          <button onClick={() => setTab('settings')} style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: tab === 'settings' ? 'rgba(255,255,255,0.18)' : 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Settings</button>
          <button onClick={signOut} style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      {tab !== 'settings' && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', padding: '0 24px', background: 'var(--vfo-card)' }}>
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: tab === key ? '2px solid var(--vfo-accent-text)' : '2px solid transparent', color: tab === key ? 'var(--vfo-accent-text)' : 'var(--vfo-muted)', fontSize: '14px', fontWeight: tab === key ? '600' : '400', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>{label}</button>
          ))}
        </div>
      )}

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
