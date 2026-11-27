import { useState } from 'react'
import { callApi } from '../../lib/api'
import { TrackHero } from '../shared/TrackKit'
import { getGrowthConfig } from './constants'
import { MUTED, GREEN, AMBER, GREY, BLUE, inputStyle, rowRule, miniLabel, NumBadge, Radios, GrowthNeed, StepNav } from './ui'
import { ProfileCard } from '../shared/ProfileKit'

// Left column = destination (default One Page Plan); only "one_page_plan" carries to G4.
const G3_STATUS = [
  { value: 'drop', label: 'Drop this Issue', color: GREY },
  { value: 'park', label: 'Park this Issue', color: AMBER },
  { value: 'one_page_plan', label: 'One Page Plan', color: GREEN },
]
// Right column = type (default New Action); used to split the One Page Plan in G5.
const G3_TYPE = [
  { value: 'new', label: 'New Action', color: BLUE },
  { value: 'continuing', label: 'Continuing or Existing Action', color: BLUE },
]

export default function GrowthPrioritize({ memberNumber, bundle, reload, onNavigate, variant }) {
  const { categoryOrder: CATEGORY_ORDER, categoryLabels: CATEGORY_LABELS } = getGrowthConfig(variant)
  const potential = (bundle.actions || []).filter(a => a.g2_status === 'potential')
  const [rows, setRows] = useState(() => potential.map(a => ({
    id: a.id, action_number: a.action_number, category: a.category, action_text: a.action_text || '',
    g3_status: a.g3_status || 'one_page_plan',
    g3_action_type: a.g3_action_type || 'new',
    g3_notes: a.g3_notes || '',
  })))
  const [saving, setSaving] = useState(false)

  if (!bundle.score) return <GrowthNeed text="Complete Scoring Growth first." cta="Go to Scoring Growth" onClick={() => onNavigate('gp_score')} />
  if (!potential.length) return <GrowthNeed text={'No actions were marked "Potential Action" in Possible Growth Actions.'} cta="Back to Possible Growth Actions" onClick={() => onNavigate('gp_actions')} />

  function update(id, patch) { setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r)) }

  async function save(target) {
    setSaving(true)
    try {
      await callApi('growth_plan_save_actions', {
        member_number: memberNumber,
        updates: rows.map(r => ({ id: r.id, g3_status: r.g3_status, g3_action_type: r.g3_action_type, g3_notes: r.g3_notes })),
      })
      await reload()
      onNavigate(target)
    } catch (e) { alert(e?.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  const onePage = rows.filter(r => r.g3_status === 'one_page_plan').length

  return (
    <div>
      <TrackHero
        eyebrow="Growth Plan"
        title="Prioritize Growth Actions"
        meta={<>Set each action's destination and type — only <strong style={{ color: GREEN }}>One Page Plan</strong> items continue.</>}
      />
      {CATEGORY_ORDER.map(cat => {
        const catRows = rows.filter(r => r.category === cat).sort((a, b) => a.action_number - b.action_number)
        if (!catRows.length) return null
        return (
          <ProfileCard key={cat} icon="flag" title={CATEGORY_LABELS[cat]} bodyStyle={{ paddingTop: '4px', paddingBottom: '4px' }}>
              {catRows.map((r, i) => (
                <div key={r.id} style={{ padding: '14px 0', ...rowRule(i), display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <NumBadge n={r.action_number} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', color: 'var(--vfo-ink)', lineHeight: 1.5, marginBottom: '12px', paddingTop: '3px' }}>{r.action_text}</div>
                    <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                      <div><div style={miniLabel}>Destination</div><Radios name={`s_${r.id}`} value={r.g3_status} onChange={v => update(r.id, { g3_status: v })} options={G3_STATUS} /></div>
                      <div><div style={miniLabel}>Type</div><Radios name={`t_${r.id}`} value={r.g3_action_type} onChange={v => update(r.id, { g3_action_type: v })} options={G3_TYPE} /></div>
                    </div>
                    <textarea value={r.g3_notes} onChange={e => update(r.id, { g3_notes: e.target.value })} placeholder="Notes" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginTop: '10px', minHeight: '40px', resize: 'vertical' }} />
                  </div>
                </div>
              ))}
          </ProfileCard>
        )
      })}
      <StepNav
        onBack={() => save('gp_actions')}
        onNext={() => save('gp_build')}
        nextLabel="Build One Page Plan →"
        busy={saving}
        secondary={<span style={{ fontSize: '12.5px', color: MUTED }}>{onePage} going to the One Page Plan</span>}
      />
    </div>
  )
}
