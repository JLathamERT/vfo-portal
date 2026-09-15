// Single source of truth for "has this revenue-share leg actually paid out yet?" across
// the Accounting panels. Those panels print every slice of a split as a dollar figure,
// which reads as money that already moved; this turns the leg's payout column into a
// short note + tone so a slice still sitting in the VFO balance reads as pending.
//
// Aggregate cells carry TWO sub-notes, not one: PendingNote for money owed for ordinary
// reasons and HeldNote for money parked behind a suspended/paused member. They partition
// the outstanding amount — a held dollar is never counted in both.
//
// The status vocabulary is not invented here — it is what the payout handlers write and
// what the client-facing split cards already render:
//   - src/components/admin/tax/PricingSplitCard.jsx — legNote / noteColor, and the
//     'Awaiting Planner Allocation' + 'Awaiting Connect Setup' non-terminal pair
//   - src/components/admin/map1/Map1PricingSplitCard.jsx — adds the migrated
//     'settled on old system' reading of a legacy row's no-share-due leg
//   - edge utils/tax-planner-payout.ts (PLANNER_SHARE_WITHHELD),
//     utils/member-share-held.ts (AWAITING_CONNECT),
//     utils/member-payout-hold.ts (HELD_MEMBER_SUSPENDED / HELD_MEMBER_PAUSED / HELD_MEMBER_ARREARS),
//     actions/tax/revshare.ts and
//     actions/msm/pip-revshare.ts ('Yes' / 'Money Mapping' / 'N/A — No Share Due' /
//     'Failed' / 'Pending')
// Annotation only: no amount, filter or total is derived from any of this.

import { money as defaultMoney } from './specialistRevenueShared'

export const PENDING_COLOR = '#b9451d'
const PAID_COLOR = '#1b9254'
const MUTED = 'var(--vfo-muted)'

const TERMINAL = ['Yes', 'Money Mapping', 'N/A — No Share Due', 'N/A']

// The three member-hold readings, spelled the way Accounting shows them. Deliberately
// Title Case where every other note is lowercase: a hold is the one pending reading an
// operator is expected to act on, so it is meant to catch the eye under the dollars.
export const HELD_SUSPENDED_NOTE = 'Held - Suspended'
export const HELD_PAUSED_NOTE = 'Held - Paused'
// Membership fees in arrears — not a suspension; released when the arrears are paid.
export const HELD_ARREARS_NOTE = 'Held - In Arrears'

export function isTerminalLeg(status) {
  return TERMINAL.includes(status)
}

export function legState(status, { revShare, paymentStatus, context } = {}) {
  if (status === 'Yes') return { note: 'paid', tone: 'done' }
  // Credited as growth credits rather than transferred — it HAS happened.
  if (status === 'Money Mapping') return { note: 'money mapping', tone: 'done' }
  // Nothing will ever pay on this leg, so it is neither done nor pending.
  if (status === 'N/A — No Share Due' || status === 'N/A') return { note: 'no share due', tone: null }
  if (status === 'Awaiting Connect Setup') return { note: 'awaiting payout setup', tone: 'pending' }
  // A suspended / paused / in-arrears member still earns the share — the payout is
  // parked and the reinstatement pass sends it, so the leg is owed money, never settled money.
  if (status === 'Held - Member Suspended') return { note: HELD_SUSPENDED_NOTE, tone: 'pending' }
  if (status === 'Held - Member Paused') return { note: HELD_PAUSED_NOTE, tone: 'pending' }
  if (status === 'Held - Member In Arrears') return { note: HELD_ARREARS_NOTE, tone: 'pending' }
  if (status === 'Awaiting Planner Allocation') return { note: 'awaiting planner', tone: 'pending' }
  if (status === 'Failed') return { note: 'failed — retrying', tone: 'pending' }
  if (status == null || status === '') {
    if (revShare === 'Pending') return { note: 'in progress', tone: 'pending' }
    if (paymentStatus === 'processing' || paymentStatus === 'check_pending') return { note: 'payment clearing', tone: 'pending' }
    // The tax retainer's revenue share does not fire on the charge — it fires on the
    // client's decision after the review, so a blank leg is waiting on the client.
    if (context === 'tax_retainer') return { note: 'awaiting client decision', tone: 'pending' }
    return { note: 'not yet paid', tone: 'pending' }
  }
  return { note: String(status).toLowerCase(), tone: 'pending' }
}

export function noteColor(state) {
  if (!state) return MUTED
  if (state.tone === 'pending') return PENDING_COLOR
  if (state.tone === 'done') return state.note === 'paid' ? PAID_COLOR : MUTED
  return MUTED
}

const noteStyle = { display: 'block', fontSize: '9px', lineHeight: 1.2, fontWeight: 400 }

