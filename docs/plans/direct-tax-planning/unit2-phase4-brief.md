# UNIT 2 — PHASE 4 BRIEF — the member's Direct actions (backend)

You are the implementer (Opus). Fable planned this and will review your work. Read `unit2-phase0-brief.md` "Absolute rules" first — they apply verbatim. Edge worktree `C:\vfo-edge-functions\.claude\worktrees\vfo-session-setup-7559c8`. Backend only, plus the repo-root probe script. Phases 0–3 are committed; build on the current tree.

Read first: `docs/architecture/04-auth-and-sessions.md` (gate order), `docs/architecture/03-edge-functions.md` (adding a handler), `docs/flows/tax-planning.md` (Tax 1 order, Step 0b, Step 2, the planner-portal section), `docs/GOTCHAS.md` #490 #455 #142 #257 #467 #385 #256 #167 #487 #303, `constants/role-gates.ts`, `middleware/auth.ts` ~190-257, `router/dispatch.ts` (the tax entries), `actions/tax/save-task.ts` (`PLANNER_EDITABLE_TASK_NAMES`), `actions/tax/pricing.ts`, `utils/client-ownership.ts`.

## Principle (#490)
A member gets self-service through SECOND, NARROWER handlers — never by widening an admin handler's gate. Each new action is a thin wrapper that proves (1) the caller is a member, (2) the plan is the caller's own (`denyIfNotOwnPlan`, session-derived), (3) the plan is `tax_route = 'direct'` — and only then runs the existing handler unchanged. Every existing handler and every existing gate entry stays byte-identical.

## Build

