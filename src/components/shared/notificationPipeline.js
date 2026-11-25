// What a notification is about, in plain words: the tag on every notification.
const LABELS = {
  TAX: 'Tax', REMINDER: 'Reminder', SDP_ATSG: 'SDP ATSG', PIP: 'PIP', VAULT: 'Vault', MSM: 'MSM', CIQ: 'CIQ',
  PFT: 'Partnership Fast Track', ERT: 'ERT', MEMBER_MEMBERSHIP: 'Membership', VFO_SPECIALIST_REVENUE: 'Specialist revenue',
  SPECIALIST_BG_CHECK: 'Background check', REVSHARE: 'Revenue share', REGULAR: 'Regular priorities', UNKNOWN: '',
}

export function pipelineLabel(p) {
  if (!p) return ''
  if (p in LABELS) return LABELS[p]
  if (/^MAP \d$/.test(p)) return p
  const words = String(p).replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
