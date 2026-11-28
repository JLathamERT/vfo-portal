import { useState, useEffect, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, getLastSeen, setLastSeen, redraftInstallmentEmail, resendContinuationSetupLink, resendFirstPaymentLink } from '../../lib/api'
import { money, StatusPill } from './specialistRevenueShared'
import { OutstandingLinksSkeleton } from '../shared/Skeleton'
import { MemberNameLink, ClientNameLink, SpecialistNameLink, clientPagePath } from '../shared/personLinks'
import { paymentStatusLabel } from '../../lib/paymentStatusLabel'
import { btnOutline, BTN_SMALL, btnState } from '../shared/buttonStyles'
import Tag from '../shared/Tag'
import ExpandChevron from '../shared/ExpandChevron'
import { refreshBtnStyle, emptyCardStyle } from './accountingTable'
import { formatDate } from '../../lib/dates'

// Where a map1 / tax card's "Open plan" goes. MAP 1 lives under Holistic (program 1).
// A tax card needs the plan's program_id or the client page opens the wrong program
// and hides the plan — the continuation items do not carry it, so they get no button.
function planPathFor(kind, item) {
  if (!item?.client_id) return null
  if (kind === 'map1') return clientPagePath(item.client_id, { program: 1, tab: 'map1' })
  if (kind === 'tax' && item.program_id) return clientPagePath(item.client_id, { program: item.program_id, tab: 'tax', plan: item.row_id })
  return null
}

const BADGE_FIRST = { label: 'First payment', color: '#125ecc' }
const BADGE_CONTINUATION = { label: 'Payment continuation', color: '#e06717' }
const BADGE_IMPLEMENTATION = { label: 'Implementation', color: '#ef4444' }
const BADGE_INSTALLMENT = { label: 'Failed installment', color: '#ef4444' }
const BADGE_RECURRING = { label: 'Recurring setup', color: '#125ecc' }
const BADGE_ONEOFF = { label: 'One-off payment', color: '#e06717' }
const BADGE_PIP = { label: 'PIP purchase', color: '#125ecc' }
const BADGE_PAST_DUE = { label: 'Past due', color: '#ef4444' }
const BADGE_FINAL_RETAINER = { label: 'Failed final retainer', color: '#ef4444' }
const BADGE_FAILED = { label: 'Payment failed', color: '#ef4444' }
const BADGE_ATSG_FIRST = { label: 'First payment', color: '#125ecc' }
const BADGE_ATSG_MISSED = { label: 'Missed retainer', color: '#ef4444' }
const BADGE_ATSG_FEE = { label: 'Impact fee', color: '#e06717' }

// The one empty line for every Outstanding Payment Links tab (HOUSE_STYLE §1).
export function OutstandingEmpty() {
  return <div style={emptyCardStyle}>No outstanding payment links.</div>
}

function programLabel(pid) {
  return Number(pid) === 4 ? 'Tax Planning' : 'Tax Priorities'
}

function emailCount(n) {
  const c = Number(n) || 0
  return `${c} email${c === 1 ? '' : 's'} sent`
}

function ordinal(n) {
  const v = Number(n) || 0
  const s = ['th', 'st', 'nd', 'rd']
  const m = v % 100
  return `${v}${s[(m - 20) % 10] || s[m] || s[0]}`
}

export const cardStyle = {
  background: 'var(--vfo-card)',
  border: '1px solid var(--vfo-border-soft)',
  borderRadius: '14px',
  marginBottom: '10px',
  overflow: 'hidden',
  fontFamily: 'Inter, sans-serif',
}

export function Detail({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: '10px', padding: '7px 0', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: '170px', flexShrink: 0, color: 'var(--vfo-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ color: 'var(--vfo-ink)' }}>{value}</div>
    </div>
  )
}

export function SectionHeader({ title, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '20px 0 10px', fontFamily: 'Inter, sans-serif' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>{title}</h3>
      <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>{count} outstanding</span>
    </div>
  )
}

