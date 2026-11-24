import { useState } from 'react'
import { formatDate } from '../../lib/dates'
import { PlanStatusTag } from '../admin/tax/TaxPlanStatus'

// Which tax plan a Tax Planning Form goes on (2026-11-23): the client already has one.
// Shared by the member's own form and admin Tax Diagnostics; never shown to a client
// or on a public page. `plans` comes from the server (utils/tax-form-plan.ts), which
// checks the choice again. Plan of record: docs/plans/tax-plan-status, decisions 9-11.

const PROGRAM = (p) => p.program_id === 4 ? 'VFO Tax Planning' : 'VFO Holistic Planning'

/** The body fields for the chosen plan. */
export function planPickBody(choice, plans, replace) {
  if (!choice) return {}
  const plan = plans.find(p => String(p.id) === String(choice))
  return { plan_pick: choice === 'new' ? 'new' : Number(choice), ...(plan?.has_form && replace ? { replace_form: true } : {}) }
}

/** What stops the choice being sent, in words; null = ready. */
export function planPickProblem(choice, plans, replace) {
  if (!choice) return 'Pick the plan this form is for.'
  const plan = plans.find(p => String(p.id) === String(choice))
  if (plan?.has_form && !replace) return 'That plan already has a form. Tick Replace its form, or pick another plan.'
  return null
}

// What picking this plan means for the form, one line.
function planNote(p, staff) {
  if (!p.open) return staff ? 'The form is filed on it and the plan stays closed.' : 'The form is filed on it. The plan stays closed.'
  if (p.status === 'paused') return staff ? 'The plan stays paused; Tracy Miller gets a bell.' : 'The plan stays paused.'
  return ''
}

export default function TaxFormPlanPicker({ clientName, plans, choice, onChoice, replace, onReplace, staff = false, disabled = false }) {
  const [hover, setHover] = useState(null)
  const openPlan = plans.find(p => p.open)
  const newBlocked = !!openPlan
  const row = (key, off) => ({
    display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px', borderRadius: '12px', marginBottom: '8px',
    border: `1px solid ${choice === key ? '#125ecc' : 'var(--vfo-border-soft)'}`,
    background: choice === key ? 'rgba(18,94,204,0.06)' : hover === key && !off ? 'var(--vfo-tint)' : 'var(--vfo-card)',
    cursor: off || disabled ? 'not-allowed' : 'pointer', opacity: off ? 0.6 : 1,
  })
  const title = { fontSize: '13.5px', fontWeight: 700, color: 'var(--vfo-ink)' }
  const sub = { fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px', lineHeight: 1.5 }
  // Newest first: the plan most likely meant is on top.
  const list = [...plans].reverse()
  return (
    <div role="radiogroup" aria-label="Tax plan">
      {list.map(p => {
        const key = String(p.id)
        const note = planNote(p, staff)
        return (
          <div key={key} style={row(key, false)} onClick={() => { if (!disabled && choice !== key) onChoice(key) }} onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)}>
            <input type="radio" name="tax-form-plan" checked={choice === key} disabled={disabled} onChange={() => onChoice(key)} style={{ marginTop: '3px', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <span style={title}>{p.tax_year ? `${p.tax_year} tax plan` : 'Tax plan'}</span>
                <PlanStatusTag plan={p} state={p.completed ? 'completed' : 'in progress'} />
              </span>
              <span style={{ ...sub, display: 'block' }}>Started {formatDate(p.created_at)} - {PROGRAM(p)}</span>
              {choice === key && note && <span style={{ ...sub, display: 'block' }}>{note}</span>}
              {p.has_form && choice !== key && <span style={{ ...sub, display: 'block' }}>Already has a Tax Planning Form.</span>}
              {p.has_form && choice === key && (
                <label onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '12.5px', color: 'var(--vfo-ink)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!replace} disabled={disabled} onChange={e => onReplace(e.target.checked)} />
                  <span>Replace its form{staff ? '. The old one is kept under Earlier forms on the plan' : ''}</span>
                </label>
              )}
            </span>
          </div>
        )
      })}
      <div style={row('new', newBlocked)} onClick={() => { if (!disabled && !newBlocked && choice !== 'new') onChoice('new') }} onMouseEnter={() => setHover('new')} onMouseLeave={() => setHover(null)}>
        <input type="radio" name="tax-form-plan" checked={choice === 'new'} disabled={disabled || newBlocked} onChange={() => onChoice('new')} style={{ marginTop: '3px', flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={title}>New plan</span>
          <span style={{ ...sub, display: 'block' }}>
            {newBlocked
              ? `Stop the current tax plan first${staff ? '' : ': please ask your VFO team'}.`
              : `Starts a new tax plan for ${clientName || 'this client'}.`}
          </span>
        </span>
      </div>
    </div>
  )
}
