// Shared helpers + row renderer for the VFO Specialist Revenue surfaces
// (Accounting viewer + Automation tracker).
import { useState } from 'react'
import { callApi } from '../../lib/api'
// Wording only. shareLegState imports `money` from here, so this is a cycle — safe
// because neither module touches the other's bindings at module scope, only inside
// functions that run at render.
import { HELD_SUSPENDED_NOTE, HELD_PAUSED_NOTE, PENDING_COLOR } from './shareLegState'

export const NAVY = '#002973'
export const BLUE = '#125ecc'

export function money(n) {
  return `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function requestDate(r) {
  return r.payment_completed_at || r.payment_requested_at || r.created_at
}

const REQ_STATUS = {
  requested: { label: 'Payment requested', color: '#0095ff' },
  pending: { label: 'Awaiting bank transfer', color: '#e06717' },
  // Bank details submitted but hand-keyed, so Stripe is holding the payment until the
  // specialist verifies a microdeposit. No money has moved — distinct from processing.
  awaiting_verification: { label: 'Awaiting bank verification', color: '#e06717' },
  processing: { label: 'Payment processing', color: '#e06717' },
  received: { label: 'Payment received', color: '#16a34a' },
  failed: { label: 'Payment failed', color: '#ef4444' },
}

// Per-recipient status. Before the specialist's money is in, everything reads Pending.
//
// The `default` arm is a real fallback, not a hole: an unrecognised payout_status
// renders the neutral grey "Pending" pill rather than a blank or broken chip, so a
// value this map has not been taught still shows something legible. That is also why
// it must be taught deliberately — 'no_payout_due' would otherwise have read as
// "Pending" forever on a line that is in fact finished (#433).
function lineStatusMeta(line, requestReceived) {
  if (!requestReceived) return { label: 'Pending', color: 'var(--vfo-muted)' }
  switch (line.payout_status) {
    case 'revenue_share_sent': return { label: 'Revenue share payment sent', color: '#16a34a' }
    case 'money_mapping': return { label: 'Allocated to money mapping', color: '#16a34a' }
    // Terminal, and deliberately NOT green: nothing was paid, there was simply
    // nothing to pay (member share entered as $0). Muted grey = settled, no money.
    case 'no_payout_due': return { label: 'No payout due', color: 'var(--vfo-muted)' }
    case 'awaiting_connect': return { label: 'Awaiting Stripe Connect setup', color: '#b45309' }
    case 'held_member_suspended': return { label: HELD_SUSPENDED_NOTE, color: '#b45309' }
    case 'held_member_paused': return { label: HELD_PAUSED_NOTE, color: '#b45309' }
    case 'failed': return { label: 'Transfer failed', color: '#ef4444' }
    default: return { label: 'Pending', color: 'var(--vfo-muted)' }
  }
}

// The note that sits UNDER a line's Member $ figure, matching what the three VFO Services
// revenue tabs print under theirs. Only the readings that say something about the money
// itself get one: it has gone out, or it is parked behind a member hold. Every other open
// state is already spelled out by the status pill on the right of the same row, so adding
// a second copy of it under the dollars would be noise.
//
// 'no_payout_due' deliberately gets NO note: the figure it would annotate is already
// "$0.00" and the pill next to it already says "No payout due" — a third statement of
// the same nothing. It is also correctly absent from isHeldLine below, so it never
// lands in the "$X held" roll-ups.
export function memberShareNote(line, requestReceived) {
  if (!requestReceived) return null
  if (line.payout_status === 'revenue_share_sent') return { text: 'paid', color: '#1b9254' }
  if (line.payout_status === 'held_member_suspended') return { text: HELD_SUSPENDED_NOTE, color: PENDING_COLOR }
  if (line.payout_status === 'held_member_paused') return { text: HELD_PAUSED_NOTE, color: PENDING_COLOR }
  return null
}

// The same note, one column left, for the ERT leg. ert_payout_status is its OWN column —
// payout_status stays the member leg's — and a null on a line that carries ERT money means
// the transfer has simply not been attempted yet, so it reads Pending like any other
// unstarted leg. A line with no ERT money has no ERT leg and gets no note at all.
//
// Gated on the specialist's payment landing, exactly like memberShareNote: before the money
// is in, NO leg has been attempted, so annotating one of them "Pending" would single out
// ERT for a wait every column on the row is doing.
export function ertShareNote(line, requestReceived) {
  if (!requestReceived) return null
  if (!(Number(line.ert_share) > 0)) return null
  if (line.ert_payout_status === 'sent') return { text: 'Sent to ERT', color: '#1b9254' }
  if (line.ert_payout_status === 'failed') return { text: 'Transfer failed', color: '#ef4444' }
  return { text: 'Pending', color: PENDING_COLOR }
}

// Does this line still owe ERT money? Mirrors isHeldLine's job for the member leg: the
// Automation tracker counts these into "Payouts pending" and keeps Retry lit for them.
export function isErtLegOpen(line) {
  return Number(line.ert_share) > 0
    && (line.ert_payout_status == null || ['pending', 'failed'].includes(line.ert_payout_status))
}

export const shareNoteStyle = { display: 'block', fontSize: '9px', lineHeight: 1.2, fontWeight: 400 }

export function isHeldLine(line) {
  return line.payout_status === 'held_member_suspended' || line.payout_status === 'held_member_paused'
}

export function StatusPill({ label, color }) {
  return (
    <span style={{ display: 'inline-block', padding: '3px 11px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}33`, whiteSpace: 'nowrap' }}>{label}</span>
  )
}