export function EmptyLine() {
  return <div style={{ fontSize: '13px', color: 'var(--vfo-faint)', padding: '4px 2px 10px', fontFamily: 'Inter, sans-serif' }}>None right now.</div>
}

// Leading "· "-joined member number in a card subtitle, linked to the member profile.
function MemberPrefix({ memberNumber }) {
  if (!memberNumber) return null
  return <><MemberNameLink memberNumber={memberNumber}>{memberNumber}</MemberNameLink>{' · '}</>
}

// A row's own action (TEAM_RULES §9): the small outline button, never a pill.
const rowBtn = { ...btnOutline, ...BTN_SMALL }

// Manual "Resend email" on an outstanding row. Fires on a single click (per Jake —
// no confirm step; the email only lands in Drafts anyway). Lives inside the card
// header, which is itself a click-to-expand target — hence stopPropagation on
// every control here.
function ResendButton({ send, onDone }) {
  const [stage, setStage] = useState('idle') // idle | busy | done
  const [err, setErr] = useState('')

  async function fire(e) {
    e.stopPropagation()
    setStage('busy'); setErr('')
    try {
      const res = await send()
      // callApi throws on non-2xx, so an { error } here is a 200-with-error body.
      if (res?.error) { setErr(res.error); setStage('idle'); return }
      setStage('done')
      onDone?.()
    } catch (ex) {
      setErr(ex?.message || 'Could not send the email.')
      setStage('idle')
    }
  }

  return (
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', minWidth: '120px' }}>
      {stage === 'idle' && (
        <button type="button" style={rowBtn} onClick={fire}>Resend email</button>
      )}
      {stage === 'busy' && <button type="button" disabled style={btnState(rowBtn, true)}>Sending…</button>}
      {stage === 'done' && (
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--vfo-success-text-2)', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>✓ Email drafted</span>
      )}
      {err && (
        <span style={{ fontSize: '11px', color: '#b91c1c', fontFamily: 'Inter, sans-serif', textAlign: 'right', maxWidth: '260px', lineHeight: 1.4 }}>{err}</span>
      )}
    </div>
  )
}

