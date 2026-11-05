import { useEffect, useState } from 'react'
import { callApi, loadCachedData } from '../../lib/api'

// The Staging tab: test site only, loaded only in a staging build. Any admin can see
// what is running and reset their OWN test member; only a superadmin sees Reset
// everyone. The backend is the real gate (actions/staging/reset.ts).

const BUILD_SHA = import.meta.env.VITE_BUILD_SHA || ''

function fmtWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

const cardStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
const titleStyle = { fontSize: '17px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '8px' }
const textStyle = { fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.55, margin: 0 }
const rowStyle = { display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', fontSize: '14px', padding: '8px 0', borderTop: '1px solid var(--vfo-border-soft)' }
const inputStyle = { padding: '9px 12px', border: '1px solid var(--vfo-border-strong)', borderRadius: '8px', fontSize: '14px', fontFamily: 'Inter, sans-serif', flex: '1 1 180px', maxWidth: '260px', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', boxSizing: 'border-box' }

function eventLine(event, extra = '') {
  return event ? `${fmtWhen(event.at)}, by ${event.by}${extra}` : 'Not yet'
}

function subscriptionNote(res) {
  const failures = res.subscription_failures || []
  return failures.length ? ` Could not cancel these Stripe sandbox subscriptions, so cancel them by hand: ${failures.join('; ')}.` : ''
}

function ResetCard({ title, body, word, button, busy, onReset, result, error }) {
  const [typed, setTyped] = useState('')
  const ready = typed === word && !busy
  return (
    <div style={cardStyle}>
      <div style={titleStyle}>{title}</div>
      <p style={textStyle}>{body}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
        <input
          value={typed}
          onChange={e => setTyped(e.target.value)}
          placeholder={`Type ${word} to confirm`}
          aria-label={`Type ${word} to confirm`}
          autoComplete="off"
          disabled={busy}
          style={inputStyle}
        />
        <button
          onClick={async () => { if (await onReset(typed)) setTyped('') }}
          disabled={!ready}
          style={{ padding: '9px 18px', border: 'none', borderRadius: '8px', background: ready ? '#e74c3c' : 'var(--vfo-border-strong)', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: ready ? 'pointer' : 'default', fontFamily: 'Inter, sans-serif' }}
        >{busy ? 'Resetting...' : button}</button>
      </div>
      {result && <div style={{ color: '#1b9254', fontSize: '14px', marginTop: '12px' }}>{result}</div>}
      {error && <div style={{ color: '#e74c3c', fontSize: '14px', marginTop: '12px' }}>{error}</div>}
    </div>
  )
}

const TABLE_NAMES = {
  email_templates: 'Email templates', agreement_templates: 'Agreement templates', notification_rules: 'Notification rules',
  portal_feature_flags: 'Feature switches', pipelines: 'Pipelines', programs: 'Programs',
  program_client_phases: 'Program client phases', program_client_tasks: 'Program client tasks',
  program_training_phases: 'Program training phases', program_training_tasks: 'Program training tasks',
  faq_categories: 'FAQ categories', faq_items: 'FAQ items', gc_services: 'Growth Credit services',
  member_number_baselines: 'Member number baselines',
}

function ChangeList({ label, items }) {
  if (!items?.length) return null
  return (
    <div style={{ marginTop: '6px' }}>
      <span style={{ color: 'var(--vfo-muted)' }}>{label}: </span>
      <span style={{ overflowWrap: 'anywhere' }}>{items.join(', ')}</span>
    </div>
  )
}

function RefreshPreview({ preview }) {
  const changed = preview.tables.filter(t => t.added.length || t.updated.length)
  const kept = preview.tables.filter(t => t.only_here.length)
  return (
    <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', marginTop: '16px' }}>
      {!changed.length && !preview.files.copy.length && <div>Everything already matches live.</div>}
      {changed.map(t => (
        <div key={t.table} style={{ padding: '8px 0', borderTop: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ fontWeight: 600 }}>{TABLE_NAMES[t.table] || t.table}</div>
          <ChangeList label="New" items={t.added} />
          <ChangeList label="Updated" items={t.updated} />
        </div>
      ))}
      {preview.files.copy.length > 0 && (
        <div style={{ padding: '8px 0', borderTop: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ fontWeight: 600 }}>Template files</div>
          <ChangeList label="Copied from live" items={preview.files.copy} />
        </div>
      )}
      {(kept.length > 0 || preview.files.only_here.length > 0) && (
        <div style={{ padding: '8px 0', borderTop: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ fontWeight: 600 }}>Only on the test site, and kept</div>
          {kept.map(t => <ChangeList key={t.table} label={TABLE_NAMES[t.table] || t.table} items={t.only_here} />)}
          <ChangeList label="Files" items={preview.files.only_here} />
        </div>
      )}
    </div>
  )
}

function RefreshCard({ onDone }) {
  const [busy, setBusy] = useState(null)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  const hasChanges = preview && (preview.files.copy.length > 0 || preview.tables.some(t => t.added.length || t.updated.length))

  async function check() {
    setBusy('check')
    setResult('')
    setError('')
    setPreview(null)
    try {
      const res = await callApi('staging_refresh_settings', { dry_run: true })
      if (res.error) throw new Error(res.error)
      setPreview(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  // A big file can run past one request's time, so this presses again until none are left.
  async function apply() {
    setBusy('apply')
    setResult('')
    setError('')
    try {
      let rows = 0
      let files = 0
      for (let round = 0; round < 6; round++) {
        const res = await callApi('staging_refresh_settings', { dry_run: false })
        if (res.error) throw new Error(res.error)
        rows += res.rows_written
        files += res.files_copied
        if (!res.remaining) {
          setPreview(null)
          setResult(`Done. ${rows} settings rows and ${files} files updated from live.`)
          loadCachedData({ refresh: true }).catch(() => {})
          onDone()
          return
        }
      }
      throw new Error('Some files are still left to copy. Press Check again, then Apply.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const buttonStyle = (on, color) => ({ padding: '9px 18px', border: 'none', borderRadius: '8px', background: on ? color : 'var(--vfo-border-strong)', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: on ? 'pointer' : 'default', fontFamily: 'Inter, sans-serif' })
  return (
    <div style={cardStyle}>
      <div style={titleStyle}>Refresh settings from live</div>
      <p style={textStyle}>Copies email templates, agreements, notification rules, feature switches, programs, FAQs and template files from live. It adds and updates only, and keeps anything that exists only on the test site. It never copies people's data, admin logins, sandbox settings or the widget.</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
        <button onClick={check} disabled={!!busy} style={buttonStyle(!busy, '#2563eb')}>{busy === 'check' ? 'Checking...' : 'Check what would change'}</button>
        {hasChanges && <button onClick={apply} disabled={!!busy} style={buttonStyle(!busy, '#e74c3c')}>{busy === 'apply' ? 'Applying...' : 'Apply these changes'}</button>}
      </div>
      {preview && <RefreshPreview preview={preview} />}
      {result && <div style={{ color: '#1b9254', fontSize: '14px', marginTop: '12px' }}>{result}</div>}
      {error && <div style={{ color: '#e74c3c', fontSize: '14px', marginTop: '12px' }}>{error}</div>}
    </div>
  )
}

export default function StagingPanel({ session }) {
  const [status, setStatus] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(null)
  const [outcome, setOutcome] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const data = await callApi('staging_status_load')
      if (data.error) throw new Error(data.error)
      setStatus(data)
      setLoadError('')
    } catch (e) {
      setLoadError(e.message)
    }
  }

  async function reset(which, action, word, describe) {
    setBusy(which)
    setOutcome(prev => ({ ...prev, [which]: null }))
    try {
      const res = await callApi(action, { confirm: word })
      if (res.error) throw new Error(res.error)
      setOutcome(prev => ({ ...prev, [which]: { result: describe(res) + subscriptionNote(res) } }))
      loadCachedData({ refresh: true }).catch(() => {})
      load()
      return true
    } catch (e) {
      setOutcome(prev => ({ ...prev, [which]: { error: e.message } }))
      return false
    } finally {
      setBusy(null)
    }
  }

  const lastReset = status?.last_reset
  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: '32px 24px' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--vfo-heading)', margin: '0 0 6px' }}>Staging</h2>
      <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: '0 0 24px' }}>
        Tools for the test site. Nothing on this page can reach the live portal.
      </p>

      <div style={cardStyle}>
        <div style={titleStyle}>What is running</div>
        {loadError && <div style={{ color: '#e74c3c', fontSize: '14px', marginBottom: '8px' }}>{loadError}</div>}
        <div style={rowStyle}><span style={{ color: 'var(--vfo-muted)' }}>Website</span><span>{BUILD_SHA ? `${BUILD_SHA}${import.meta.env.DEV ? ' (dev server)' : ''}` : 'Unknown'}</span></div>
        <div style={rowStyle}><span style={{ color: 'var(--vfo-muted)' }}>Backend</span><span>{status?.backend_version ? `v${status.backend_version}` : 'Unknown'}</span></div>
        <div style={rowStyle}><span style={{ color: 'var(--vfo-muted)' }}>Your test member</span><span>{status?.my_member_number || 'None'}</span></div>
        <div style={rowStyle}><span style={{ color: 'var(--vfo-muted)' }}>Last reset</span><span>{eventLine(lastReset, lastReset ? (lastReset.scope === 'everyone' ? ' (everyone)' : ' (their own)') : '')}</span></div>
        <div style={rowStyle}><span style={{ color: 'var(--vfo-muted)' }}>Last reset of everyone</span><span>{eventLine(status?.last_reset_everyone)}</span></div>
        <div style={rowStyle}><span style={{ color: 'var(--vfo-muted)' }}>Last settings refresh</span><span>{eventLine(status?.last_refresh)}</span></div>
      </div>

      <ResetCard
        title="Reset my test data"
        body="Wipes your test member, its clients, plans, payments, bells and files, and starts it fresh with the same member number and 3 clients at step 1. Your specialist, tax planner and team member go back to how they started. Nobody else's work is touched. Specialists you added by hand, Tax Diagnostic forms not matched to your member and onboardings you added by hand don't belong to one person, so they stay until someone resets everyone."
        word="RESET"
        button="Reset my data"
        busy={busy === 'mine'}
        onReset={word => reset('mine', 'staging_reset_mine', word, res => `Done. Test member ${res.member_number} is fresh. Member and client logins for it need to sign in again.`)}
        result={outcome.mine?.result}
        error={outcome.mine?.error}
      />

      {session?.is_superadmin && <RefreshCard onDone={load} />}

      {session?.is_superadmin && (
        <ResetCard
          title="Reset everyone"
          body="Wipes ALL test data for ALL people and re-makes each person's test member, specialist, tax planner and team member. Use this rarely: anyone in the middle of a test loses their work. Admin logins and settings stay."
          word="RESET EVERYONE"
          button="Reset everyone"
          busy={busy === 'all'}
          onReset={word => reset('all', 'staging_reset_all', word, res => `Done. ${Object.keys(res.members || {}).length} test members re-made. Everyone's member and client logins need to sign in again.`)}
          result={outcome.all?.result}
          error={outcome.all?.error}
        />
      )}
    </div>
  )
}
