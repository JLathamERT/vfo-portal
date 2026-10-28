import { useState, useEffect, useCallback } from 'react'
import { callApi } from '../../lib/api'
import { GrowthTabs } from '../growth/ui'
import GrowthOnePage from '../growth/GrowthOnePage'
import GrowthAddPriority from '../growth/GrowthAddPriority'
import { useIsPhone } from '../../lib/useMediaQuery'

// Member-portal Growth Plan. The member sees their One Page Plan (G5) — read-only
// normally; once their coach turns on Accountability Mode, the per-row progress
// dropdowns become editable and they can add priorities. Dropped Priorities holds
// the off-plan (non-parked) pool — add to plan, park, or create your own; Parking
// Garage holds parked priorities — add to plan or drop. All self-scoped.
const TABS = [
  { key: 'onepage', label: 'One Page Plan' },
  { key: 'parking', label: 'Parking Garage' },
  { key: 'dropped', label: 'Dropped Priorities', phoneLabel: 'Dropped' },
]

export default function MemberGrowthPlan({ memberNumber, variant = 'advisor' }) {
  const [bundle, setBundle] = useState({ score: null, actions: [], partnerships: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('onepage')
  const isPhone = useIsPhone()

  const reload = useCallback(async () => {
    try {
      const res = await callApi('growth_plan_load', {})
      setBundle({ score: res.score || null, actions: res.actions || [], partnerships: res.partnerships || [] })
      setError('')
    } catch (e) {
      setError(e?.message || 'Failed to load your Growth Plan')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { setLoading(true); reload() }, [reload])

  if (loading) return <Msg text="Loading your Growth Plan…" />
  if (error) return <Msg text={error} />
  if (!bundle.score) return <Msg text="Your Growth Plan hasn't been set up yet — your coach will build it with you." />

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: isPhone ? '16px var(--vfo-gutter)' : '24px' }}>
      <div style={{ marginBottom: isPhone ? '14px' : '18px' }}>
        <GrowthTabs tabs={TABS} active={view} onChange={setView} />
      </div>
      {view === 'onepage' && <GrowthOnePage role="member" memberNumber={memberNumber} bundle={bundle} reload={reload} onNavigate={() => {}} variant={variant} />}
      {view === 'dropped' && <GrowthAddPriority role="member" tab="dropped" memberNumber={memberNumber} bundle={bundle} reload={reload} variant={variant} />}
      {view === 'parking' && <GrowthAddPriority role="member" tab="parking" memberNumber={memberNumber} bundle={bundle} reload={reload} variant={variant} />}
    </div>
  )
}

function Msg({ text }) {
  return <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--vfo-muted)', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}>{text}</div>
}
