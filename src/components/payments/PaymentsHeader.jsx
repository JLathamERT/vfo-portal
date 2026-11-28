import { useState } from 'react'
import { callApi, getSession } from '../../lib/api'
import { ProfileCardHead, pullHead } from '../shared/ProfileKit'
import { btnPrimary, btnState } from '../shared/buttonStyles'

// The "Payments" tab header: title on the left, and (superadmin/Jake only) a
// "Send Email to Change Payment Method" button on the right. The result message
// renders as a full-width banner BELOW the header row so it never crowds the
// button or the table columns.
//
// personType: 'client' | 'member' | 'specialist'
// personRef:  client id / member_number / expert id
export default function PaymentsHeader({ personType, personRef }) {
  const isSuper = getSession()?.is_superadmin
  const [status, setStatus] = useState('idle') // idle | sending
  const [msg, setMsg] = useState(null)         // { tone, text }

  const showButton = isSuper && personRef != null && personRef !== ''

  async function send() {
    setStatus('sending'); setMsg(null)
    try {
      const d = await callApi('payments_send_card_update', {
        person_type: personType,
        person_ref: String(personRef),
      })
      if (d?.sent) {
        const n = d.count || 0
        setMsg({
          tone: 'success',
          text: `Draft email created${d.to_email ? ` to ${d.to_email}` : ''}${d.sandbox ? ' (sandbox)' : ''}, covering ${n} payment${n === 1 ? '' : 's'}. It's in your Gmail drafts — review and send.`,
        })
      } else if (d?.reason === 'none') {
        setMsg({ tone: 'warn', text: d.message || 'No reusable card/bank payment is on file to change yet.' })
      } else if (d?.reason === 'no_email') {
        setMsg({ tone: 'warn', text: d.message || 'No email address is on file for this person.' })
      } else {
        setMsg({ tone: 'warn', text: 'Could not create the email.' })
      }
    } catch (e) {
      setMsg({ tone: 'warn', text: e?.message || 'Something went wrong creating the email.' })
    } finally {
      setStatus('idle')
    }
  }

  return (
    <div style={{ marginBottom: msg ? '16px' : 0 }}>
      <ProfileCardHead icon="dollar" title="Payments" style={pullHead} action={showButton && (
        <button
          onClick={send}
          disabled={status === 'sending'}
          style={btnState(btnPrimary, status === 'sending')}
        >
          {status === 'sending' ? 'Sending…' : 'Send Email to Change Payment Method'}
        </button>
      )} />
      {msg && (
        <div style={{
          marginTop: '12px', padding: '10px 14px', borderRadius: '10px',
          fontSize: '12.5px', lineHeight: 1.45,
          background: msg.tone === 'success' ? 'rgba(34,197,94,0.10)' : '#fff7e6',
          border: msg.tone === 'success' ? '1px solid rgba(34,197,94,0.30)' : '1px solid #f3d9a6',
          color: msg.tone === 'success' ? '#0f7a3d' : '#8a5200',
        }}>
          {msg.text}
        </div>
      )}
    </div>
  )
}
