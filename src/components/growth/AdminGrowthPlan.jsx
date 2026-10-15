import { useState, useEffect, useCallback } from 'react'
import { callApi } from '../../lib/api'
import GrowthHub from './GrowthHub'
import { HubMenuBar } from '../shared/HubKit'
import GrowthGetStarted from './GrowthGetStarted'
import Growth4Ways from './Growth4Ways'
import GrowthScoring from './GrowthScoring'
import GrowthActions from './GrowthActions'
import GrowthPrioritize from './GrowthPrioritize'
import GrowthBuildPlan from './GrowthBuildPlan'
import GrowthOnePage from './GrowthOnePage'
import GrowthHistory from './GrowthHistory'
import { GP_STEPS, variantForMember } from './constants'

// Container for the Advisor Growth Plan tab in the admin member-detail view.
// Loads the member's current plan bundle once, then routes the active sub-tab
// (G1–G5 / Growth History) to its view. `onNavigate(stepKey)`
// lets a sub-view advance the outer tab (e.g. G2 "Prioritize" → G3).
export default function AdminGrowthPlan({ member, activeStep, onNavigate }) {
  const memberNumber = member?.plugin_member_number
  const memberName = member?.name
  const variant = variantForMember(member)
  const [bundle, setBundle] = useState({ score: null, actions: [], partnerships: [], four_ways: null })
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!memberNumber) return
    try {
      const res = await callApi('growth_plan_load', { member_number: memberNumber })
      setBundle({ score: res.score || null, actions: res.actions || [], partnerships: res.partnerships || [], four_ways: res.four_ways || null })
      setError('')
    } catch (e) {
      setError(e?.message || 'Failed to load growth plan')
    } finally {
      setInitialLoading(false)
    }
  }, [memberNumber])

  useEffect(() => { setInitialLoading(true); reload() }, [reload])

  let step = activeStep && activeStep.startsWith('gp_') ? activeStep : (bundle.score ? 'gp_hub' : 'gp_start')
  // Parking Garage is no longer a standalone tab — it lives in the One Page Plan.
  if (step === 'gp_parking') step = 'gp_onepage'

  if (initialLoading) return <GpMsg text="Loading growth plan…" />
  if (error) return <GpMsg text={error} retry={reload} />

  // Gate: until an MSM is assigned, only the hub (menu) and Get Started are
  // reachable — every other step redirects to Get Started so it can't be opened.
  const hasMsm = !!(bundle.four_ways?.assigned_admin_email || bundle.score?.assigned_admin_email)
  if (!hasMsm && step !== 'gp_hub' && step !== 'gp_start') step = 'gp_start'

  const common = { memberNumber, memberName, bundle, reload, onNavigate, variant }

  // The hub is the home base — no menu bar on top of itself.
  if (step === 'gp_hub') return <GrowthHub key={memberNumber} {...common} />

  let view
  switch (step) {
    case 'gp_start':
      view = <GrowthGetStarted key={memberNumber} {...common} />; break
    case 'gp_fourways':
      view = <Growth4Ways key={memberNumber} {...common} />; break
    case 'gp_score':
      view = <GrowthScoring key={memberNumber} {...common} />; break
    case 'gp_actions':
      view = <GrowthActions key={memberNumber} {...common} />; break
    case 'gp_prioritize':
      view = <GrowthPrioritize key={memberNumber} {...common} />; break
    case 'gp_build':
      view = <GrowthBuildPlan key={memberNumber} {...common} />; break
    case 'gp_onepage':
      view = <GrowthOnePage key={memberNumber} {...common} />; break
    case 'gp_history':
      view = <GrowthHistory key={memberNumber} {...common} />; break
    default: {
      const label = (GP_STEPS.find(s => s.key === step) || {}).label || 'Growth Plan'
      view = <GpMsg text={`${label} — coming in the next build phase.`} />
    }
  }

  return (
    <div>
      <HubMenuBar label="Growth Plan Menu" breadcrumb={(GP_STEPS.find(s => s.key === step) || {}).label} onBack={() => onNavigate('gp_hub')} />
      {view}
    </div>
  )
}

function GpMsg({ text, retry }) {
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '14px' }}>
      {text}
      {retry && (
        <div style={{ marginTop: '12px' }}>
          <button onClick={retry} style={{ padding: '6px 16px', borderRadius: '999px', border: '1px solid var(--vfo-accent-text)', background: 'transparent', color: 'var(--vfo-accent-text)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Retry</button>
        </div>
      )}
    </div>
  )
}