// One expandable person card. Per-row open state lives here because hooks cannot
// be used inside the .map calls below. The name links to the client profile
// (clientId, with `program` when known) or, on specialist cards, to the specialist
// profile (expertId); with neither it stays plain text. The header click opens
// the plan when the card has one (`planPath`, Client Overview's rule — Jake,
// 2026-10-17, replacing the 2026-09-30 expand-on-header); the ▸ expands the card,
// and a card with no plan still expands from anywhere on the header. `action` is an optional right-edge control (the Resend button) —
// it must not toggle the card.
export function OutstandingCard({ name, clientId, program, planPath, expertId, subtitle, badge, sandbox, amount, amountText, caption, action, children }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const nameEl = !name ? '-'
    : clientId ? <ClientNameLink clientId={clientId} program={program}>{name}</ClientNameLink>
      : expertId ? <SpecialistNameLink expertId={expertId}>{name}</SpecialistNameLink>
        : name
  return (
    <div style={cardStyle}>
      <div onClick={() => (planPath ? navigate(planPath) : setOpen(o => !o))} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', cursor: 'pointer' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>
            {nameEl}
            {sandbox && <Tag color="#e06717" style={{ marginLeft: '8px', verticalAlign: '2px' }}>Sandbox</Tag>}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{subtitle}</div>
        </div>
        <StatusPill label={badge.label} color={badge.color} />
        <div style={{ width: '120px', textAlign: 'right' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: amountText ? 'var(--vfo-ink-2)' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{amountText || money(amount)}</div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>{caption}</div>
        </div>
        {action || null}
        <ExpandChevron open={open} onToggle={() => setOpen(o => !o)} />
      </div>
      {open && (
        <div style={{ background: 'var(--vfo-input)', borderTop: '1px solid var(--vfo-border-soft)', padding: '14px 18px' }}>
          {children}
          {planPath && (
            <button type="button" onClick={() => navigate(planPath)} style={{ ...rowBtn, marginTop: '12px' }}>Open plan →</button>
          )}
        </div>
      )}
    </div>
  )
}

function FirstLinkCard({ item, kind, showProgram, onDone }) {
  const sent = formatDate(item.link_sent_at)
  const parts = []
  parts.push(sent ? `Link sent ${formatDate(item.link_sent_at)}` : 'Link not sent yet')
  parts.push(emailCount(item.emails_sent))
  return (
    <OutstandingCard
      name={item.client_name}
      clientId={item.client_id}
      program={kind === 'map1' ? 1 : item.program_id}
      planPath={planPathFor(kind, item)}
      subtitle={<><MemberPrefix memberNumber={item.member_number} />{parts.join(' · ')}</>}
      badge={BADGE_FIRST}
      amount={item.amount_due}
      caption="due"
      action={(
        <ResendButton
          onDone={onDone}
          send={() => resendFirstPaymentLink({ pipeline: kind === 'tax' ? 'TAX' : 'MAP1', rowId: item.row_id })}
        />
      )}
    >
      <Detail label="Amount due" value={money(item.amount_due)} />
      {item.payment_plan ? <Detail label="Payment plan" value={item.payment_plan} /> : null}
      {showProgram ? <Detail label="Program" value={programLabel(item.program_id)} /> : null}
      <Detail label="Link sent" value={sent || 'not yet'} />
      <Detail label="Reminder sent" value={formatDate(item.reminder_sent_at) || 'not yet'} />
      <Detail label="PF notified" value={formatDate(item.pf_notified_at) || 'not yet'} />
      <Detail label="Emails sent" value={String(Number(item.emails_sent) || 0)} />
    </OutstandingCard>
  )
}

function RemainingTable({ kind, remaining }) {
  const rows = remaining || []
  if (rows.length === 0) return null
  const grid = kind === 'map1' ? '120px 150px 120px 1fr' : '1fr 140px'
  return (
    <div style={{ marginBottom: '14px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginBottom: '6px' }}>Remaining payments</div>
      <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '0 0 6px', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }}>
        {kind === 'map1'
          ? <><div>Payment</div><div>Date</div><div>Amount</div><div>Status</div></>
          : <><div>Payment</div><div>Amount</div></>}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px', color: 'var(--vfo-ink)' }}>
          {kind === 'map1'
            ? (
              <>
                <div>Payment {r.n}</div>
                <div>{formatDate(r.date) || '-'}</div>
                <div>{money(r.amount)}</div>
                <div style={{ color: 'var(--vfo-muted)' }}>{paymentStatusLabel(r.status) || 'scheduled'}</div>
              </>
            ) : (
              <>
                <div>{r.label || '-'}</div>
                <div>{money(r.amount)}</div>
              </>
            )}
        </div>
      ))}
    </div>
  )
}

