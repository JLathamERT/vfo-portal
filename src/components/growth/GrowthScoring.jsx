import { useState, useEffect } from 'react'
import { callApi } from '../../lib/api'
import { TrackHero } from '../shared/TrackKit'
import { StepNav, BTN_LARGE, inputStyle, eyebrowLabel, rowRule, BLUE, INK, MUTED } from './ui'
import { getGrowthConfig } from './constants'
import { computeScores, blankAnswers } from './scoring'
import { ProfileCard, Switch } from '../shared/ProfileKit'
import { btnPrimary, btnOutline, btnState, BTN_SMALL } from '../shared/buttonStyles'

function fmtCompleted(iso) {
  if (!iso) return ''
  const d = new Date(iso); const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function compositeFrom(score, enabled, sections) {
  if (!score) return null
  const vals = []
  for (const s of sections) {
    const v = score[`${s.key}_score`]
    if (enabled[s.key] && v != null) vals.push(Number(v))
  }
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}
function rowsFromBundle(bundle) {
  return (bundle.partnerships || []).map(p => ({ name: p.name || '', score: p.is_na ? '' : (p.score ?? ''), is_na: !!p.is_na }))
}
function initEnabled(score) {
  return {
    section1: score ? score.section1_enabled !== false : true,
    section2: score ? score.section2_enabled !== false : true,
    section3: score ? score.section3_enabled !== false : true,
  }
}

// A scored question is answered when it has a value OR is marked N/A.
// 'partnerships' and 'areas' are exempt — an empty list already counts as N/A by
// the score math. A 'preference' question additionally needs a radio option.
function isAnswered(q, a, q10pref) {
  if (q.type === 'partnerships' || q.type === 'areas') return true
  if (a && a.na) return true
  const hasValue = !!(a && a.value !== '' && a.value !== null && a.value !== undefined)
  if (q.preference) return hasValue && !!q10pref
  return hasValue
}
function firstUnanswered(sections, answers, q10pref) {
  for (const s of sections) for (const q of s.questions) if (!isAnswered(q, answers[q.id], q10pref)) return q.id
  return null
}

export default function GrowthScoring({ memberNumber, bundle, reload, onNavigate, variant }) {
  const cfg = getGrowthConfig(variant)
  const sections = cfg.sections
  const score = bundle.score
  const [view, setView] = useState(score ? 'summary' : 'form')
  const [answers, setAnswers] = useState(() => ({ ...blankAnswers(sections), ...(score?.raw_answers?.answers || {}) }))
  const [partners, setPartners] = useState(() => rowsFromBundle(bundle))
  const [q10pref, setQ10pref] = useState(score?.raw_answers?.q10_preference || '')
  const [enabled, setEnabled] = useState(initEnabled(score))
  const [saving, setSaving] = useState(false)
  const [triedGenerate, setTriedGenerate] = useState(false)

  // The MSM is assigned on "Get Started" (member-keyed four_ways row). Fall back
  // to an existing score's MSM so plans created before that step still score.
  const assignedEmail = bundle.four_ways?.assigned_admin_email || score?.assigned_admin_email || ''
  const assignedName = bundle.four_ways?.assigned_admin_name || score?.assigned_admin_name || ''

  useEffect(() => {
    setAnswers({ ...blankAnswers(sections), ...(score?.raw_answers?.answers || {}) })
    setPartners(rowsFromBundle(bundle))
    setQ10pref(score?.raw_answers?.q10_preference || '')
    setEnabled(initEnabled(score))
    setTriedGenerate(false)
    setView(score ? 'summary' : 'form')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score?.id])

  function setAns(qid, patch) { setAnswers(a => ({ ...a, [qid]: { ...a[qid], ...patch } })) }

  async function generate() {
    if (!assignedEmail) { alert('Assign an MSM on the Get Started page before generating a score.'); if (onNavigate) onNavigate('gp_start'); return }
    const missing = firstUnanswered(sections, answers, q10pref)
    if (missing) {
      setTriedGenerate(true)
      const el = typeof document !== 'undefined' ? document.getElementById('gpq-' + missing) : null
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSaving(true)
    try {
      const sc = computeScores(sections, answers, partners, { section1: true, section2: true, section3: true })
      await callApi('growth_plan_save_score', {
        member_number: memberNumber,
        completed_at: new Date().toISOString(),
        section1_score: sc.section1, section2_score: sc.section2, section3_score: sc.section3,
        composite_score: sc.composite,
        section1_enabled: true, section2_enabled: true, section3_enabled: true,
        raw_answers: { answers, q10_preference: q10pref },
        assigned_admin_email: assignedEmail,
        assigned_admin_name: assignedName || '',
        partnerships: partners
          .filter(r => (r.name && r.name.trim()) || r.is_na || r.score !== '')
          .map(r => ({ name: r.name?.trim() || null, score: r.is_na ? null : (r.score === '' ? null : Number(r.score)), is_na: !!r.is_na })),
        actions: cfg.defaultActions,
      })
      await reload()
    } catch (e) { alert(e?.message || 'Failed to generate score') }
    finally { setSaving(false) }
  }

  async function toggleSection(key) {
    const next = { ...enabled, [key]: !enabled[key] }
    setEnabled(next)
    try {
      await callApi('growth_plan_save_summary', {
        member_number: memberNumber,
        section1_enabled: next.section1, section2_enabled: next.section2, section3_enabled: next.section3,
        composite_score: compositeFrom(score, next, sections),
      })
    } catch (e) { setEnabled(enabled); alert(e?.message || 'Failed to save') }
  }

  // ── Summary view ──────────────────────────────────────────────────────
  if (view === 'summary' && score) {
    const composite = compositeFrom(score, enabled, sections)
    const anyOn = sections.some(s => enabled[s.key])
    return (
      <div>
        <TrackHero
          eyebrow="Growth Plan"
          title="Growth Summary Score"
          meta={<>Score completed on <strong style={{ color: 'var(--vfo-ink-2)' }}>{fmtCompleted(score.completed_at || score.created_at)}</strong>{(score.assigned_admin_name || score.assigned_admin_email) && <> · Assigned MSM <strong style={{ color: 'var(--vfo-ink-2)' }}>{score.assigned_admin_name || score.assigned_admin_email}</strong></>}</>}
        />
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '16px' }}>
          {/* Scoring-on switches — sized to content so the page background shows below */}
          <ProfileCard icon="settings" title="Scoring on" style={{ marginBottom: 0, flex: '0 0 300px', maxWidth: '100%' }} bodyStyle={{ paddingTop: '4px', paddingBottom: '4px' }}>
            {sections.map((s, i) => (
              <label key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 0', ...rowRule(i), cursor: 'pointer' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: INK, lineHeight: 1.35 }}>{s.label}</span>
                <Switch on={enabled[s.key]} onClick={() => toggleSection(s.key)} label={s.label} />
              </label>
            ))}
          </ProfileCard>

          {/* Growth Score card */}
          <ProfileCard icon="award" title="Overall Growth Score" style={{ marginBottom: 0, flex: '1 1 400px', minWidth: '320px' }}>
            <div style={{ padding: '14px 0 8px', textAlign: 'center' }}>
              <ScoreRing value={composite} size={144} primary />
              {anyOn ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '34px auto 26px', maxWidth: '480px' }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--vfo-border-soft)' }} />
                    <span style={eyebrowLabel}>By section</span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--vfo-border-soft)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '40px' }}>
                    {sections.filter(s => enabled[s.key]).map(s => (
                      <ScoreRing key={s.key} value={score[`${s.key}_score`]} size={104} label={s.label} />
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '12.5px', color: MUTED, marginTop: '22px' }}>Select a section to include it in the score.</div>
              )}
            </div>
          </ProfileCard>
        </div>
        <StepNav
          onNext={() => onNavigate('gp_actions')}
          nextLabel="Continue →"
          secondary={<button onClick={() => { setTriedGenerate(false); setView('form') }} style={{ ...btnOutline, ...BTN_LARGE }}>Edit answers / Re-score</button>}
        />
      </div>
    )
  }

  // ── Form view ─────────────────────────────────────────────────────────
  const canGenerate = !!assignedEmail
  const missingCount = sections.reduce((n, s) => n + s.questions.filter(q => !isAnswered(q, answers[q.id], q10pref)).length, 0)
  return (
    <div>
      <TrackHero
        eyebrow="Growth Plan"
        title="Scoring Growth"
      />
      <ProfileCard icon="user" title="Assigned MSM"
        action={<button onClick={() => onNavigate('gp_start')} style={btnOutline}>{assignedEmail ? 'Change on Get Started' : 'Assign on Get Started'} →</button>}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: assignedEmail ? INK : '#e74c3c' }}>
          {assignedName || assignedEmail || 'Not set — assign on Get Started'}
        </div>
      </ProfileCard>
      {sections.map((s, idx) => (
        <ProfileCard key={s.key} icon="clipboard" title={s.label} sub={`SECTION ${idx + 1}`} bodyStyle={{ paddingTop: '4px' }}>
          {s.questions.map((q, qi) => (
            <QuestionRow key={q.id} q={q} first={qi === 0} ans={answers[q.id]} setAns={setAns}
              partners={partners} setPartners={setPartners}
              q10pref={q10pref} setQ10pref={setQ10pref} prefOptions={cfg.q10PreferenceOptions || []}
              invalid={triedGenerate && !isAnswered(q, answers[q.id], q10pref)} />
          ))}
        </ProfileCard>
      ))}
      <button onClick={generate} disabled={saving || !canGenerate} style={btnState({ ...btnPrimary, ...BTN_LARGE }, saving || !canGenerate)}>
        {saving ? 'Generating…' : 'Generate Score'}
      </button>
      {!canGenerate && <div style={{ marginTop: '10px', fontSize: '12px', color: MUTED }}>Assign an <strong style={{ color: INK }}>MSM</strong> on the <button onClick={() => onNavigate('gp_start')} style={{ background: 'none', border: 'none', padding: 0, color: BLUE, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>Get Started</button> page to enable scoring.</div>}
      {score && canGenerate && <div style={{ marginTop: '10px', fontSize: '12px', color: MUTED }}>Re-scoring updates the score and <strong style={{ color: INK }}>keeps your prioritized actions</strong> — the previous version is saved to Growth History.</div>}
      {triedGenerate && missingCount > 0 && <div style={{ marginTop: '10px', fontSize: '12.5px', color: '#e74c3c', fontWeight: 600 }}>Please answer the {missingCount} highlighted question{missingCount === 1 ? '' : 's'} — choose a score or check N/A.</div>}
    </div>
  )
}