// One split-amount grid cell: the amount in the caller's existing styling, dimmed unless
// the leg has actually settled, with the leg note underneath. A zero/absent share keeps
// whatever the caller rendered before (a dash, or a plain $0.00) and carries no note —
// unless the caller passes noteOnZero, for the one case where a zero is not "no share"
// but "this share books on a later payment" (the 3-payment tax initial retainer) and the
// note is the whole point of the cell. Off by default, so every other caller is unchanged.
export function ShareCell({ value, state, money = defaultMoney, color, fontWeight, dash, noteOnZero = false }) {
  const n = Number(value) || 0
  const note = (n > 0 || noteOnZero) ? state?.note : null
  return (
    <span style={{ textAlign: 'right', color, fontWeight }}>
      <span style={{ opacity: note && state.tone !== 'done' ? 0.55 : 1 }}>{n > 0 || dash == null ? money(n) : dash}</span>
      {note && <span style={{ ...noteStyle, color: noteColor(state) }}>{note}</span>}
    </span>
  )
}

// The two readings that mean a member's slice actually LANDED somewhere: cash was
// transferred, or growth credits were issued. MAP 1 / Tax (legState above) and PIP
// (pipShared's pipMemberState) start from different status vocabularies — 'Yes' vs
// 'Completed - Revenue Share', 'Money Mapping' vs 'Completed - Money Mapping' — and both
// normalise into these, which is why the bucketing rule below reads the note rather than
// the raw column and needs no per-track variant.
const SETTLED_AS_CASH = 'paid'
const SETTLED_AS_CREDITS = 'money mapping'

// Which of the two member columns a slice belongs in — Member Revenue Share or Member
// Money Mapping.
//
// A SETTLED leg is history and is bucketed by WHAT HAPPENED, not by what the member has
// chosen since: cash that really moved stays in Revenue Share even if that member has
// switched to Money Mapping in the years afterwards, and vice versa. Reading the current
// decision there would silently restate a past payout as something it never was.
//
// An UNSETTLED leg (blank / in progress / held / awaiting / failed) has no history to
// read yet, so the member's current decision is the best prediction of where the money
// will go and stays the fallback. 'no share due' and the legacy 'settled on old system'
// also fall through here — no member money moves either way, so the column only decides
// which side shows the dash.
export function isMoneyMappingLeg(state, decision) {
  if (state?.note === SETTLED_AS_CASH) return false
  if (state?.note === SETTLED_AS_CREDITS) return true
  return (decision || '') === 'Money Mapping'
}

// Which member-hold parked this leg, if any. Aggregate surfaces bucket held dollars per
// reason rather than reading the note text back out.
export function heldReason(state) {
  if (state?.note === HELD_SUSPENDED_NOTE) return 'suspended'
  if (state?.note === HELD_PAUSED_NOTE) return 'paused'
  if (state?.note === HELD_ARREARS_NOTE) return 'arrears'
  return null
}

// "$X pending" under a totals / aggregate cell. Held dollars are NOT counted here — they
// get their own note below, so the two together partition what is still owed instead of
// double-counting the same money under two headings.
export function PendingNote({ amount, money = defaultMoney }) {
  if (!amount) return null
  return <span style={{ ...noteStyle, color: PENDING_COLOR }}>{money(amount)} pending</span>
}

// "$X held - suspended" / "$X held - paused" / "$X held - in arrears" under an aggregate
// cell — or, given `total` instead, one combined "$X held" for a totals row where the
// per-reason breakdown would only add noise. Held money is owed money parked behind a
// suspended, paused or in-arrears member and released on reinstatement / catch-up;
// separating it out is the whole point of the note.
export function HeldNote({ suspended = 0, paused = 0, arrears = 0, total, money = defaultMoney }) {
  if (total != null) {
    return total > 0 ? <span style={{ ...noteStyle, color: PENDING_COLOR }}>{money(total)} held</span> : null
  }
  if (!suspended && !paused && !arrears) return null
  return (
    <>
      {suspended > 0 && <span style={{ ...noteStyle, color: PENDING_COLOR }}>{money(suspended)} held - suspended</span>}
      {paused > 0 && <span style={{ ...noteStyle, color: PENDING_COLOR }}>{money(paused)} held - paused</span>}
      {arrears > 0 && <span style={{ ...noteStyle, color: PENDING_COLOR }}>{money(arrears)} held - in arrears</span>}
    </>
  )
}

// Muted one-liner under a cell — the Received column's in-flight payment note.
export function SubNote({ text }) {
  if (!text) return null
  return <span style={{ ...noteStyle, color: MUTED }}>{text}</span>
}

// The payment itself is still in flight, so nothing downstream of it can have paid out.
export function paymentNoteFor(status) {
  if (status === 'processing') return 'processing'
  if (status === 'check_pending') return 'check pending'
  return null
}