// "Mark payment received" for a pending house-account request: trusts the click,
// draws the funds from the shared VFO account, and fires invoice/receipt + payouts.
// Shown in both the Accounting viewer and the Automation tracker.
export function MarkReceivedButton({ request, onDone }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  async function go() {
    if (!window.confirm('Mark this payment received? This pulls the funds from the VFO account and pays out the member shares.')) return
    setBusy(true); setMsg(null)
    try {
      const res = await callApi('specialist_revenue_confirm_received', { request_id: request.id })
      if (res?.ok) { setMsg({ tone: 'success', text: 'Payment received — member payouts have been sent.' }); onDone?.() }
      else if (res?.not_funded) setMsg({ tone: 'amber', text: res.message || 'The funds have not landed in the VFO account yet. Try again once the transfer settles.' })
      else setMsg({ tone: 'error', text: res?.error || 'Could not confirm the payment.' })
    } catch (e) {
      setMsg({ tone: 'error', text: e?.message || 'Could not confirm the payment.' })
    } finally {
      setBusy(false)
    }
  }
  const tone = msg && (msg.tone === 'success' ? { c: '#166534', b: '#bbf7d0', bg: '#f0fdf4' }
    : msg.tone === 'amber' ? { c: '#b45309', b: '#fde68a', bg: '#fffbeb' }
    : { c: '#b91c1c', b: '#fecaca', bg: '#fef2f2' })
  // Deep link to the VFO house account's page in the correct Stripe account + mode, so
  // the admin can eyeball the incoming transfers (click into Cash Balance) before
  // confirming. Needs the stored account id + the request's house customer.
  const acctId = request.account?.stripe_account_id
  const custId = request.stripe_customer_id
  const stripeUrl = acctId && custId ? `https://dashboard.stripe.com/${acctId}/${request.sandbox ? 'test/' : ''}customers/${custId}` : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button disabled={busy} onClick={go}
          style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: busy ? '#c7d2e4' : `linear-gradient(90deg, ${NAVY} 0%, ${BLUE} 100%)`, color: '#fff', fontWeight: 700, fontSize: '13px', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
          {busy ? 'Confirming…' : 'Mark payment received'}
        </button>
        {stripeUrl && (
          <a href={stripeUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '12px', fontWeight: 600, color: BLUE, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            View account activity in Stripe ↗
          </a>
        )}
        <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>Pulls the funds from the VFO account and pays out the member shares.</span>
      </div>
      {msg && <div style={{ fontSize: '12.5px', padding: '8px 12px', borderRadius: '8px', color: tone.c, border: `1px solid ${tone.b}`, background: tone.bg }}>{msg.text}</div>}
    </div>
  )
}

// Mirror of the backend guard in actions/specialist-revenue/delete-request.ts: a request
// is deletable ONLY while it is genuinely pre-payment — the link was emailed and the
// specialist never entered payment details. 'requested' is the only such status
// ('pending' is a house-account bank transfer the admin is waiting on and carries
// payment_method_type 'bank_transfer'; processing / awaiting_verification / received /
// failed all have a live or finished payment behind them). A recurring row is excluded —
// recurring has its own cancel on the plan.
export function canDeleteSpecrevRequest(request) {
  return request?.payment_status === 'requested'
    && !request?.recurring_plan_id
    && !request?.stripe_payment_intent_id
    && !request?.payment_method_type
}

