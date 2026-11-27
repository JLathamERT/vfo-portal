import { useState, useEffect } from 'react'
import { callApi } from '../../lib/api'
import { TrackHero } from '../shared/TrackKit'
import { cardStyle, miniLabel, NumBadge, Radios, GrowthNeed, StepNav, NameCombo, buildNamePool } from './ui'
import { displayNumbers } from './grouping'

const LEVELS = [{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]
// ProfileKit's Field tile.
const fieldGroup = { background: 'var(--vfo-input)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', padding: '10px 14px' }

export default function GrowthBuildPlan({ memberNumber, bundle, reload, onNavigate }) {
  const onePage = (bundle.actions || [])
    .filter(a => a.g3_status === 'one_page_plan')
    .sort((a, b) => (a.plan_number ?? Infinity) - (b.plan_number ?? Infinity) || a.action_number - b.action_number)
  const [rows, setRows] = useState(() => onePage.map(a => ({
    id: a.id, action_number: a.action_number, action_text: a.action_text || '',
    owned_by: a.owned_by || '', assisted_by: a.assisted_by || '',
    value_level: a.value_level || 'medium', effort_level: a.effort_level || 'medium',
  })))
  const [saving, setSaving] = useState(false)
  // Per-plan pool of names for the Owned By / Assisted By dropdowns — seeded from
  // names already on this plan, and grows as you type new ones. Shared across both
  // fields and every row, so a name is only ever entered once for this person's plan.
  const [people, setPeople] = useState(() => {
    const set = new Set()
    for (const a of onePage) for (const v of [a.owned_by, a.assisted_by]) if (v && v.trim()) set.add(v.trim())
    return [...set]
  })
  function rememberName(name) {
    const n = (name || '').trim()
    if (n) setPeople(p => p.includes(n) ? p : [...p, n])
  }
  // The full system admin list joins the plan-local names in the dropdown.
  const [admins, setAdmins] = useState([])
  useEffect(() => {
    let alive = true
    callApi('growth_plan_load_admins').then(r => { if (alive) setAdmins(r?.admins || []) }).catch(() => {})
    return () => { alive = false }
  }, [])
  const { pool: sortedPeople, adminSet } = buildNamePool(people, admins.map(a => a.name))
  const labels = displayNumbers(onePage)

  if (!bundle.score) return <GrowthNeed text="Complete Scoring Growth first." cta="Go to Scoring Growth" onClick={() => onNavigate('gp_score')} />
  if (!onePage.length) return <GrowthNeed text="No actions are in the One Page Plan yet — complete Prioritize Growth Actions first." cta="Go to Prioritize Growth Actions" onClick={() => onNavigate('gp_prioritize')} />

  function update(id, patch) { setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r)) }

  async function save(target) {
    setSaving(true)
    try {
      await callApi('growth_plan_save_actions', {
        member_number: memberNumber,
        updates: rows.map(r => ({ id: r.id, owned_by: r.owned_by, assisted_by: r.assisted_by, value_level: r.value_level, effort_level: r.effort_level })),
      })
      await reload()
      onNavigate(target)
    } catch (e) { alert(e?.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <TrackHero
        eyebrow="Growth Plan"
        title="Build One Page Growth Plan"
        meta={<>Assign ownership and rate each action's value and effort. Names you enter are saved to a reusable dropdown shared across all rows.</>}
      />
      {rows.map((r, i) => (
        <div key={r.id} style={cardStyle}>
          <div style={{ padding: 'var(--vfo-card-pad)' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '14px' }}>
              <NumBadge n={labels.get(r.id) || (i + 1)} />
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--vfo-heading)', lineHeight: 1.5, paddingTop: '3px' }}>{r.action_text}</div>
            </div>
            <div style={{ paddingLeft: '34px' }}>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
                  <div style={miniLabel}>Owned By</div>
                  <NameCombo value={r.owned_by} onChange={v => update(r.id, { owned_by: v })} onCommit={rememberName} people={sortedPeople} adminSet={adminSet} placeholder="Type or pick a name" />
                </div>
                <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
                  <div style={miniLabel}>Assisted By</div>
                  <NameCombo value={r.assisted_by} onChange={v => update(r.id, { assisted_by: v })} onCommit={rememberName} people={sortedPeople} adminSet={adminSet} placeholder="Type or pick a name" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={fieldGroup}>
                  <div style={miniLabel}>Value</div>
                  <div style={{ display: 'flex', gap: '14px' }}><Radios name={`v_${r.id}`} value={r.value_level} onChange={v => update(r.id, { value_level: v })} options={LEVELS} /></div>
                </div>
                <div style={fieldGroup}>
                  <div style={miniLabel}>Effort</div>
                  <div style={{ display: 'flex', gap: '14px' }}><Radios name={`e_${r.id}`} value={r.effort_level} onChange={v => update(r.id, { effort_level: v })} options={LEVELS} /></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
      <StepNav onBack={() => save('gp_prioritize')} onNext={() => save('gp_onepage')} nextLabel="View One Page Plan →" busy={saving} />
    </div>
  )
}