// "+ Add Other Area" / "+ Create Partnership": a small row action.
const addBtn = { ...btnOutline, ...BTN_SMALL }

function ScoreRing({ value, label, size = 78, primary }) {
  // Fixed white circle with VFO-navy number in BOTH themes (Jake's call,
  // 2026-07-02) — literals on purpose, do not migrate to var(--vfo-*).
  const shadow = primary ? '0 10px 24px rgba(0,32,96,0.30)' : '0 4px 12px rgba(18,94,204,0.16)'
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', margin: '0 auto', background: '#ffffff', border: '1px solid #dbe4f2', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: shadow }}>
        <span style={{ color: '#002973', fontWeight: 800, fontSize: Math.round(size * 0.36) + 'px', fontFamily: 'Inter, sans-serif', letterSpacing: '-0.02em' }}>{value == null ? 'N/A' : value}</span>
      </div>
      {label && <div style={{ fontSize: '11px', fontWeight: 600, color: MUTED, marginTop: '10px', maxWidth: size + 90, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.35 }}>{label}</div>}
    </div>
  )
}

function QuestionRow({ q, first, ans, setAns, partners, setPartners, q10pref, setQ10pref, prefOptions, invalid }) {
  const a = ans || { value: '', na: false, notes: '' }
  const required = q.type !== 'partnerships' && q.type !== 'areas'
  const scoreMissing = !a.na && (a.value === '' || a.value === null || a.value === undefined)
  const prefMissing = !!q.preference && !a.na && !q10pref
  return (
    <div id={'gpq-' + q.id} style={{ padding: '14px 0', ...rowRule(first ? 0 : 1) }}>
      <div style={{ fontSize: '13.5px', color: INK, marginBottom: '10px', lineHeight: 1.5 }}>{q.text}{required && <span style={{ color: '#e74c3c', marginLeft: '4px' }}>*</span>}</div>
      {q.type === 'partnerships' ? (
        <PartnershipEditor partners={partners} setPartners={setPartners} />
      ) : q.type === 'areas' ? (
        <AreasEditor q={q} ans={a} setAns={setAns} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <select value={a.na ? '' : a.value} disabled={a.na} onChange={e => setAns(q.id, { value: e.target.value })} style={{ ...inputStyle, minWidth: '170px', opacity: a.na ? 0.5 : 1, border: (invalid && scoreMissing) ? '1px solid #e74c3c' : inputStyle.border }}>
            <option value="">-- Select --</option>
            {q.type === 'words'
              ? q.options.map(o => <option key={o.label} value={o.value}>{o.label}</option>)
              : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: MUTED, cursor: 'pointer' }}>
            <input type="checkbox" checked={a.na} onChange={e => setAns(q.id, { na: e.target.checked })} style={{ accentColor: BLUE }} /> N/A
          </label>
        </div>
      )}
      {invalid && required && scoreMissing && <div style={{ color: '#e74c3c', fontSize: '11.5px', marginTop: '8px' }}>Required — choose a score or check N/A.</div>}
      {q.preference && (
        <div style={{ marginTop: '14px', paddingLeft: invalid && prefMissing ? '10px' : '2px', borderLeft: invalid && prefMissing ? '2px solid #e74c3c' : 'none' }}>
          {prefOptions.map(o => (
            <label key={o.value} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', color: INK, marginBottom: '8px', cursor: 'pointer', lineHeight: 1.45 }}>
              <input type="radio" name={q.id + '_pref'} checked={q10pref === o.value} onChange={() => setQ10pref(o.value)} style={{ marginTop: '3px', accentColor: BLUE }} />
              <span>{o.label}</span>
            </label>
          ))}
          {invalid && prefMissing && <div style={{ color: '#e74c3c', fontSize: '11.5px', marginTop: '2px' }}>Required — choose one of the options above.</div>}
        </div>
      )}
      <textarea value={a.notes || ''} onChange={e => setAns(q.id, { notes: e.target.value })} placeholder="Notes" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginTop: '10px', minHeight: '44px', resize: 'vertical' }} />
    </div>
  )
}