function ContinuationCard({ item, kind, onDone }) {
  const parts = []
  parts.push(item.link_sent_at ? `Link sent ${formatDate(item.link_sent_at)}` : 'Link not sent yet')
  parts.push(emailCount(item.emails_sent))
  const history = item.history || []
  const subtitle = (
    <>
      <MemberPrefix memberNumber={item.member_number} />
      {parts.join(' · ')}
      {item.expired
        ? <span style={{ color: '#ef4444', fontWeight: 600 }}> · link EXPIRED</span>
        : (item.expires_at ? <> · expires {formatDate(item.expires_at)}</> : null)}
    </>
  )
  return (
    <OutstandingCard
      name={item.client_name}
      clientId={item.client_id}
      program={kind === 'map1' ? 1 : item.program_id}
      planPath={planPathFor(kind, item)}
      subtitle={subtitle}
      badge={BADGE_CONTINUATION}
      amount={item.total_remaining}
      caption="remaining"
      action={(
        // Always available: a resend mints a FRESH 7-day token, so an expired link
        // and an auto-resend-cap-reached row are exactly the rows that need it.
        <ResendButton
          onDone={onDone}
          send={() => resendContinuationSetupLink({ pipeline: kind === 'tax' ? 'TAX' : 'MAP 1', rowId: item.row_id })}
        />
      )}
    >
      <RemainingTable kind={kind} remaining={item.remaining} />
      <div style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginBottom: '6px' }}>Link email history</div>
      {history.length === 0 && <div style={{ fontSize: '13px', color: 'var(--vfo-faint)', padding: '4px 0' }}>No link emails recorded.</div>}
      {history.map((h, i) => (
        <div key={i} style={{ padding: '7px 0', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px', color: 'var(--vfo-ink)' }}>
          <span style={{ fontWeight: 600 }}>{formatDate(h.sent_at) || 'Date unknown'}</span>
          <span style={{ color: 'var(--vfo-muted)' }}>
            {' · '}{h.auto ? 'auto-resent by system' : `sent by ${h.sent_by || 'unknown'}`}
            {h.expired
              ? null
              : (h.expires_at ? ` · expires ${formatDate(h.expires_at)}` : '')}
            {h.reminder_sent_at ? ` · reminder sent ${formatDate(h.reminder_sent_at)}` : ''}
          </span>
          {h.expired ? <span style={{ color: '#ef4444', fontWeight: 600 }}>{' · expired'}</span> : null}
        </div>
      ))}
      {item.auto_resends_exhausted ? (
        <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', fontSize: '12.5px' }}>
          Auto-resend cap reached (3) - send manually if still needed.
        </div>
      ) : null}
      <div style={{ marginTop: '12px' }}>
        <Detail label="Reminder sent" value={formatDate(item.reminder_sent_at) || 'not yet'} />
        <Detail label="PF notified" value={formatDate(item.pf_notified_at) || 'not yet'} />
        <Detail label="Auto-resends used" value={String(Number(item.auto_resends) || 0)} />
        <Detail label="Emails sent" value={String(Number(item.emails_sent) || 0)} />
      </div>
    </OutstandingCard>
  )
}

function ImplementationCard({ item }) {
  const parts = []
  parts.push(programLabel(item.program_id))
  if (item.charge_status) parts.push(`charge ${paymentStatusLabel(item.charge_status)}`)
  const charged = formatDate(item.charge_date)
  if (charged) parts.push(charged)
  return (
    <OutstandingCard
      name={item.client_name}
      clientId={item.client_id}
      program={item.program_id}
      planPath={planPathFor('tax', item)}
      subtitle={<><MemberPrefix memberNumber={item.member_number} />{parts.join(' · ')}</>}
      badge={BADGE_IMPLEMENTATION}
      amount={item.amount_due}
      caption="due"
    >
      <Detail label="Amount due" value={money(item.amount_due)} />
      <Detail label="Program" value={programLabel(item.program_id)} />
      <Detail label="Charge status" value={paymentStatusLabel(item.charge_status) || 'not started'} />
      <Detail label="Charge date" value={charged || 'not yet'} />
      <Detail label="Payment link" value="Emailed to the client when the charge failed (no button here)" />
    </OutstandingCard>
  )
}

