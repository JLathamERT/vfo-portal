// The kinds of MSM meeting an admin can log from MSM Home. Meetings logged
// before the types existed are stored as 'MSM Meeting' and are not counted.
export const MSM_MEETING_TYPES = ['Growth Plan Meeting', 'Implementation Period Check-In']

const COUNTER_LABELS = {
  'Growth Plan Meeting': 'Growth Plan',
  'Implementation Period Check-In': 'Implementation',
}

// The combined MSM counter's sub-counts: [label, count] pairs, one per type.
export const msmTypeCounts = (meetings) => MSM_MEETING_TYPES.map(t => [
  COUNTER_LABELS[t] || t,
  (meetings || []).filter(m => m.meeting_type === t).length,
])
