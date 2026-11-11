// The kinds of MSM meeting an admin can log from MSM Home. Meetings logged
// before the types existed are stored as 'MSM Meeting' and still count.
export const MSM_MEETING_TYPES = ['Growth Plan Meeting', 'Implementation Period Check-In']

export const isMsmMeeting = (type) => type === 'MSM Meeting' || MSM_MEETING_TYPES.includes(type)

// ‑ is a non-breaking hyphen, so a narrow tile wraps before "Check-Ins"
// rather than splitting it at the hyphen.
const COUNTER_LABELS = {
  'Growth Plan Meeting': 'Growth Plan Meetings',
  'Implementation Period Check-In': 'Implementation Period Check‑Ins',
}

// One Meeting Summary counter per type: [label, count] pairs.
export const msmTypeCounts = (meetings) => MSM_MEETING_TYPES.map(t => [
  COUNTER_LABELS[t] || t,
  (meetings || []).filter(m => m.meeting_type === t).length,
])
