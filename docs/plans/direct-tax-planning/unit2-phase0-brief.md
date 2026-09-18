# UNIT 2 — PHASE 0 BRIEF — feature gate for the tax intake + Direct route

You are the implementer (Opus). Fable planned this and will review your work. Jake tests by hand. Read this whole file before touching anything.

## Absolute rules
- EDIT ONLY inside these two worktrees. Never touch `C:\vfo-react\src`, `C:\vfo-react\docs` or `C:\vfo-edge-functions\supabase` directly.
  - edge: `C:\vfo-edge-functions\.claude\worktrees\vfo-session-setup-7559c8`
  - react: `C:\vfo-react\.claude\worktrees\vfo-session-setup-7559c8`
- Branch is `claude/vfo-session-setup-7559c8` in both. Do not create branches. Do not commit, push, merge, deploy or apply migrations to the live DB. `execute_sql` for READS only. Migrations are FILES in `supabase/migrations/` — Fable applies them after review.
- Never touch `boldsign-webhook`, never touch the `pipeRow` null-check in `router/webhooks.ts`, never convert an HTTP chain call to an in-process call, never add retries to write actions in `src/lib/api.js`.
- Read first: `docs/flows/tax-intake.md` (whole file), `docs/plans/direct-tax-planning/README.md` §1–§3, `docs/architecture/04-auth-and-sessions.md` (gate order), `docs/GOTCHAS.md` #141 #142 #196 #223 #455 #490 #511.
- Security invariants: the new table = `enable row level security` + `create policy "Deny all access" on public.<t> for all to public using (false)` in the SAME migration.
- No code comments unless the WHY is non-obvious. Match neighbouring code style.

## Goal (Jake, 2026-09-18)
The member-facing tax intake shipped in unit 1 (Tax Planning tab always visible, "+ Add new tax client", the 37-question form, the $500 deposit, the client link, the Holistic form email) must NOT be live to real members until Jake flips it. Only Test Member 59524 may see/use it now. The flip must be a one-line SQL update with no deploy. The same mechanism will gate the Direct route in later phases.

## Build

### 1. Migration `supabase/migrations/20260918200000_portal_feature_flags.sql`
```sql
create table public.portal_feature_flags (
  key text primary key,
  enabled_for_all boolean not null default false,
  member_numbers text[] not null default '{}',
  note text,
  updated_at timestamptz not null default now()
);
alter table public.portal_feature_flags enable row level security;
create policy "Deny all access" on public.portal_feature_flags for all to public using (false);
insert into public.portal_feature_flags (key, enabled_for_all, member_numbers, note) values
  ('tax_intake', false, '{59524}', 'Member-run tax intake (unit 1): tab, Add button, form, deposit, client link, Holistic email. Flip enabled_for_all=true to release.'),
  ('tax_direct', false, '{59524}', 'DIRECT tax route (unit 2). Flip enabled_for_all=true to release.');
```

### 2. Helper `utils/feature-flags.ts` (edge)
`export async function featureEnabledForMember(sb, key: string, memberNumber: string | null | undefined): Promise<boolean>` — selects the row by key; true when `enabled_for_all` OR the trimmed member number is in `member_numbers`. **Fail CLOSED**: missing row, error, thrown → `false` (log once via console.warn). Never throws. Also `export const FEATURE_TAX_INTAKE = "tax_intake"`, `FEATURE_TAX_DIRECT = "tax_direct"`.

### 3. Backend enforcement (403 `{ error: "This feature is not available for your account yet." }`)
- `actions/tax/intake-eligibility.ts`: compute `intake_enabled` for the resolved member number and return it in the payload (`intake_enabled: boolean`, plus `direct_enabled: boolean` from the `tax_direct` flag — unused by the FE this phase). Do NOT 403 here; it is a read the form uses to decide what to show.
- `actions/tax/intake-submit.ts`, `intake-send-link.ts`, `intake-holistic-submit.ts`: after the existing role/ownership checks and BEFORE any write or Stripe call, 403 when `!featureEnabledForMember(sb, FEATURE_TAX_INTAKE, memberNumber)`. Use the same member number the handler already resolved (session for a member, body for an admin acting on behalf).
- `actions/tax/intake-link-load.ts` and `intake-link-submit.ts` (PUBLIC): after the token row is found, gate on `intake.member_number`. link-load → 404 "This link is not valid." (do not leak the reason on a public page); link-submit → 403 with the message above.
- `utils/tax-intake-request-email.ts draftTaxIntakeRequestEmail`: after the client row read (it already selects `member_number`), return `{ drafted:false, reason:"feature off" }` when the flag is off for `client.member_number`. Do NOT stamp `tax_intake_requested_at` in that case, so the email goes out later when the flag flips and the next MAP 1 payment… no — the trigger is payment 1 only, which will not recur. Accept: a Holistic client whose first payment lands while the flag is off never gets the email automatically (record this in your report; Fable will note it in the docs).
- `actions/msm/load-enabled-programs.ts` (`msm_load_enabled_programs`): add `features: { tax_intake: boolean, tax_direct: boolean }` to the response for `body.member_number`. Check how this action is gated (grep role-gates) and report it; it must at minimum be MEMBER_SCOPED so a member cannot read another member's flags — if it is in no list, ADD it to `MEMBER_SCOPED_ACTIONS` and report that as a security ride-along.

### 4. Frontend
- `src/pages/MemberPortal.jsx` ~99-108: replace the `ALWAYS_VISIBLE_PROGRAM` rule with: VFO Tax Planning is visible when `enabledPrograms` has a program-4 row (the pre-unit-1 rule) OR `features.tax_intake` is true. Read `features` off the same `msm_load_enabled_programs` response (store it in state beside `enabledPrograms`).
- `src/components/member/MemberMSMTracking.jsx` ~240-241 (MSM Home list), ~290-291 (program tab), ~304-312 (enrollment-less render) and ~827-832 (the Add button): same rule — the tax program bypass and the enrollment-less Clients view apply only when `features.tax_intake`; the "+ Add new tax client" button renders only when `features.tax_intake`. A member with a program-4 enrollment but the flag off sees exactly what they saw before unit 1: the tab and their client list, no Add button.
- The `?intake_client=` / `?intake=&paid=1` deep links (~735-762) must not open the form when the flag is off (fall through to the normal list).
- `TaxIntakeForm.jsx`: if `eligibility.intake_enabled === false` render a short "not available for your account yet" card instead of the form (belt and braces — the button is already hidden).
- Do NOT change gating for any other program.

### 5. Verify
- `C:\Users\jakel_fjetgbx\.deno\bin\deno.exe check --no-lock supabase/functions/vfo-admin-api/index.ts` → 0 errors.
- Action-count parity (commands in `docs/SESSION_REFERENCE.md` DERIVE block): expect **514** unchanged (no new action).
- `npm run build` in the react worktree → exit 0.
- Grep proof: every handler that writes an intake row or mints a Checkout carries the flag check; list file:line for each.

## Report back to Fable with
files changed (both repos), the migration text, the gate-list change if any, the exact `msm_load_enabled_programs` gate finding, the Holistic-off consequence, the three gate results verbatim, and a numbered click-through for Jake (59524 sees tab + button; a non-flagged member with a program-4 enrollment sees tab, no button; a non-flagged member without enrollment sees no tab).
