// Step order for Advisor + Accountant Onboarding: which step is locked, and the
// tax-style hint it shows. MIRRORED server-side by vfo-edge-functions
// utils/onboarding-order.ts — the handlers refuse exactly what this locks, so
// change both together (labels included: the hint quotes them).
//
// A Tier 1 row (isTier1Onboarding — a VFO Associate or Financial Collaborator
// stamped tier1_flow_at, portal licensing L6b) takes its own order: no deposit and
// no implementation value in Stage 1, and a "VFO Portal licence paid by" step after
// CC Connected Advisor. Stage 2 is the same as every other row — the first month
// is paid on the onboarding before Create.

export const PRELIM_SEND_DEPOSIT = 'Completed - Send Deposit'

// MIRRORED from edge utils/tier1-onboarding.ts + utils/tier1-onboarding-payment.ts.
// The tier1_flow_at stamp written at creation, not the type alone, puts a row on
// the Tier 1 path, so rows from before the switch stay on today's path.
export const ASSOCIATE_ACCOUNTANT_TYPE = 'VFO Associate'
export const FC_ADVISOR_TYPE = 'Financial Collaborator'

export function isTier1Onboarding(ob, pipeline) {
  if (!ob?.tier1_flow_at) return false
  return pipeline === 'accountant'
    ? ob.accountant_type === ASSOCIATE_ACCOUNTANT_TYPE
    : ob.advisor_type === FC_ADVISOR_TYPE
}

export function isConnectedAssociate(ob) {
  return ob?.accountant_partnership === 'Accountant Partnership'
}

export function tier1MonthlyFee(ob, pipeline) {
  return pipeline === 'accountant' && isConnectedAssociate(ob) ? 25 : 145
}

export function tier1AdvisorPays(ob, pipeline) {
  return pipeline === 'accountant'
    && isConnectedAssociate(ob)
    && ob?.licence_paid_by === 'advisor'
    && !!String(ob?.cc_advisor_email || '').trim()
}

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
  const tier1 = isTier1Onboarding(ob, pipeline)
  if (pipeline === 'accountant') {
    steps.push({ key: 'partnership', label: 'Direct or Advisor Partnership', done: !!ob.accountant_partnership })
    if (ob.accountant_partnership === 'Accountant Partnership') {
      steps.push({ key: 'cc_advisor', label: 'CC Connected Advisor', done: !!ob.cc_advisor_email })
      if (tier1) steps.push({ key: 'licence_paid_by', label: 'VFO Portal licence paid by', done: !!ob.licence_paid_by })
    }
  }
  if (tier1) {
    steps.push({ key: 'decision', label: 'Preliminary Meeting Decision', done: !!ob.prelim_meeting_decision })
    return steps
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
// step above it is done. A VFO Associate accountant on today's path (no Tier 1
// stamp) skips Stages 1-2 entirely; a Tier 1 row pays its first month before
// Create like every other row.
export function createMemberLock(ob, pipeline) {
  if (!isTier1Onboarding(ob, pipeline) && pipeline === 'accountant' && ob.accountant_type === 'VFO Associate') return null
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
