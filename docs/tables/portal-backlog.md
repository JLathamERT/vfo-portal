# Portal Backlog tables

> The More ▾ → Portal Backlog tab ([flows/portal-backlog.md](../flows/portal-backlog.md)). Migrations `20261117190000_portal_backlog.sql` and `20261117190100_portal_backlog_title_writeup.sql` (edge repo). Both tables are RLS deny-all; only `vfo-admin-api` (service role) reads and writes them. *(v: 2026-11-17)*

## `portal_requests`

One row per request.

| Column | Notes |
|---|---|
| `id` | bigint identity |
| `requester_admin_id` | `allowed_admins.id`, on delete set null |
| `requester_name` | a snapshot of the name, kept after the admin leaves |
| `requested_on` | date (America/New_York); null only for an imported row with no date |
| `title` | not null, 1–140 characters |
| `request_text` | the description; not null, non-empty (the API caps it at 4000) |
| `departments` | text[]; at least one unless `imported` (the API checks the list) |
| `urgency`, `importance` | smallint 1–5; null only on imported rows |
| `review_status` | `pending` / `approved` / `denied` / `withdrawn` |
| `review_note` | the denial reason |
| `reviewed_by_admin_id`, `reviewed_at` | who approved or denied, and when |
| `progress` | `todo` / `working` / `done` / `ready_to_announce`; not null exactly when approved |
| `assignee_admin_id` | the lane; null = Approved but unassigned (only with `todo`; kept in `ready_to_announce`) |
| `requested_assignee_admin_id` | the requester's optional pick, used at approval only |
| `sort_key` | numeric, the position in the current column (lower first) |
| `done_at`, `ready_at` | the first time it entered Done / Ready to announce |
| `announcement` | the "What it does" write-up, up to 4000; required to enter Ready to announce |
| `archived_at`, `archived_by_admin_id` | set when archived; only allowed in `ready_to_announce` |
| `announced_on`, `announce_note` | from the archive dialog (note up to 1000) |
| `imported`, `sheet_row` | the sheet import; `sheet_row` is unique and makes the import safe to re-run |
| `created_at`, `updated_at` | |

Indexes: `(review_status, progress, assignee_admin_id, sort_key)`, `(archived_at)`.

## `portal_request_events`

The history. `request_id` (on delete cascade), `actor_admin_id` (null for the import and the title clean-up), `kind` (`created`, `edited`, `withdrawn`, `approved`, `denied`, `reopened`, `moved`, `reordered`, `archived`, `restored`, `imported`, `writeup`), `from_value`, `to_value`, `note`, `created_at`. A column is written `"<progress>:<assignee id>"` in `from_value` / `to_value` (`moved`, `reordered`, `approved`). `edited` names the changed fields in `note`, except the 2026-11-22 title clean-up's rows (no actor, `note` "Title replaced (imported title was cut off)", the old and new title in `from_value` / `to_value`, written by `scripts/portal-backlog-title-fix.sql`); `reopened` keeps the old denial reason in `from_value`; `restored` keeps the old announced date and note.

## Functions

- `portal_request_apply(p_id, p_set, p_expect, p_events)` — the only write path: inserts (`p_id` null) or updates one request from `p_set`, refuses with `portal_request_conflict` when a `p_expect` value no longer matches, and inserts the event rows, all in one transaction.
- `portal_backlog_resort(p_progress, p_assignee)` — Sort by priority for one column.

Both are SECURITY INVOKER with `search_path` pinned; execute is revoked from `public`, `anon` and `authenticated` and granted to `service_role`.
