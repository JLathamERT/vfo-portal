# Portal Backlog tables

> The More ▾ → Portal Backlog tab ([flows/portal-backlog.md](../flows/portal-backlog.md)). Migrations `20261117190000_portal_backlog.sql`, `20261117190100_portal_backlog_title_writeup.sql`, `20261123190000_portal_backlog_tasks.sql` and `20261123200000_portal_backlog_live_importance.sql` (Live + release importance, Backlog 5a / 5b) and `20261123210000_portal_backlog_likes.sql` (likes, the cap, Sort by likes, Backlog 7a / 7b / 7c; edge repo). All four tables are RLS deny-all; only `vfo-admin-api` (service role) reads and writes them. *(v: 2026-11-24)*

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
| `progress` | `todo` / `working` / `done` / `ready_to_announce` / `live` (2026-11-23); not null exactly when approved. `done` is labelled **Review** on screen since 2026-11-24 |
| `assignee_admin_id` | the lane; null = Approved but unassigned (only with `todo`; kept in `ready_to_announce` and `live`, the table allows null there too; never on a task). On delete set null, which a task refuses: move or archive a superadmin's tasks before deleting their `allowed_admins` row |
| `requested_assignee_admin_id` | the requester's optional pick, used at approval only |
| `sort_key` | numeric, the position in the current column (lower first) |
| `done_at`, `ready_at`, `live_at` | the first time it entered Done / Ready to announce / Live; never cleared |
| `announcement` | the "What it does" write-up, up to 4000; required for a request to enter Ready to announce |
| `archived_at`, `archived_by_admin_id` | set when archived; only allowed in `live` (and `ready_to_announce`, for rows archived before 2026-11-23); the API archives from `live` only |
| `announced_on`, `announce_note` | from Mark as announced (Ready to announce → Live; note up to 1000); empty on an item that went Done → Live. Before 2026-11-23 the archive dialog set them. A restore keeps them |
| `release_importance` | `big` / `normal` (default) / `minor` (`portal_requests_release_importance_check`), the What's new marker (Backlog 5b); Done → Live turns `normal` into `minor`. Not the 1–5 `importance` |
| `imported`, `sheet_row` | the sheet import; `sheet_row` is unique and makes the import safe to re-run. Rows 91 and 92 were added to the sheet after the switch and imported on 2026-11-24 |
| `created_at`, `updated_at` | |

Indexes: `(review_status, progress, assignee_admin_id, sort_key)`, `(archived_at)`.

## `portal_request_events`

The history. `request_id` (on delete cascade), `actor_admin_id` (null for the import and the title clean-up), `kind` (`created`, `edited`, `withdrawn`, `approved`, `denied`, `reopened`, `moved`, `reordered`, `archived`, `restored`, `imported`, `writeup`, `task_created` — a task added, `to_value` its column; `announced` — Mark as announced, `from_value` the column it left, `to_value` the announced date, `note` the note; `went_live` — Done → Live, the two columns; `release_importance` — the old and new level, `note` "went straight to Live" when Done → Live set it), `from_value`, `to_value`, `note`, `created_at`. An `archived` row carried the announced date in `to_value` before 2026-11-23 and carries nothing since. A column is written `"<progress>:<assignee id>"` in `from_value` / `to_value` (`moved`, `reordered`, `approved`). `edited` names the changed fields in `note`, except the 2026-11-22 title clean-up's rows (no actor, `note` "Title replaced (imported title was cut off)", the old and new title in `from_value` / `to_value`, written by `scripts/portal-backlog-title-fix.sql`); `reopened` keeps the old denial reason in `from_value`; `restored` keeps the old announced date and note.

## `portal_request_likes` (Backlog 7a, 2026-11-23)

One like per admin per request. `request_id` (→ `portal_requests`, on delete cascade), `admin_id` (→ `allowed_admins`, on delete cascade, so a departed admin's likes go with them), `created_at`; primary key `(request_id, admin_id)`, index on `admin_id`. A row stays when its request is archived, denied or withdrawn (the count still shows in the archive). Written only by `portal_request_like_set`, never by `portal_request_apply`, and never with an event row.

## `portal_backlog_settings` (Backlog 7b, 2026-11-23)

One row (`id = 1`, checked). `like_cap` smallint 1–20, default **5**: how many active likes each admin may hold. `updated_by_admin_id` (on delete set null), `updated_at`. Written by `portal_backlog_settings_save`.

## Functions

- `portal_request_like_set(p_id, p_admin, p_liked)` — like or unlike in one transaction (Backlog 7a / 7b). Takes a per-admin advisory lock (`hashtext('portal_like:' || admin)`) then the request row. A like on a task, or on an archived, denied or withdrawn request, raises `portal_like_not_allowed`; a like that would be active (pending, or approved in `todo` / `working`) when the admin already holds `like_cap` active likes raises `portal_like_cap_reached` with the cap as DETAIL; a missing request raises `portal_request_not_found`. Liking twice or unliking a missing like changes nothing. Returns `{ id, like_count, liked_by_me, like_cap, likes_left }`.
- `portal_request_apply(p_id, p_set, p_expect, p_events)` — the only write path: inserts (`p_id` null) or updates one request from `p_set` (`kind` on insert only, `due_on`, `live_at` and `release_importance` on both), refuses with `portal_request_conflict` when a `p_expect` value no longer matches, and inserts the event rows, all in one transaction. **It writes only the columns it lists**: a new column needs the function re-created with it in both the INSERT and the UPDATE list, or `p_set` silently drops it.
- `portal_backlog_resort(p_progress, p_assignee, p_order default 'priority')` — Sort by priority for one column: tasks first in their current order, then requests by priority. `p_order = 'likes'` (Backlog 7c) puts the requests in order of like count first, then the priority key; tasks still first. Any other `p_order` raises `portal_resort_bad_order`. `ready_to_announce` and `live` are shared pools (every card in that progress, whoever it is assigned to). The two-argument form was dropped 2026-11-23; two-argument calls still resolve through the default.

All three are SECURITY INVOKER with `search_path` pinned; execute is revoked from `public`, `anon` and `authenticated` and granted to `service_role`.
