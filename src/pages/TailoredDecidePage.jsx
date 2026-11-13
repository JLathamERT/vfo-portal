import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TokenShell from '../components/shared/TokenShell'
import DecisionConfirmCard from '../components/shared/DecisionConfirmCard'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

const CHOICE_LABELS = { vfo_ft: 'VFO FT Accountant', vfo_associate: 'VFO Associate Accountant' }

// Public token page for the Tailored Route for Accountants decision email
// (2026-11-12). The accountant clicks a path, No, or "I have questions" and lands
// here. A path / No shows a confirmation card and records nothing until it is
// clicked (#290), then goes through automation_PFT_undecided_response - the same
// work as a Partnership Fast Track decision. "I have questions" opens a question
// box that posts to automation_TRA_question (the Rapid Route loop, TaxDecidePage).
// The page never names the program: the accountant does not know it by name.
export default function TailoredDecidePage() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [choice, setChoice] = useState(() => searchParams.get('choice') || '')
  const [question, setQuestion] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    const ch = searchParams.get('choice')
    if (!token || !ch) {
      setError('Invalid link - missing required parameters.')
      setStatus('error')
      return
    }
    setChoice(ch)
    if (ch === 'questions') {
      // Each email's questions link asks ONE question: find out before drawing the box.
      postQuestion({ peek: true }).then(ok => { if (ok) setStatus('question') })
      return
    }
    peekDecision()
  }, [])

  // Read-only: an answered link opens on "Already Received" and a choice the
  // email did not offer on its refusal. Anything else, including a backend that
  // does not know the action yet, shows the confirm card - nothing is recorded
  // until it is clicked (#290).
  async function peekDecision() {
    try {
      const { res, data } = await post({ action: 'automation_PFT_undecided_peek', token: searchParams.get('token'), choice: searchParams.get('choice') })
      if (data.existing_decision) { setChoice(data.existing_decision); setStatus('already_submitted'); return }
      if (res.status === 404 || (res.status === 400 && !String(data.error || '').startsWith('Unknown action'))) { setError(data.error || 'Something went wrong.'); setStatus('error'); return }
    } catch { /* fall through to the confirm card */ }
    setStatus('confirm')
  }

  async function post(body) {
    const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    let data = {}
    try { data = await res.json() } catch { /* empty body */ }
    return { res, data }
  }

  // Maps every refusal to its view; true only on success.
  async function postQuestion(extra) {
    try {
      const { res, data } = await post({ action: 'automation_TRA_question', token: searchParams.get('token'), q: searchParams.get('q') || '0', ...extra })
      if (res.ok) return true
      if (data.already_asked) setStatus('question_used')
      else if (data.pending) setStatus('question_pending')
      else if (data.existing_decision) { setChoice(data.existing_decision); setStatus('already_submitted') }
      else { setError(data.error || 'Something went wrong.'); setStatus('error') }
      return false
    } catch {
      setError('Unable to connect. Please try again later.')
      setStatus('error')
      return false
    }
  }

  async function submitQuestion() {
    const text = question.trim()
    if (!text) return
    setStatus('processing')
    if (await postQuestion({ question: text })) setStatus('question_sent')
  }

  async function processDecision() {
    setStatus('processing')
    try {
      const { res, data } = await post({ action: 'automation_PFT_undecided_response', token: searchParams.get('token'), choice: searchParams.get('choice') })
      if (data.existing_decision) { setChoice(data.existing_decision); setStatus('already_submitted'); return }
      if (!res.ok) { setError(data.error || 'Something went wrong.'); setStatus('error'); return }
      setStatus('success')
    } catch {
      setError('Unable to connect. Please try again later.')
      setStatus('error')
    }
  }

  if (status === 'loading') return <TokenShell maxWidth={520}><div style={cardStyle}><p style={messageStyle}>Loading...</p></div></TokenShell>

  if (status === 'confirm') {
    const confirm = choice === 'no'
      ? { title: 'Please confirm your decision', message: "You're about to let us know you won't be moving forward at this time.", buttonLabel: 'Confirm my decision', buttonColor: '#64748b' }
      : { title: 'Please confirm your decision', message: `You're about to confirm you would like to move forward as a ${CHOICE_LABELS[choice] || 'VFO accountant'}.`, buttonLabel: 'Confirm - move forward', buttonColor: '#16a34a' }
    return (
      <TokenShell maxWidth={520}>
        <DecisionConfirmCard {...confirm} onConfirm={processDecision} />
      </TokenShell>
    )
  }

  if (status === 'question') {
    return (
      <TokenShell maxWidth={520}>
        <div style={{ padding: '12px 0' }}>
          <h1 style={{ ...titleStyle, textAlign: 'center' }}>What would you like to ask?</h1>
          <p style={{ ...messageStyle, textAlign: 'center', marginBottom: '20px' }}>
            Type your question below and we will reply by email. You can still choose your option from the email at any time.
          </p>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value.slice(0, 2000))}
            placeholder="Your question..."
            rows={6}
            style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif', fontSize: '14px', lineHeight: 1.55, boxSizing: 'border-box', resize: 'vertical' }}
          />
          <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', textAlign: 'right', marginTop: '4px' }}>{question.length}/2000</div>
          <button
            onClick={submitQuestion}
            disabled={!question.trim()}
            style={{ width: '100%', marginTop: '14px', padding: '12px', borderRadius: '10px', border: 'none', background: question.trim() ? '#2563eb' : '#93b4e8', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: question.trim() ? 'pointer' : 'not-allowed', fontFamily: 'Inter, sans-serif' }}
          >
            Send my question
          </button>
        </div>
      </TokenShell>
    )
  }

  const view = getView(status, choice, error)
  return (
    <TokenShell maxWidth={520}>
      <div style={cardStyle}>
        <div style={{ ...iconCircleStyle, background: view.color + '20', color: view.color }}>
          <span style={{ fontSize: '30px', lineHeight: 1, fontWeight: 700 }}>{view.icon}</span>
        </div>
        <h1 style={titleStyle}>{view.title}</h1>
        <p style={messageStyle}>{view.message}</p>
      </div>
    </TokenShell>
  )
}