// "Delete request" for a pre-payment request: hard-deletes the request + its recipient
// lines. The emailed payment link dies with the row (the public page loads by
// checkout_token and finds nothing).
export function DeleteRequestButton({ request, onDone }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  async function go() {
    if (!window.confirm(`Delete the ${money(request.gross_amount)} payment request for ${request.specialist_name || 'this specialist'}? This removes the request and its recipient lines completely, and the payment link already emailed will stop working. This cannot be undone.`)) return
    setBusy(true); setMsg(null)
    try {
      const res = await callApi('specialist_revenue_delete_request', { request_id: request.id })
      if (res?.ok) { setMsg({ tone: 'success', text: 'Request deleted.' }); onDone?.() }
      else setMsg({ tone: 'error', text: res?.error || 'Could not delete the request.' })
    } catch (e) {
      setMsg({ tone: 'error', text: e?.message || 'Could not delete the request.' })
    } finally {
      setBusy(false)
    }
  }
  const tone = msg && (msg.tone === 'success' ? { c: '#166534', b: '#bbf7d0', bg: '#f0fdf4' }
    : { c: '#b91c1c', b: '#fecaca', bg: '#fef2f2' })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button disabled={busy} onClick={go}
          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #fecaca', background: busy ? 'var(--vfo-tint)' : '#fef2f2', color: busy ? 'var(--vfo-faint)' : '#b91c1c', fontWeight: 700, fontSize: '13px', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
          {busy ? 'Deleting…' : 'Delete request'}
        </button>
        <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>Removes the request completely and kills the payment link that was emailed.</span>
      </div>
      {msg && <div style={{ fontSize: '12.5px', padding: '8px 12px', borderRadius: '8px', color: tone.c, border: `1px solid ${tone.b}`, background: tone.bg }}>{msg.text}</div>}
    </div>
  )
}