### A. `utils/tax-direct-member.ts`
```ts
export function directMemberHandler(inner: Handler, opts?: { planKey?: string }): Handler
```
- Returns a handler with the SAME call signature dispatch uses for the inner one (read `router/dispatch.ts` — some inner handlers take `(body, supabase, json)`, some `(body, supabase, json, req)`, some with `auth`; the wrapper must always receive `auth` itself, so register it with the full `(c.body, c.supabase, c.json, c.req, c.auth)` shape and forward whichever the inner needs — implement the wrapper as `(body, supabase, json, req, auth) => …` and call `inner(body, supabase, json, req, auth)`; JS ignores extra args, so a 3-arg inner is unaffected. Verify each inner's declared parameter ORDER matches that positional shape before registering it; if any inner uses a different order, adapt at the registration site and report it).
- Checks, in order: `auth.callerRole !== "member"` → 403 `"Members only"`; `denyIfNotOwnPlan(supabase, body[planKey ?? "tax_plan_id"], auth, json)`; then read `client_tax_plans.tax_route` for that plan → 403 `"This case is not run by you"` unless `'direct'`. Only then `return inner(...)`.
- Export `isDirectPlan(supabase, planId)` for the pricing preset below.

### B. Registrations in `router/dispatch.ts` (AUTH_HANDLERS) — 14 new names, each wrapping the named inner
| new action | inner |
|---|---|
| `tax_direct_request_returns` | `automation_TAX_request_returns` |
| `tax_direct_returns_already_have` | `automation_TAX_returns_already_have` |
| `tax_direct_deposit_refund` | `automation_TAX_depositrefund` |
| `tax_direct_readyfortax3` | `automation_TAX_readyfortax3` |
| `tax_direct_skiproimeeting` | `automation_TAX_skiproimeeting` |
| `tax_direct_generate_presentation` | `tax_generate_presentation` |
| `tax_direct_presentation_downloaded` | `tax_presentation_downloaded` |
| `tax_direct_presentation_schedule` | `automation_TAX_presentation_schedule` |
| `tax_direct_decision` | `automation_TAX_decision` |
| `tax_direct_pricing` | `automation_TAX_pricing` |
| `tax_direct_extrameeting` | `automation_TAX_extrameeting` |
| `tax_direct_highlevelmeeting_confirm` | `automation_TAX_highlevelmeeting_confirm` |
| `tax_direct_amend_fee` | `automation_TAX_amend_fee` |
| `tax_direct_save_task` | the NARROW twin in D, wrapped the same way |

For EVERY inner: grep it for `callerRole`, `isSuperadmin`, `isTaxAdmin`, `auth.` and `denyIfNotPlanner*` and report what a member caller hits. `denyIfNotPlannerPlan` returns null for a non-planner (expected). Anything that would 403 or misbehave for a member must be reported, not patched — Fable decides.

Action count expectation: **514 → 528**.

### C. Gate list — `constants/role-gates.ts` + `middleware/auth.ts`
- New `export const TAX_DIRECT_MEMBER_ACTIONS = [ …the 14 names… ]` with a comment dated 2026-09-18 naming this brief: members only, confined in-handler by `directMemberHandler`.
- In `middleware/auth.ts`, beside the ADMIN_ONLY member gate (~242): `if (TAX_DIRECT_MEMBER_ACTIONS.includes(action) && callerRole !== "member") return 403 "Forbidden — member access only"`. This makes the list a NAMED fence for admins and planners (planners already 403 via their allowlist; admins use the real actions). Do NOT add these names to `MEMBER_SCOPED_ACTIONS` (they key on `tax_plan_id`, not `member_number` — #455; the wrapper is the guard) and NOT to any `TAB_ACTIONS` key (#495).

### D. The narrow save-task twin — `actions/tax/direct-save-task.ts`
Copy the SHAPE of `actions/msm/member-save-task.ts` (the 2026-09-12 precedent, #490). Body: `tax_plan_id`, `task_id`, `status`, optional `completed_date`. Rules, each a 400 unless stated:
1. `tax_specialist_id` present → 400 (per-specialist rows belong to the planning team).
2. The task (by `task_id`, from `program_client_tasks`) must be in the DIRECT allowlist, matched by sentinel first then exact name: sentinel `tax_refund` (Green/Red — status must be EXACTLY `'Proceed'`; a Refund goes through `tax_direct_deposit_refund`), sentinel `enter_details` (the Tax 3 decision follow-up save), sentinels `tax_amend_fee` + `tax_amend_fee_tax5` (the amend follow-up saves), names `"Client risk profile complete"` and `"ROI Presentation"`. Export the list as `DIRECT_MEMBER_EDITABLE` beside `PLANNER_EDITABLE_TASK_NAMES` so the FE mirror (phase 5) has one source — note the cross-repo contract in a comment.
3. `status` must be one of the task's own `status_options` (split on `|`), or `'Proceed'` for `tax_refund`; never `Stopped` / `N/A` — refused as INPUT and as the EXISTING progress value (#490).
4. Then call the real `tax_save_task` handler function with the same body (so the Proceed → `$250` team-share hook, the review bells and the clear sites fire exactly as for an admin). Do not reimplement the write.
Register as `tax_direct_save_task` through `directMemberHandler`.

### E. Pricing preset 45/45/10 (decision 10) — `actions/tax/pricing.ts`
Read how `automation_TAX_pricing` derives `member_share` / `tax_planner_share` / `vfos_share` (and the strategic leg) from `form_data`. When `isDirectPlan` → ignore the submitted shares and set member 45% / tax planning group 45% / VFOS 10% of the total fee (whole cents, VFOS takes the rounding residual so the three sum exactly — #394/#465), strategic leg untouched. Applies whoever calls it (admin or member). Report the exact lines and a worked example on a $20,000 fee. If the split is set somewhere OTHER than pricing.ts (e.g. `decision.ts` on Yes), say so and put the preset at the real writer.

### F. Probe — `scripts/probe-tax-intake-refusals.ps1`
New section D "Direct member actions": admin token on `tax_direct_save_task` → 403; member token with a FORGED foreign plan id (`$ForeignPlanId`) on `tax_direct_save_task` and `tax_direct_request_returns` → 403; member token on `$OwnPlanId` (classic plan, when supplied) → 403 "not run by you"; new optional `$DirectPlanId` (default 0 → Skip) → `tax_direct_save_task` with `tax_specialist_id` set → 400, with status `Stopped` → 400, with a non-allowlisted task → 400. Keep the existing Check/Skip shape.

### G. Verify
`deno check --no-lock …` → 0; action count → 528 (paste the command output); the per-inner audit table from B.

## Report back to Fable with
files changed, the wrapper text, the dispatch hunk, the gate-list + auth.ts hunks, the per-inner member-caller audit table, the save-task twin's allowlist and refusal list, the pricing preset hunk + worked example, the probe lines, and the gate results verbatim. Also list, for phase 5, every action the FE must remap in `directMode` and which of them need the 60 s timeout tier in `src/lib/api.js` (`timeoutFor()` is keyed on the `automation_*` name prefix — #487 — so `tax_direct_generate_presentation` / `_decision` / `_pricing` etc. would silently drop to 20 s unless the FE rule learns the `tax_direct_` prefix).
