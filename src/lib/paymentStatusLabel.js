// Display wording for a raw payment status stored in the database (Stripe-style
// values such as 'processing' or 'check_pending'). Display only: never compare
// against or save the returned text. Unknown values come back unchanged.
const LABELS = {
  processing: 'clearing',
  check_pending: 'check clearing',
  succeeded: 'cleared',
  pending: 'pending',
  failed: 'failed',
  requires_action: 'needs action',
}

export function paymentStatusLabel(status) {
  if (status == null || status === '') return status
  return LABELS[status] || status
}
