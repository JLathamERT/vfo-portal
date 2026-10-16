# CIQ tables

CIQ = **Client Intake Questionnaire**. Each member can run one or more CIQs against each of their clients. The CIQ collects answers across many sections, then surfaces a ranked list of priorities the advisor can drop / park / prioritize. Every state version of the priority ranking is captured in `ciq_priority_snapshots`.

## `client_ciqs`

One per (client, CIQ-run) pairing. Status moves `'draft'` → `'completed'`.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | pk |
| `client_id` | bigint | not null. fk → `clients.id` (CASCADE). |
| `member_number` | text | not null. Owning member. |
| `status` | text | not null, default `'draft'`. **Status field. CHECK: `status IN ('draft', 'completed')`.** |
| `created_at` | timestamptz | not null, default `now()` |
| `completed_at` | timestamptz | Set when `status` flips to `'completed'`. |
| `priorities_completed_at` | timestamptz | Set when priority ranking is finalized (separate step from CIQ completion). |
| `accountability_mode` | boolean | not null, default `false`. **"Update Progress" toggle** for the One Page Plan. When true, per-priority progress controls render. Flippable by admin AND member via `ciq_set_accountability`; shared between both views. |

**Status fields:** `status` (DB CHECK).

> **Schema-file gap (verified live 2026-10-16).** `accountability_mode` here and `ciq_priorities.progress_status` (+ its CHECK) exist in the live database but in **no file** under `supabase/migrations/` — they were applied by hand, so a rebuilt environment would lack them (#196). The portal licensing L4 branch adds an idempotent catch-up migration (`add column if not exists`). The live shape is the one documented here.

**Touched by:** `ciq_load_list`, `ciq_create`, `ciq_add_client_and_create`, `ciq_load`, `ciq_save`, `ciq_complete`, `ciq_load_priorities`, `ciq_save_priorities`, `ciq_complete_priorities`, `ciq_save_priority_snapshot`, `ciq_load_priority_snapshots`, `ciq_load_settings`, `ciq_set_accountability` (writes `accountability_mode`). Frontend: [MemberCIQ.jsx](src/components/shared/MemberCIQ.jsx).

> **`ciq_complete` reaches outside this table (2026-08-03, v695).** After flipping `status`/`completed_at` it re-reads this row's `client_id` and stamps the MAP 1 **"CIQ complete"** step — resolving the task by NAME through `program_client_phases` (`program_id=1`, `track_type='map1'`) + `program_client_tasks`, upserting `client_progress`, then calling `activateClientIfPending` (which can flip `clients.status` `pending`→`active`, #320). Entirely fail-soft: a failure logs and the CIQ still completes. See [flows/ciq.md](../flows/ciq.md) and gotcha #323.

---

## `ciq_answers`

Key/value answer storage. One row per `(ciq_id, question_key)`.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | pk |
| `ciq_id` | bigint | not null. fk → `client_ciqs.id` (CASCADE). |
| `question_key` | text | not null. Question identifier (form field key). |
| `answer_value` | text | Stored as text regardless of underlying type. |

**Touched by:** `ciq_load`, `ciq_save`, `ciq_complete`.

---

## `ciq_priorities`

Generated priority items derived from a completed CIQ. The advisor then assigns each a `decision`.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | pk |
| `ciq_id` | bigint | not null. fk → `client_ciqs.id` (CASCADE). |
| `item_key` | text | not null |
| `item_label` | text | not null. Display text. |
| `item_section` | text | not null. CIQ section grouping. |
| `item_value` | text | |
| `decision` | text | not null, default `'drop'`. **Status field. CHECK: `decision IN ('drop', 'park', 'prioritize')`.** The bucket assigned during the Prioritize step; also re-set from the One Page Plan ("Move to Parked" → `park`, "Drop" → `drop`, "Set as Priority" → `prioritize`). |
| `notes` | text | |
| `progress_status` | text | nullable. CHECK: `progress_status IN ('in_progress', 'completed')` (null = not started). **"Update Progress" status**, set per-priority on the One Page Plan when `accountability_mode` is on. Orthogonal to `decision`. `'completed'` items render in a separate Completed section. |

**Status fields:** `decision` (DB CHECK), `progress_status` (DB CHECK, nullable).

**Touched by:** `ciq_load_priorities`, `ciq_save_priorities` (upserts `decision` + `progress_status`), `ciq_complete_priorities`.

---

## `ciq_priority_snapshots`

Append-only history of the entire priority list at each save. Every "save priorities" action writes a new row containing the full JSONB snapshot, so the user can see the evolution.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | pk |
| `ciq_id` | bigint | not null. fk → `client_ciqs.id` (CASCADE). |
| `saved_by` | text | |
| `saved_at` | timestamptz | not null, default `now()`. |
| `snapshot` | jsonb | not null. Full priority list at this point in time. |

**Touched by:** `ciq_save_priority_snapshot`, `ciq_load_priority_snapshots`. Frontend: [MemberCIQ.jsx](src/components/shared/MemberCIQ.jsx) (`savePriorities`, ~line 431-438 as of 2026-10-16).

---

## `ciq_assignments` — **DROPPED 2026-07-01**

*(Verified absent from the live database 2026-10-16, but no migration file drops it — the baseline migration still CREATES it, so a rebuilt environment would bring it back (#196); the L4 catch-up migration drops it `if exists`.)* This table (specialist/expert "CIQ Topics" tag assignments) was **removed entirely** — the specialist CIQ-topics feature is gone (gotcha #168). `load_data` no longer returns a `ciq` array, `ciqMap` no longer exists in `AdminPortal`, and `save_specialist`/`delete_specialist` no longer touch it. This is UNRELATED to the member "CIQ One Page Plan" tables above, which remain fully in use.
