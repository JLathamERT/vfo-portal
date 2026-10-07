// Step order for Advisor + Accountant Onboarding: which step is locked, and the
// tax-style hint it shows. MIRRORED server-side by vfo-edge-functions
// utils/onboarding-order.ts — the handlers refuse exactly what this locks, so
// change both together (labels included: the hint quotes them).

export const PRELIM_SEND_DEPOSIT = 'Completed - Send Deposit'

export const lockHint = (label) => `Complete "${label}" first`

// The deposit is done once its confirmation email has gone out on a deposit that
// is paid or (ACH) clearing — a failed or unpaid deposit keeps the next step shut.
export function depositStepDone(ob) {
  if (ob.prelim_meeting_status !== PRELIM_SEND_DEPOSIT) return true
  return !!ob.deposit_confirmation_email_sent_at
    && (ob.deposit_status === 'succeeded' || ob.deposit_status === 'processing')
}

export function stage1Steps(ob, pipeline) {
  const prelim = ob.prelim_meeting_status
  const steps = [
    { key: 'team', label: 'Team Member Responsible', done: !!ob.onboarding_team_member },
    // A recorded meeting outcome proves the reminder step was passed (the PFT
    // fast path writes "Request no meeting" without one).
    { key: 'reminder', label: 'Meeting Reminder Setup', done: !!(ob.meeting_reminder_scheduled_at || ob.meeting_reminder_skipped_at || prelim) },
    { key: 'prelim', label: 'Preliminary Meeting', done: !!prelim && prelim !== 'No Show', noShow: prelim === 'No Show' },
  ]
  if (pipeline === 'accountant') {
    steps.push({ key: 'partnership', label: 'Direct or Advisor Partnership', done: !!ob.accountant_partnership })
    if (ob.accountant_partnership === 'Accountant Partnership') {
      steps.push({ key: 'cc_advisor', label: 'CC Connected Advisor', done: !!ob.cc_advisor_email })
    }
  }
  if (prelim === PRELIM_SEND_DEPOSIT) steps.push({ key: 'deposit', label: 'Deposit', done: depositStepDone(ob) })
  if (pipeline === 'advisor') {
    steps.push({ key: 'impl', label: 'Implementation value (including deposit)', done: Number(ob.implementation_value_vfo_ft) > 0 && Number(ob.implementation_value_pft) > 0 })
  }
  steps.push({ key: 'decision', label: 'Preliminary Meeting Decision', done: !!ob.prelim_meeting_decision })
  return steps
}

// Locked while any step above `key` is unfinished; the hint names the step
// directly above it (or, if that one is done, the first unfinished one above).
export function stage1Lock(ob, pipeline, key) {
  const steps = stage1Steps(ob, pipeline)
  const i = steps.findIndex(s => s.key === key)
  if (i <= 0) return null
  const prev = steps[i - 1]
  const open = !prev.done ? prev : steps.slice(0, i).find(s => !s.done)
  if (!open) return null
  return open.noShow ? 'Preliminary meeting was a no-show' : lockHint(open.label)
}

// The label Stage 2 gives the money row, so the Create lock names the row on screen.
export function paymentStepLabel(ob) {
  const depositOnFile = ob.deposit_status === 'succeeded' || ob.deposit_status === 'processing'
  const depositPaid = depositOnFile ? (Number(ob.deposit_amount) || 0) : 0
  const balance = Math.max(Number(ob.payment_amount || 0) - depositPaid, 0)
  const coversAll = !!ob.agreement_signed_by_ceo_at && ob.deposit_status === 'succeeded'
    && depositPaid > 0 && Number(ob.payment_amount) > 0 && balance === 0
  if (coversAll) return 'Deposit covered the full onboarding payment'
  return depositPaid > 0 ? 'Remaining payment collected after deposit' : 'Payment collected'
}

const INVOICE_STEP = 'Invoice and receipt created and emailed to client'

// Stage 3 (create the advisor / accountant) stays locked until every Stage 2
// step above it is done. VFO Associate accountants skip Stages 1-2 entirely.
export function createMemberLock(ob, pipeline) {
  if (pipeline === 'accountant' && ob.accountant_type === 'VFO Associate') return null
  const decision = ob.prelim_meeting_decision
  const finalDec = ob.final_decision || (decision === 'Yes' ? 'Yes' : decision === 'No' ? 'No' : null)
  if (finalDec === 'No') return `The ${pipeline} declined`
  if (finalDec !== 'Yes') return lockHint(INVOICE_STEP)
  const signedAt = pipeline === 'advisor' ? ob.agreement_signed_by_advisor_at : ob.agreement_signed_by_accountant_at
  const steps = [
    ['Engagement agreement created and sent for signing', !!ob.agreement_sent_at],
    ['Engagement agreement signed', !!signedAt],
    ['Engagement agreement signed by CEO', !!ob.agreement_signed_by_ceo_at],
    [paymentStepLabel(ob), ob.payment_status === 'succeeded'],
    [INVOICE_STEP, !!ob.invoice_sent_at],
  ]
  // Named by the step directly above Create — the last Stage 2 row.
  return steps.some(([, done]) => !done) ? lockHint(INVOICE_STEP) : null
}
