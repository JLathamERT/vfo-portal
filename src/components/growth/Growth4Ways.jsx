import { useState } from 'react'
import { callApi } from '../../lib/api'
import { TrackHero } from '../shared/TrackKit'
import { StepNav, cardStyle, eyebrowLabel, rowRule, INK, MUTED } from './ui'
import { ProfileCard, formInput } from '../shared/ProfileKit'
import { btnPrimary, btnSecondary, btnState } from '../shared/buttonStyles'
import { getGrowthConfig, FOUR_WAYS_PRINCIPLES } from './constants'

// "4 Ways to Grow a Business" — the big-picture-focus questionnaire that precedes
// Scoring Growth. Admin/MSM picks the member's type, ranks the four growth
// focuses (1–4 or N/A, a true ranking — no number reused), answers a conditional
// question, and gets a priority-ordered summary. Content is variant-driven
// (advisor / accountant). Persisted per member via growth_plan_save_four_ways.

// Apply any locked-to-N/A rows for the chosen type (advisor Type 3).
function effectivePriorities(memberType, priorities, focuses) {
  const eff = { ...priorities }
  if (memberType === 'type3') {
    for (const f of focuses) if (f.lockedForType3) eff[f.key] = 'na'
  }
  return eff
}

export default function Growth4Ways({ memberNumber, bundle, reload, onNavigate, variant }) {
  const cfg = getGrowthConfig(variant)
  const focuses = cfg.fourWaysFocuses
  const conditional = cfg.fourWaysConditional
  const saved = bundle.four_ways || null
  const [memberType, setMemberType] = useState(saved?.member_type || '')
  const [priorities, setPriorities] = useState(() => ({ ...(saved?.priorities || {}) }))
  const [conditionalAnswer, setConditionalAnswer] = useState(saved?.accountant_interest || '')
  const [saving, setSaving] = useState(false)

  const eff = effectivePriorities(memberType, priorities, focuses)
  const triggerRank = eff[conditional.triggerKey]
  const showConditional = triggerRank === 1 || triggerRank === 2
  const conditionalOptions = showConditional ? conditional.optionsFor(memberType) : []

  function setPriority(key, val) { setPriorities(p => ({ ...p, [key]: val })) }
  function pickType(val) { setMemberType(val) }

  // Continue saves this section, then advances — no separate Save button.
  async function saveAndContinue() {
    if (!memberType) { alert('Select a type to continue.'); return }
    setSaving(true)
    try {
      await callApi('growth_plan_save_four_ways', {
        member_number: memberNumber,
        member_type: memberType,
        priorities: eff,
        accountant_interest: showConditional ? conditionalAnswer : '',
      })
      await reload()
      onNavigate('gp_score')
    } catch (e) { alert(e?.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  // Focuses given a numeric rank, in priority order (ties break by focus order).
  const ranked = focuses
    .map((f, i) => ({ f, i, rank: eff[f.key] }))
    .filter(r => typeof r.rank === 'number')
    .sort((a, b) => a.rank - b.rank || a.i - b.i)

  return (
    <div>
      <TrackHero eyebrow="Growth Plan" title="4 Ways to Grow a Business" />

      {/* Principles */}
      <ProfileCard icon="layers" title="The Growth Plan is built around the principles of 4 Ways to Grow Business Profits">
        <ol style={{ margin: 0, paddingLeft: '22px', color: INK }}>
          {FOUR_WAYS_PRINCIPLES.map((p, i) => (
            <li key={i} style={{ fontSize: '13.5px', lineHeight: 1.9 }}>{p}</li>
          ))}
        </ol>
      </ProfileCard>

      {/* Member type */}
      <ProfileCard icon="user" title={cfg.typeLabel} sub={cfg.typeHelper}>
        <select value={memberType} onChange={e => pickType(e.target.value)} style={{ ...formInput, maxWidth: '360px' }}>
          <option value="">{cfg.typePlaceholder}</option>
          {cfg.memberTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </ProfileCard>

      {/* Priority order */}
      {memberType ? (
        <ProfileCard icon="flag" title="Your Priority Order" sub="Rank each focus 1–4 (or mark N/A). Each number can be used only once." bodyStyle={{ paddingTop: '6px', paddingBottom: '6px' }}>
          {focuses.map((f, i) => {
            const locked = memberType === 'type3' && f.lockedForType3
            // A true ranking — numbers already used on OTHER focuses are disabled here.
            const taken = new Set(focuses.filter(o => o.key !== f.key).map(o => eff[o.key]).filter(v => typeof v === 'number'))
            return (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', padding: '13px 0', ...rowRule(i) }}>
                <div style={{ fontSize: '13.5px', color: INK, lineHeight: 1.4, flex: '1 1 260px' }}>{f.row}</div>
                <PriorityPicker value={eff[f.key]} onChange={v => setPriority(f.key, v)} disabled={locked} takenNumbers={taken} />
              </div>
            )
          })}
        </ProfileCard>
      ) : (
        <div style={{ ...cardStyle, padding: '30px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
          Select a type above to set the priority order.
        </div>
      )}

      {/* Conditional question */}
      {memberType && showConditional && (
        <ProfileCard>
          <div style={{ fontSize: '13.5px', color: INK, marginBottom: '12px', lineHeight: 1.5 }}>
            {conditional.question}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {conditionalOptions.map(o => (
              <button key={o.value} onClick={() => setConditionalAnswer(o.value)} style={segBtnStyle(conditionalAnswer === o.value, false)}>{o.label}</button>
            ))}
          </div>
        </ProfileCard>
      )}

      {/* Summary */}
      <ProfileCard icon="award" title="Growth Plan Big Picture Focus in Summary" sub="This produces a summary of the above answers." bodyStyle={ranked.length ? { paddingTop: '4px', paddingBottom: '4px' } : undefined}>
        {ranked.length === 0 ? (
          <div style={{ fontSize: '13px', color: MUTED }}>Rank at least one focus above to see the summary.</div>
        ) : (
          ranked.map(({ f, rank }, idx) => (
            <div key={f.key} style={{ display: 'flex', gap: '14px', alignItems: 'baseline', padding: '14px 0', ...rowRule(idx) }}>
              <div style={{ ...eyebrowLabel, whiteSpace: 'nowrap', minWidth: '150px', color: '#0095ff' }}>GROWTH FOCUS - Priority {rank}</div>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--vfo-heading)', letterSpacing: '-0.01em', lineHeight: 1.25 }}>{f.title}</div>
                {f.sub && <div style={{ fontSize: '12.5px', color: MUTED, marginTop: '3px', lineHeight: 1.4 }}>{f.sub}</div>}
              </div>
            </div>
          ))
        )}
      </ProfileCard>

      <StepNav
        onNext={saveAndContinue}
        nextLabel="Continue to Scoring →"
        busy={saving}
        secondary={!memberType && <span style={{ fontSize: '12px', color: MUTED }}>Select a type to continue.</span>}
      />
    </div>
  )
}

// ProfileKit's ChoiceButtons look: the chosen one primary, the rest secondary.
function segBtnStyle(on, disabled) {
  return btnState({ ...(on ? btnPrimary : btnSecondary), minWidth: '40px', padding: '8px 14px', fontSize: '13px' }, disabled && !on)
}

function PriorityPicker({ value, onChange, disabled, takenNumbers }) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {[1, 2, 3, 4].map(n => {
        const off = disabled || (takenNumbers && takenNumbers.has(n) && value !== n)
        return <button key={n} disabled={off} onClick={() => onChange(n)} style={segBtnStyle(value === n, off)}>{n}</button>
      })}
      <button disabled={disabled} onClick={() => onChange('na')} style={segBtnStyle(value === 'na', disabled)}>N/A</button>
    </div>
  )
}