// Compliance Factory matrix: fixed areas + add-your-own "Others". Each row is
// scored 1–10 (scale:'numeric') or by a word dropdown (scale:'words'); Q12 also
// captures a manager Name per row (hasManager). The row average feeds the score.
function AreasEditor({ q, ans, setAns }) {
  const areas = ans.areas || {}
  const others = ans.others || []
  const fixed = q.areas || []

  function setArea(key, patch) {
    const cur = areas[key] || { value: '', na: false, manager: '' }
    setAns(q.id, { areas: { ...areas, [key]: { ...cur, ...patch } } })
  }
  function setOther(i, patch) { setAns(q.id, { others: others.map((r, j) => j === i ? { ...r, ...patch } : r) }) }
  function addOther() { setAns(q.id, { others: [...others, { label: '', value: '', na: false, manager: '' }] }) }
  function removeOther(i) { setAns(q.id, { others: others.filter((_, j) => j !== i) }) }

  const ScoreCell = ({ entry, onChange }) => (
    <select value={entry?.na ? '' : (entry?.value ?? '')} disabled={entry?.na} onChange={e => onChange({ value: e.target.value })} style={{ ...inputStyle, minWidth: q.scale === 'words' ? '210px' : '110px', opacity: entry?.na ? 0.5 : 1 }}>
      <option value="">-Choose-</option>
      {q.scale === 'words'
        ? q.options.map(o => <option key={o.label} value={o.value}>{o.label}</option>)
        : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  )
  const NaCell = ({ entry, onChange }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: MUTED, cursor: 'pointer' }}>
      <input type="checkbox" checked={!!entry?.na} onChange={e => onChange({ na: e.target.checked })} style={{ accentColor: BLUE }} /> N/A
    </label>
  )

  return (
    <div>
      {fixed.map(ar => {
        const entry = areas[ar.key] || { value: '', na: false, manager: '' }
        return (
          <div key={ar.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '9px 0', borderTop: '1px solid var(--vfo-border-soft)' }}>
            <div style={{ flex: '1 1 200px', fontSize: '13px', fontWeight: 600, color: INK }}>{ar.label}</div>
            {q.hasManager && <input placeholder="Name" value={entry.manager || ''} onChange={e => setArea(ar.key, { manager: e.target.value })} style={{ ...inputStyle, flex: '0 0 160px' }} />}
            <ScoreCell entry={entry} onChange={p => setArea(ar.key, p)} />
            <NaCell entry={entry} onChange={p => setArea(ar.key, p)} />
          </div>
        )
      })}
      {others.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '9px 0', borderTop: '1px solid var(--vfo-border-soft)' }}>
          <input placeholder="Other compliance area" value={r.label || ''} onChange={e => setOther(i, { label: e.target.value })} style={{ ...inputStyle, flex: '1 1 200px', minWidth: '160px' }} />
          {q.hasManager && <input placeholder="Name" value={r.manager || ''} onChange={e => setOther(i, { manager: e.target.value })} style={{ ...inputStyle, flex: '0 0 160px' }} />}
          <ScoreCell entry={r} onChange={p => setOther(i, p)} />
          <NaCell entry={r} onChange={p => setOther(i, p)} />
          <button onClick={() => removeOther(i)} title="Remove" style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
      ))}
      <button onClick={addOther} style={{ ...addBtn, marginTop: '10px' }}>+ Add Other Area</button>
    </div>
  )
}

