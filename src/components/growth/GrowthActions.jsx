import { useState } from 'react'
import { callApi } from '../../lib/api'
import { TrackHero } from '../shared/TrackKit'
import { StepNav, NumBadge, inputStyle, rowRule, MUTED } from './ui'
import { getGrowthConfig } from './constants'
import { ProfileCard } from '../shared/ProfileKit'
import { btnOutline } from '../shared/buttonStyles'

// drop = default; only "potential" carries to G3; "park" → Parking Garage.
const G2_OPTIONS = [
  { value: 'drop', label: 'Drop this Issue', color: 'var(--vfo-muted)' },
  { value: 'park', label: 'Park this Issue', color: '#e06717' },
  { value: 'potential', label: 'Potential Action', color: '#1b9254' },
]

export default function GrowthActions({ memberNumber, bundle, reload, onNavigate, variant }) {
  const { categoryOrder: CATEGORY_ORDER, categoryLabelsLong: CATEGORY_LABELS_LONG } = getGrowthConfig(variant)
  const score = bundle.score
  const [rows, setRows] = useState(() => (bundle.actions || []).map(a => ({
    id: a.id, action_number: a.action_number, category: a.category,
    action_text: a.action_text || '', g2_status: a.g2_status || 'drop',
  })))
  const [saving, setSaving] = useState(false)

  if (!score) return <NeedScore onNavigate={onNavigate} />

  function update(id, patch) { setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r)) }

  async function save(target) {
    setSaving(true)
    try {
      await callApi('growth_plan_save_actions', {
        member_number: memberNumber,
        updates: rows.map(r => ({ id: r.id, action_text: r.action_text, g2_status: r.g2_status })),
      })
      await reload()
      onNavigate(target)
    } catch (e) { alert(e?.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  const potential = rows.filter(r => r.g2_status === 'potential').length
  const parked = rows.filter(r => r.g2_status === 'park').length

  return (
    <div>
      <TrackHero
        eyebrow="Growth Plan"
        title="Possible Growth Actions"
        meta={<>Edit any action, then choose what to do with it — only <strong style={{ color: 'var(--vfo-success-text)' }}>Potential Action</strong> items carry forward.</>}
      />
      {CATEGORY_ORDER.map(cat => {
        const catRows = rows.filter(r => r.category === cat).sort((a, b) => a.action_number - b.action_number)
        if (!catRows.length) return null
        return (
          <ProfileCard key={cat} icon="clipboard" title={CATEGORY_LABELS_LONG[cat]} bodyStyle={{ paddingTop: '4px', paddingBottom: '4px' }}>
            {catRows.map((r, i) => <ActionRow key={r.id} r={r} i={i} update={update} />)}
          </ProfileCard>
        )
      })}
      <StepNav
        onBack={() => save('gp_score')}
        onNext={() => save('gp_prioritize')}
        nextLabel="Prioritize →"
        busy={saving}
        secondary={<span style={{ fontSize: '12.5px', color: MUTED }}>{potential} potential · {parked} parked</span>}
      />
    </div>
  )
}

function ActionRow({ r, i, update }) {
  return (
    <div style={{ padding: '14px 0', ...rowRule(i), display: 'flex', gap: '18px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 340px', minWidth: '240px', display: 'flex', gap: '10px' }}>
        <span style={{ marginTop: '6px' }}><NumBadge n={r.action_number} /></span>
        <textarea value={r.action_text} onChange={e => update(r.id, { action_text: e.target.value })} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', minHeight: '54px', resize: 'vertical' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', flex: '0 0 auto' }}>
        {G2_OPTIONS.map(o => {
          const on = r.g2_status === o.value
          return (
            <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', cursor: 'pointer', fontWeight: on ? 700 : 500, color: on ? o.color : 'var(--vfo-muted)' }}>
              <input type="radio" name={`g2_${r.id}`} checked={on} onChange={() => update(r.id, { g2_status: o.value })} style={{ accentColor: o.color }} />
              {o.label}
            </label>
          )
        })}
      </div>
    </div>
  )
}

function NeedScore({ onNavigate }) {
  return (
    <div style={{ padding: '44px', textAlign: 'center', color: MUTED }}>
      <div style={{ fontSize: '14px', marginBottom: '14px' }}>Complete <strong>Scoring Growth</strong> first to generate the action list.</div>
      <button onClick={() => onNavigate('gp_score')} style={btnOutline}>Go to Scoring Growth</button>
    </div>
  )
}
