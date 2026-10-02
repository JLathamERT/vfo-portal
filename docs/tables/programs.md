# Programs tables

A "program" is a curriculum / engagement template. It has two parallel hierarchies of phases & tasks:

- **Training** (`program_training_phases` → `program_training_tasks`) — what the *member* learns
- **Client** (`program_client_phases` → `program_client_tasks`) — what the *member does for each client*

Each member enrolls into a program (`member_enrollments`), then training-progress is tracked per enrollment, while client-progress is tracked per client.

## `programs`

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `name` | text | not null |
| `description` | text | |
| `active` | boolean | default `true` |
| `created_at` | timestamptz | default `now()` |

**Touched by:** `msm_load_programs`. Frontend: [MemberPortal.jsx:34](src/pages/MemberPortal.jsx), [MemberMSMTracking.jsx](src/components/member/MemberMSMTracking.jsx), [MSMTracking.jsx](src/components/admin/MSMTracking.jsx).

---

## `program_training_phases`

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `program_id` | integer | fk → `programs.id` (NO ACTION) |
| `phase_number` | integer | not null |
| `name` | text | not null |
| `phase_order` | integer | not null |

---

## `program_training_tasks`

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `phase_id` | integer | fk → `program_training_phases.id` (NO ACTION) |
| `name` | text | not null |
| `task_type` | text | default `'dropdown'`. **Three values render differently in the 90-Day-Plan UI:** `'dropdown'` = a normal checkable step (status dropdown, counts toward phase completion); `'section'` = a **label-only sub-heading** (no dropdown, NEVER counted — see gotcha #173); `'substep'` = a checkable step rendered **indented inside** the enclosing section box (counts normally). |
| `task_order` | integer | not null. Section headers and their sub-steps are contiguous — a `'section'` owns every following `'substep'` until the next `'section'` or a `'dropdown'`. |
| `status_options` | text | **Pipe-delimited** (`Completed\|Outstanding\|Stopped`) list of allowed `status` values for `member_training_progress.status` — `training_member_save_task` splits on `\|` (corrected 2026-10-02; this cell previously said "Comma/JSON-encoded"). NULL for `'section'` rows (labels have no status). **Sentinel `'roleplay_booking'` (2026-10-02)** marks the **Proactive Facilitator Roleplay** step — task **161** (Holistic, phase 7 "MSM 5 Activity") and **162** (PFT, phase 22), each right after "Introduction to Proactive Facilitator" (35 / 91); MSM-driven, status DERIVED by `syncRoleplayProgress`, refused by `training_member_save_task` — see `training_roleplays` below. **Sentinel values `'tracker_accountants'` / `'tracker_clients'` (2026-07-21)** mark a **member-driven tracker step** (see `training_tracker_entries` below): the member adds rows and the step status is DERIVED from the entry count — NOT an admin dropdown. Task ids 76 (PFT "Add ≥2 Accountants") and 19 (Holistic "Add ≥5 Clients") are these; both are recognized by a sentinel-first / exact-task-name-fallback resolver in BOTH repos until the deploy-time swap sets the sentinel (gotchas #255, #256). |
| `video_url` | text | Optional training video — the member-side `VideoTask` embeds it. Three providers, detected by URL shape: **YouTube** (`…?v=<id>`, YT IFrame API), **Wistia** (`https://fast.wistia.net/embed/iframe/<mediaId>`), or **Loom** (`https://www.loom.com/embed/<id>`) — any URL containing `wistia` or `loom` renders in a plain 16:9 iframe. Provider **share** links are NOT stored directly: Wistia `/s/<slug>` (resolve via oEmbed) and Loom `/share/<id>?sid=…` (rewrite to `/embed/<id>`) must be converted first — see gotcha #174. |

> **90-Day-Plan sections (2026-07-02):** VFO Holistic Planning (program 1) MSM 1–4 and Partnership Fast Track (program 2) MSM 1–4 were restructured so each old "Watched Module/Step" step is now a `task_type='section'` header with `'substep'` watch-items beneath it (e.g. Holistic MSM 1 → *Watch "Foundation of a Virtual Family Office"* + 4 sub-steps). Section rows are labels only — both the admin `MSMTracking.jsx` and member `MemberMSMTracking.jsx` exclude them from every count via `countableTasks()` and enclose each `groupTasks()` group in a tinted box. Data-only change (rendering already generic); see gotcha #173.
>
> **Added 2026-08-31 (`20260831130000` + `20260831140000`, data-only — LIVE with no deploy, because the curriculum is data):** Holistic (program 1) MSM 2 Training gained **"Watch VFO Tax Planning Process"** (section, `task_order` 2) + **"Watch The VFO Tax Planning Process"** (substep, order 3, Wistia `9zhvrxs34i`) ABOVE the existing identify group, with everything from order 2 shifted **+2**. Because grouping is by ADJACENCY, inserting a section anywhere but the end means re-reading the whole phase afterwards to confirm each section still owns exactly its own substeps — there is no `(phase_id, task_order)` unique index to catch a collision, and member progress keys on `task_id` so a shift never moves anyone's saved status. The same pass renamed task 121 *"Watch Steps 1 - Identify"* → *"Watch Step 1 - Identify"*, the only plural among ten sibling sections across both programs.

> **Added 2026-10-02 (`20261002160000_training_roleplay_steps.sql`, applied AFTER backend v935 so the member-save refusal was live first):** "Proactive Facilitator Roleplay" (`task_type 'dropdown'`, `status_options 'roleplay_booking'`, `task_order` = max + 1) at the END of "MSM 5 Activity" on Holistic (id 161) and PFT (id 162). Inserted by phase name + program name, guarded by `not exists` on the sentinel. A frontend older than the roleplay branch renders the sentinel as a one-option dropdown until the new frontend is published.

> The `task_code` column (the visible `M#`/`P#` step IDs) was **dropped** for the 90-Day-Plan cleanup — codes are no longer stored or displayed. The 3 per-program "Review" checkpoint phases (MSM 4/8/12 Review) were also deleted; the training track now runs MSM 1 Training → MSM 12 Activity only. (`program_client_tasks.task_code` below — the MAP 1 C-codes — is unaffected.)

---

## `program_client_phases`

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `program_id` | integer | fk → `programs.id` (NO ACTION) |
| `phase_number` | integer | not null |
| `name` | text | not null |
| `phase_order` | integer | not null |
| `track_type` | text | default `'map1'`. Distinguishes which track this phase belongs to (e.g., `'map1'`, `'partnership_fast_track'`, `'regular'`, `'tax'`). |

---

## `program_client_tasks`

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `phase_id` | integer | fk → `program_client_phases.id` (NO ACTION) |
| `task_code` | text | |
| `name` | text | not null |
| `task_type` | text | default `'dropdown'` |
| `task_order` | integer | not null |
| `status_options` | text | Allowed `status` values for downstream progress tables. | **Pipe-delimited (`A\|B\|C`)** for `program_client_tasks` — the same format as `program_training_tasks.status_options` above. Certain values are sentinels the frontend switches on rather than dropdown options (e.g. `tax_refund`, `assess_form`, `tax_hlm_confirm`).

**Referenced by:** `client_progress.task_id`, `client_tax_progress.task_id`, `priority_progress.task_id` — all `NO ACTION`.

> **Tax 4 task this session:** ids **153 + 154** (the Tax 4 `task_order=0` task in both tax programs) were renamed to **"High Level Meeting Confirmation Email"** and their `status_options` changed `tax_meeting_date` → **`tax_hlm_confirm`** (date-picker task replaced by the `automation_TAX_highlevelmeeting_confirm` send-email button).

> **2026-08-13 (DML, `20260813233634_intro_cancelled_option_and_deck_stamp_backfill.sql`):** the **"VFO specialist introductions / discussions"** task on **both** tax programs had `status_options` changed from `'Introductions Completed'` to **`'Introductions Completed|Introductions cancelled'`**. Resolved **by name, not by id** (`WHERE name = '…' AND status_options = 'Introductions Completed'`), unlike the id-based note above. **The companion frontend change is mandatory, not optional:** `TaxPrioritiesTab.jsx`'s `statusColors` gained `'Introductions cancelled': '#e74c3c'` — a new option with no `statusColors` entry renders unstyled. **Operational note: open portals must be RELOADED** before a `status_options` change appears in the dropdown.

---

## `member_enrollments`

A member's enrollment in a program. Drives both training-progress and client-program tracking.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `member_number` | text | fk → `members.member_number` (CASCADE) |
| `program_id` | integer | fk → `programs.id` (NO ACTION) |
| `date_enrolled` | date | |
| `training_status` | text | default `'pre'`. Status field. |
| `program_status` | text | default `'active'`. Status field. |
| `assigned_msm` | text | Member-Servicing-Manager assigned to this enrollment. |
| `target_clients` | integer | default `0`. Goal count. |
| `notes` | text | |
| `created_at` | timestamptz | default `now()` |

**Status fields:** `training_status`, `program_status`.

**Touched by:** `msm_load_enrollments`, `msm_enroll_member`, `msm_update_enrollment`, `msm_load_clients`, `msm_load_member_clients`, `msm_update_assigned_msm`. Frontend: [MemberMSMTracking.jsx](src/components/member/MemberMSMTracking.jsx), [MSMTracking.jsx](src/components/admin/MSMTracking.jsx).

---

## `member_training_progress`

Per-task progress through the training curriculum. One row per `(enrollment_id, task_id)`.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `enrollment_id` | integer | fk → `member_enrollments.id` (CASCADE) |
| `task_id` | integer | fk → `program_training_tasks.id` (NO ACTION) |
| `status` | text | Status field. |
| `completed_date` | date | |
| `completed_by` | text | |
| `notes` | text | |

**Touched by:** `msm_load_training_progress`, `msm_save_training_task`. For the two **member-driven tracker steps** (task ids 76, 19), the `status`/`completed_date`/`completed_by` are DERIVED from `training_tracker_entries` by `syncTrackerProgress` (see below), not written by `msm_save_training_task`. For the **roleplay steps** (161, 162) they are DERIVED from `training_roleplays` / `training_roleplay_attempts` by `syncRoleplayProgress` (`Pending` / `Outstanding` / `Completed`, never over `Stopped` / `N/A`); `training_roleplay_send_intro` also ticks the "Introduction to Proactive Facilitator" row (35 / 91) `Completed`.

---

## `training_tracker_entries`

**NEW 2026-07-21.** Member-added rows behind a **member-driven 90 Day Plan training step** — the member builds a list (accountants for the PFT "Add ≥2 Accountants to Tracker" step, id 76; clients for the Holistic "Add ≥5 Clients to Client Target List" step, id 19) and the enclosing `member_training_progress` status is DERIVED from the row count vs a threshold (0 → grey/row-deleted, 1..threshold-1 → `In Progress`, ≥threshold → `Completed`). RLS deny-all (SECURITY INVARIANT #1). Created in migration `20260721150000_training_tracker_entries.sql`.

| Column | Type | Notes |
|---|---|---|
| `id` | serial | pk |
| `enrollment_id` | integer | fk → `member_enrollments.id` (**ON DELETE CASCADE**) |
| `task_id` | integer | fk → `program_training_tasks.id` |
| `first_name` | text | not null |
| `last_name` | text | not null |
| `email` | text | not null (must contain `@`) |
| `warm_cold` | text | not null (`Warm` \| `Cold`) |
| `firm_name` | text | nullable |
| `phone` | text | nullable |
| `source` | text | nullable (e.g. "LinkedIn", "Word of mouth") |
| `notes` | text | nullable |
| `created_at` | timestamptz | |
| `created_by` | text | member name |

Index on `(enrollment_id, task_id)`. **Touched by:** `training_tracker_load` (read), `training_tracker_add` (member insert + `syncTrackerProgress`), `training_tracker_delete` (admin delete + `syncTrackerProgress`). Config resolved by `resolveTrackerConfig` (sentinel `status_options` first, exact task-name fallback). See gotcha #255 + [flows/msm-tracking.md](../flows/msm-tracking.md).

---

## `training_roleplays` + `training_roleplay_attempts` (2026-10-02)

**NEW 2026-10-02** (migration `20261002150000_training_roleplay.sql`, both RLS deny-all in the same migration — SECURITY INVARIANT #1; anon probe `*/0`, advisor GREEN). Back the 90 Day Plan **Proactive Facilitator Roleplay** step (`program_training_tasks.status_options = 'roleplay_booking'`, ids 161 / 162). Flow: [flows/msm-tracking.md](../flows/msm-tracking.md#the-proactive-facilitator-roleplay-step-2026-10-02-v935).

**`training_roleplays`** — one row per `(enrollment, step)`; the intro email stamp.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial | pk |
| `enrollment_id` | integer | fk → `member_enrollments.id` (**ON DELETE CASCADE**) |
| `task_id` | integer | fk → `program_training_tasks.id` (**ON DELETE CASCADE**) |
| `intro_variant` | text | CHECK `in ('holistic','pft')` — narrowed from `('holistic','tax','pft')` by `20261002180000_training_roleplay_drop_tax_intro.sql`. Which intro was sent; also picks `[Program]` on the confirmation emails (`ROLEPLAY_PROGRAM_LABEL`). |
| `intro_sent_at` | timestamptz | Set on every (re-)send. |
| `intro_sent_by` | text | Admin display name (`allowed_admins.name`, email fallback). |
| `created_at` / `updated_at` | timestamptz | default `now()` |

Unique `(enrollment_id, task_id)`.

**`training_roleplay_attempts`** — one row per roleplay date; each No-show opens the next attempt.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial | pk |
| `roleplay_id` | bigint | fk → `training_roleplays.id` (**ON DELETE CASCADE**) |
| `attempt_no` | integer | not null, `>= 1` |
| `scheduled_date` | date | not null |
| `scheduled_time` | text | `HH:MM` (24h) |
| `scheduled_timezone` | text | `ET` / `CT` / `MT` / `PT` / `AKT` / `HT` (validated in-handler, no CHECK) |
| `confirmation_kind` | text | CHECK `confirmed` \| `rescheduled` |
| `confirmation_sent_at` / `confirmation_sent_by` | timestamptz / text | |
| `outcome` | text | CHECK `completed` \| `no_show`; NULL = not yet recorded |
| `outcome_at` / `outcome_by` | timestamptz / text | |
| `outcome_bell_sent_at` | timestamptz | Guard for the day-after `TRAINING_roleplay_outcome_needed` bell (growth overdue sweep pass); reset to NULL when the date changes. |
| `created_at` / `updated_at` | timestamptz | default `now()` |

Unique `(roleplay_id, attempt_no)`. **Touched by:** `training_roleplay_load` (read; admins any, members own enrollment via `denyIfNotOwnEnrollment`), `training_roleplay_send_intro` (upserts `training_roleplays`), `training_roleplay_confirm` (inserts / re-dates attempts), `training_roleplay_set_outcome` (outcome), `runRoleplayOutcomePass` in `automation_GROWTH_overdue_sweep` (reads due attempts, stamps `outcome_bell_sent_at`).

---

## `member_meetings`

Meeting log per enrollment.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `member_number` | text | fk → `members.member_number` (CASCADE) |
| `enrollment_id` | integer | fk → `member_enrollments.id` (CASCADE) |
| `meeting_date` | date | |
| `meeting_type` | text | |
| `conducted_by` | text | |
| `notes` | text | |
| `created_at` | timestamptz | default `now()` |

**Touched by:** `msm_load_meetings`, `msm_log_meeting`, `msm_delete_meeting`.

---

## `member_program_enabled`

Flag table — which programs are enabled for which members.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `member_number` | text | fk → `members.member_number` (CASCADE) |
| `program_id` | integer | fk → `programs.id` (NO ACTION) |
| `enabled` | boolean | default `false`. Status field. |

**Touched by:** `msm_load_enabled_programs` (whose payload also carries `features` — the two `portal_feature_flags` reads below, 2026-09-18), `msm_toggle_program`. **The member portal's VFO Tax Planning tab no longer needs a row here once the member's `tax_intake` flag is on** (unit 2 phase 0): with the flag on the tab is offered to every member; with it off, this table gates Tax Planning exactly like every other program.

---

## `portal_feature_flags` *(new 2026-09-18, migration `20260918200000_portal_feature_flags.sql`; deny-all RLS from creation)*

Portal feature gates — the release switch for member-facing features that ship dark. One row per feature key. Read ONLY through [utils/feature-flags.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/utils/feature-flags.ts) `featureEnabledForMember(sb, key, memberNumber)` (or, for a public page with no member, `featureEnabledGlobally(sb, key)`, which reads `enabled_for_all` only), both of which **fail closed**: a missing row, a failed read or a thrown error all answer `false`, so a database blip opens a feature to nobody rather than to everybody. **Written only by `feature_switches_save`** (2026-09-28, v914 — the superadmin-only admin **More ▾ → Feature Switches** tab; see [flows/tax-planning.md](../flows/tax-planning.md#feature-switches-2026-09-28)), which refuses any key outside `FEATURE_SWITCHES`, only UPDATEs (never creates a row), and writes one of three positions: **Off for all** = (`false`, `'{}'`), **Test member only** = (`false`, `'{59524}'`), **On for all** = (`true`, `'{59524}'`); `tax_diagnostic` (`memberScoped=false`) has only Off / On and always writes `'{}'`. No deploy either way; a hand SQL update still works (set `updated_at` yourself).

| Column | Type | Notes |
|---|---|---|
| `key` | text | pk — the feature name the code passes (`FEATURE_TAX_INTAKE = 'tax_intake'`, `FEATURE_TAX_DIRECT = 'tax_direct'`, `FEATURE_TAX_DIAGNOSTIC = 'tax_diagnostic'`, `FEATURE_PORTAL_LICENSING = 'portal_licensing'`, `FEATURE_TPOM_ADDITIONAL_BENEFITS = 'tpom_additional_benefits'`, `FEATURE_TAX_REMINDERS = 'tax_reminders'`). |
| `enabled_for_all` | boolean | not null, default `false`. **The release switch** — `true` short-circuits the allowlist for every member. |
| `member_numbers` | text[] | not null, default `'{}'`. The pre-release allowlist, matched by trimmed string equality against the member number. Seeded `{59524}` (Test Member) on `tax_intake`, `tax_direct`, `portal_licensing`, `tpom_additional_benefits` and `tax_reminders`; `{}` and never read on `tax_diagnostic`. |
| `note` | text | Free text — what the flag gates and how to release it. |
| `updated_at` | timestamptz | not null, default `now()`. Not maintained by a trigger — `feature_switches_save` stamps it; a hand update must set it in the same statement. |
| `updated_by` | text | nullable. **NEW 2026-09-28** (`20260928140000_feature_switches.sql`). The superadmin's email, stamped by `feature_switches_save`; shown as "Last changed ... by ..." on the tab. Null on rows never flipped from the tab. |

**Rows (seeded, `on conflict (key) do nothing`):** `tax_intake` — the member-run tax intake (unit 1): the member portal's Tax Planning tab and "+ Add new tax client" button, every intake write (`tax_intake_submit` / `_holistic_submit` / `_send_link` / `_link_submit` → 403 `This feature is not available for your account yet.`), the public `tax_intake_link_load` and the `/tax-deposit-pay` pair `tax_intake_deposit_load` / `_checkout` (404), and the Holistic "complete the Tax Planning Form" email (`utils/tax-intake-request-email.ts`, which then does NOT stamp `clients.tax_intake_requested_at`). `tax_direct` — the DIRECT route (unit 2): whether `tax_route='direct'` may be chosen on the intake (with 2+ qualifying clients) and the `direct_enabled` / `direct_eligibility` reads the form and the member profile render from. Both `enabled_for_all=false` at ship. `tax_diagnostic` (2026-09-23, migration `20260923180000`) — the public VFO Tax Diagnostic: the three `tax_diagnostic_*` public actions and the page, plus every intake row a diagnostic minted (its `/tax-deposit-pay` and `/tax-intake` links 404 while off, and `tax_diagnostic_confirm` 409s a deposit-due Confirm); only `enabled_for_all` is read. Seeded `false`, **switched to `true` on 2026-09-23 (Jake)**. `portal_licensing` (2026-09-28, migration `20260928140000`) — ONE switch for the new tax agreement AND the whole client portal licence (DIRECT unit 4 = portal licensing L1, 2026-09-28): while off for the client's member, `tax_send_agreement` sends the `'Tax Planning (pre-benefits)'` `agreement_templates` rows and the Undecided quote / Rapid Route emails attach the `-pre-benefits` sample PDFs (see [documents.md](documents.md)), and `automation_TAX_invoicereceipt` grants no licence, creates no login and stamps no `licence_disbursement`, and `client_showroom_load` omits its `licence` key (so the client portal has no Home screen) — see [flows/tax-planning.md](../flows/tax-planning.md#client-portal-licence-direct-unit-4--portal-licensing-l1-2026-09-28). `tpom_additional_benefits` (same migration) — the TPOM deck's Additional Benefits slide (`slide30`); off = dropped. Both seeded Test member only (`false`, `{59524}`). `tax_reminders` (2026-09-28, migration `20260928190000_tax_reminder_chases.sql`, `FEATURE_TAX_REMINDERS`, member-scoped) — the two tax reminder chases (`utils/tax-reminder-chases.ts`: additional info → client, planner review → planner + team member), its OWN switch by Jake's decision; seeded Test member only. Current positions: `select key, enabled_for_all, member_numbers, updated_at, updated_by from portal_feature_flags order by key`.

**Touched by (reads only):** `msm_load_enabled_programs` (`features`), `tax_intake_eligibility` (`intake_enabled` / `direct_enabled`), `member_profile_load` (`direct_eligibility.feature_released`), the four intake writes, `tax_intake_link_load`, `tax_intake_deposit_load` / `_checkout`, the `tax_diagnostic_*` actions, `utils/tax-intake-request-email.ts`, and (2026-09-28) `send-agreement.ts` / `decision.ts` / `generate-presentation.ts`, `utils/client-portal-licence.ts`, `client_showroom_load` and `utils/tax-reminder-chases.ts`. Flow: [flows/tax-intake.md § Feature flag and the Direct choice](../flows/tax-intake.md#feature-flag-and-the-direct-choice-unit-2-2026-09-18).

---

## `member_program_notes`

Free-text per-program notes attached to a member.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `member_number` | text | not null |
| `program_name` | text | not null |
| `note_text` | text | not null |
| `created_by` | text | not null |
| `created_at` / `updated_at` | timestamptz | default `now()` |

**Touched by:** `load_member_program_notes`, `add_member_program_note`, `update_member_program_note`, `delete_member_program_note`.
