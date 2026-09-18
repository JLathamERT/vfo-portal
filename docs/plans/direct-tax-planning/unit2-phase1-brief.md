# UNIT 2 — PHASE 1 BRIEF — deposit finalize hardening + two intake ride-alongs

You are the implementer (Opus). Fable planned this and will review your work. Read `unit2-phase0-brief.md` "Absolute rules" first — they apply verbatim (worktrees, no commit/push/deploy/migrate, read-only SQL). Edge worktree: `C:\vfo-edge-functions\.claude\worktrees\vfo-session-setup-7559c8`. Backend only; no react change.

Read first: `docs/flows/tax-intake.md` (webhook + finalize sections), `docs/architecture/07-server-chains.md` (webhook + sweep), `docs/GOTCHAS.md` #327 #470 #489 #228 #187 #427 #507 #282.

## Problem (Fable post-ship review, 2026-09-18)
`router/webhooks.ts` ~748-792: on `checkout.session.completed` with `payment_kind=tax_intake_deposit` the row is stamped `paid` and `finalizeTaxIntake` runs. If finalize returns `ok:false` or throws, the row sits at `paid` forever: the webhook skips `paid` rows on redelivery, nothing bells, nothing sweeps. Worse, `utils/tax-intake-finalize.ts` inserts the client (~299-316) and the plan (~328-341) and only stamps `client_id`/`tax_plan_id`/`created_client_at` at the end (~376-385), so a naive re-run after a mid-way failure would mint a SECOND client. `nextClientRef` (~298) and the raw awaits at ~356-384 are outside any try/catch.

## Build

### A. Make finalize resumable (`utils/tax-intake-finalize.ts`)
1. Immediately after the `clients` insert succeeds, `update tax_intake_requests set client_id = <id> where id = intake.id`. Immediately after the `client_tax_plans` insert succeeds, stamp `tax_plan_id` the same way. Treat a failed stamp as fatal for THIS run (return `ok:false` with the error) — a stamp that failed means the next run cannot be trusted either, but the ids are logged.
2. At the top, after the existing `created_client_at && client_id` latch: if `intake.client_id` is set, SKIP the enrollment/client insert and re-read that client row (need `id`, `client_ref`, `enrollment_id`, name fields the later steps use); if `intake.tax_plan_id` is set, skip the plan insert and re-read the plan. Every later step (Deposit Paid row, latch update, docs, email) already carries its own idempotency (`insert-or-update` on the progress row, `deposit_docs_at`, `confirmation_email_sent_at`) — verify each by reading the code and say so in the report.
3. The `client_enrollments` junction insert (~318-326) is currently log-only on failure; keep that, but on a resumed run re-check and insert if missing (select by client_id + enrollment_id first).
4. Wrap the whole body after the latch in try/catch so a throw returns `{ ok:false, error }` instead of escaping. The three callers (webhook, `intake-submit.ts` waived branch, `intake-link-submit.ts` waived branch) must keep behaving as they do on `ok:false`.
5. Re-read the intake row fresh at the start (by id) rather than trusting the caller's copy, per #427, and use the fresh row for the latches.

### B. Webhook branch (`router/webhooks.ts` ~772)
- Change the skip to `intake.status === "completed"` only. A `paid` row re-runs finalize (now idempotent). Keep the `pending` → `paid` stamp `existing || now` unchanged.
- On `!res.ok` OR a caught throw: `notifyJakeFailure` with `ruleKey: "FAILURE_tax_intake_finalize"`, `pipeline: "TAX"`, `client_id: intake.client_id ?? null`, `title: \`Tax intake finalize FAILED — intake ${intake.id}\``, message with the error + "The nightly tax sweep will retry.", `link: "/admin?tab=automation"` (check what link the sibling `FAILURE_tax_deposit_docs` uses in `utils/tax-deposit-docs.ts` ~252-261 and copy its shape), `actionRequired: true`. On a later success (webhook or sweep) call `clearJakeFailure` with the exact same title.
- Do NOT seed a `notification_rules` row (a missing row falls back to Jake by code default — document this in the report; Fable decides whether to seed).

### C. Sweep pass 4 (`actions/tax/revshare-sweep.ts`, after pass 3 ~298-324)
Copy the pass-3 block shape: bare block, local `intakeFinalizeRetried: Array<any>`, one query `tax_intake_requests` where `status = 'paid'` and `paid_at < now() - interval '10 minutes'` (compute the ISO cutoff in JS), per-row try/catch, call `finalizeTaxIntake(supabase, row)`, push `{ intake_id, ok, error }`, clear the bell on ok, and add `intake_finalize_retried` to the return object (~1249). Import the finalize util.

### D. Ride-along 1 — route-B client cancels at Stripe (`actions/tax/intake-link-submit.ts`)
Today a client who reaches Checkout and clicks back leaves the row `pending`, and every resubmit 409s until `checkout.session.expired` (~24 h). Change:
- `cancel_url` becomes `${base}/tax-intake?token=${token}&cancelled=1` (the page already returns to the same token; no FE change needed for this phase — the FE reads only `paid`).
- The 409 guard (~46-50) additionally allows `status === "pending"` when `stripe_payment_intent_id` is null AND `paid_at` is null. In that arm, before minting a new session, call Stripe `POST /v1/checkout/sessions/<stripe_checkout_session_id>/expire` with the same key selection the mint uses (best-effort: a 4xx because it is already expired/complete is logged, not fatal — but if Stripe says the session is `complete`, return 409 "This form has already been submitted." because money may be in flight). Then mint the new session and overwrite `stripe_checkout_session_id`.
- Apply the identical guard to route A? No — `intake-submit.ts` is member-side and mints a fresh row per submit; leave it.

### E. Ride-along 2 — refund idempotency key (`actions/tax/deposit-refund.ts` ~78-95)
After a written `deposit_refund_status = 'failed'`, a retry re-sends the identical key and Stripe replays the error for 24 h (#489). Copy the team-share pattern in `utils/tax-deposit-team-share.ts`: when the plan's current `deposit_refund_status === 'failed'`, fold a rotation suffix into the key. There is no `deposit_refund_at` timestamp for a failure, so add ONE nullable column `client_tax_plans.deposit_refund_failed_at timestamptz` (migration file `20260918203000_tax_deposit_refund_failed_at.sql`, DDL only, no policy change) written on the failure path, and use `-r<epoch of deposit_refund_failed_at>` as the suffix. The success path clears it (`null`). `#228` still holds: the base key is logical and date-less.

### F. Verify
- `deno check --no-lock supabase/functions/vfo-admin-api/index.ts` → 0.
- Action count unchanged at 514.
- Walk the failure matrix in your report: (1) throw in `nextClientRef` → row `paid`, no client, bell; sweep re-run creates everything once. (2) plan insert fails → row has `client_id`, no plan, bell; re-run reuses the client and creates the plan. (3) docs/email fail → row `completed`, no bell (best-effort, as today). (4) Stripe manual redelivery on a `completed` row → skipped. State for each which line proves it.

## Report back to Fable with
files changed, both migration texts, the exact new webhook skip predicate, the sweep pass text, the failure matrix, the three gate results verbatim, and a fixture recipe Jake can use to force case (2) on Test Member 59524 in sandbox (e.g. a temporary NOT NULL violation is NOT acceptable — propose something reversible such as pointing the plan insert at an impossible program id via a one-line env or query tweak, and say how to revert it).