function PartnershipEditor({ partners, setPartners }) {
  function update(i, patch) { setPartners(rows => rows.map((r, j) => j === i ? { ...r, ...patch } : r)) }
  function add() { setPartners(rows => [...rows, { name: '', score: '', is_na: false }]) }
  function remove(i) { setPartners(rows => rows.filter((_, j) => j !== i)) }
  return (
    <div>
      {partners.length === 0 && <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginBottom: '8px' }}>No partnerships added yet.</div>}
      {partners.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <input placeholder="Partner name" value={r.name} onChange={e => update(i, { name: e.target.value })} style={{ ...inputStyle, flex: '1 1 200px', minWidth: '160px' }} />
          <select value={r.is_na ? '' : r.score} disabled={r.is_na} onChange={e => update(i, { score: e.target.value })} style={{ ...inputStyle, width: '92px', opacity: r.is_na ? 0.5 : 1 }}>
            <option value="">Score</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: MUTED, cursor: 'pointer' }}>
            <input type="checkbox" checked={r.is_na} onChange={e => update(i, { is_na: e.target.checked })} style={{ accentColor: BLUE }} /> N/A
          </label>
          <button onClick={() => remove(i)} title="Remove" style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
      ))}
      <button onClick={add} style={{ ...addBtn, marginTop: '4px' }}>+ Create Partnership</button>
    </div>
  )
}
