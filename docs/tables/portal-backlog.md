# Portal Backlog tables

> The More ▾ → Portal Backlog tab ([flows/portal-backlog.md](../flows/portal-backlog.md)). Migrations `20261117190000_portal_backlog.sql`, `20261117190100_portal_backlog_title_writeup.sql`, `20261123190000_portal_backlog_tasks.sql` and `20261123200000_portal_backlog_live_importance.sql` (Live + release importance, Backlog 5a / 5b; edge repo). Both tables are RLS deny-all; only `vfo-admin-api` (service role) reads and writes them. *(v: 2026-11-23)*

## `portal_requests`

One row per request, or per superadmin task (`kind`, 2026-11-23).

| Column | Notes |
|---|---|
| `id` | bigint identity |
| `kind` | `request` (default, every row before 2026-11-23) or `task` — a superadmin's own item: born `approved` in a lane, no urgency / importance / requested assignee (`portal_requests_task_shape`), always assigned (`portal_requests_task_assigned`), departments optional |
| `due_on` | date, a task's optional due date (past dates allowed); never set on a request |
| `requester_admin_id` | `allowed_admins.id`, on delete set null |
| `requester_name` | a snapshot of the name, kept after the admin leaves |
| `requested_on` | date (America/New_York); null only for an imported row with no date |
| `title` | not null, 1–140 characters |
| `request_text` | the description; not null, non-empty (the API caps it at 4000) |
| `departments` | text[]; at least one unless `imported` or a task (the API checks the list) |
| `urgency`, `importance` | smallint 1–5; null only on imported rows |
| `review_status` | `pending` / `approved` / `denied` / `withdrawn` |
| `review_note` | the denial reason |
| `reviewed_by_admin_id`, `reviewed_at` | who approved or denied, and when |
| `progress` | `todo` / `working` / `done` / `ready_to_announce` / `live` (2026-11-23); not null exactly when approved |
| `assignee_admin_id` | the lane; null = Approved but unassigned (only with `todo`; kept in `ready_to_announce` and `live`, the table allows null there too; never on a task). On delete set null, which a task refuses: move or archive a superadmin's tasks before deleting their `allowed_admins` row |
| `requested_assignee_admin_id` | the requester's optional pick, used at approval only |
| `sort_key` | numeric, the position in the current column (lower first) |
| `done_at`, `ready_at`, `live_at` | the first time it entered Done / Ready to announce / Live; never cleared |
| `announcement` | the "What it does" write-up, up to 4000; required for a request to enter Ready to announce |
| `archived_at`, `archived_by_admin_id` | set when archived; only allowed in `live` (and `ready_to_announce`, for rows archived before 2026-11-23); the API archives from `live` only |
| `announced_on`, `announce_note` | from Mark as announced (Ready to announce → Live; note up to 1000); empty on an item that went Done → Live. Before 2026-11-23 the archive dialog set them. A restore keeps them |
| `release_importance` | `big` / `normal` (default) / `minor` (`portal_requests_release_importance_check`), the What's new marker (Backlog 5b); Done → Live turns `normal` into `minor`. Not the 1–5 `importance` |
| `imported`, `sheet_row` | the sheet import; `sheet_row` is unique and makes the import safe to re-run |
| `created_at`, `updated_at` | |

Indexes: `(review_status, progress, assignee_admin_id, sort_key)`, `(archived_at)`.

## `portal_request_events`

The history. `request_id` (on delete cascade), `actor_admin_id` (null for the import and the title clean-up), `kind` (`created`, `edited`, `withdrawn`, `approved`, `denied`, `reopened`, `moved`, `reordered`, `archived`, `restored`, `imported`, `writeup`, `task_created` — a task added, `to_value` its column; `announced` — Mark as announced, `from_value` the column it left, `to_value` the announced date, `note` the note; `went_live` — Done → Live, the two columns; `release_importance` — the old and new level, `note` "went straight to Live" when Done → Live set it), `from_value`, `to_value`, `note`, `created_at`. An `archived` row carried the announced date in `to_value` before 2026-11-23 and carries nothing since. A column is written `"<progress>:<assignee id>"` in `from_value` / `to_value` (`moved`, `reordered`, `approved`). `edited` names the changed fields in `note`, except the 2026-11-22 title clean-up's rows (no actor, `note` "Title replaced (imported title was cut off)", the old and new title in `from_value` / `to_value`, written by `scripts/portal-backlog-title-fix.sql`); `reopened` keeps the old denial reason in `from_value`; `restored` keeps the old announced date and note.

## Functions

- `portal_request_apply(p_id, p_set, p_expect, p_events)` — the only write path: inserts (`p_id` null) or updates one request from `p_set` (`kind` on insert only, `due_on`, `live_at` and `release_importance` on both), refuses with `portal_request_conflict` when a `p_expect` value no longer matches, and inserts the event rows, all in one transaction. **It writes only the columns it lists**: a new column needs the function re-created with it in both the INSERT and the UPDATE list, or `p_set` silently drops it.
- `portal_backlog_resort(p_progress, p_assignee)` — Sort by priority for one column: tasks first in their current order, then requests by priority. `ready_to_announce` and `live` are shared pools (every card in that progress, whoever it is assigned to).

Both are SECURITY INVOKER with `search_path` pinned; execute is revoked from `public`, `anon` and `authenticated` and granted to `service_role`.
