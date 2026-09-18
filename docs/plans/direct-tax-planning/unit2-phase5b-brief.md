# UNIT 2 — PHASE 5b BRIEF — step OWNER chips on every tax surface, owner-aware lock tooltips, gate on every Direct row

You are the implementer (Opus). Fable planned this and will review. Frontend only, in `C:\vfo-react\.claude\worktrees\vfo-session-setup-7559c8` (the ONLY path you may edit). Read-only in the edge worktree to confirm the owner list. Do not commit. A dev server is running on this worktree; do not start another. Read `unit2-phase0-brief.md` "Absolute rules".

Read first: `src/components/admin/tax/TaxPrioritiesTab.jsx` — `DIRECT_EDITABLE_TASKS` / `isDirectEditable` / `DIRECT_LOCK_HINT` (~L440-490), `renderTask` (~L3120-3170: the directMode wrapper, then the plannerMode wrapper), `stepGate` + where it is applied (~L3040-3060, `if ((!readOnly || directEditable) && !alreadyDone)`), `LockedIcon` / `lockedHintStyle` (~L564-573), `PLANNER_EDITABLE_TASK_NAMES`; backend `supabase/functions/vfo-admin-api/utils/tax-plan-steps.ts` ~L262-427 (`Step.owner` — the source of truth for who owns each step); `docs/GOTCHAS.md` #339 #262 #263 #459.

## Jake's asks (2026-09-18, after the first Direct click-through)
1. The lock tooltip on **Deposit Paid** says "Handled by the Tax Planning Team" — false; that step is VFO Services' (stamped by the intake / admin). Tooltips must follow the step's owner.
2. In Direct mode the team-owned steps show plain "Not started" while every other row shows the circle-slash prerequisite hint. Run the prerequisite gate on EVERY row so the hints are uniform.
3. A compact **owner marker next to each step name** on all three surfaces (admin, planner, member), Direct or not — one small chip, not a text line; nothing like the earlier full-width hint row.

## Build

### A. One owner map (module scope, beside `DIRECT_EDITABLE_TASKS`)
```js
// Cross-repo contract with utils/tax-plan-steps.ts Step.owner (#339): the backend
// names Tray / Tracy / Admin / PF (all VFO Services), PLANNER (the Tax Planning
// Team) and Client. Match by status_options sentinel first, then exact task name.
const STEP_OWNER = {
  sentinels: {
    tax_deposit_pi: 'vfos', tax_returns_request: 'vfos', tax_planner_select: 'vfos', tax_refund: 'vfos',
    tax_3_decision: 'vfos', tax_generate_presentation: 'vfos', tax_presentation_link: 'vfos',
    enter_details: 'vfos', tax_hlm_confirm: 'vfos', [AMEND_FEE_CODE]: 'vfos', [AMEND_FEE_TAX5_CODE]: 'vfos',
    tax_continue_stop: 'team', tax_implement_decision: 'team', specialist_select: 'team', tax_dd_implementation: 'team',
  },
  names: {
    'Client risk profile complete': 'vfos', 'ROI Presentation': 'vfos',
    'Additional information required': 'team', 'Tax planner review complete': 'team',
    'Detailed tax plan presentation': 'team', 'Client decision 2': 'team',
    'Assess tax planning opportunities (and enter presentation details)': 'team',
  },
}
```
Verify every entry against `tax-plan-steps.ts` owners (PF_OWNER, "Tray", "Tracy / Tray", "Admin" → `vfos`; PLANNER → `team`; "Client" → `client`) and against the actual `program_client_tasks` names in the file (the assess step's stored name — check `shortLabel`). Per-specialist rows (Tax 5a/5b/6 specialist cards) are `team`. The Tax 3 / Tax 5b "AI PC Admin" cascade cards and any `auto` row get NO chip. Report any step you could not classify.

`stepOwner(task)` → `'vfos' | 'team' | 'client' | null`.

### B. The chip
`OwnerChip({ owner, label })` — tiny pill right after the task name, same row, `fontSize 10px`, `padding 1px 7px`, `borderRadius 999px`, `marginLeft 8px`, `verticalAlign middle`, `whiteSpace nowrap`. Colours: **You** = `rgba(18,94,204,0.12)` / `#125ecc`; **Member** = the same blue; **VFOS** = `var(--vfo-tint)` / `var(--vfo-muted)`; **Tax Team** = `rgba(224,103,23,0.12)` / `#e06717`; **Client** = `rgba(27,146,84,0.12)` / `#1b9254`. `title` = the long form ("VFO Services", "Tax Planning Team", "The client", "You run this step").

Label by viewer (`ownerLabel(owner, task, phase)`):
| owner | admin (classic) | admin (Direct plan) | planner | member (classic) | member (Direct) |
|---|---|---|---|---|---|
| vfos | VFOS | **Member** if `isDirectEditable(task, phase)` else VFOS | VFOS | VFOS | **You** if `isDirectEditable(task, phase)` else VFOS |
| team | Tax Team | Tax Team | **You** | Tax Team | Tax Team |
| client | Client | Client | Client | Client | Client |
"Admin (Direct plan)" = `!readOnly && !plannerMode && (livePlan || plan)?.tax_route === 'direct'`.

Render it in the ONE place the task name is printed (find the shared name span in `renderTaskInner` / the generic row; if several renderers print their own name, add the chip in each and list them — every step row on every surface must carry it). Do not add it to phase headers, the hero, or Client Overview.

### C. Owner-aware lock tooltips
Replace `DIRECT_LOCK_HINT` with `lockHintFor(owner)`: `team` → "Handled by the Tax Planning Team", `vfos` → "Handled by VFO Services", `client` → "Completed by the client", null → "Not available on this view". Use it as the `title` on the directMode wrapper. Add the same `title` to the plannerMode wrapper (`vfos` → "Handled by VFO Services", `client` → …) — today it has none.

### D. Gate on every Direct row
Change the gate condition so that in directMode the prerequisite gate runs for EVERY task (`if ((!readOnly || directMode) && !alreadyDone)`), not only the editable ones. A team step whose prerequisites are unmet then shows the same circle-slash hint as any other row; a team step whose prerequisites are met shows whatever it shows today (Not started / its chip) inside the inert wrapper. Classic member view (`readOnly && !directMode`) stays exempt — unchanged.

### E. Ride-along (flagged in phase 5)
`TaxDecisionForm`: on a Direct plan (`plan.tax_route === 'direct'`) hide the 1/3-split option / the share inputs and show one muted line "Direct pricing: 45% member / 45% tax planning group / 10% VFO Services (set automatically)". The server already enforces the preset; this is display only. Report the hunk.

### F. Verify
`npm run build` → exit 0 (paste). List every renderer that prints a task name and confirm the chip is in each. Confirm by reading, for the three surfaces, that Deposit Paid now says "Handled by VFO Services" on hover in Direct mode and shows a **VFOS** chip; that "Tax planner review complete" shows **Tax Team** for a member/admin and **You** for a planner; that "Request Tax Returns" shows **You** for a Direct member, **Member** for an admin on that plan, **VFOS** on a classic plan.

## Report back to Fable with
the STEP_OWNER map with any unclassified steps, the chip + label code, the renderer list, the tooltip hunk, the gate hunk, the TaxDecisionForm hunk, and the build output.
