# UNIT 2 — PHASE 5d BRIEF — Green/Red becomes "Tax Plan Red Light": appears only on a Stop review; Refund (deposit) or Stop tax planning (no deposit); the $250 leg fires on the review Proceed

You are the implementer (Opus). Fable planned, Fable reviews. Read `unit2-phase0-brief.md` "Absolute rules". Edge worktree `C:\vfo-edge-functions\.claude\worktrees\vfo-session-setup-7559c8`, react worktree `C:\vfo-react\.claude\worktrees\vfo-session-setup-7559c8`. Both trees clean (edge HEAD `2c21d4d` + `61362b2`, react HEAD `ae8a7b1`). Phase 5c (this file's predecessor) is LIVE (v869) and is PARTLY SUPERSEDED here — read it so you know what you are replacing. Do not commit/deploy/migrate/write SQL; migrations are FILES. Dev server running; do not start another.

Read first: `utils/tax-review-bell.ts` (whole header, `reviewBellNeedsGreenRed`, `isNoDepositPlan`, `clearTaxReviewBells`, `getGreenRedStatus`), `actions/tax/save-task.ts` (review-complete fire block ~L296-390; the `tax_refund` Proceed block ~L392-430 with the `$250` hook), `actions/tax/deposit-refund.ts` (the whole handler — the Stop twin copies its shape), `actions/tax/ready-for-tax3.ts` ~L250-275, `actions/tax/skip-roi-meeting.ts` ~L135, `actions/tax/revshare-sweep.ts` pass 3 (~L298-324), `actions/tax/allocate-planner.ts` release (~L300-320), `utils/tax-deposit-team-share.ts`, `utils/tax-plan-steps.ts` (closed ladder ~L240-255, `tax_refund` push ~L279), `TaxPrioritiesTab.jsx` Green/Red renderer (~L4105-4260: the refund card, `sendDepositRefund`, `refundReasonDrafts`), `renderTask` gate (~L3174 `noDeposit && tax_refund → null`), `isStepExcluded` (~L2863), `DIRECT_EDITABLE_TASKS` / `DIRECT_ACTION_MAP`, `STEP_OWNER`; `docs/flows/tax-planning.md` Step 0b; `docs/GOTCHAS.md` #365 #403 #293 #438 #356 #324 #490.

## Jake's decisions (2026-09-21, final)
1. The step is renamed **"Tax Plan Red Light"** (display label; the `program_client_tasks` row and its `tax_refund` sentinel are NOT renamed — #293/#382 — only `TASK_DISPLAY_LABELS` / sub-label change).
2. It appears ONLY when "Tax planner review complete" = "Stop tax planning" (and, for history, when it already carries a `Proceed` status or a succeeded refund — then it shows as a done chip exactly as today). On Proceed it is not shown and not counted, on EVERY plan, deposit or not.
3. **Deposit plan + Stop → button "Refund"**: today's card and handler, byte-identical (reason box, refund email preview, Send Refund → `automation_TAX_depositrefund`).
4. **No-deposit plan + Stop → button "Stop tax planning"**: the same card layout, a reason box, a preview of the NEW email below, a "Send" button → new handler `automation_TAX_stopnodeposit` that stops the plan, drafts the email, clears Tray's bell. No money.
5. **The $250 team share fires when the review step is SAVED "Proceed with tax planning"** (option A), not on a Green/Red click any more. The sweep retry re-keys on that. Every other property of the leg (own columns, idempotency key + rotation, probe-before-spend, bell, terminal list, N/A on no-deposit) is unchanged.
6. Tray's review bells: Proceed → the Holistic wording ("Book the ROI meeting, or skip …") on BOTH plan types, cleared by booking/skipping (already true since 5c for no-deposit; now for deposit plans too). Stop → deposit: "Click Refund on the Tax Plan Red Light step for [Client Name]." / no deposit: "Click Stop tax planning on the Tax Plan Red Light step for [Client Name]." — cleared by the refund succeeding / the stop being recorded. Ready-for-tax3's decline override and skip-roi clears stay as they are.
7. Direct: the member can click Refund / Stop tax planning on their own Direct plan (add the new action to the Direct twins). Bells still go to Tray.

## The approved email — new template (migration `supabase/migrations/20260921120000_tax_stop_no_deposit_template.sql`, DATA ONLY)
`pipeline 'TAX'`, `template_name 'TAX_stop_no_deposit'`, `active true`, `send_mode false`, `to_list '["CLIENT"]'`, `cc_list '["MEMBER","ASSIGNED_PF","tnmiller@vfo-services.com","tvaldes@vfo-services.com"]'`, `bcc_list '["aanderson@elitert.com","platham@elitert.com"]'`, subject `VFO Services - Tax Planning Update - [Client Name]`, body (house HTML wrapper copied from 279's markup, NO in-body footer, this exact text):

```
Hi [Client First],

After reviewing the information provided, we will not be moving forward with tax planning at this time for the following reason:
[Stop Reason] No deposit was taken, so there is nothing to refund.

If you have any questions, just let us know.

Thank you for your time.
```
Copy the column shape of 279 (read it with a SELECT first; use `on conflict do nothing` keyed however the sibling migrations key their inserts). Report the SELECT of 279 and the INSERT text.

## Build

### A. Backend — `actions/tax/stop-no-deposit.ts` → `automation_TAX_stopnodeposit` (AUTH, `ADMIN_ONLY_ACTIONS`; `denyIfNotPlannerPlan` like its sibling; NOT on the planner allowlist)
Copy `deposit-refund.ts`'s shape minus Stripe:
1. `tax_plan_id` + REQUIRED `reason` (400 "reason required").
2. Load plan (+ `status`, `deposit_payment_intent_id`, `tax_stop_reason`, `tax_stopped_at`); 400 if the plan HAS a deposit (`deposit_payment_intent_id` set or `!isNoDepositPlan`) — "This plan took a deposit; use Refund."; skip `{ok:true, skipped:true}` if `tax_stopped_at` already set.
3. Write: `status='stopped'`, new columns `tax_stop_reason text`, `tax_stopped_at timestamptz` (migration `20260921110000_tax_stop_no_deposit_columns.sql`, DDL on `client_tax_plans`, no policy change), and write the `tax_refund` progress row `status='Stopped'` (find task by sentinel; insert-or-update; `completed_date` today) so the step reads done.
4. Draft the email: template `TAX_stop_no_deposit` via `resolveTemplateRecipients` with ctx `CLIENT`, `MEMBER`, `ASSIGNED_PF: await resolvePfEmail(...)`, tokens `[Client First]` `[Client Name]` `[Member First]` `[Stop Reason]` (HTML-escaped, newlines → `<br>`), replacer FUNCTIONS (#438), `gmailDraftFetch` keyed on the same `(pipeline, template_name)` (#356), sandbox by the client's TAX config, member contacts as the refund does. Stamp `tax_stop_email_sent boolean` (third new column) on ok. Fail-soft: a mail failure never un-stops the plan.
5. `clearTaxReviewBells(supabase, plan.client_id)` (the Stop bell's instruction is carried out).
6. FYI bell to the PF like the refund's "Deposit refund issued" bell: rule key `TAX_plan_stopped_no_deposit`, dismissible, `taxPfRecipients(client.assigned_pf)`, title `Tax planning stopped — <client> (<ref>)`. Seed the `notification_rules` row in the template migration (copy the refund bell's row shape; area Tax).
Register in dispatch; add `tax_direct_stop_no_deposit` via `directMemberHandler` + `TAX_DIRECT_MEMBER_ACTIONS`. Action count 531 → **533**.

### B. Backend — the $250 trigger moves to the review Proceed (`actions/tax/save-task.ts`)
1. In the review-complete block, when `status === REVIEW_PROCEED` and `priorStatus !== status` and the plan is program 4: call `transferDepositTeamShare` exactly as the `tax_refund` Proceed block does today (same try/catch isolation, same key selection, same terminal skip). Move that code into a small shared function in `utils/tax-deposit-team-share.ts` (`fireDepositTeamShareForPlan(supabase, taxPlanId)`) and call it from here; DELETE the call from the `tax_refund` Proceed block (a Proceed on the old step can only be a history row now, and must not pay twice — the terminal skip already protects, but remove the trigger anyway).
2. `actions/tax/allocate-planner.ts` release: today gated on `getGreenRedStatus === 'Proceed'`; change to `getReviewStepStatus === REVIEW_PROCEED`. Same in `revshare-sweep.ts` pass 3 (`greenRed !== 'Proceed'` → review status). Report both hunks. `Awaiting Planner Allocation` can still occur (review Proceed saved by an admin before a planner exists is impossible — the step needs a planner — but keep the arm).
3. `reviewBellNeedsGreenRed` → DELETE. The Proceed arm's `alreadySatisfied` = `roiSettled` on every plan; the Stop arm's = `plan.deposit_refund_status === 'succeeded' || !!plan.tax_stopped_at` (program 4) / `ready_for_tax3_decision === 'No'` (program 1). Messages per decision 6 (program 4 branches on `isNoDepositPlan`). `ready-for-tax3.ts` and `skip-roi-meeting.ts`: the Proceed clear no longer consults Green/Red on any plan — remove that branch. `deposit-refund.ts` clear unchanged. Update the matrix comment in `tax-review-bell.ts`.

### C. `utils/tax-plan-steps.ts`
- `tax_refund` push: `applicable: reviewStop || p?.status === 'Proceed' || p?.status === 'Stopped' || depositRefunded` where `reviewStop` = the review step's progress status === `REVIEW_STOP` (import the constant); `done: p?.status === 'Proceed' || p?.status === 'Stopped' || depositRefunded`; label stays `t.name`.
- Closed ladder: add `plan.tax_stopped_at` → `"Stopped — tax planning declined"` beside the deposit-refunded arm (before the generic `status==='stopped'` arm).

### D. Frontend — `TaxPrioritiesTab.jsx`
1. Visibility: replace the phase-5c `noDeposit && tax_refund → null` with `redLightVisible = reviewStop || isTaskStatused(task) || depositRefunded` (the review status is already computed as `reviewStop`); hidden otherwise on every surface; `isStepExcluded` excludes it from counts when not visible. `greenRedOk` → simply `true` (nothing gates on it any more; keep the constant name or remove it, but grep every use and report).
2. Display label `TASK_DISPLAY_LABELS[...]` → "Tax Plan Red Light"; sub-label → "Refund the deposit, or stop tax planning, if unable to proceed".
3. Renderer: when visible and not done: deposit plan → today's Refund button + card (unchanged); no-deposit → a red **Stop tax planning** button that opens the SAME card component with: subject line `VFO Services - Tax Planning Update - <client>`, `Hi <client first>,`, the fixed opening sentence, the reason textarea, the fixed closing lines exactly as the template body, Cancel + **Send** (disabled until a reason is typed; `confirm()` before firing) → `act('automation_TAX_stopnodeposit')`. Done state: chip `Stopped` (red, same style as `Refunded $500.00`) with the date. Remove the Proceed button entirely (a history `Proceed` chip still renders for old rows).
4. `DIRECT_EDITABLE_TASKS`: `tax_refund` stays; `DIRECT_ACTION_MAP` gains `automation_TAX_stopnodeposit: 'tax_direct_stop_no_deposit'`. `direct-save-task.ts`'s `tax_refund: ['Proceed']` allowlist entry → REMOVE (no Proceed to save any more; the Stop is written by the handler).
5. The `$250 team share` admin chip moves to render beside the **review step** row (admin only) since that is where it now fires; keep the chip map.
6. Owner chip: unchanged (`vfos`).

### E. Probe — `scripts/probe-tax-intake-refusals.ps1`
Section D: `tax_direct_stop_no_deposit` admin token → 403; member token forged plan → 403; `automation_TAX_stopnodeposit` member token → 403 (ADMIN_ONLY). With `-DirectPlanId`: `tax_direct_stop_no_deposit` with no reason → 400.

### F. Docs (react)
`docs/flows/tax-planning.md` Step 0b rewritten for the Red Light step (both buttons, visibility rule, the $250 trigger now on the review Proceed, the bell matrix); Tax 1 order table row 8 renamed in display; `docs/flows/tax-intake.md` $250 section (trigger = review Proceed); `docs/plans/direct-tax-planning/README.md` §2 decision 27 (supersedes 4's "Green/Red is the single trigger" and 5c's decision 26 second half); `docs/tables/tax.md` the three new columns + template + rule; `docs/tables/documents.md` template row; `docs/tables/notifications.md` rule row.

### G. Verify
`deno check` 0; action count 533; build exit 0; probe parses. Report: every hunk in B (money), the handler text, the SELECT of 279 + both migration texts, the FE visibility predicate + the card markup, the docs touched, and a click-through on plan 207 (no deposit, review currently Stop → the Red Light step is visible with "Stop tax planning"; click → card → reason → Send → plan Stopped, email drafted, Tray bell cleared, PF FYI bell; then set review back to Proceed on a fresh fixture or on 206 → step hidden, Tray bell Holistic wording, team-share chip on the review row reads `N/A — No Deposit`). Also name the ONE live deposit plan you'd use as the deposit control and what must be unchanged on it.
