// Portal Backlog: where a request sits, the lenses, and the labels the board,
// lists and history share. The server owns every rule; this only reads rows.

export const PROGRESS_LABELS = {
  todo: 'To do',
  working: 'Working on',
  done: 'Done',
  ready_to_announce: 'Ready to announce',
  live: 'Live',
}

export const LANE_COLUMNS = ['todo', 'working', 'done']

// Ready to announce and Live (Backlog 5a) are shared pools: one column each,
// whoever the card is assigned to.
export const isPool = (progress) => progress === 'ready_to_announce' || progress === 'live'

// The release importance marker (Backlog 5b). Always labelled "Release
// importance" on screen: the 1-5 Importance score is a different thing.
export const RELEASE_IMPORTANCE = [
  { key: 'big', label: 'Big news' },
  { key: 'normal', label: 'Normal' },
  { key: 'minor', label: 'Minor' },
]
export const releaseImportanceLabel = (v) => RELEASE_IMPORTANCE.find((o) => o.key === v)?.label || 'Normal'
const RELEASE_RANK = { big: 0, normal: 1, minor: 2 }

// The What's new tab's order in each section: Big news, then Normal, then
// Minor; within a level, newest first by `field` (ready_at or live_at).
export function byReleaseThenNewest(field) {
  return (a, b) => {
    const r = (RELEASE_RANK[a.release_importance] ?? 1) - (RELEASE_RANK[b.release_importance] ?? 1)
    if (r) return r
    const da = a[field] || '', db = b[field] || ''
    return db.localeCompare(da) || (b.id - a.id)
  }
}

export const LENSES = [
  { key: 'pending', label: 'Pending review', color: '#c98a14', desc: 'of total' },
  { key: 'unassigned', label: 'Unassigned', color: '#8a9bbd', desc: 'of total' },
  { key: 'todo', label: 'To do', color: '#0a85e8', desc: 'of total' },
  { key: 'working', label: 'Working on', color: '#125ecc', desc: 'of total' },
  { key: 'done', label: 'Done', color: '#1b9254', desc: 'of total' },
  { key: 'ready', label: 'Ready to announce', color: '#7c4dcc', desc: 'of total' },
  { key: 'live', label: 'Live', color: '#0e8a8a', desc: 'of total' },
  { key: 'all', label: 'Total', color: '#125ecc', desc: 'pending or on the board (denied and archived requests are in the archive)' },
]

const approved = (r) => r.review_status === 'approved' && !r.archived_at

// A superadmin task (Backlog 4a): born approved, no urgency, importance or
// review, always in a lane. The hero counts requests only (Paxton 2026-11-23).
export const isTask = (r) => r?.kind === 'task'

// Overdue: the due date has passed and the task is not yet in Ready to announce
// or the archive. Dates compare as YYYY-MM-DD strings in the viewer's day.
export function isOverdue(r) {
  if (!r?.due_on || r.archived_at || isPool(r.progress)) return false
  return String(r.due_on).slice(0, 10) < todayLocal()
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// "5 Dec", with the year when it is not this year.
export function fmtDue(d) {
  const [y, m, day] = String(d || '').slice(0, 10).split('-').map(Number)
  if (!y || !m || !day) return String(d || '')
  return `${day} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`
}

export const LENS_PREDICATE = {
  all: () => true,
  pending: (r) => r.review_status === 'pending',
  unassigned: (r) => approved(r) && r.progress === 'todo' && r.assignee_admin_id == null,
  todo: (r) => approved(r) && r.progress === 'todo' && r.assignee_admin_id != null,
  working: (r) => approved(r) && r.progress === 'working',
  done: (r) => approved(r) && r.progress === 'done',
  ready: (r) => approved(r) && r.progress === 'ready_to_announce',
  live: (r) => approved(r) && r.progress === 'live',
}

export function lensCounts(rows) {
  const out = {}
  for (const l of LENSES) out[l.key] = rows.filter(LENS_PREDICATE[l.key]).length
  return out
}

// The Filter button on the Tasks board and the Requests tab (one filter, shared).
// Department matches when ANY of a request's departments is ticked. Assigned to
// is the requester's pick while pending, the real assignee once approved. Type
// shows requests or tasks alone (Backlog 4a); a task with no department matches
// no Department tick.
export const EMPTY_BACKLOG_FILTER = { type: [], department: [], requester: [], assignee: [] }
export const TYPE_REQUESTS = 'Requests'
export const TYPE_TASKS = 'Tasks'
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
    { key: 'type', label: 'Type', options: [TYPE_REQUESTS, TYPE_TASKS], get: (r) => (isTask(r) ? TYPE_TASKS : TYPE_REQUESTS) },
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

// The Requests tab's order (Backlog 3c). "Added" is the date the request was
// filed (requested_on), then the id; a request with no date (some sheet imports)
// goes last. created_at is not used: the sheet import stamped every row alike.
const addedCmp = (a, b, dir) => {
  const da = a.requested_on || '', db = b.requested_on || ''
  if (!da !== !db) return da ? -1 : 1
  return dir * (da.localeCompare(db) || (a.id - b.id))
}
export const byAdded = (a, b) => addedCmp(a, b, 1)

export const REQUEST_SORT_OPTIONS = [
  { value: 'added_asc', label: 'Date added: Oldest' },
  { value: 'added_desc', label: 'Date added: Newest' },
  { value: 'priority', label: 'Priority: Highest' },
  { value: 'title', label: 'Title: A to Z' },
]

export function sortRequests(rows, value) {
  const list = [...rows]
  switch (value) {
    case 'added_desc': return list.sort((a, b) => addedCmp(a, b, -1))
    case 'priority': return list.sort((a, b) => (priority(b) - priority(a)) || byAdded(a, b))
    case 'title': return list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }) || (a.id - b.id))
    default: return list.sort(byAdded)
  }
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
  if (progress === 'live') return 'Live'
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