// A MAP 1 quarterly installment Stripe refused. The nightly sweep charges only an
// EMPTY slot, so a declined installment is never retried and the money stays open
// until the client uses the /pay link — the ONE email carrying that link is drafted
// at failure time and its template is draft-mode, so if nobody sends the draft the
// client is never told. Hence the Resend button here.
//
// `payment_number` is whatever the /pay link would actually collect (the server runs
// the page's own resolver), which is the LOWEST failed installment — so a row with
// two failed slots shows one card, and clearing it surfaces the next.
function InstallmentCard({ item, onDone }) {
  const failed = item.failed_payments || []
  const parts = []
  parts.push(`Payment ${item.payment_number} ${item.charge_status === 'auth_required' ? 'needs authentication' : 'declined'}`)
  const charged = formatDate(item.charge_date)
  if (charged) parts.push(`due ${formatDate(item.charge_date)}`)
  if (failed.length > 1) parts.push(`${failed.length} failed installments`)
  return (
    <OutstandingCard
      name={item.client_name}
      clientId={item.client_id}
      program={1}
      planPath={planPathFor('map1', item)}
      subtitle={<><MemberPrefix memberNumber={item.member_number} />{parts.join(' · ')}</>}
      badge={BADGE_INSTALLMENT}
      amount={item.amount_due}
      caption="due"
      action={<ResendButton onDone={onDone} send={() => redraftInstallmentEmail({ rowId: item.row_id })} />}
    >
      <Detail label="Amount due" value={money(item.amount_due)} />
      <Detail label="Installment" value={`Payment ${item.payment_number} of 4`} />
      <Detail label="Charge status" value={paymentStatusLabel(item.charge_status) || 'unknown'} />
      <Detail label="Scheduled for" value={charged || 'not set'} />
      {failed.length > 1 && (
        <Detail
          label="Also failed"
          value={failed.filter(f => f.n !== item.payment_number).map(f => `Payment ${f.n} (${paymentStatusLabel(f.status)})`).join(', ')}
        />
      )}
      {/* A row migrated from the old system has no /pay token yet; the resend mints
          one (accounting_redraft_installment_link), so the button is always offered. */}
      {!item.has_token && (
        <div style={{ marginTop: '12px', fontSize: '12.5px', color: 'var(--vfo-muted)' }}>
          No payment link exists for this client yet - Resend email creates one.
        </div>
      )}
    </OutstandingCard>
  )
}

function RecurringCard({ item }) {
  const parts = []
  parts.push(item.link_sent_at ? `Link sent ${formatDate(item.link_sent_at)}` : 'Link not sent yet')
  parts.push(emailCount(item.emails_sent))
  return (
    <OutstandingCard
      name={item.specialist_name}
      expertId={item.expert_id}
      subtitle={parts.join(' · ')}
      badge={BADGE_RECURRING}
      amount={item.monthly_amount}
      caption="per month"
    >
      <Detail label="Monthly amount" value={money(item.monthly_amount)} />
      <Detail label="Charge day" value={item.charge_day ? `${ordinal(item.charge_day)} of the month` : 'not set'} />
      <Detail label="Link sent" value={formatDate(item.link_sent_at) || 'not yet'} />
      <Detail label="Reminder sent" value={formatDate(item.reminder_sent_at) || 'not yet'} />
      <Detail label="Emails sent" value={String(Number(item.emails_sent) || 0)} />
    </OutstandingCard>
  )
}

function RequestCard({ item }) {
  const parts = []
  parts.push(item.link_sent_at ? `Link sent ${formatDate(item.link_sent_at)}` : 'Link not sent yet')
  parts.push(emailCount(item.emails_sent))
  return (
    <OutstandingCard
      name={item.specialist_name}
      expertId={item.expert_id}
      subtitle={parts.join(' · ')}
      badge={BADGE_ONEOFF}
      amount={item.gross_amount}
      caption="due"
    >
      <Detail label="Amount" value={money(item.gross_amount)} />
      <Detail label="Requested" value={formatDate(item.link_sent_at) || 'not yet'} />
      <Detail label="Reminder sent" value={formatDate(item.reminder_sent_at) || 'not yet'} />
      <Detail label="Emails sent" value={String(Number(item.emails_sent) || 0)} />
    </OutstandingCard>
  )
}

