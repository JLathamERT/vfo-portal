// Portal Backlog: where a request sits, the lenses, and the labels the board,
// lists and history share. The server owns every rule; this only reads rows.

export const PROGRESS_LABELS = {
  todo: 'To do',
  working: 'Working on',
  done: 'Done',
  ready_to_announce: 'Ready to announce',
}

export const LANE_COLUMNS = ['todo', 'working', 'done']

export const LENSES = [
  { key: 'pending', label: 'Pending review', color: '#c98a14', desc: 'of total' },
  { key: 'unassigned', label: 'Unassigned', color: '#8a9bbd', desc: 'of total' },
  { key: 'todo', label: 'To do', color: '#0a85e8', desc: 'of total' },
  { key: 'working', label: 'Working on', color: '#125ecc', desc: 'of total' },
  { key: 'done', label: 'Done', color: '#1b9254', desc: 'of total' },
  { key: 'ready', label: 'Ready to announce', color: '#7c4dcc', desc: 'of total' },
  { key: 'all', label: 'Total', color: '#125ecc', desc: 'pending or on the board (denied and announced requests are in the archive)' },
]

const approved = (r) => r.review_status === 'approved' && !r.archived_at

export const LENS_PREDICATE = {
  all: () => true,
  pending: (r) => r.review_status === 'pending',
  unassigned: (r) => approved(r) && r.progress === 'todo' && r.assignee_admin_id == null,
  todo: (r) => approved(r) && r.progress === 'todo' && r.assignee_admin_id != null,
  working: (r) => approved(r) && r.progress === 'working',
  done: (r) => approved(r) && r.progress === 'done',
  ready: (r) => approved(r) && r.progress === 'ready_to_announce',
}

export function lensCounts(rows) {
  const out = {}
  for (const l of LENSES) out[l.key] = rows.filter(LENS_PREDICATE[l.key]).length
  return out
}

// The Filter button on the Tasks board and the Requests tab (one filter, shared).
// Department matches when ANY of a request's departments is ticked. Assigned to
// is the requester's pick while pending, the real assignee once approved.
export const EMPTY_BACKLOG_FILTER = { department: [], requester: [], assignee: [] }
export const UNASSIGNED = 'Unassigned'

export const filterIsOn = (f) => Object.values(f).some((v) => v.length > 0)

const assignedIdOf = (r) => (r.review_status === 'pending' ? r.requested_assignee_admin_id : r.assignee_admin_id)
const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })

export function backlogFilterGroups(requests, people, assignees, departments) {
  const nameOf = (id) => people?.[id] || 'A former admin'
  const live = requests.filter((r) => r.review_status === 'pending' || (r.review_status === 'approved' && !r.archived_at))
  const requesters = [...new Set(live.map((r) => r.requester_name).filter(Boolean))].sort(byName)
  const superadmins = assignees.map((a) => a.name).sort(byName)
  const others = new Set()
  for (const r of live) {
    const id = assignedIdOf(r)
    if (id != null && !superadmins.includes(nameOf(id))) others.add(nameOf(id))
  }
  return [
    { key: 'department', label: 'Department', options: departments, get: (r) => r.departments || [] },
    { key: 'requester', label: 'Requester', options: requesters, get: (r) => r.requester_name },
    {
      key: 'assignee', label: 'Assigned to', options: [...superadmins, ...[...others].sort(byName), UNASSIGNED],
      get: (r) => { const id = assignedIdOf(r); return id == null ? UNASSIGNED : nameOf(id) },
    },
  ]
}

export const bySortKey =(a, b) => (a.sort_key - b.sort_key) || (a.id - b.id)

export function priority(r) {
  return (r.urgency || 0) + (r.importance || 0)
}

// Where a request is now, for the drawer, the deep link and the history.
export function placeLabel(r, people) {
  if (r.archived_at) return 'Archived'
  if (r.review_status === 'pending') return 'Pending review'
  if (r.review_status === 'denied') return 'Denied'
  if (r.review_status === 'withdrawn') return 'Withdrawn'
  return columnName(r.progress, r.assignee_admin_id, people)
}

export function columnName(progress, assignee, people) {
  if (progress === 'ready_to_announce') return 'Ready to announce'
  if (progress === 'todo' && assignee == null) return 'Approved but unassigned'
  const who = people?.[assignee] || 'Someone'
  return `${who} · ${PROGRESS_LABELS[progress] || progress}`
}

// Event from/to values are "<progress>:<assignee id>".
export function parseColumn(v) {
  const [progress, assignee] = String(v || '').split(':')
  return { progress: progress || null, assignee: assignee ? Number(assignee) : null }
}

export function fmtDate(d) {
  if (!d) return '–'
  const s = String(d)
  const [y, m, day] = s.slice(0, 10).split('-')
  if (!y || !m || !day) return s
  return `${Number(m)}/${Number(day)}/${y}`
}

export function fmtDateTime(ts) {
  if (!ts) return '–'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return String(ts)
  return d.toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function todayLocal() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function scoreText(n) {
  return n == null ? '–' : String(n)
}
