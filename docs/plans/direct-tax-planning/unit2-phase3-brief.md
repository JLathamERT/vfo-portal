# UNIT 2 — PHASE 3 BRIEF — the Direct choice on the intake

You are the implementer (Opus). Fable planned this and will review your work. Read `unit2-phase0-brief.md` "Absolute rules" first — they apply verbatim. Edge worktree `C:\vfo-edge-functions\.claude\worktrees\vfo-session-setup-7559c8`, react worktree `C:\vfo-react\.claude\worktrees\vfo-session-setup-7559c8`. Phases 0–2 are committed on this branch; build on the current tree.

Read first: `docs/plans/direct-tax-planning/README.md` §2 decisions 1, 2, 3, 6, 7, 8, 10; `docs/flows/tax-intake.md`; `utils/tax-direct-eligibility.ts`; `utils/tax-intake-finalize.ts` (now resumable — `finalizeBody`, the `stampIntake` helper); `utils/feature-flags.ts`; `docs/GOTCHAS.md` #438 #455 #448.

## What this phase is
A member with two qualifying clients may choose to run a new tax client themselves ("Direct"). This phase records that choice; the member's powers arrive in phases 4–5. Nothing here moves money.

## Rules (Jake's decisions, final)
- Direct is an OPTION, never forced. Default is Classic.
- Eligibility = `qualifyingTaxClients(member).count >= 2` (the same helper and threshold as the deposit waiver) AND the `tax_direct` feature flag on for that member. Computed, never stored, never admin-overridable.
- The choice is offered at step 1 on route A (member fills) and route B (member sends the link); the member decides at send time. Holistic is never Direct.
- On a Direct case the member IS the PF: `clients.assigned_pf` = the member's display name, `clients.pf_member_number` = the member number (phase 2's discriminator), `client_tax_plans.tax_route = 'direct'`. Classic leaves all three as today (NULL / NULL / NULL).
- No email template changes this phase (the confirmation stays as is; Jake approves email copy separately).

## Build

### A. Migration `supabase/migrations/20260918220000_tax_intake_direct_route.sql`
`alter table public.tax_intake_requests add column if not exists tax_route text;` + `comment on column` (NULL = classic, 'direct' = the member runs the case; copied to client_tax_plans.tax_route by finalize). No policy change.

### B. `utils/tax-direct-eligibility.ts`
Add `export const TAX_DIRECT_MIN_CLIENTS = TAX_DEPOSIT_WAIVER_MIN_CLIENTS;` and `export function directEligibleFor(count: number): boolean`. One place for the threshold.

### C. `actions/tax/intake-eligibility.ts`
Add `direct_eligible: directEligibleFor(count) && directEnabled` (keep `direct_enabled` and `qualifying_count` in the payload — the form needs the count for its wording).

### D. Route A + B capture (`intake-submit.ts`, `intake-send-link.ts`)
- Read `body.tax_route`; accept only `undefined | null | "" | "direct"`, anything else → 400 `"tax_route invalid"`.
- When `"direct"`: recompute `qualifyingTaxClients` + the `tax_direct` flag server-side; if not eligible → 400 `"Direct is not available for your account yet."` Never trust the body's opinion of eligibility.
- Store `tax_route` on the inserted row (and on the REUSED invitation row in send-link — that path refreshes the row; refresh `tax_route` too so a member who changes their mind on a re-send wins).
- `intake-link-submit.ts` and `intake-holistic-submit.ts`: no route input; the link row already carries it, Holistic writes nothing.

### E. `utils/tax-intake-finalize.ts`
Inside `finalizeBody`, in the CLIENT insert arm only (the resume arm reuses what the first run wrote): when `intake.tax_route === "direct"`, add `assigned_pf` = `\`${member.first_name} ${member.last_name}\`.trim()` (fallback `\`Member ${memberNumber}\``) and `pf_member_number = memberNumber`. You will need the member's name — check what `finalizeBody`/`draftConfirmationEmail` already select from `members` and reuse that read (one query, hoisted) rather than adding a second. In the PLAN insert arm add `tax_route: intake.tax_route === "direct" ? "direct" : null`. Waived + direct must work (no PI, still direct).

### F. Frontend — `src/components/member/TaxIntakeForm.jsx`
- Step 1 (the chooser) gains a second block when `eligibility?.direct_eligible`: a radio pair, default Classic:
  - **VFO Services runs this case** — "Our tax planning team and your VFO team run every step; you follow along."
  - **I run this case (Direct)** — "You run the steps our VFO team normally runs; the tax planning team's steps stay with them. You act as the Planning Facilitator for this client."
  Below it, one muted line: `Direct is available because you have N qualifying tax clients.`
- When intake is on but `direct_eligible` is false and `direct_enabled` is true: a muted line under the deposit line: `Direct (run the case yourself) becomes available once you have 2 qualifying tax clients — you have N.` When `direct_enabled` is false: show nothing about Direct at all.
- Pass `tax_route: 'direct'` (or omit) on both the route-A submit and the route-B send-link calls. Holistic mode never shows the block.
- Match the existing chooser's visual style exactly (copy the card/radio markup already on step 1).

### G. Admin + member visibility of the route
1. `actions/tax/load-plans.ts`: confirm `tax_route` is in the payload (widen the select if explicit — #448). 
2. `src/components/admin/tax/TaxPrioritiesTab.jsx`: in `TrackHero` (the plan header all three surfaces share) render a small pill **Direct** (same pill style as the existing hero chips) when `plan.tax_route === 'direct'`; also on the plan list cards when more than one plan is listed.
3. `actions/members/*` — the admin Member Profile: find the loader behind the admin member profile DETAILS tab (`member_profile_load`) and add `direct_eligibility: { qualifying_count, eligible }` (eligible = count >= 2 && flag). Render one line on the Details tab, below Bio, above the Additional Contacts card: `Direct tax planning: eligible (N qualifying clients)` / `not yet eligible (N of 2 qualifying clients)` / when the flag is off for that member append ` — feature not released`. Read-only, no control.
4. Client Overview tax rows (`actions/clients/overview-tax.ts` + `ClientOverviewPanel.jsx`): if the track object already carries a label/badge slot, add `Direct`; if it would need a new column, SKIP and report it.

### H. Probe — `scripts/probe-tax-intake-refusals.ps1`
Add in section A: `Check "member: tax_intake_submit tax_route=direct while ineligible" 400 (...)` using the member token with a minimal valid-shape body plus `tax_route = "direct"` — 59524 has 0 qualifying clients so 400 is the expected answer (it must fire BEFORE validation of the 37 answers, or send valid test answers; state which). And `Check "member: tax_intake_submit tax_route=bogus" 400`.

### I. Verify
- `deno check --no-lock …` → 0; action count unchanged at 514; `npm run build` exit 0.
- Report the finalize hunk verbatim and the member-name query you reused.

## Report back to Fable with
files changed (both repos), the migration text, the finalize hunk, the eligibility payload shape, the exact 400 messages and where they sit relative to answer validation, the Member Profile loader finding, the overview finding (done or skipped), the probe lines added, the three gate results verbatim, and a numbered click-through for Jake on 59524 (needs two qualifying fixture plans inserted by SQL — write the INSERT/DELETE pair Fable will run, copied from the unit-1 test matrix's fixture shape: `client_tax_plans` rows on client 62 with `retainer_status='succeeded'`, `post_review_client_decision='Proceed'`, `post_review_decision='Undecided'`, plus a second client).