// A labelled value with a small Copy button (bank-transfer details).
function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(String(value || ''))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div>
      <div style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginBottom: '4px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: 600 }}>{value || '—'}</span>
        {value && (
          <button type="button" onClick={copy}
            style={{ padding: '2px 9px', borderRadius: '6px', border: `1px solid ${BLUE}`, background: 'var(--vfo-card)', color: BLUE, fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  )
}

// One specialist request row: header (name + totals + status) → expand → recipient table.
// `actions` is an optional render-prop ({ request }) => node shown in the expanded panel
// (used by the Automation tracker for the Retry button).
// `grid` opts into the table layout the Accounting viewer uses — the same row rendered as
// one line of a bordered table instead of a standalone card. Passing nothing keeps the
// card, which is what the Automation tracker renders.
export function RequestRow({ request, actions, grid }) {
  const [open, setOpen] = useState(false)
  const isRecurring = !!request.recurring_plan_id
  // Recurring rows relabel the two states they use; everything else (incl. the
  // house-account 'pending' = Awaiting bank transfer) keeps its non-recurring meta.
  const RECURRING_STATUS = {
    processing: { label: 'Pending', color: '#e06717' },
    received: { label: 'Payment received', color: '#16a34a' },
  }
  const req = (isRecurring && RECURRING_STATUS[request.payment_status])
    || REQ_STATUS[request.payment_status]
    || { label: request.payment_status, color: 'var(--vfo-muted)' }
  const received = request.payment_status === 'received'
  const lines = request.lines || []
  // Member dollars parked behind a suspended/paused member. Only meaningful once the
  // specialist's payment is in — before that no line has been attempted at all.
  const heldMemberTotal = received ? lines.reduce((s, l) => s + (isHeldLine(l) ? Number(l.member_share) || 0 : 0), 0) : 0
  const d = requestDate(request)
  const dateStr = d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const detail = <RequestDetail request={request} actions={actions} received={received} heldMemberTotal={heldMemberTotal} />

  if (grid) {
    return (
      <div>
        <div onClick={() => setOpen(o => !o)} style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', cursor: 'pointer' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, fontWeight: 600 }}>
            <span style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>{open ? '▾' : '▸'}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{request.specialist_name || '—'}</span>
          </span>
          <span style={{ color: 'var(--vfo-muted)' }}>{dateStr}</span>
          <span style={{ textAlign: 'right', color: 'var(--vfo-muted)' }}>{lines.length}</span>
          <span style={{ textAlign: 'right', color: 'var(--vfo-muted)' }}>{request.total_deals || 0}</span>
          <span style={{ textAlign: 'right' }}>{money(request.total_member_share)}</span>
          <span style={{ textAlign: 'right' }}>{money(request.total_ert_share)}</span>
          <span style={{ textAlign: 'right' }}>{money(request.total_vfos_share)}</span>
          <span style={{ textAlign: 'right', fontWeight: 700, color: 'var(--vfo-heading)' }}>{money(request.gross_amount)}</span>
          <span style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
            {isRecurring && <StatusPill label="Recurring" color="#6b7280" />}
            <StatusPill label={req.label} color={req.color} />
          </span>
        </div>
        {open && detail}
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', marginBottom: '10px', overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', cursor: 'pointer' }}>
        <span style={{ fontSize: '11px', color: 'var(--vfo-faint)', width: '12px' }}>{open ? '▾' : '▸'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{request.specialist_name || '—'}</div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{dateStr} · {lines.length} recipient{lines.length === 1 ? '' : 's'} · {request.total_deals || 0} deals</div>
        </div>
        <div style={{ display: 'flex', gap: '18px', textAlign: 'right' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{money(request.total_member_share)}</div>
            <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>member</div>
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{money(request.total_ert_share)}</div>
            <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>ERT</div>
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{money(request.total_vfos_share)}</div>
            <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>VFOS</div>
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{money(request.gross_amount)}</div>
            <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>gross</div>
          </div>
        </div>
        <div style={{ width: '160px', textAlign: 'right', display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          {isRecurring && <StatusPill label="Recurring" color="#6b7280" />}
          <StatusPill label={req.label} color={req.color} />
        </div>
      </div>

      {open && detail}
    </div>
  )
}

// The expanded half of a request row — recipient lines, their totals, the house-account
// details and any caller-supplied actions. Shared by the card and table layouts above.
function RequestDetail({ request, actions, received, heldMemberTotal }) {
  const lines = request.lines || []
  const detailGrid = '1.4fr 110px 110px 110px 70px 1fr'
  return (
        <div style={{ background: 'var(--vfo-input)', borderTop: '1px solid var(--vfo-border-soft)', padding: '14px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: detailGrid, gap: '10px', padding: '0 0 8px', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }}>
            <div>Recipient</div><div>ERT $</div><div>VFOS $</div><div>Member $</div><div>Deals</div><div style={{ textAlign: 'right' }}>Status</div>
          </div>
          {lines.map(line => {
            const m = lineStatusMeta(line, received)
            const note = memberShareNote(line, received)
            const ertNote = ertShareNote(line, received)
            return (
              <div key={line.id} style={{ display: 'grid', gridTemplateColumns: detailGrid, gap: '10px', alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px', color: 'var(--vfo-ink-2)' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{line.recipient_name || '—'}</div>
                  <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>{line.recipient_type === 'specialist' ? 'Specialist' : (line.member_number || 'Member')} · {line.revenue_decision || 'Revenue Share'}</div>
                </div>
                <div>
                  <span style={{ opacity: ertNote && ertNote.color === PENDING_COLOR ? 0.55 : 1 }}>{money(line.ert_share)}</span>
                  {ertNote && <span style={{ ...shareNoteStyle, color: ertNote.color }}>{ertNote.text}</span>}
                </div>
                <div>{money(line.vfos_share)}</div>
                <div>
                  <span style={{ opacity: note && note.color === PENDING_COLOR ? 0.55 : 1 }}>{money(line.member_share)}</span>
                  {note && <span style={{ ...shareNoteStyle, color: note.color }}>{note.text}</span>}
                </div>
                <div>{line.deals || 0}</div>
                <div style={{ textAlign: 'right' }}><StatusPill label={m.label} color={m.color} /></div>
              </div>
            )
          })}
          <div style={{ display: 'grid', gridTemplateColumns: detailGrid, gap: '10px', alignItems: 'center', padding: '10px 0 2px', borderTop: '2px solid var(--vfo-border)', marginTop: '4px', fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)' }}>
            <div>Totals</div>
            <div>{money(request.total_ert_share)}</div>
            <div>{money(request.total_vfos_share)}</div>
            <div>
              {money(request.total_member_share)}
              {heldMemberTotal > 0 && <span style={{ ...shareNoteStyle, color: PENDING_COLOR }}>{money(heldMemberTotal)} held</span>}
            </div>
            <div>{request.total_deals || 0}</div>
            <div style={{ textAlign: 'right', color: 'var(--vfo-muted)', fontWeight: 600 }}>{request.payment_method_type ? `${request.payment_method_type === 'bank_transfer' ? 'bank transfer' : request.payment_method_type}${request.acct_last4 ? ` ••${request.acct_last4}` : ''}` : ''}</div>
          </div>
          {request.payment_status === 'pending' && request.account && (
            <div style={{ marginTop: '14px', padding: '14px 16px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '10px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginBottom: '12px' }}>House account — give these to the specialist</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                <CopyField label="Bank name" value={request.account.bank_name} />
                <CopyField label="Routing number" value={request.account.routing_number} />
                <CopyField label="Account number" value={request.account.account_number} />
                <CopyField label="Account holder" value={request.account.holder_name} />
              </div>
            </div>
          )}
          {actions && <div style={{ marginTop: '14px' }}>{actions({ request })}</div>}
        </div>
  )
}
