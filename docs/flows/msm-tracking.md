# MSM (Member-Servicing-Manager) tracking flow

The largest action surface in the system. ~32 `msm_*` actions covering: programs, enrollments, training progress, client management, client priorities, tax tracking, and per-client home pages. Both admins and members use it (admin has full visibility; members are scoped to their own data).

There is no single "MSM flow" — it's a collection of related CRUD operations on the program/enrollment/client/priority tables. This doc maps the territory.

## Triggers

- Admin: opens a member's profile in [MembersPanel.jsx](src/components/admin/MembersPanel.jsx) → MSM Tracking feature tab → mounts [MSMTracking.jsx](src/components/admin/MSMTracking.jsx) (large).
- Member: opens [MemberPortal.jsx](src/pages/MemberPortal.jsx) → MSM Tracking dropdown → MSM Home or per-program tab → mounts [MemberMSMTracking.jsx](src/components/member/MemberMSMTracking.jsx) (large).
- Both admins and members can drill into a specific client via [ClientDetail.jsx](src/pages/ClientDetail.jsx).

## Subsystems

The 32 `msm_*` actions fall into 5 subsystems. Each is a small CRUD island — no chains, no integrations.

### A — Program / enrollment management

| Action | Tables | Notes |
|---|---|---|
| `msm_load_programs` | `programs` | Returns all programs. |
| `msm_load_enrollments` | `member_enrollments` | Filtered by `member_number`. |
| `msm_enroll_member` | inserts `member_enrollments` | Creates enrollment with default `training_status='pre'`, `program_status='active'`. |
| `msm_update_enrollment` | updates `member_enrollments` | Updates training/program status, target_clients, assigned_msm. |
| `msm_load_enabled_programs` | `member_program_enabled` | Reads which programs are enabled for the member. |
| `msm_toggle_program` | upserts `member_program_enabled` | Enables/disables a program for a member. Drives MemberPortal's dynamic tab list. |
| `msm_update_assigned_msm` | updates `members.assigned_msm` (or enrollment-level) | Reassigns the MSM. |

### B — Training tracking (per-enrollment)

