# Clients tables

A client is a member's **end customer** — the person whose tax/financial planning the advisor manages. Owned by a member; tracked through programs, priorities, and tax engagements.

## `clients`

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `client_ref` | text | Human-friendly reference (e.g., `VFO-XYZ-123`). |
| `enrollment_id` | integer | fk → `member_enrollments.id` (SET NULL). Which member enrollment owns this client. |
| `member_number` | text | fk → `members.member_number` (CASCADE). |
| `first_name` / `last_name` / `email` / `phone` | text | |
| `status` | text | default `'pending'`. Status field. Values seen: `'pending'`, `'active'`, `'lost'`, others — **not DB-constrained** (the value set is a code convention only). **AUTO-ACTIVATES since 2026-08-03 (v694, gotcha #320):** a row flips `'pending'` → `'active'` on the client's first tracking activity, via `activateClientIfPending` (`utils/client-status.ts`) called from exactly THREE writers — `msm_save_client_task` (covering every MAP 1 dropdown, every PFT dropdown and the admin MSMTracking inline holistic track), `tax_save_task` (via its hoisted plan lookup) and `savePftProgress` (`actions/pft/_shared.ts`). The update is strictly conditional (`.eq("status","pending")`), so `'active'`/`'lost'` are **never** overwritten — PFT's No→`'lost'` write lands afterwards and correctly wins. It is fire-and-forget and never fails the caller's save. **Any NEW tracking-progress writer must call it, or its clients sit at Pending forever.** Consumers are display-only: the two "ACTIVE" KPI tiles (`MSMTracking.jsx`, `MemberMSMTracking.jsx`) plus status pills/filters — **no backend query, gate, sweep or payment path reads this column.** Member callers cannot set it (`msm_update_client` ignores `status` from members — admin-controlled). |
| `assigned_pf` | text | Planning Facilitator assigned to this client. |
| `tax_upload_token` | text | Per-client token for the public `/tax-upload` link. **Durable, per-CLIENT and SHARED across flows — never per-request** (#331): the "Request Tax Returns" step (both tax programs since 2026-08-07) and the "Request additional information" step mint-if-absent and then reuse the same value, so every link ever emailed to a client is the same URL. **No longer minted by the MAP 1 first-payment email** — `contract-invoice-receipt.ts` dropped it in v709 and links a static Tax Form URL instead (#341). Links already sent still resolve, which is exactly why Holistic's `tax_returns_received_at` stamp is request-gated (#340). |
| `client_setup_token` | text | Per-client token for the `/client-setup` portal-login link. **NO WRITER as of 2026-08-26 (v789).** Its only two minters were the first-payment handlers — `actions/tax/invoice-receipt.ts` (`[PORTAL_SETUP]`) and `actions/pipeline/contract-invoice-receipt.ts` (the button inside `[TAX_UPLOAD]`) — and both lost the button that day, the TAX pair also losing the token from their `email_templates` bodies by live SQL. **Nothing in the codebase writes this column now, so every value in it is historical.** The READ side is deliberately intact: `load_client_setup` / `submit_client_setup` still resolve on it, so links already emailed keep working — **do not treat the column, the `/client-setup` route or those two handlers as dead code and drop them.** New clients reach the portal via the manual login-setup email (`/set-password`, `login_setup_tokens`) instead — flagged decision, see [../architecture/04-auth-and-sessions.md](../architecture/04-auth-and-sessions.md). |
| `client_setup_completed_at` | timestamptz | Stamped when the client creates their `client_logins` row. |
| `created_at` | timestamptz | default `now()` |

**Status fields:** `status`.

**Touched by:** `msm_load_clients`, `msm_load_member_clients`, `msm_add_client`, `msm_link_existing_client`, `msm_update_client`, `msm_load_client_track`, `msm_load_client_progress`, `msm_load_client_home`, `msm_load_client_detail`, `msm_update_assigned_msm`, `automation_*` (most read `clients`), and indirectly anywhere `client_id` is used. Frontend: [ClientDetail.jsx](src/pages/ClientDetail.jsx), [MSMTracking.jsx](src/components/admin/MSMTracking.jsx), [MemberMSMTracking.jsx](src/components/member/MemberMSMTracking.jsx).

---

## `client_contacts`

Additional contacts attached to a client (spouse, business partner, etc.). **Since 2026-08-20 this table also drives who gets Cc'd on the client's automation emails** — full mechanism → [flows/additional-contacts.md](../flows/additional-contacts.md).

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `client_id` | integer | fk → `clients.id` (CASCADE) |
| `first_name` / `last_name` | text | |
| `email` | text | **REQUIRED on every NEW row since 2026-08-20** (`msm_add_client_contact` 400s without it, validated against the same regex `dedupeEmails` uses). Pre-existing rows may still be blank — they keep working but can never enable `cc_on_emails`. |
| `cc_on_emails` | boolean | `NOT NULL DEFAULT false` (2026-08-20). Cc this contact on **every** client-facing email for this client. Read at send time by `utils/additional-contact.ts loadAdditionalContacts`. **Requires a non-empty `email`.** |
| `use_in_greeting` | boolean | `NOT NULL DEFAULT false` (2026-08-20). Also fold this contact's `first_name` into the `[Client First]` body token (*"Dane and Veronica"*). **Requires `cc_on_emails`.** |
| `created_at` | timestamptz | default `now()` |

Both toggles are **admin-only** (`msm_update_client_contact` gates on `auth.callerRole === "admin"` — a tax planner is `"tax_planner"`, not an admin). Both invariants are enforced on the **final state**, not the incoming fields. Migration: `20260820190148_client_contacts_cc_toggles`; the legacy `extra_cc` backfill: `20260820193959` + `20260820200601`.

**Touched by:** `msm_add_client_contact`, `msm_update_client_contact` (2026-08-20), `msm_delete_client_contact`, `load_member_contacts`, `msm_load_client_home`, `ciq_add_client_and_create`, `msm_add_client`, and **every emailing handler that calls `loadAdditionalContacts`** (53 sites at ship — derive it, don't trust the count).

---

## `client_notes`

Phase/tab-scoped notes on a client. Used by the program-tracking UI to attach notes to specific phase steps.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `client_id` | integer | not null. fk → `clients.id` (CASCADE). |
| `phase_name` | text | not null |
| `tab_name` | text | not null |
| `program_name` | text | |
| `note_text` | text | not null |
| `created_by` | text | not null |
| `created_at` / `updated_at` | timestamptz | default `now()` |

**Touched by:** `load_client_notes`, `add_client_note`, `update_client_note`, `delete_client_note` (all four are admin-only AND — as of 2026-07-23 — planner-callable from the Tax Planner portal per-phase Notes, with in-handler group-scope guards on the writes; gotcha #273). Frontend: [PhaseNotes.jsx](src/components/shared/PhaseNotes.jsx), [AddGeneralNote.jsx](src/components/shared/AddGeneralNote.jsx).

---

## `client_enrollments`

Many-to-many bridge linking a `client` to a `member_enrollments` row. Allows one client to participate in multiple enrollments.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `client_id` | integer | not null. fk → `clients.id` (CASCADE). |
| `enrollment_id` | integer | not null. fk → `member_enrollments.id` (CASCADE). |
| `created_at` | timestamptz | default `now()` |

**Touched by:** indirectly via `msm_load_clients`, `msm_add_client`.

---

## `client_progress`

Per-task progress tracking for "client" (non-training) program tasks. Drives the MAP1 / regular / PF tracks UI.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `client_id` | integer | fk → `clients.id` (CASCADE) |
| `task_id` | integer | fk → `program_client_tasks.id` (NO ACTION) |
| `status` | text | Status field. Values defined per-task in `program_client_tasks.status_options`. |
| `completed_date` | date | |
| `completed_by` | text | |
| `notes` | text | |

**Touched by:** `msm_load_client_progress`, `msm_save_client_task`, `msm_load_client_track`, **`ciq_complete`** (2026-08-03 — stamps the MAP 1 "CIQ complete" row). Frontend: [PFTEngagementTrack.jsx](src/components/admin/pft/PFTEngagementTrack.jsx), [ClientTrackViewV2.jsx](src/components/admin/map1/ClientTrackViewV2.jsx).

> **This table has NO enrollment column — it is keyed `(client_id, task_id)` alone, and one writer depends on that.** `ciq_complete`'s MAP 1 step sync (2026-08-03, v695) writes the "CIQ complete" row **whether or not the client's MAP 1 track has been set up yet**; the row simply pre-exists and is picked up when the track is later created. Do not add an enrollment guard to this table's writes. See [../flows/ciq.md](../flows/ciq.md) and gotcha #323.

---

## `client_priority_tracks`

Each client can have multiple "priority tracks" — e.g., a regular priority and a tax priority. Each track has its own progression through tasks.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `client_id` | integer | fk → `clients.id` (CASCADE) |
| `priority_name` | text | |
| `track_type` | text | default `'regular'`. Distinguishes track types (e.g., `'regular'`, `'partnership_fast_track'`). |
| `specialist_name` | text | Normally the name of a directory specialist, stored as free text (no FK). **Since 2026-08-20 it may also hold `"Custom - <name>"`** — an off-directory specialist typed into the Add Regular Priority form's trailing **"Custom"** picker option. **The server owns the prefix:** `msm_add_priority_track` takes `custom: true` + `custom_name`, strips any user-supplied `custom -` lead-in, collapses whitespace, caps at 80 chars and prepends `"Custom - "` itself, using the same sanitizer shape as tax add-specialist — so a client can never choose the stored format. Anything reading this column must treat it as free text and must not assume it matches a specialists row. **It reaches a CLIENT since 2026-08-27 (v798):** `actions/regular/map4-confirm-email.ts` renders it into the MAP 4 confirmation email's `[Specialist Name]` token — so it strips the `"Custom - "` prefix (an internal marker that must never appear in client-facing copy), falls back to *"your VFO Specialist"* when empty, and substitutes through a replacer **function** because free text may contain `$&`/`$1` (#438). Any future consumer owes the same three things. |
| `status` | text | default `'live'`. Status field. |
| `created_at` | timestamptz | default `now()` |

**Touched by:** `msm_load_priority_tracks`, `msm_load_regular_phases`, `msm_add_priority_track`, `msm_update_priority_status`. Frontend: [RegularPrioritiesTab.jsx](src/components/admin/regular/RegularPrioritiesTab.jsx).

---

## `priority_progress`

Per-task progress within a priority track (parallel to `client_progress` but scoped to a `client_priority_tracks` row).

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `priority_track_id` | integer | fk → `client_priority_tracks.id` (CASCADE) |
| `task_id` | integer | fk → `program_client_tasks.id` (NO ACTION) |
| `status` | text | Status field. |
| `completed_date` | date | |
| `completed_by` | text | |
| `notes` | text | |
| `created_at` | timestamptz | default `now()` |

**Touched by:** `msm_load_priority_progress`, `msm_save_priority_task`.

## `pft_engagement`

Per-accountant state for the Partnership Fast Track engagement track (added 2026-06-05). One row per PFT client; the DB-driven track tasks themselves live in `program_client_phases`/`program_client_tasks` (`track_type='partnership_fast_track'`) with status in `client_progress`. See [../flows/partnership-fast-track.md](../flows/partnership-fast-track.md).

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | pk (generated always as identity) |
| `client_id` | integer | **UNIQUE** fk → `clients.id` (CASCADE) |
| `discovery_token` | text | token for the Meeting-2 discovery form (`/pft-discovery`) |
| `discovery_data` | jsonb | submitted discovery answers |
| `discovery_submitted_at` | timestamptz | |
| `discovery_email_sent_at` | timestamptz | Meeting-2 send timer (drives the 2-day reminder / 4-day PF notice) |
| `discovery_reminder_sent_at` | timestamptz | 2-day reminder guard |
| `discovery_pf_notified_at` | timestamptz | 4-day PF-notice guard |
| `ft_response_token` | text | token for the VFO Fast Track email buttons (`/pft-ft-decide`) |
| `ft_email_sent_at` | timestamptz | FT decision-email send timer |
| `ft_response` | text | `confirm` \| `another_meeting` (idempotency) |
| `ft_response_at` | timestamptz | |
| `ft_reminder_sent_at` | timestamptz | 2-day reminder guard |
| `ft_pf_notified_at` | timestamptz | 4-day PF-notice guard |
| `accountant_onboarding_id` | bigint | fk → `accountant_onboarding(id)` `ON DELETE SET NULL`; the handoff record created on a VFO FT / VFO Associate decision |
| `created_at` | timestamptz | default `now()` |
| `discovery_pf_ack_at` / `ft_pf_ack_at` / `decision_pf_ack_at` | timestamptz | **2026-08-12 (v734).** "Reached out?" acknowledgements — one per stall ladder, recording that a human chased the 4-day PF notice. **ONLY writer `automation_stall_ack`** (`pipeline:'pft'`, `stall` ∈ `discovery` / `ft` / `decision`); un-ticking writes NULL. Nothing reads them. Backfilled `now()` where the PF notice had fired AND the response arrived (`decision_response` / `ft_response` non-null) — **0 rows matched on both**; `discovery` got no backfill statement. **The 2-day / 4-day rows themselves used to render ALWAYS on this surface and are now conditional on their own stamp** — and `PFTEngagementTrack.jsx` dropped its `!decResp`/`!ftResp` guards at the same time, so the chase history now SURVIVES the response instead of vanishing when the accountant replies. Gotcha **#381**. |

> **`decision_options`** (text, nullable — **2026-09-14**, migration `20260914180000`): `ft_no` | `ft_associate_no` | NULL (= legacy = all three) — which paths the Undecided email offered; read by the sweep re-send and by `automation_PFT_undecided_response`, which refuses a choice outside the set.
>
> **The `decision_*` family is not itemised above and predates this session** — `decision_email_sent_at` / `decision_reminder_sent_at` / `decision_pf_notified_at` / `decision_response` exist and are read by `automation_PFT_sweep` and `PFTAutomationPanel.jsx`. Pre-existing doc drift, noted rather than fixed here.

**Touched by:** `automation_PFT_meetingemail`, `automation_PFT_decisionemail`, `automation_PFT_ftresponse`, `automation_PFT_loaddiscovery`, `automation_PFT_submitdiscovery`, `automation_PFT_sweep`, `pft_load_engagement`, `automation_stall_ack`.

> Also added 2026-06-05: `accountant_onboarding.accountant_type` (`'VFO FT'` | `'VFO Associate'` | NULL) — associates skip Stages 1-2; and `accountant_onboarding.prelim_meeting_status` gained the value `'Request no meeting'` (auto-set by the PFT FT "confirm" response).
