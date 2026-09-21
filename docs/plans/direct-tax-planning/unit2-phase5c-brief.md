# UNIT 2 — PHASE 5c BRIEF — no-deposit plans skip the Green/Red step (Holistic-style review bells)

You are the implementer (Opus). Fable planned, Fable reviews. Read `unit2-phase0-brief.md` "Absolute rules". Edge worktree `C:\vfo-edge-functions\.claude\worktrees\vfo-session-setup-7559c8`, react worktree `C:\vfo-react\.claude\worktrees\vfo-session-setup-7559c8`. Both trees have ONE uncommitted react change (owner-chip labels made identical across viewers in `TaxPrioritiesTab.jsx`) — build on it. Do not commit/deploy/migrate. Dev server is running; do not start another.

Read first: `utils/tax-review-bell.ts` (the whole header comment: title prefixes, the clearing matrix, `GREEN_RED_SENTINEL`, `getGreenRedStatus`, `stepStatusByTaskMatch`), `actions/tax/save-task.ts` ~L296-430 (the review-complete fire block and the Green/Red clear block), `actions/tax/ready-for-tax3.ts` ~L250-275, `utils/tax-plan-steps.ts` ~L176-300, `utils/tax-intake-finalize.ts` (the Deposit Paid row write, `N/A — No Deposit`), `TaxPrioritiesTab.jsx` ~L2715-2800 (`isTaskStatused` for `tax_refund`, `prereqDone`, `greenRedOk`, `reviewStop`), ~L2915-2925 (the task filter), ~L2960-2995 (`stepGate` for `tax_3_decision` and the Tax 2 gates), ~L4105-4120 (the Green/Red renderer's waived branch), the hero count (`heroDoneTasks` / `heroTotalTasks`); `docs/flows/tax-planning.md` Step 0b + "Tax planner review complete"; `docs/GOTCHAS.md` #339 #365 #403 #293.

## Decision (Jake, 2026-09-21, final)
A program-4 plan that took NO deposit (a waived intake) does not need the Green/Red Light step: there is nothing to refund and nothing to forward. On such a plan the step is not shown and not counted, and the "Tax planner review complete" bells behave EXACTLY as they do on Holistic (program 1), which has no Green/Red step either. **A plan that took a deposit changes in no way whatsoever** — not one byte of behaviour, wording, clear site or money movement.

## The one predicate
`noDeposit` = the plan's Deposit Paid progress row (task with `status_options = 'tax_deposit_pi'`) has `status === 'N/A — No Deposit'`. NOT "PaymentIntent is null" — a hand-created plan awaiting an admin paste still owes the deposit and keeps the step.

## Build

### A. Backend helper — `utils/tax-review-bell.ts`
- `export const DEPOSIT_NA_STATUS = "N/A — No Deposit"` (grep for an existing constant for this string in finalize / team-share and REUSE it if one exists — one definition).
- `export async function isNoDepositPlan(supabase, taxPlanId): Promise<boolean>` — `stepStatusByTaskMatch(supabase, taxPlanId, "status_options", "tax_deposit_pi") === DEPOSIT_NA_STATUS`. Errors read as `false` (keep the step; fail toward the existing behaviour).
- `export async function reviewBellNeedsGreenRed(supabase, plan): Promise<boolean>` — `(plan.program_id || 1) === 4 && !(await isNoDepositPlan(supabase, plan.id))`. This single function decides "program-4-with-deposit" everywhere below.
- Update the header comment's clearing matrix: the two program-4 rows become "program 4 WITH a deposit", and add two rows "program 4, no deposit (waived intake) → same as program 1" for Proceed and Stop.

### B. `actions/tax/save-task.ts` review-complete fire block (~L296-390)
Replace every `programId === 4` decision in that block with `const needsGreenRed = await reviewBellNeedsGreenRed(supabase, plan)`:
- `alreadySatisfied`: `proceed ? (needsGreenRed ? roiSettled && greenRed === "Proceed" : roiSettled) : (needsGreenRed ? plan.deposit_refund_status === "succeeded" : plan.ready_for_tax3_decision === "No")`.
- `message`: `needsGreenRed ? <the existing program-4 strings> : <the existing program-1 strings>` — reuse the literal strings already in the file, do not reword.
- The `link` keeps `program=${programId}` (it is a URL, not a behaviour).
The Green/Red clear block (~L392-430) needs no change — it can only run on a Proceed save, which never happens on a no-deposit plan. Say so in the report.

### C. `actions/tax/ready-for-tax3.ts` (~L256-264)
`if ((plan.program_id || 1) === 4)` → `if (await reviewBellNeedsGreenRed(supabase, plan))`. The `declined` branch is already unconditional.

### D. `utils/tax-plan-steps.ts` (~L279)
The `tax_refund` step gets `applicable: !noDeposit` where `noDeposit` is derived from the plan's Deposit Paid progress row already in `ctx` (the same `p` lookup the `tax_deposit_pi` branch uses two lines above — read it once, reuse). `computeTrack` / `taxPlanStepsComplete` already drop `applicable === false` steps. Do not touch the closed ladder.

### E. `utils/tax-intake-finalize.ts`
On a WAIVED intake (`deposit_required === false`), the plan insert also sets `deposit_team_share_status: DEPOSIT_NA_STATUS` (import the shared constant from wherever it lives — `utils/tax-deposit-team-share.ts` likely exports the terminal list; use its constant). Money-side effect: none — every trigger already skips a terminal value. On the resume arm (plan already exists) nothing.

### F. Frontend — `TaxPrioritiesTab.jsx`
1. `const noDeposit = isTaxProgram && (() => { const dt = findStepTask('tax_deposit_pi', 'Deposit Paid'); return !!dt && localProgress[dt.id]?.status === 'N/A — No Deposit' })()` beside `depositOk` (~L2769). Reuse the existing waived test at ~L4111-4116 rather than a second copy — hoist one helper.
2. Task list: wherever the phase's tasks are filtered for rendering AND for the hero counts (~L2919 `filter(t => t.status_options !== 'auto')` and whatever feeds `heroTotalTasks`), also drop `t.status_options === 'tax_refund'` when `noDeposit`. Confirm by reading that the hero total drops by one on plan 207 (currently "2 / 20").
3. `greenRedOk = !isTaxProgram || noDeposit || prereqDone('tax_refund', null)`.
4. The `tax_3_decision` gate (~L2970): `locked: !((diagnosticChain && greenRedOk) || ((!isTaxProgram || noDeposit) && reviewStop))` and its hint must never mention Green/Red on a no-deposit plan (pick the Holistic hint branch).
5. `isTaskStatused` for `tax_refund` (~L2719) unchanged. The Green/Red renderer (~L4105) unchanged (it simply never renders).
6. Anything else that counts or lists Tax 1 tasks (phase "In progress · 1/6" pill, `computeTrack`-style client overview mirrors in the FE, `TASK_DISPLAY_LABELS`) — grep `tax_refund` and report each site with what you did.

### G. One-off data (report the SQL, Fable runs it)
`update client_tax_plans set deposit_team_share_status = 'N/A — No Deposit' where id in (206, 207) and deposit_payment_intent_id is null and deposit_team_share_status is null;` — the two waived test plans.

### H. Docs (react worktree)
- `docs/flows/tax-planning.md` Step 0b: a paragraph "No-deposit plans (waived intake, 2026-09-21)": step not applicable, hidden on every surface, bells behave as program 1; the Tax 1 order table gets a footnote on row 8.
- `docs/flows/tax-intake.md` "The deposit and the waiver": one sentence pointing at it; the $250 section: the leg is stamped `N/A — No Deposit` at creation on a waived intake.
- `docs/plans/direct-tax-planning/README.md` §2: decision 26 (one row, dated 09-21, the two sentences above).

### I. Verify
`deno check --no-lock` → 0; action count unchanged at 531; `npm run build` exit 0. Report: the helper text, every `programId === 4` site you changed (and the ones you left, with why), the FE sites from F.6, the finalize hunk, the SQL, and a 6-step click-through on plan 207 for Jake (Green/Red absent; hero total 19; review Proceed → Tray bell text is the Holistic wording; book the ROI meeting → bell cleared; Client Overview row has no Green/Red step; a deposit plan — e.g. any live plan with a PaymentIntent — still shows the step unchanged).