// A MAP 1 quarterly installment past its date that was never charged: a check not
// received, a plan with no saved method, or a day the charge run missed. Read-only:
// the reason says what is needed.
function PastDueCard({ item }) {
  return (
    <OutstandingCard
      name={item.client_name}
      clientId={item.client_id}
      program={1}
      planPath={planPathFor('map1', item)}
      subtitle={<><MemberPrefix memberNumber={item.member_number} />Payment {item.payment_number} due {formatDate(item.due_date)} · {item.reason}</>}
      badge={BADGE_PAST_DUE}
      amount={item.amount_due}
      caption="due"
    >
      <Detail label="Amount due" value={money(item.amount_due)} />
      <Detail label="Installment" value={`Payment ${item.payment_number} of 4`} />
      <Detail label="Due" value={formatDate(item.due_date) || 'not set'} />
      <Detail label="Payment method" value={item.method === 'check' ? 'Check' : item.method === 'ach' ? 'Bank (ACH)' : item.method === 'card' ? 'Card' : 'none saved'} />
      <Detail label="Why it is open" value={item.reason} />
    </OutstandingCard>
  )
}

// A 3-payment tax plan's final retainer charge that failed; the client was emailed a
// fresh /tax-pay link (charge-final-retainer.ts).
function FinalRetainerCard({ item }) {
  return (
    <OutstandingCard
      name={item.client_name}
      clientId={item.client_id}
      program={item.program_id}
      planPath={planPathFor('tax', item)}
      subtitle={<><MemberPrefix memberNumber={item.member_number} />{programLabel(item.program_id)} · charge {paymentStatusLabel(item.charge_status)}</>}
      badge={BADGE_FINAL_RETAINER}
      amount={item.amount_due}
      caption="due"
    >
      <Detail label="Final retainer" value={money(item.amount_due)} />
      <Detail label="Program" value={programLabel(item.program_id)} />
      <Detail label="Charge status" value={paymentStatusLabel(item.charge_status) || 'unknown'} />
      <Detail label="Payment link" value="Emailed to the client when the charge failed (no button here)" />
    </OutstandingCard>
  )
}

// A specialist revenue payment Stripe refused: a one-off request, or a month of a
// recurring plan (Stripe retries those itself; a later success removes the card).
function FailedRequestCard({ item }) {
  return (
    <OutstandingCard
      name={item.specialist_name}
      expertId={item.expert_id}
      subtitle={`${item.recurring ? 'Recurring month' : 'One-off payment'} · failed ${formatDate(item.failed_at) || 'date unknown'}`}
      badge={BADGE_FAILED}
      amount={item.gross_amount}
      caption="due"
    >
      <Detail label="Amount" value={money(item.gross_amount)} />
      <Detail label="Kind" value={item.recurring ? 'Recurring monthly payment - Stripe retries it automatically' : 'One-off payment request - re-send or follow up'} />
      <Detail label="Requested" value={formatDate(item.link_sent_at) || 'not known'} />
      <Detail label="Failed" value={formatDate(item.failed_at) || 'not known'} />
    </OutstandingCard>
  )
}

// An Additional PIP purchase whose /pip-pay link was emailed and has not been paid.
// Read-only: the link is sent from the client's PIP track.
function PipCard({ item }) {
  return (
    <OutstandingCard
      name={item.client_name}
      clientId={item.client_id}
      program={1}
      planPath={item.client_id ? clientPagePath(item.client_id, { program: 1, tab: 'pip' }) : null}
      subtitle={<><MemberPrefix memberNumber={item.member_number} />{item.purchase} · {item.link_sent_at ? `Link sent ${formatDate(item.link_sent_at)}` : 'Link not sent yet'}</>}
      badge={BADGE_PIP}
      amount={item.amount_due}
      caption="due"
    >
      <Detail label="Purchase" value={item.purchase} />
      <Detail label="Amount due" value={money(item.amount_due)} />
      <Detail label="Link sent" value={formatDate(item.link_sent_at) || 'not yet'} />
      <Detail label="Payment status" value={paymentStatusLabel(item.payment_status) || 'not started'} />
    </OutstandingCard>
  )
}