| Action | Tables | Notes |
|---|---|---|
| `msm_load_training_track` | `program_training_phases`, `program_training_tasks` | The training curriculum template. `program_training_tasks.task_type` ∈ `'dropdown'`\|`'section'`\|`'substep'`: `'section'` rows are label-only sub-headings (never counted), `'substep'` rows render indented inside the enclosing section box — see gotcha #173 + `tables/programs.md`. **Completion is decided by `components/shared/trainingStatus.js`, and the rule is a DENYLIST of exactly FIVE values — `Outstanding`, `Will Watch`, `Pending`, `In Progress`, `Stopped`. Any other non-empty status counts as done (positive values are open-ended per program: "Have Watched", "3 to Call", "Built - 45%"), so a new done-style option needs no code change and a new not-done option must be added to the set. `N/A` is separate: it excludes the task from the DENOMINATOR entirely (a 4-step phase becomes 3). Any `Stopped` step makes the "90 Day Plan:" header read Stopped — gotcha #233. The backend mirror of that five-value set is `NOT_DONE_STATUSES` in `actions/msm/tracker-config.ts`.** |
| `msm_load_training_progress` | `member_training_progress` | Per-enrollment task progress. |
| `msm_save_training_task` | upserts `member_training_progress` | Keyed by `(enrollment_id, task_id)`. **ADMIN_ONLY as of 2026-07-21** (gotcha #256 — the list previously carried only the dead name `msm_save_training_progress`, leaving this ungated). Unchanged by the 2026-09-12 member-save work below. |
| `training_member_save_task` | upserts `member_training_progress`; bell | **The member's own writer for their 90 Day Plan (2026-09-12, `actions/msm/member-save-task.ts`).** MEMBER-only 403 gate + `denyIfNotOwnEnrollment`; `msm_save_training_task` stays ADMIN_ONLY and untouched — this is a second, narrower handler, not a widened gate. It **refuses**: `'section'` rows ("Section headers have no status"), tracker steps (`resolveTrackerConfig` — those are set by adding rows), `Stopped` / `N/A` **as an input value** (stripped out of the task's own `status_options`), and **any write over an existing `Stopped` / `N/A`** ("This step was set by your MSM and can't be changed here"). It writes `status` + `completed_by` = the member's name + `completed_date` = today **only when that column is currently null** (a non-empty status never blanks an admin-set date); clearing the status nulls both. When the write completes **every countable step of the phase** it raises the dismissible FYI bell `TRAINING_member_phase_completed` to the member's assigned MSM (`resolveAssignedMsmEmail`, `MSM_TEAM_EMAILS` fallback when unassigned), `dedupe: "unread"`, deep-linked to `&sub=training`; the whole block is try/catch so a notify failure never fails the write. **"Countable" and "done" come from the backend mirror of the frontend denylist — `NOT_DONE_STATUSES` in `actions/msm/tracker-config.ts`, which must stay identical to `components/shared/trainingStatus.js`.** |
| `training_tracker_load` | `training_tracker_entries`, `program_training_tasks` | **Member-driven tracker steps (2026-07-21).** MEMBER_SCOPED; loads a step's entries (`{enrollment_id, task_id}`), admins any / members own-enrollment via `denyIfNotOwnEnrollment`. Config resolved by `resolveTrackerConfig` — sentinel `status_options` (`tracker_accountants`/`tracker_clients`) first, exact task-name fallback (gotcha #255). |
| `training_tracker_add` | inserts `training_tracker_entries`; syncs `member_training_progress`; bell | MEMBER-only 403 gate + ownership. The member adds an accountant/client row (task id 76 PFT "Add ≥2 Accountants", id 19 Holistic "Add ≥5 Clients"); `syncTrackerProgress` re-derives the step status from the entry count (0→grey/row-deleted, 1..threshold-1→`In Progress`, ≥threshold→`Completed`), never overwriting `Stopped`/`N/A`. Completion-only FYI bell to the assigned MSM (`TRAINING_tracker_accountant_added`/`_client_added`) — fires once when the step reaches `Completed` at the threshold, not per add. |
| `training_tracker_delete` | deletes `training_tracker_entries`; syncs `member_training_progress` | ADMIN_ONLY. Removes a member-added row, re-derives status via `syncTrackerProgress`. |

### C — Meetings (per-enrollment)

| Action | Tables | Notes |
|---|---|---|
| `msm_load_meetings` | `member_meetings` | Filtered by `enrollment_id`. |
| `msm_log_meeting` | inserts `member_meetings` | |
| `msm_delete_meeting` | deletes `member_meetings` | |

### D — Client management (per-enrollment)

