# Advisor Growth Plan — Build Handoff

> Handoff for continuing the Advisor Growth Plan feature in a new chat.
> Read this in full before doing anything. Then read the files it points to.

## TL;DR
**Phases 1–8 + custom priorities/sub-tasks are BUILT + user-verified + DEPLOYED.**
Backend live **v490** (MERGED edge #52/#53, tagged `backend-good-2026-06-17-v490`);
frontend live **`live-15-growth-accountability`** (MERGED react #64/#65). A
follow-up **Parking/Dropped UI-cleanup** pass (branch
`claude/suspicious-lovelace-b2515f`, frontend-only) is dev-only until its own
`npm run deploy`. The feature is **advisor-only** for now; an accountant variant
comes later (same structure, different question/action copy — keep copy isolated
in `constants.js`). Remaining is a few deferred UX items (see bottom).

> **⚠️ 2026-07-08 UPDATE — much of the above is now superseded (branch `claude/growth-plan-4-ways`, backend live v560, frontend dev-only → next `live-N`):**
> - **Accountant variant is BUILT.** `constants.js` is now split into `ADVISOR_CONFIG`/`ACCOUNTANT_CONFIG` selected by `getGrowthConfig(variant)`; `variantForMember(member)` is derived from `member_category` and threaded through every sub-view + the member portal. Score math extracted to `scoring.js`. New `'areas'` question type = the accountant "Compliance Factory" section (rendered by `AreasEditor` in `GrowthScoring.jsx`). Enabled via `growthPlan={true}` on `AccountantsPanel` — NO backend/DB change (generic storage). See gotcha #192.
> - **New pre-scoring flow + hub.** Sub-tabs now: **Get Started** (`GrowthGetStarted.jsx`, assign MSM — gates the rest) → **4 Ways to Grow a Business** (`Growth4Ways.jsx`) → Scoring → … The "Growth Plan" tab is a single button that opens a **Menu/hub** (`GrowthHub.jsx`); dropdown removed. Shared `shared/HubKit.jsx` powers both the hub and the restyled **CIQ chooser** (`MemberCIQ.jsx`).
> - **MSM + notifications.** MSM lives on member-keyed `growth_plan_four_ways` AND the score row; `save-four-ways.ts` syncs the score row so notifications route right (gotcha #191). Growth notifications deep-link to the member's One Page Plan (`?member=&feature=gp_onepage`). New `GROWTH_plan_completed` FYI fires when a member completes every One Page priority (`save-accountability.ts`). GP_STEPS + the new files are the source of truth — treat the phase/file list below as historical.

---

## Where the work lives
- **Phases 1–6 MERGED** (backend #52 → `backend-good-2026-06-17-v484`; frontend #64 → `live-14-growth-plan`) — on `main` in both repos.
- **Phases 7–8 + custom/sub-tasks MERGED + DEPLOYED** (backend #53 → `backend-good-2026-06-17-v490`, 6 new actions + 3 migrations + cron jobid 12; frontend #65 → `live-15-growth-accountability`) — on `main` in both repos.
- **Parking/Dropped UI cleanup** (branch `claude/suspicious-lovelace-b2515f`, frontend-only, dev-only until `npm run deploy`): see the "UI cleanup" subsection below. **Next chat: branch FRESH from main.**

## Files
**Frontend** (`vfo-react/src/components/growth/`)
- `constants.js` — all G1 questions (15, 3 sections), word→number maps (Q2/Q6), Q10 preference, the 20 default actions, category labels, `GP_STEPS`, and score math (`computeScores`, `sectionPercent`, `partnershipAverage` — **partnership avg is rounded** to match the legacy tool).
- `ui.jsx` — shared tokens + atoms (`cardStyle`, `accentStrip`, `pillSolid/Outline/Ghost`, `NumBadge`, `Radios`, `GrowthNeed`, `StepNav`, `GrowthTabs` [pill tab switcher]). **Must be `.jsx`** (contains JSX).
- `AdminGrowthPlan.jsx` — container: loads the plan bundle (`growth_plan_load`), routes the `gp_*` sub-tabs, passes `{ memberNumber, memberName, bundle, reload, onNavigate }` down.
- `GrowthScoring.jsx` (G1), `GrowthActions.jsx` (G2), `GrowthPrioritize.jsx` (G3), `GrowthBuildPlan.jsx` (G4), `GrowthOnePage.jsx` (G5 — also embeds the admin **Add Priorities** Parking/Dropped switcher + inline-editable Owned By / Assisted By).
- `GrowthAddPriority.jsx` — shared **Dropped Priorities / Parking Garage** add surface (member tabs + admin One Page Plan bottom). **`GrowthParking.jsx` was deleted** (its Move-to-Potential / Drop replaced by this surface).

**Admin wiring** — `vfo-react/src/components/admin/MembersPanel.jsx`
- Growth Plan is a `FeatureTabDropdown` (6 items = `GP_STEPS` — the standalone **Parking Garage** entry was removed), rendered **only when `growthPlan` prop is true** (passed by `AdvisorsPanel`, not `AccountantsPanel`), positioned **immediately left of CIQ** (injected in the tab `.map` before the `ciq` key, via `Fragment`).
- Content render: `{growthPlan && memberFeatureTab.startsWith('gp_') && <AdminGrowthPlan member={selectedMember} activeStep={memberFeatureTab} onNavigate={...} />}`.

**Backend** (`vfo-edge-functions/supabase/functions/vfo-admin-api/actions/growth/`)
- `shared.ts` — `resolveMemberNumber(body, auth)` + `getCurrentScoreId` + `getCurrentScore` (id + accountability_mode, for the member access-gate).
- Phase 1–6: `load.ts`, `load-history.ts`, `save-score.ts`, `save-summary.ts`, `save-actions.ts`, `save-accountability.ts`.
- Phase 7–8 (this session): `load-admins.ts`, `load-audit.ts`, `set-accountability.ts`, `add-action.ts`, `delete-action.ts`, `overdue-sweep.ts` (PUBLIC cron), `history.ts` (`logGrowthHistory`), `notify.ts` (`notifyProgressUpdate`). Cron SQL at `supabase/cron/growth-overdue-sweep.sql`.
- Role gates: `save_score`/`save_summary`/`set_accountability`/`load_admins` → `ADMIN_ONLY_ACTIONS`; the rest in-handler (member self-scoped; member writes gated on `accountability_mode`).

## DB schema (live — full dictionary in `docs/tables/growth.md`)
- `growth_plan_scores` — base cols + **Phase 7a:** `accountability_mode` (bool), `assigned_admin_email` / `assigned_admin_name` (text). One `is_current=true` per member; re-scoring archives prior + COPIES its actions verbatim into the new version (gotcha #136).
- `growth_plan_actions` — base cols + **Phase 7b/c:** `due_date` (date), `overdue_notified_at` (ts) + **custom/sub-tasks:** `parent_action_id` (bigint self-FK ON DELETE CASCADE; null=top-level), `is_custom` (bool). `action_number` > 20 for custom rows. UNIQUE(score_id, action_number).
- `growth_plan_partnerships` — id, score_id (FK), name, score, is_na.
- **`growth_plan_history`** (NEW, Phase 8) — FK-free append-only audit log: actor_role / actor_name, event, detail jsonb, created_at.
- All RLS deny-all (edge function uses service-role).

## Backend action contract (live)
- `growth_plan_load { member_number?, score_id? }` → `{ score, actions[], partnerships[] }` (current plan, or a specific archived `score_id`).
- `growth_plan_load_history { member_number? }` → `{ scores[] }` (is_current=false, newest first).
- `growth_plan_save_score {...score fields, raw_answers, partnerships[], actions[] }` → versioned create (archive prior, insert score + Q7 partnerships + 20 seed actions).
- `growth_plan_save_summary { section1/2/3_enabled, composite_score }` → updates current score's checkbox/composite.
- `growth_plan_save_actions { updates:[{id, action_text?, g2_status?, g3_status?, g3_action_type?, g3_notes?, owned_by?, assisted_by?, value_level?, effort_level? }] }` → bulk update current plan's actions (whitelisted + enum-validated).
- `growth_plan_save_accountability { updates:[{id, status}] }` → set accountability_status (member only under accountability; member update → FYI to assigned admin).
- `growth_plan_load_audit { member_number? }` → `{ history[] }` (edit log, newest first). `growth_plan_load_admins {}` → `{ admins:[{name,email}] }` (ADMIN_ONLY; assigned-admin picker — gotcha #137).
- `growth_plan_set_accountability { enabled?, due_dates:[{id, due_date}] }` → accountability_mode + per-action due_date. ADMIN_ONLY.
- `growth_plan_add_action { action_text, parent_action_id?, owned_by?, assisted_by?, value/effort_level?, g3_action_type?, category? }` → custom priority (or sub-task when parent passed). `growth_plan_delete_action { id }` → delete custom only (cascades sub-tasks). Both member-only-under-accountability.
- `automation_GROWTH_overdue_sweep` — PUBLIC service-role daily cron (overdue no-progress → assigned-admin FYI; idempotent via overdue_notified_at).
- NOTE: `save_score` now REQUIRES `assigned_admin_email` (400 if missing) and is ADMIN_ONLY (so is `save_summary`).

## Conventions (MUST follow)
- **Match the Portal design vibe, NOT legacy screenshots** (navy `#002973`, blue `#125ecc`, sky `#0a85e8`, green `#1b9254`, page `#f4f7fd`; rounded white cards + navy→blue accent strips; Inter; TrackKit/StepKit). Legacy screenshots are functional/spec reference only.
- **Any file containing JSX must be `.jsx`** — the rollup production build errors on JSX in `.js` (the esbuild dev server is lenient, so it only shows up at `npx vite build`).
- **Verify before handing back:** `cd <react worktree>; npx vite build` (must end `✓ built in …`). Backend: `deno check --no-lock supabase/functions/vfo-admin-api/index.ts` (must be 0 errors).
- **Member key** = `members.member_number` (text) = `selectedMember.plugin_member_number` in the admin UI.
- **Scoping** is in-handler via `auth.callerRole` / `auth.callerMemberNumber`; clients/specialists are denied by default.
- Reads named `*_load*` retry on timeout (api.js); writes (`*_save_*`) do not — keep that naming.
- Dev server: `npm run dev` in the react worktree, **no `VITE_API_URL`** (hits live Supabase). If you rename a file, **restart** the dev server (Vite caches the old module graph).
- Deploys (`supabase functions deploy`, `npm run deploy`) need **explicit user approval** each time. Run SQL via the Supabase MCP.

## Decisions locked (do not re-litigate)
- ~~Owned By / Assisted By = free-text inputs~~ → **overridden this session**: G4 Build uses a reusable per-plan name combobox (custom dropdown — type a new name or pick an existing one, shared across Owned/Assisted); the One Page Plan add-forms use plain text.
- **No banner** on G5 (portal header + date only).
- Matrix gradient: **darkest top-right** (High Value/High Effort) → lightest bottom-left. Dots must always stand out (white when no status; under accountability each status has its own color — **Not Started = yellow `#f1c40f`, Behind = red `#e74c3c`, Progressing on Plan = light green `#86d6a0`, Ahead = bright green `#16a34a`, Completed = blue** — with a white ring; light dots (yellow / light green) use **dark navy numbers** for legibility, others white). Legend lists "Not set" first.
- **Ongoing items also appear on the matrix** (matrix shows all One-Page items; shared 1…N numbering cross-references both tables).
- Every "proceed" button is at the **bottom**; each linear stage has **← Back + forward** at the bottom (G1 first = no back; G5 last = no forward), and Back/Forward **save** before navigating.
- Assigned-admin list = **`allowed_admins`** (12 people; store the chosen `email` so notification `recipient = email` reaches their bell).

---

## BUILT THIS SESSION (Phases 7–8 + custom/sub-tasks) — all live + user-verified
- **7a foundations** — accountability columns; G1 requires an **Assigned Admin** (`growth_plan_load_admins` picker, NOT superadmin-only `load_admins` — gotcha #137) + every G1 question required (score/N-A; Q10 preference too); access model enforced server-side (`save_score`/`save_summary`/`set_accountability` ADMIN_ONLY; `save_actions`/`save_accountability`/`add_action`/`delete_action` member-only-under-accountability).
- **Re-score keeps the plan** — `save_score` copies prior actions verbatim + remaps `parent_action_id` (gotcha #136).
- **7b Accountability Mode (G5)** — admin toggle (`set_accountability`) → per-priority **Update By** date + progress dropdowns (Not Started / Behind Expectations / Progressing on Plan / Ahead of Expectations / Completed); matrix dots recolor by status; **Completed Action Items** split out of the matrix/tables.
- **7c notifications** — member progress update → FYI to assigned admin (on-time/late); daily cron `automation_GROWTH_overdue_sweep` (jobid 12, 10:00 UTC — gotcha #135) for overdue-no-progress priorities.
- **8 audit log + Growth History** — `growth_plan_history` written by `logGrowthHistory` from every write handler; Growth History tab = activity log (newest-first, Admin/Member chips) + expandable past-plan snapshots. **Member portal** `growthplan` tab live (advisor-gated). *(The original Phase-8 admin Parking Garage "Move to Potential / Drop" and the single member "Add a Priority" tab were reworked — see "UI cleanup" below.)*
- **Custom priorities + sub-tasks** — "+ Create your own priority" (top-level) + per-priority "+ Add sub-task" (typed; own matrix dot; rendered "sub-task of: <parent>", one level deep); `add_action`/`delete_action`; × delete on custom rows.

## UI cleanup (branch `claude/suspicious-lovelace-b2515f`, frontend-only — dev-only until deploy)
Off-plan priority management was reorganized into two symmetric buckets, identical on both the admin One Page Plan (bottom **Add Priorities** switcher) and the member portal (top-level tabs). Tab order: **Parking Garage** left, **Dropped Priorities** right.
- **Three buckets**, derived purely from existing status fields (no schema change): **On Plan** = `g3_status==='one_page_plan'`; **Parked** = `g2_status==='park' || g3_status==='park'`; **Dropped** = off-plan and not parked.
- **Dropped Priorities** tab — off-plan non-parked pool. Per row: **Add to Plan** (opens Owned/Assisted/Value/Effort) or **Park**. Has the **"+ Create your own priority"** button (Dropped only).
- **Parking Garage** tab — parked pool. Per row: **Add to Plan** or **Drop**.
- **Status-transition writes** (all via `growth_plan_save_actions`): Add to Plan → `{ g3_status:'one_page_plan', g2_status:'potential', g3_action_type:'new', owned_by, assisted_by, value_level, effort_level }`; Park → `{ g2_status:'park', g3_status:'park' }`; Drop → `{ g2_status:'drop', g3_status:'' }`. **Add to Plan MUST set `g2_status:'potential'`** or a parked item stays half-parked (gotcha #138).
- Removed the standalone admin **Parking Garage** `GP_STEPS` sub-tab + deleted `GrowthParking.jsx`; a stale persisted `gp_parking` tab key now falls back to `gp_onepage`.
- Removed the admin One Page Plan's old bottom "+ Create your own priority" button (now inside the Dropped Priorities sub-tab); deleted `MemberAddPriority.jsx` (replaced by shared `GrowthAddPriority.jsx`).
- **Accountability status recolor** (see "Conventions" colors above) + **Owned By / Assisted By inline-editable** on the One Page Plan (admin always; member under accountability; saved on blur via `growth_plan_save_actions`).

## DEFERRED (flagged, NOT built — the user's call)
- A member **"remove from plan"** control (move an ON-plan priority back off the plan; Park/Drop only shuffle items between the two OFF-plan buckets).
- Member **editing of existing admin-set value/effort** (Owned By / Assisted By are now editable on the One Page Plan under accountability — **resolved in the UI-cleanup pass**; value/effort of existing rows are still set only on add).
- Reword the overdue/progress **notification copy "due date" → "update by"** to match the relabelled G5 column (backend `notify.ts` + `overdue-sweep.ts`).
- The accountant variant of the whole feature (different question/action copy).

## Test fixture
- **Member 59524** (advisor) was deleted from live 2026-11-04 with its data: use your test-site member. Scoring requires an assigned admin.
- Reset growth data via MCP: `DELETE FROM growth_plan_scores WHERE member_number='<test-site member>';` (cascades to actions + partnerships; `growth_plan_history` is FK-free → delete it separately).

## Verification gates before declaring a phase done
1. `npx vite build` clean (frontend) and/or `deno check --no-lock …/index.ts` = 0 (backend).
2. If you edited `router/dispatch.ts` / `middleware/auth.ts` / shared backend code → run `scripts/smoke-pipelines.ps1` (needs Jake's superadmin token).
3. Hand back a numbered click-through for the user to verify; don't commit/deploy until they confirm + approve.