// An SDP ATSG payment the client still owes through /sdp-atsg-pay: the first
// retainer, a missed or declined later retainer, or a Strategy Impact Fee. The case
// screen sends the links, so the card opens the case.
function AtsgCard({ item, badge }) {
  return (
    <OutstandingCard
      name={item.client_name}
      planPath={`/admin?tab=sdp_atsg&case=${item.case_id}`}
      sandbox={item.sandbox}
      subtitle={<><MemberPrefix memberNumber={item.member_number} />{[item.client_ref, item.label, item.link_sent_at ? `Link sent ${formatDate(item.link_sent_at)}` : 'Link not sent yet'].filter(Boolean).join(' · ')}</>}
      badge={badge}
      amount={item.amount_due}
      caption="due"
    >
      <Detail label="Payment" value={item.label} />
      <Detail label="Amount due" value={money(item.amount_due)} />
      {item.due_date ? <Detail label="Due" value={formatDate(item.due_date)} /> : null}
      <Detail label="Link sent" value={formatDate(item.link_sent_at) || 'not yet'} />
      <Detail label="Status" value={paymentStatusLabel(item.status) || 'not started'} />
      {item.failure_reason ? <Detail label="Why it failed" value={item.failure_reason} /> : null}
    </OutstandingCard>
  )
}