| Action | Tables | Notes |
|---|---|---|
| `msm_load_clients` | `clients`, `client_enrollments` | Joins clients to enrollment. **IDOR fixed 2026-08-27 / v796 — `denyIfNotOwnEnrollment` now runs first; see the member-side note below (#455).** |
| `msm_load_member_clients` | `clients` | All clients for a member, regardless of enrollment. |
| `msm_add_client` | inserts `clients` + optional `client_contacts` + `client_enrollments` | Creates a new client tied to an enrollment. `client_ref` from the shared `utils/client-ref.ts` `nextClientRef` (max suffix + 1). **ADMIN_ONLY as of 2026-09-12** — see the member-side note below. |
| `msm_link_existing_client` | inserts `client_enrollments` | Links existing client to a new enrollment. **ADMIN_ONLY as of 2026-09-12** — and it is the only way a CIQ-created client ever reaches a program Clients tab. |
| `msm_update_client` | updates `clients` | Defined twice in source — line 3079 wins, line 3216 is dead code. |
| `msm_add_client_contact` | inserts `client_contacts` | `email` REQUIRED since 2026-08-20. |
| `msm_update_client_contact` | updates `client_contacts` | New 2026-08-20. Name/email for any permitted caller; the `cc_on_emails` / `use_in_greeting` toggles are **admin-only**. See [additional-contacts.md](additional-contacts.md). |
| `msm_delete_client_contact` | deletes `client_contacts` | |

### E — Client tracks & priorities (per-client)

| Action | Tables | Notes |
|---|---|---|
| `msm_load_client_track` | `program_client_phases`, `program_client_tasks` | The "client" curriculum template, filtered by `track_type` (e.g., `'map1'`, `'partnership_fast_track'`). |
| `msm_load_client_progress` | `client_progress` | Per-client task progress. |
| `msm_save_client_task` | upserts `client_progress` | The action that records each c-task completion in MAP1/PFT/Regular tabs. **Also called by [PIPDecisionForm.jsx:106](src/components/admin/map1/PIPDecisionForm.jsx) before chaining `automation_PIPFU_decision`.** |
| `msm_load_priority_tracks` | `client_priority_tracks` | List of priority tracks for a client. |
| `msm_load_regular_phases` | `program_client_phases` filtered to `track_type='regular'` | |
| `msm_add_priority_track` | inserts `client_priority_tracks` | **Custom specialist (2026-08-20).** The Add Regular Priority picker carries a permanent trailing **"Custom"** option (module sentinel `OTHER_SPEC_VALUE = '__other__'`) that reveals an 80-char name input; the request then carries `custom: true` + `custom_name` and the **server** builds the stored value, sanitizing exactly like `tax_add_specialist` (collapse whitespace → trim → strip a leading case-insensitive `"custom -"` so it cannot double → 80-char cap) and prepending `"Custom - "`. Empty `custom_name` on the custom path is a 400. Same contract as the tax track's Custom allocation — see [tax-planning.md](tax-planning.md#allocating-an-off-directory-specialist-custom-2026-07-31-v683). **Deploy-window note:** the frontend also sends the already-prefixed `specialist_name` on the custom path, so the *old* handler (which ignores `custom`/`custom_name`) stores the identical value instead of NULL; the new handler ignores that field when `custom` is true and re-derives it. That belt-and-braces field can be dropped once the backend deploy has settled. |
| `msm_update_priority_status` | updates `client_priority_tracks.status` | E.g. `'live'`, `'archived'`. |
| `msm_load_priority_progress` | `priority_progress` | Per-track task progress. |
| `msm_save_priority_task` | upserts `priority_progress` | |
| `msm_load_client_home` | `clients` + `client_contacts` + `member_enrollments` + `programs` + `client_enrollments` | Aggregate read for ClientDetail's home tab. |
| `msm_load_client_detail` | `clients` + `member_enrollments` + `programs` | Smaller aggregate read. |

## Member-side view

Members can call all `msm_load_*` reads — but they are scoped server-side: `MEMBER_SCOPED_ACTIONS` (`constants/role-gates.ts`) overwrites `body.member_number` with the caller's own.

**The membership of that list is NOT reproduced here — read `MEMBER_SCOPED_ACTIONS` in `constants/role-gates.ts`.** It changes most sessions (it now also carries the `ciq_*` entries and `training_member_save_task`), and a copied list in prose goes stale silently while reading exactly as if it were current. Same hub rule as a count: never copy a list or a number into a doc when the source of truth is one grep away.

> **⚠️ That list is NOT an ownership guard, and two of its entries were an IDOR until 2026-08-27 / v796 (gotcha #455).** `MEMBER_SCOPED_ACTIONS` does exactly one thing — overwrite `body.member_number`. **`msm_load_clients` and `msm_load_training_progress` never read `member_number`:** they key on `body.enrollment_id`, and `msm_load_clients` returned whole `clients.*` rows (names, emails, phones). Enrollment ids are sequential integers, so any logged-in member could enumerate any other member's entire client list by incrementing one. Both now call **`denyIfNotOwnEnrollment`** as their first statement (`dispatch.ts` passes `c.auth`). `msm_load_training_track` was checked and needs nothing — it keys on `program_id` and returns shared curriculum templates. **Before trusting any entry above, read the handler and name the body field it filters on; if it is not `member_number`, it needs its own guard.** Fixed code-only — never exercised with a forged id.

**Adding clients is NOT member-allowed any more (2026-09-12 — reverses v337).** `msm_add_client` and `msm_link_existing_client` are now in **`ADMIN_ONLY_ACTIONS`**, and the member-side **"+ Add Client" / "+ Add Accountant"** button was removed from the program Clients tabs in `MemberMSMTracking.jsx`. A member's only path to creating a client is the **CIQ tab** — `ciq_add_client_and_create`, itself gated by `members.ciq_enabled` (see [ciq.md](ciq.md)). Two consequences to hold in mind:

- A CIQ-created client gets **no `client_enrollments` row**, so it never appears on a program Clients tab until an admin links it (`msm_link_existing_client`, now admin-only).
- There is **no member path at all to create a Partnership Fast Track accountant** — the CIQ path always mints a non-PFT ref (`<member>-NNN`), never `<member>-PFT<n>`. A PFT accountant now requires an admin.

`msm_add_client_contact` is **unchanged**: still member-scoped, still carrying its own `403` unless the target client belongs to the caller — it simply has no member UI caller on the program tabs any more. `add-client.ts` keeps its `enrollment.member_number === member_number` guard too (now belt-and-braces behind the admin gate). See [04-auth-and-sessions.md](../architecture/04-auth-and-sessions.md#role-gates).

**What a member CAN now do on their own 90 Day Plan (2026-09-12).** A member sets the status of **every non-tracker step themselves**, video sub-steps included, from the same select the admin sees minus two options: `Stopped` and `N/A` are **admin-only escapes** and are filtered out of the member's dropdown. A step already sitting at `Stopped` or `N/A` renders as a locked chip reading "Set by your MSM" instead of a select, and the backend refuses the write even if the request is forged. The two tracker steps stay **count-derived** (add rows, don't pick a status). And a member now sees the plan's **Stopped** state on the hero — the `90 Day Plan:` meta line reads `Stopped` in red, the same `planStatusLabel` / `isTrackStopped` the admin header uses.

Other mutations are admin-only (in `ADMIN_ONLY_ACTIONS` array — `constants/role-gates.ts`). Notably:
- `msm_save_client_task` is NOT in either list — the handler doesn't enforce role, so members could in theory write client progress for any client they know the ID of (application/UI-level ownership is the only guard). **`msm_save_training_task` was closed 2026-07-21** — it is now in `ADMIN_ONLY_ACTIONS` (the list previously carried only the dead name `msm_save_training_progress`, which matched no dispatched action, so the real training-status writer was ungated; gotcha #256). It stays admin-only: the member's own training-status writer is the separate `training_member_save_task` (2026-09-12, gotcha #490), not a widened gate on this one.

## The member's Vault tab on their own client (2026-08-27, v796)

**A member drilling into one of their own clients via `ClientDetail.jsx` now gets a `Vault` tab beside Profile** — the member-portal view of the same client vault the admin/planner `ClientVaultTab` renders. `validTabsForProgram`'s member array becomes `['home','vault']`, and the tab **appears for EVERY program the member is enrolled in, not just Holistic** — deliberate, matching admin/planner behaviour.

Permissions, chosen by the user: **General VIEW+ADD · Sensitive/tax-returns VIEW+ADD · ERT/VFOS Documentation VIEW ONLY.** No delete, no share, no request-documentation, no drag-to-move. `ClientVaultTab.jsx` takes a new `memberMode` prop with `MEMBER_SECTIONS` beside the renamed `ADMIN_SECTIONS`; **every added condition is `&& !memberMode`**, so admin and planner rendering is unchanged.

Three new backend actions — `member_client_vault_list` / `_download` / `_upload_url` — and **their gating is the part to read before touching them:** all three are in **NO `role-gates.ts` list**, confined instead by an in-handler `denyIfNotOwnClient` as the first statement of each, with the write bucket chosen from a positive allowlist that omits `'ert'` entirely. Full reasoning in [05-api-action-catalog.md](../architecture/05-api-action-catalog.md) (*Client vault — MEMBER side*) and [04-auth-and-sessions.md](../architecture/04-auth-and-sessions.md). A member upload raises the existing `VAULT_planner_document_added` bell to Tracy + the client's assigned PF, and **deliberately does not** stamp the tax planner's assess step.

## Cross-talk with other flows

- `msm_save_client_task` is called by [PIPDecisionForm.jsx:106](src/components/admin/map1/PIPDecisionForm.jsx) inside the MAP1 contract flow — see [contract-and-payment.md](contract-and-payment.md#step-2--pip-follow-up-decision).
- `member_load_pipeline` is invoked from [MemberMSMTracking.jsx:777](src/components/member/MemberMSMTracking.jsx) to surface the MAP1 pipeline state read-only inside the member view.
- `training_member_save_task` raises `TRAINING_member_phase_completed` — a dismissible FYI bell routed to the member's assigned MSM via the `ASSIGNED_MSM` token, with the whole MSM team as the call-site fallback when the member has no assigned MSM. The Notification Editor rule is seeded by `supabase/migrations/20260912120000_training_member_phase_completed_rule.sql`; see [notifications.md](notifications.md).

## Tables touched (composite list)

- **Read/written:** `programs`, `program_training_phases`, `program_training_tasks`, `program_client_phases`, `program_client_tasks`, `member_enrollments`, `member_program_enabled`, `member_training_progress` (written by the admin `msm_save_training_task` AND by the member's own `training_member_save_task`, 2026-09-12), `training_tracker_entries` (member-driven 90 Day Plan tracker steps, 2026-07-21), `member_meetings`, `clients`, `client_contacts`, `client_enrollments`, `client_progress`, `client_priority_tracks`, `priority_progress`, `members.assigned_msm`.
- **Written (notifications):** `notifications` — the tracker bells plus `TRAINING_member_phase_completed` (`training_member_save_task`), all dedupe-unread/best-effort.
- **Read only:** `members` (for context, and `members.assigned_msm` to route the member-completion bell), `notification_rules`.

## Downstream chains

**None.** Every msm action is single-shot CRUD.

## Failure modes

1. **No DB transactions** — `msm_add_client` does 3 inserts (`clients`, `client_contacts`, `client_enrollments`) sequentially, not in a transaction. A failure between #1 and #2 leaves an orphan `clients` row.
2. **`msm_update_client` duplicate handler** — see [05-api-action-catalog.md](../architecture/05-api-action-catalog.md). The duplicate at line 3216 is dead code.
3. **Cross-tenant write** — for actions in neither `ADMIN_ONLY_ACTIONS` nor `MEMBER_SCOPED_ACTIONS` (notably `msm_save_client_task`, `msm_save_priority_task`) there's no server-side ownership check; it relies on the UI not exposing other members' enrollment/client IDs. The gate moves since: `msm_save_training_task` went ADMIN_ONLY 2026-07-21 (gotcha #256), and **`msm_add_client` + `msm_link_existing_client` went ADMIN_ONLY 2026-09-12** — so the only member-callable writers left on this surface are `msm_add_client_contact` / `msm_update_client_contact` (member-scoped + handler-level `client_id` ownership), the tracker `training_tracker_load` / `_add`, and `training_member_save_task` (MEMBER-only 403 + `denyIfNotOwnEnrollment`).
4. **`msm_link_existing_client`** could in theory let an admin link a client to any enrollment without ownership validation. No checks observed — now admin-only (2026-09-12), so the exposure is admin-side only.

## Cross-references

- Programs/enrollments tables: [../tables/programs.md](../tables/programs.md)
- Clients tables: [../tables/clients.md](../tables/clients.md)
- Action catalog: [../architecture/05-api-action-catalog.md](../architecture/05-api-action-catalog.md)