function getView(status, choice, error) {
  if (status === 'processing') return { icon: '...', color: '#0095ff', title: 'Processing your response', message: 'Please wait, do not close this page.' }
  if (status === 'already_submitted') return { icon: 'i', color: '#0095ff', title: 'Already Received', message: "We've already received your response - no further action is needed. Thank you!" }
  if (status === 'error') return { icon: '!', color: '#ef4444', title: 'Something Went Wrong', message: error || 'An unexpected error occurred.' }
  if (status === 'question_sent') return { icon: '✓', color: '#16a34a', title: 'Question Received', message: 'Thank you - we will reply to your question by email. You can still choose your option from the email at any time.' }
  if (status === 'question_used') return { icon: '✓', color: '#0095ff', title: 'Question Already Sent', message: 'You have already sent a question from this email. We will reply by email, and you can ask a further question from that reply. You can still choose your option from the email at any time.' }
  if (status === 'question_pending') return { icon: '...', color: '#0095ff', title: 'Answer On Its Way', message: 'We are preparing an answer to your previous question. You will receive it by email.' }
  if (choice === 'no') return { icon: '✓', color: '#16a34a', title: 'Thank You', message: 'Thanks for letting us know. We appreciate you taking the time to meet with us.' }
  return { icon: '✓', color: '#16a34a', title: 'Thank You!', message: "We're delighted you'd like to move forward. Our team will be in touch shortly to begin your onboarding." }
}

const cardStyle = { textAlign: 'center', padding: '12px 0' }
const iconCircleStyle = { width: '72px', height: '72px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }
const titleStyle = { fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }
const messageStyle = { fontSize: '15px', color: 'var(--vfo-muted)', lineHeight: 1.6 }