// Accounting pill tab: everyone who was emailed a payment or account-setup link
// and has not finished it yet. The link kinds are deliberately split into their
// own sections (and carry their own badge) so a first payment link is never
// mistaken for a payment-continuation setup link.
export default function OutstandingLinksPanel({ kind, embedded = false }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Re-open draws the last lists at once (snapshot), refreshes behind them.
  useLayoutEffect(() => {
    const snap = getLastSeen('outstandinglinks:')
    if (snap) { setData(snap); setLoading(false) }
    load(snap ? { quiet: true, keepOnError: true } : undefined)
  }, [])

  // quiet = refresh the data WITHOUT swapping the list for the skeleton. A resend
  // refreshes through this path so the row's "Email drafted" confirmation survives
  // (a remount would wipe the button's state the moment it appeared).
  async function load({ quiet = false, keepOnError = false } = {}) {
    if (!quiet) setLoading(true)
    if (!keepOnError) setError('')
    try {
      const res = await callApi('accounting_outstanding_links_load')
      if (res?.error) { if (keepOnError) console.error(res.error); else setError(res.error); return }
      setData(res || {})
      setLastSeen('outstandinglinks:', res || {})
    } catch (e) {
      if (keepOnError) console.error(e)
      else setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const bucket = (data && data[kind]) || {}
  const firstLinks = bucket.first_links || []
  const continuation = bucket.continuation || []
  const implementation = bucket.implementation_links || []
  const installments = bucket.installment_links || []
  const recurring = bucket.recurring || []
  const requests = bucket.requests || []
  const pipPurchases = bucket.purchases || []
  const atsgMissed = bucket.missed_retainers || []
  const atsgFees = bucket.impact_fees || []
  const pastDue = bucket.past_due || []
  const finalRetainers = bucket.final_retainer_links || []
  const failedRequests = bucket.failed || []
  const totalCount = firstLinks.length + continuation.length + implementation.length + installments.length + recurring.length + requests.length
    + pipPurchases.length + atsgMissed.length + atsgFees.length + pastDue.length + finalRetainers.length + failedRequests.length

  const wrap = embedded
    ? { fontFamily: 'Inter, sans-serif' }
    : { padding: '24px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }

  return (
    <div style={wrap}>
      {!embedded && (
        <div style={{ marginBottom: '18px' }}>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting</p>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>Outstanding Payment Links</h2>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => load()} style={refreshBtnStyle}>Refresh</button>
      </div>

      {loading && <OutstandingLinksSkeleton />}
      {!loading && error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>
      )}

      {!loading && !error && totalCount === 0 && <OutstandingEmpty />}

      {!loading && !error && totalCount > 0 && kind === 'pip' && (
        <div>
          <SectionHeader title="Additional PIP - Payment Links" count={pipPurchases.length} />
          {pipPurchases.map(it => <PipCard key={it.row_id} item={it} />)}
        </div>
      )}

      {!loading && !error && totalCount > 0 && kind === 'sdp_atsg' && (
        <div>
          <SectionHeader title="New Clients - First Retainer Payment" count={firstLinks.length} />
          {firstLinks.length === 0 ? <EmptyLine /> : firstLinks.map(it => (
            <AtsgCard key={it.payment_id} item={it} badge={BADGE_ATSG_FIRST} />
          ))}

          <SectionHeader title="Missed Retainer Payments" count={atsgMissed.length} />
          {atsgMissed.length === 0 ? <EmptyLine /> : atsgMissed.map(it => (
            <AtsgCard key={it.payment_id} item={it} badge={BADGE_ATSG_MISSED} />
          ))}

          <SectionHeader title="Strategy Impact Fees - Payment Requests" count={atsgFees.length} />
          {atsgFees.length === 0 ? <EmptyLine /> : atsgFees.map(it => (
            <AtsgCard key={it.payment_id} item={it} badge={BADGE_ATSG_FEE} />
          ))}
        </div>
      )}

      {!loading && !error && totalCount > 0 && (kind === 'map1' || kind === 'tax') && (
        <div>
          <SectionHeader title="New Clients - First Payment Link" count={firstLinks.length} />
          {firstLinks.length === 0 ? <EmptyLine /> : firstLinks.map(it => (
            <FirstLinkCard key={it.row_id ?? it.client_id} item={it} kind={kind} showProgram={kind === 'tax'} onDone={() => load({ quiet: true })} />
          ))}

          <SectionHeader title="Payment Continuation - Account Setup Links" count={continuation.length} />
          {continuation.length === 0 ? <EmptyLine /> : continuation.map(it => (
            <ContinuationCard key={it.row_id ?? it.client_id} item={it} kind={kind} onDone={() => load({ quiet: true })} />
          ))}

          {kind === 'map1' && installments.length > 0 && (
            <>
              <SectionHeader title="Failed Installments - Retry Links" count={installments.length} />
              {installments.map(it => (
                <InstallmentCard key={it.row_id} item={it} onDone={() => load({ quiet: true })} />
              ))}
            </>
          )}

          {kind === 'map1' && pastDue.length > 0 && (
            <>
              <SectionHeader title="Past Due - Not Charged" count={pastDue.length} />
              {pastDue.map(it => (
                <PastDueCard key={`${it.row_id}-${it.payment_number}`} item={it} />
              ))}
            </>
          )}

          {kind === 'tax' && finalRetainers.length > 0 && (
            <>
              <SectionHeader title="Final Retainer - Charge Failed" count={finalRetainers.length} />
              {finalRetainers.map(it => (
                <FinalRetainerCard key={it.row_id} item={it} />
              ))}
            </>
          )}

          {kind === 'tax' && implementation.length > 0 && (
            <>
              <SectionHeader title="Implementation - Charge Failed" count={implementation.length} />
              {implementation.map(it => (
                <ImplementationCard key={it.row_id ?? it.client_id} item={it} />
              ))}
            </>
          )}
        </div>
      )}

      {!loading && !error && totalCount > 0 && kind === 'specrev' && (
        <div>
          <SectionHeader title="Recurring Revenue - Setup Pending" count={recurring.length} />
          {recurring.length === 0 ? <EmptyLine /> : recurring.map(it => (
            <RecurringCard key={it.plan_id ?? it.expert_id} item={it} />
          ))}

          <SectionHeader title="One-Off Requests - Awaiting Payment" count={requests.length} />
          {requests.length === 0 ? <EmptyLine /> : requests.map(it => (
            <RequestCard key={it.id ?? it.expert_id} item={it} />
          ))}

          {failedRequests.length > 0 && (
            <>
              <SectionHeader title="Failed Payments" count={failedRequests.length} />
              {failedRequests.map(it => <FailedRequestCard key={it.id} item={it} />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}
