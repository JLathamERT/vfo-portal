import { useState, useEffect } from 'react'
import { callApi } from '../../lib/api'
import { TrackHero } from '../shared/TrackKit'
import { StepNav, MUTED } from './ui'
import { ProfileCard, formInput } from '../shared/ProfileKit'

// "Get Started" — the first Growth Plan step. Assigns the MSM (accountability
// owner) BEFORE any scoring. Persisted per member via growth_plan_save_four_ways
// (independent of the versioned score row), and consumed by Scoring Growth.
export default function GrowthGetStarted({ memberNumber, memberName, bundle, reload, onNavigate }) {
  const saved = bundle.four_ways || null
  // Prefer the setup row; fall back to an existing score's MSM so plans created
  // before this step still show their assignment.
  const initialEmail = saved?.assigned_admin_email || bundle.score?.assigned_admin_email || ''
  const [admins, setAdmins] = useState([])
  const [assignedEmail, setAssignedEmail] = useState(initialEmail)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    callApi('growth_plan_load_admins')
      .then(res => { if (alive) setAdmins(res?.admins || []) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Continue saves the MSM, then advances — no separate Save button. The rest of
  // the plan stays locked until this is saved.
  async function continueNext() {
    if (!assignedEmail) { alert('Select an MSM to continue.'); return }
    setSaving(true)
    try {
      const admin = admins.find(a => a.email === assignedEmail)
      await callApi('growth_plan_save_four_ways', {
        member_number: memberNumber,
        assigned_admin_email: assignedEmail,
        assigned_admin_name: admin?.name || saved?.assigned_admin_name || '',
      })
      await reload()
      onNavigate('gp_fourways')
    } catch (e) { alert(e?.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <TrackHero eyebrow="Growth Plan" title="Get Started" meta={memberName ? <>Setting up the Growth Plan for <strong style={{ color: 'var(--vfo-ink-2)' }}>{memberName}</strong></> : undefined} />

      <ProfileCard icon="user"
        title={<>Assigned MSM <span style={{ color: '#e74c3c', fontWeight: 700 }}>*</span></>}
        sub="Who is accountable for coaching this Growth Plan? This person receives the accountability updates, and their assignment is required before the plan can be scored.">
        <select value={assignedEmail} onChange={e => setAssignedEmail(e.target.value)} style={{ ...formInput, maxWidth: '360px' }}>
          <option value="">Select an MSM</option>
          {admins.map(a => <option key={a.email} value={a.email}>{a.name}</option>)}
        </select>
      </ProfileCard>

      <StepNav
        onNext={continueNext}
        nextLabel="Continue to 4 Ways to Grow →"
        busy={saving}
        secondary={!assignedEmail && <span style={{ fontSize: '12px', color: MUTED }}>Select an MSM to continue.</span>}
      />
    </div>
  )
}
