import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TokenShell from '../components/shared/TokenShell'
import DecisionConfirmCard from '../components/shared/DecisionConfirmCard'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

export default function TaxDecidePage() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('confirm')
  const [error, setError] = useState('')
  const [decision, setDecision] = useState(() => searchParams.get('decision') || '')
  // Rapid Route (2026-09-25): "I have questions" opens a question box instead
  // of a confirm card. Posting it records NO decision — the Yes / No buttons in
  // the email stay live — and the reply comes back by email.
  const [question, setQuestion] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    const dec = searchParams.get('decision')

    if (!token || !dec) {
      setError('Invalid link — missing required parameters.')
      setStatus('error')
      return
    }

    setDecision(dec)
    if (dec === 'Questions') {
      // Each email's "I have questions" link asks ONE question: find out before
      // the client types anything whether this link is already spent. `peek`
      // writes nothing.
      setStatus('processing')
      postQuestion({ peek: true }).then(ok => { if (ok) setStatus('question') })
      return
    }
    setStatus('confirm')
  }, [])

  // Posts to automation_TAX_rapidquestion; maps every refusal to its view and
  // returns true only on success. `q` is the link's own question count.
  async function postQuestion(extra) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'automation_TAX_rapidquestion', token: searchParams.get('token'), q: searchParams.get('q') || '0', ...extra }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.existing_decision) {
          setDecision(data.existing_decision)
          setStatus('already_submitted')
        } else if (data.already_asked) {
          setStatus('question_used')
        } else if (data.pending) {
          setStatus('question_pending')
        } else {
          setError(data.error || 'Something went wrong.')
          setStatus('error')
        }
        return false
      }
      return true
    } catch (err) {
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

  if (status === 'question') {
    return (
      <TokenShell maxWidth={520}>
        <div style={{ padding: '12px 0' }}>
          <h1 style={{ ...titleStyle, textAlign: 'center' }}>What would you like to ask?</h1>
          <p style={{ ...messageStyle, textAlign: 'center', marginBottom: '20px' }}>
            Type your question below and your tax planning team will reply by email. You can still choose Yes or No from the email at any time.
          </p>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value.slice(0, 2000))}
            placeholder="Your question…"
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

  function handleConfirm() {
    setStatus('processing')
    processDecision()
  }

  async function processDecision() {
    const token = searchParams.get('token')
    const dec = searchParams.get('decision')

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'automation_TAX_finaldecision',
          token,
          decision: dec,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.existing_decision) {
          setDecision(data.existing_decision)
          setStatus('already_submitted')
        } else {
          setError(data.error || 'Something went wrong.')
          setStatus('error')
        }
        return
      }

      setStatus('success')
    } catch (err) {
      setError('Unable to connect. Please try again later.')
      setStatus('error')
    }
  }

  if (status === 'confirm') {
    const confirm = getConfirm(decision)
    return (
      <TokenShell maxWidth={520}>
        <DecisionConfirmCard {...confirm} onConfirm={handleConfirm} />
      </TokenShell>
    )
  }

  const view = getView(status, decision, error)

  return (
    <TokenShell maxWidth={520}>
      <div style={cardStyle}>
        <div style={{ ...iconCircleStyle, background: view.color + '20' }}>
          <span style={{ fontSize: '32px', lineHeight: 1 }}>{view.icon}</span>
        </div>
        <h1 style={titleStyle}>{view.title}</h1>
        <p style={messageStyle}>{view.message}</p>
      </div>
    </TokenShell>
  )
}

function getConfirm(decision) {
  if (decision === 'ExtraMeeting') {
    return {
      title: 'Please confirm your request',
      message: "You're about to request an additional tax planning meeting before making your decision.",
      buttonLabel: 'Confirm — request a meeting',
      buttonColor: '#125ecc',
    }
  }
  if (decision === 'Yes') {
    return {
      title: 'Please confirm your decision',
      message: "You're about to confirm moving forward with your tax planning engagement. We'll follow up with the engagement agreement and next steps.",
      buttonLabel: 'Confirm — move forward',
      buttonColor: '#16a34a',
    }
  }
  return {
    title: 'Please confirm your decision',
    message: "You're about to let us know you won't be moving forward with tax planning at this time.",
    buttonLabel: 'Confirm my decision',
    buttonColor: '#64748b',
  }
}

function getView(status, decision, error) {
  if (status === 'processing') {
    return {
      icon: '⏳',
      color: '#0095ff',
      title: 'Processing your response…',
      message: 'Please wait, do not close this page.',
    }
  }
  if (status === 'already_submitted') {
    return {
      icon: 'ℹ️',
      color: '#0095ff',
      title: 'Already Received',
      message: "We've already received your decision — no further action is needed. Thank you!",
    }
  }
  if (status === 'error') {
    return {
      icon: '⚠️',
      color: '#ef4444',
      title: 'Something Went Wrong',
      message: error || 'An unexpected error occurred.',
    }
  }
  if (status === 'question_sent') {
    return {
      icon: '✓',
      color: '#16a34a',
      title: 'Question Received',
      message: 'Thank you — your tax planning team will reply to your question by email. You can still choose Yes or No from the email at any time.',
    }
  }
  if (status === 'question_used') {
    return {
      icon: '✓',
      color: '#0095ff',
      title: 'Question Already Sent',
      message: 'You have already sent a question from this email. Your tax planning team will reply by email, and you can ask a further question from that reply. You can still choose Yes or No from the email at any time.',
    }
  }
  if (status === 'question_pending') {
    return {
      icon: '…',
      color: '#0095ff',
      title: 'Answer On Its Way',
      message: 'Your tax planning team is preparing an answer to your previous question. You will receive it by email.',
    }
  }
  if (decision === 'ExtraMeeting') {
    return {
      icon: '📅',
      color: '#125ecc',
      title: 'Meeting Requested',
      message: 'Thank you — your Proactive Facilitator will be in touch to arrange an additional tax planning meeting.',
    }
  }
  if (decision === 'Yes') {
    return {
      icon: '✓',
      color: '#16a34a',
      title: 'Thank You!',
      message: "We're excited to move forward with your tax planning engagement. We will be in touch shortly with the engagement agreement and next steps.",
    }
  }
  return {
    icon: '✓',
    color: '#16a34a',
    title: 'Thank You',
    message: "We appreciate you letting us know. If circumstances ever change, we'll be right here to help.",
  }
}

const cardStyle = {
  textAlign: 'center',
  padding: '12px 0',
}

const iconCircleStyle = {
  width: '72px',
  height: '72px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 24px',
}

const titleStyle = {
  fontSize: '24px',
  fontWeight: 700,
  color: 'var(--vfo-ink)',
  marginBottom: '12px',
}

const messageStyle = {
  fontSize: '15px',
  color: 'var(--vfo-muted)',
  lineHeight: 1.6,
}
