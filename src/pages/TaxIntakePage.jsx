import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TokenShell from '../components/shared/TokenShell'
import TaxIntakeForm from '../components/member/TaxIntakeForm'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

// PUBLIC page — the client's own Tax Planning Form, reached from the
// "Complete the Tax Planning Form" button in TAX_intake_link. No session and no
// login: the `token` in the URL is the whole credential (#310), and it is the
// only thing this page ever sends that selects anything.
//
// Raw fetch rather than lib/api.js, like every other token page (the api helper
// attaches the portal session and its retry policy, neither of which applies
// here).
export default function TaxIntakePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const paid = searchParams.get('paid') === '1'
  const cancelled = searchParams.get('cancelled') === '1'

  const [status, setStatus] = useState('loading')
  const [intake, setIntake] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setError('This link is not valid.'); setStatus('error'); return }
    let live = true
    ;(async () => {
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'tax_intake_link_load', token }),
        })
        const data = await res.json()
        if (!live) return
        if (!res.ok) {
          setError(data?.error || 'This link is not valid.')
          setStatus('error')
          return
        }
        // Back from Stripe: the webhook has usually already flipped the row to
        // completed by the time this page loads, so the paid return is checked
        // FIRST — the client just paid, this is their thank-you, not a re-visit.
        if (paid) { setStatus('thanks'); return }
        if (data.status === 'completed' || data.status === 'paid' || data.status === 'waived') {
          setStatus('already')
          return
        }
        setIntake(data)
        setStatus('form')
      } catch (err) {
        if (!live) return
        setError('Unable to connect. Please try again later.')
        setStatus('error')
      }
    })()
    return () => { live = false }
  }, [token, paid])

  async function submitAnswers(answers) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'tax_intake_link_submit', token, answers }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'Something went wrong — please try again.')
    return data
  }

  // Same states and the same text-glyph icon circle as the other token pages
  // (TaxDecidePage / OnboardingMeetingPage) — no emoji anywhere.
  if (status === 'loading') {
    return <TokenShell maxWidth={520}><Message icon="…" color="#0095ff" title="One moment" message="Loading your Tax Planning Form..." /></TokenShell>
  }
  if (status === 'error') {
    return <TokenShell maxWidth={520}><Message icon="!" color="#d93025" title="We could not open this form" message={error} /></TokenShell>
  }
  if (status === 'already') {
    return <TokenShell maxWidth={520}><Message icon="✓" color="#64748b" title="Thank you." message="We have already received your Tax Planning Form — no further action is needed. Your VFO member will be in touch." /></TokenShell>
  }
  if (status === 'thanks') {
    return <TokenShell maxWidth={520}><Message icon="✓" color="#16a34a" title="Thank you." message="Your Tax Planning Form has been received. A confirmation email is on its way, and the tax planning team will be allocated in due course." /></TokenShell>
  }

  // A link from a confirmed VFO Tax Diagnostic is PAY-ONLY: the answers were
  // already given and confirmed, so the email button goes straight on to Stripe's
  // payment page. The card (with its own Pay button) only shows when the payer
  // came BACK from Stripe without paying, or the hand-off failed.
  if (intake?.diagnostic) {
    return (
      <TokenShell maxWidth={560}>
        <DiagnosticDepositCard intake={intake} autoStart={!cancelled} onPay={() => submitAnswers({})} onDone={() => setStatus('thanks')} />
      </TokenShell>
    )
  }

  return (
    <TokenShell maxWidth={900}>
      <TaxIntakeForm
        publicMode
        publicIntake={intake}
        onPublicSubmit={submitAnswers}
        onDone={() => setStatus('thanks')}
      />
    </TokenShell>
  )
}

function DiagnosticDepositCard({ intake, autoStart, onPay, onDone }) {
  // Starts "busy" on the auto path so the card never flashes before the hand-off.
  const [busy, setBusy] = useState(!!autoStart)
  const [failed, setFailed] = useState('')
  const started = useRef(false)
  useEffect(() => {
    if (!autoStart || started.current) return
    started.current = true
    pay()
  }, [autoStart])
  const clientName = `${intake.client_first_name || ''} ${intake.client_last_name || ''}`.trim()
  const memberPays = intake.payer === 'member'
  const amount = intake.deposit_amount || 500

  async function pay() {
    setBusy(true); setFailed('')
    try {
      const res = await onPay()
      if (res?.url) { window.location.assign(res.url); return }
      onDone()
    } catch (err) {
      setFailed(err?.message || 'Something went wrong — please try again.')
      setBusy(false)
    }
  }

  const row = { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '13.5px' }
  if (autoStart && busy && !failed) {
    return <Message icon="…" color="#0095ff" title="One moment" message="Taking you to the secure payment page..." />
  }
  return (
    <div>
      <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '4px' }}>VFO Tax Planning</div>
      <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--vfo-heading)', margin: '0 0 8px' }}>Tax Planning Deposit</h1>
      <p style={{ fontSize: '13.5px', lineHeight: 1.7, color: 'var(--vfo-muted)', margin: '0 0 18px' }}>
        {memberPays
          ? `Thank you for the VFO Tax Diagnostic for ${clientName || 'your client'}. The next step is the deposit, which starts their tax planning.`
          : 'Thank you for your VFO Tax Diagnostic. The next step is the deposit, which starts your tax planning.'}
      </p>
      <div style={{ marginBottom: '18px' }}>
        <div style={row}><span style={{ color: 'var(--vfo-muted)' }}>Client</span><span style={{ fontWeight: 600, color: 'var(--vfo-ink)' }}>{clientName}</span></div>
        {intake.member_display_name && (
          <div style={row}><span style={{ color: 'var(--vfo-muted)' }}>VFO member</span><span style={{ fontWeight: 600, color: 'var(--vfo-ink)' }}>{intake.member_display_name}</span></div>
        )}
        <div style={{ ...row, borderBottom: 'none' }}><span style={{ color: 'var(--vfo-muted)' }}>Deposit</span><span style={{ fontWeight: 700, color: 'var(--vfo-ink)' }}>{intake.deposit_required === false ? 'Waived' : `$${amount}`}</span></div>
      </div>
      {intake.deposit_required !== false && (
        <p style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', margin: '0 0 18px', lineHeight: 1.6 }}>The deposit is fully refundable if we are unable to proceed.</p>
      )}
      {failed && <div style={{ marginBottom: '14px', fontSize: '13px', color: '#d93025' }}>{failed}</div>}
      <button type="button" onClick={pay} disabled={busy}
        style={{ width: '100%', padding: '12px 24px', borderRadius: '999px', fontSize: '14px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', border: 'none', background: busy ? 'var(--vfo-faint)' : '#1b9254', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
        {busy ? 'One moment...' : intake.deposit_required === false ? 'Continue' : `Pay $${amount} deposit`}
      </button>
    </div>
  )
}

function Message({ icon, color, title, message }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      <div style={{ width: '72px', height: '72px', borderRadius: '50%', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: color + '20' }}>
        <span style={{ fontSize: '32px', lineHeight: 1 }}>{icon}</span>
      </div>
      <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: '21px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-heading)', margin: '0 0 12px' }}>{title}</h1>
      <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--vfo-muted)', margin: 0 }}>{message}</p>
    </div>
  )
}
