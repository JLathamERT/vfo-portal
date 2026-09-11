# System map

The top-level picture. Two repos, one Supabase project, four external integrations, one static-hosted SPA. The whole system is held together by a **123-line orchestrator** in `vfo-admin-api/index.ts` that dispatches to **493 actions across 505 modular action handler files** *(v: 2026-09-08 — derive both, do not trust them)* plus two routers (`router/dispatch.ts`, `router/webhooks.ts`).

> **Refactor + feature history.** The edge function was a single 4371-line file as of `vfo-admin-api` v194 (deployed 2026-05-07). The modular extraction was completed in 18 phased commits and deployed as v196 on 2026-05-08. All 128 action handlers at that point preserved their original behavior byte-equivalently — the public API contract (action names, response shapes, DB writes) was unchanged. Post-refactor additions: MAP1 sweeps (`automation_CONTRACT_revshare_sweep`, `automation_CONTRACT_chargescheduled_sweep`, `automation_CONTRACT_checkreminder_sweep`), MAP1 check path, sandbox toggle, the full Tax Planning automation track (~27 new tax handlers in `actions/tax/`), the Tax 4 meeting-date nudge, the Advisor Onboarding pipeline (21 handlers in `actions/advisor/` — Phases 1-6 deployed 2026-05-22 through 2026-05-26 + member-portal login setup chain + admin Automation Panel loader added 2026-05-28 + always-15th renewal-date rule), the PIP Meetings automation chain (13 handlers in `actions/msm/pip-*.ts` + 1 panel loader — deployed 2026-05-27), and the Accountant Onboarding pipeline (21 handlers in `actions/accountant/` + new Partnership? step — deployed 2026-05-28 as v323→v330, mirrors advisor pattern with conditional $4,000/$2,000 pricing per partnership, dual `agreement_templates` rows, no revenue_decision on member **— that last one ENDED 2026-08-12 / v730, which gave accountants full revenue-decision parity with advisors, gotcha #375**, 06:00 UTC reminder cron). Member numbering was later (2026-05-29, v336) reworked into the durable `member_category` taxonomy + category-relative `nextMemberNumber` helper — see GOTCHAS.md gotcha #48; the old fixed 30000/60100/90000 ranges are gone. Later additions include the read-only Payments aggregation tabs (per-person + global `all_payments_load`) and, in v483 (2026-06-16, "Phase D"), the **admin-initiated payment-method change** capability: a superadmin "send card-update link" action (`payments_send_card_update`) + two PUBLIC-token client legs that mint a Stripe `mode=setup` checkout, whose `checkout.session.completed` is handled by the system's first SetupIntent webhook branch — saving the new card/bank as the engagement's default for future off-session charges across MAP 1 / Tax / Specialist-license. **Current total: 461** (6 logins + 132 PUBLIC + 323 AUTH), re-counted 2026-08-13; the historical v483 figure was 307 (5 logins + 102 PUBLIC + 200 AUTH) (see `SESSION_REFERENCE.md` LIVE STATE — authoritative). The largest later additions include Member Membership Fees, Growth Credits + the Notifications page, Recurring Specialist Revenue, and (2026-07-21, live v633) the **Tax Planners 5th admin section** — new deny-all tables `tax_planners` + `tax_planning_groups`, a 3-way tax revenue split (Member / Tax Planner / VFOS) whose planner leg pays the planner's GROUP Stripe Connect account, and a per-case test-member sandbox override. See [03-edge-functions.md](03-edge-functions.md) for the new file layout, [../flows/tax-planning.md](../flows/tax-planning.md) for the tax track, [../flows/pip-meetings.md](../flows/pip-meetings.md) for the PIP Meetings track, `ADVISOR_ONBOARDING_RESUMPTION.md` for the advisor onboarding state, and `ACCOUNTANT_ONBOARDING_RESUMPTION.md` (both at repo root) for the accountant onboarding state.

## High-level diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            BROWSER (gh-pages SPA)                                │
│                  https://vfoportal.com/                        │
│                                                                                  │
│   /          /admin       /admin/login   /admin/client/:id   /decide?token=...   │
│              /member      /member/login  /member/client/:id  /pay?token=...      │
│                                                              /tax-pay?token=...  │
│                                                              /advisor-pay?token  │
│                                                              /accountant-pay?... │
│                                                              /pip-pay?token=...  │
│                                                              /member-setup?token │
│                                                                                  │
│   sessionStorage: vfo_session = { token, role, name, ... }                       │
└──────────────────────────────┬─────────────────────────────────┬─────────────────┘
                               │ Bearer ANON_KEY                  │ no Authorization
                               │ + body.token (session)           │ + URL ?token=
                               │                                  │
                               ▼                                  ▼
                          ┌─────────────────────────────────────────────┐
                          │   SUPABASE EDGE FUNCTION: vfo-admin-api      │
                          │   (493 actions, 123-line orchestrator        │
                          │    + 507 handler files + 2 routers)          │
                          │                                              │
                          │   Three dispatch surfaces:                   │
                          │   1. Stripe webhook  (router/webhooks.ts —   │
                          │      stripe-signature hdr)                   │
                          │   2. BoldSign webhook (router/webhooks.ts —  │
                          │      body.event shape)                       │
                          │   3. Action dispatcher (router/dispatch.ts — │
                          │      PUBLIC_HANDLERS + AUTH_HANDLERS maps)   │
                          │                                              │
                          │   Token gate via middleware/auth.ts;         │
                          │   role gates from constants/role-gates.ts.   │
                          └────┬────────┬────────┬──────────┬────────────┘
                               │        │        │          │
              service_role     │        │        │          │ chains
              (RLS bypass)     │        │        │          │ (admin-api → admin-api)
                               │        │        │          │ via SERVICE_ROLE_KEY
                               ▼        │        │          ▼
                       ┌──────────────┐ │        │     ┌────────────────────┐
                       │  POSTGRES    │ │        │     │  vfo-admin-api     │
                       │  51 tables   │ │        │     │  (loopback)        │
                       │  RLS denies  │ │        │     └────────────────────┘
                       │  anon by     │ │        │
                       │  default     │ │        │
                       └──────────────┘ │        │
                                        │        │
                       ┌────────────────┘        │
                       ▼                         │
              ┌──────────────────┐               ▼
              │ Storage buckets  │       ┌─────────────────────────────────┐
              │ - headshots      │       │  EXTERNAL APIs                  │
              │ - member-vault   │       │  ─────────────                  │
              └──────────────────┘       │  Stripe         (payments,      │
                                         │                  transfers,     │
                                         │                  webhook)       │
              ┌──────────────────┐       │  BoldSign       (e-sign,        │
              │  STANDALONE FN:  │       │                  webhook)       │
              │ boldsign-webhook │◄──────│  Gmail API      (drafts only)   │
              │  (95 lines)      │       │  Google Sheets  (read-only,     │
              └────────┬─────────┘       │                  rev share)     │
                       │ chains          │  Google Drive   (per-client     │
                       └────────────────►│                  PDF folder)    │
                                         │  html2pdf.app   (PDF gen)       │
                                         └─────────────────────────────────┘

                                         ┌─────────────────────────────────┐
                                         │  WEBHOOK INGRESS                │
                                         │  ─────────────                  │
                                         │  Stripe ───► vfo-admin-api      │
                                         │  BoldSign ─► boldsign-webhook   │
                                         │             OR vfo-admin-api    │
                                         │             (configured ext.)   │
                                         └─────────────────────────────────┘
```

## Repos

| Repo | Path | Purpose |
|---|---|---|
| `vfo-react` | `C:\vfo-react\.claude\worktrees\determined-elgamal-40071c` (this worktree) | React + Vite + react-router-dom v6 SPA. Static-hosted to GitHub Pages. |
| `vfo-edge-functions` | `C:\vfo-edge-functions` | Two Supabase edge functions. No local migrations directory — schema is managed remotely. |

## Runtime targets

| Component | Runtime | Where it runs |
|---|---|---|
| SPA | Browser (Vite-built static bundle) | `https://vfoportal.com/` |
| `vfo-admin-api` | Deno 2 (Supabase Edge Runtime) | Supabase project `ejpsprsmhpufwogbmxjv`, region `us-east-2` |
| `boldsign-webhook` | same | same |
| Postgres | Supabase Postgres 17 | same project |
| Storage | Supabase Storage | same project, buckets `headshots` (public read) + `member-vault` (signed URLs) |

## Data direction

- **Browser → admin-api**: every action via [src/lib/api.js](src/lib/api.js). Includes session token in body.
- **Browser → admin-api (token-link pages)**: `/decide`, `/pay`, `/tax-decide`, `/tax-pay`, `/tax-implement-decide`, `/tax-postreview-decide`, `/advisor-decide`, `/advisor-pay`, `/accountant-decide`, `/accountant-pay`, `/pip-pay`, `/member-setup` use raw `fetch` with URL token (no session). Reach the public-token handlers via `PUBLIC_HANDLERS` in `router/dispatch.ts` (which is dispatched BEFORE the `middleware/auth.ts` gate). Public-token actions span MAP1, Tax, Advisor Onboarding, Accountant Onboarding, and PIP pipelines — see [05-api-action-catalog.md](05-api-action-catalog.md). The `/member-setup` page falls through advisor → accountant token lookup so one shared page handles login-setup for both onboarding pipelines.
- **admin-api → Postgres**: via `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` — service-role bypasses RLS. Auth is application-level.
- **admin-api → admin-api (loopback chains)**: server-to-server `fetch` with `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`. Used by webhooks and automation handlers to chain into other handlers. The chains route to public-token actions, so they bypass the user-session gate.
- **admin-api → external APIs**: Stripe, BoldSign, Google OAuth, Gmail, Sheets, Drive, html2pdf.app. All via `fetch` with API-specific auth.
- **Stripe → admin-api**: webhook with `stripe-signature` header, HMAC-verified.
- **BoldSign → ???**: webhook with `body.event.eventType`. URL configured externally — could be the standalone function OR the embedded handler in admin-api. Only the standalone version chains downstream.

## State carriers

| State | Where | Authority |
|---|---|---|
| Identity | `allowed_admins`, `member_logins` | Postgres |
| Active session | `admin_sessions` (server) + `vfo_session` in `sessionStorage` (client mirror) | Both — server validates, client transmits |
| Pipeline state machine | `pipeline_map1` row (~80 columns) | Postgres |
| Client/member/program state | various tables | Postgres |
| In-flight UI tab/section | `sessionStorage` keys (`adminActiveTab`, etc.) | Client only |
| Sandbox toggle | `pipeline_sandbox_config` per pipeline | Postgres |
| Email/agreement copy | `email_templates`, `agreement_templates` | Postgres (admin-editable) |

## Authentication boundary

```
              UNAUTHENTICATED                      AUTHENTICATED
              ───────────────                      ─────────────
              /decide   /pay                       /admin    /admin/client/:id
              (URL token)                          /member   /member/client/:id

              ↓ raw fetch                          ↓ callApi (Bearer ANON_KEY +
              ↓ no Authorization                   ↓         body.token = session)
              ↓                                    ↓
              ┌────────────────────────────────────────────────────────┐
              │  vfo-admin-api orchestrator (index.ts, 88 lines)       │
              │                                                        │
              │  1. router/webhooks.ts (Stripe + BoldSign by shape)    │
              │  2. admin_login / member_login / login (inline,        │
              │     pre-webhook order preserved)                       │
              │  3. PUBLIC_HANDLERS map (router/dispatch.ts):          │
              │       100 public-token + chain-callable handlers      │
              │       (PCADMIN_finaldecision, CONTRACT_loadpayment,    │
              │        CONTRACT_stripecheckout — URL token             │
              │        endpoints; CONTRACT_ceocountersign,             │
              │        CONTRACT_stripecustomer, CONTRACT_paymentemail, │
              │        CONTRACT_revshare, CONTRACT_confirmationemail,  │
              │        CONTRACT_invoicereceipt — server-to-server)     │
              │                                                        │
              │  ─── middleware/auth.ts (Token gate) ──────────        │
              │     Reads body.token, looks up admin_sessions.         │
              │     Role: admin / member / client / specialist;        │
              │     is_superadmin = email == SUPERADMIN_EMAIL.          │
              │                                                        │
              │  SUPERADMIN_ONLY_ACTIONS → 403 non-superadmin, then    │
              │  ADMIN_ONLY_ACTIONS → 403 for member callers.          │
              │                                                        │
              │  MEMBER_SCOPED_ACTIONS (constants/role-gates.ts):      │
              │     23 reads/writes → body.member_number forced        │
              │     to caller's own                                    │
              │                                                        │
              │  4. AUTH_HANDLERS map (router/dispatch.ts):            │
              │       116 authed handlers. Both roles can call most;   │
              │       application-level scoping by role-gates.         │
              └────────────────────────────────────────────────────────┘
```

## How to navigate this map

| If you want to know... | Read |
|---|---|
| The full table of routes / pages | [02-frontend-shell.md](02-frontend-shell.md) |
| The shape of the edge function | [03-edge-functions.md](03-edge-functions.md) |
| Auth tokens and gates in detail | [04-auth-and-sessions.md](04-auth-and-sessions.md) |
| Every action handler | [05-api-action-catalog.md](05-api-action-catalog.md) |
| Where logic lives, by file | [06-orchestration-files.md](06-orchestration-files.md) |
| What a specific table holds | [../tables/](../tables/) |
| How a feature works end-to-end | [../flows/](../flows/) |
| External APIs and env vars | [../integrations/](../integrations/) |

## What's NOT in the system

These are explicitly absent from the codebase (read-only observation, no judgement):

- **No backend HTTP server** beyond the Supabase edge functions. The frontend talks directly to `vfo-admin-api`.
- **No client-state library** (Redux, Zustand, etc.). Each page does its own load.
- **No GraphQL.** All API calls are POST with `{action, ...payload}`.
- **No Supabase Auth.** Identity is a custom session-token scheme over `allowed_admins` / `member_logins`.
- **No DB migrations directory** in either repo. Migrations are managed remotely on Supabase.
- **No CI / GitHub Actions** observed. Build and deploy are manual via `npm run deploy` (`gh-pages -d dist`).
- **No tests.** No `__tests__/`, no `.test.js`, no test runner config in `package.json`.
- **No TypeScript** in the React app (only in the Deno edge functions).
- **No environment-specific configs** for the frontend (Supabase ANON_KEY is hardcoded). `VITE_API_URL` IS honored by `src/lib/api.js`, `src/pages/PayPage.jsx`, and `src/pages/DecidePage.jsx` — production behavior unchanged via fallback to the hardcoded prod URL when the env var is unset. (Added on `test/frontend-vs-local-function` branch, commit `3bf0963`, for local-function smoke testing.)
- **No observability beyond `console.log`/`console.error`** in either edge function. No structured logging, no metrics export.
- **Seventeen background jobs via `pg_cron` + `pg_net.http_post`** (staggered to avoid races on the same row; jobids 2–18 — derive them, never trust this count: `select jobid, jobname, schedule from cron.job order by jobid`. **Added 2026-09-04:** `onboarding-meeting-reminder-sweep-5min` **jobid 18** (`*/5 * * * *`, `automation_ONBOARDING_MEETING_sweep`: the preliminary-meeting reminder ladder for BOTH onboarding pipelines — the second non-daily job; see item 12 below). **Added 2026-08-27:** `gc-recurring-sweep-daily` jobid 17 @12:30 UTC (`automation_GC_recurring_sweep`: charges due `gc_subscriptions` rows out of the member's Growth-Credit balance — no Stripe, no money; **no weekend skip**, unlike the growth-overdue job; see item 11 below and `flows/gift-credits.md` Flow E). Also live: `regular-map4-followup-sweep-daily` jobid 11 @09:30 UTC, `growth-overdue-sweep-daily` jobid 12 @10:00 UTC, — added 2026-07-10 — `reminder-sweep-5min` jobid 14 (`*/5 * * * *`, `automation_REMINDER_sweep`: delivers due `personal_reminders` as bell notifications; the only non-daily job) and `notifications-purge-daily` jobid 15 @10:30 UTC (`automation_NOTIFICATIONS_purge`: hard-deletes READ notifications older than 90 days), and — added 2026-07-13 — `membership-sweep-daily` jobid 16 @12:00 UTC (`automation_MEMBERSHIP_sweep`: member membership fees — **FIVE passes as of 2026-08-04 / v700**: 30-day advance **renewal notices** → renewals → waive $0 credit-covered rows → ONE combined off-session charge per plan for the due month + all missed months → auto-unsuspend caught-up members (**and, 2026-08-24, release their held revenue-share payouts when no hold reason remains — `payouts_released`**). The notice pass runs FIRST so a plan is always warned before it is rolled over, and is idempotent on `member_payment_plans.renewal_notice_for`, stamped only after a successful draft; see `flows/membership-fees.md`). Setup docs: `supabase/cron/reminder-sweep.sql` + `notifications-purge.sql` + `membership-sweep.sql`):
  1. **Daily MAP 1 revshare sweep** — `automation_CONTRACT_revshare_sweep` at 02:00 UTC. **Since 2026-08-24 it also carries a final pass that re-fires `automation_PIP_revshare` for every PIP row parked by the member-standing hold** (`pip_rev_share_status` ∈ `Held - Member Suspended` / `Held - Member Paused`) — PIP has no cron of its own, and PIP's `Pending` failure state was deliberately left out, so it stays manual. Returns `pip_held_refired`. Setup: `vfo-edge-functions/supabase/cron/revshare-sweep.sql`.
  2. **Daily Tax revshare sweep** — `automation_TAX_revshare_sweep` at 02:30 UTC. Retries Pending/Failed tax revshare AND drives Tax 3/4/5 reminder timers + the Tax 4 meeting-date nudge (a **calendar** survivor — it keys off `tax4_meeting_date < current_date`). **This sweep NEVER charges anything as of 2026-08-14:** the old "Tax 5 Proceed + 24h silence → `implementation_final_decision='Auto-Locked'` + off-session charge" tier is DELETED, replaced by a Proceed-branch reminder ladder (`TAX_impl_proceed_reminder_email` 2 business days → `TAX_impl_proceed_stalled` 4 business days, PF bell) that waits indefinitely for a real click. `automation_TAX_charge_implementation` now has exactly ONE runtime call site — `actions/tax/implement-final-decision.ts`, the client's own button — and `'Auto-Locked'` is historical-only (zero writers; `actions/clients/overview-tax.ts` still reads it for old rows) + — **added 2026-08-10 / v717** — the **Tax 2 assess-form reminder before the booked ROI meeting** (rule `TAX_tax3_assess_reminder_email`, `email_templates` 217, Draft): its `delay_days` counts **business days BEFORE `client_tax_plans.tax3_meeting_date`** (via `businessDayHorizonDateOnly`) rather than business days since a trigger — and the one-shot guard `tax3_assess_reminder_sent_at` is stamped **only after a successful Gmail draft**, so a missing planner email or a Gmail auth failure retries the next night (gotcha #359). **Added 2026-08-20:** an EARLY second tier of the same chase (rule `TAX_tax3_assess_reminder_early_email`, default **5** business days, templates `TAX_tax3_assess_reminder_early` + `|vault`, guard `tax3_assess_reminder_early_sent_at`) whose window sits strictly beyond the 2-day horizon, so the two tiers never draft on the same night. Setup: `vfo-edge-functions/supabase/cron/tax-revshare-sweep.sql`.
  3. **Daily scheduled-payment charger** — `automation_CONTRACT_chargescheduled_sweep` at 03:00 UTC. Creates off-session Stripe PaymentIntents for MAP1 quarterly card/ACH payments 2-4 once `payN_date` arrives. Setup: `vfo-edge-functions/supabase/cron/chargescheduled-sweep.sql`.
  4. **Daily check-payment reminder sweep** — `automation_CONTRACT_checkreminder_sweep` at 04:00 UTC. Three jobs in one action, in this order: (a) `sweepUnclearedChecks` — the `MAP1/TAX_check_uncleared_bell` rows for checks recorded/due but never marked cleared (default 14 **business** days); (b) — **added 2026-07-28, v668** — `sweepMigrationSetupLinks`, the **Payment Continuation setup-link ladder**: for the newest UNUSED `migration_setup_tokens` row per `(pipeline, row_id)`, a 2-business-day reminder email to the client (`CLIENT_PAYMENT_CONTINUATION` / `setup_link_reminder`, guarded by `reminder_sent_at`) and a 4-business-day bell to Tracy + Jake (`MIGRATION_setup_link_stall_bell`, guarded by `pf_notified_at`) — and if the link has **EXPIRED** it is never emailed; the sweep instead **auto-mints a fresh 7-day token** (`created_by='sweep'`, `reminder_sent_at` stamped at mint) and emails that, capped at 3 sweep-minted tokens per row, with four-way truthful bell wording (gotcha #300); (c) the original job — Gmail reminders for MAP1 quarterly check clients ~7 **business** days before each P2/P3/P4 due date (the lookahead horizon comes from `businessDayHorizonDateOnly`; the due dates themselves are untouched calendar dates). **(a) and (b) run BEFORE the `MAP1_check_payment_reminder_email` early-return**, so disabling the check-reminder rule cannot silently disable them. Setup: `vfo-edge-functions/supabase/cron/check-reminder-sweep.sql`.
  5. **Daily Advisor Onboarding sweep** — `automation_ADVISOR_sweep` at 05:00 UTC. Three stalls × (2-business-day reminder + 4-business-day notification): Undecided email, agreement signing, payment link. The escalation notification routes to the onboarding's chosen **Team Member Responsible** (`onboarding_team_member` → `teamMemberRecipient`, falls back to the shared `admin` bell), not a generic PF — 2026-06-15. Also runs a 14-day implicit-No auto-decline on stalled Undecided rows — **CALENDAR days, deliberately left unconverted**. Setup: `vfo-edge-functions/supabase/cron/advisor-sweep.sql`.
  6. **Daily Accountant Onboarding sweep** — `automation_ACCOUNTANT_sweep` at 06:00 UTC. Same three stalls (2 / 4 business days) + 14-**calendar**-day implicit-No pattern as advisor, against `accountant_onboarding`. Chains `automation_ACCOUNTANT_declineemail` on auto-decline. Setup: `vfo-edge-functions/supabase/cron/accountant-sweep.sql`.
  7. **Daily Specialist Onboarding sweep** — `automation_SPECIALIST_sweep` at 07:00 UTC (7 stalls × 2-business-day reminder + 4-business-day Tracy FYI, all 14 tiers routed through one shared `cutoff()` wrapper over `businessDelayCutoffIso`; no auto-decline). Setup: `vfo-edge-functions/supabase/cron/specialist-sweep.sql`.
  8. **Daily Partnership Fast Track sweep** — `automation_PFT_sweep` at 08:00 UTC. Discovery-form 2-business-day reminder email to the accountant + 4-business-day PF notice, and VFO Fast Track decision-email 2-business-day reminder + 4-business-day PF notice (plus the undecided-decision pair, six tiers in all). Timers on `pft_engagement`; no auto-decline. Installed by cloning the specialist cron command in-SQL.
  9. **Daily Tax presentation-link sweep** — `automation_TAX_presentation_sweep` at 09:00 UTC (jobid 10). Drafts the `TAX_presentation_link` email (To member, Cc assigned PF) for any `client_tax_plans` row whose `presentation_send_date <= today` and `presentation_email_sent_at IS NULL` (the Tax 2 "Send presentation link to member before meeting" step). Drafts only — no auto-send. **Since 2026-08-11 it also RETIRES a bell:** stamping `presentation_email_sent_at` is what carries out the assigned PF's action-required `Download the ROI presentation for%` ask (`TAX_assess_completed_pf`), so the sweep calls `clearPresentationDownloadBells` right after each successful draft — fail-soft, and **this sweep is the only site that stamps that column**, which is why it is the only site that clears (`presentation-schedule.ts` merely NULLs it). Installed via `cron.schedule` with the same Bearer pattern as the other jobs.
  10. **Daily VFO Specialist Revenue payout sweep** — `specialist_revenue_payout_sweep` at 11:00 UTC (jobid 13). **Four passes as of 2026-08-11.** Pass 1: retries every payout line on a RECEIVED request whose status is in the engine's **exported `PAYABLE_STATUSES`** — `pending`/`awaiting_connect`/`failed` **plus `held_member_suspended`/`held_member_paused` (2026-08-24)**; the sweep imports that list rather than restating it, so a new non-terminal status can never be swept-out by omission. Pass 2: the ONE-OFF payment reminder ladder — 2-business-day reminder email to the specialist + 4-business-day FYI notification to Tracy (on `specialist_revenue_requests`). **Pass 2b (new 2026-08-11): bank-verification stall** — one-off requests left in the new `awaiting_verification` status past the rule's delay (default 5 **business** days, keyed on `updated_at`) raise `SPECREV_awaiting_verification_bell` to Tracy, deduped on unread with **no stamp column**. It is a poll rather than a push, so it still fires if `payment_intent.canceled` is ever missed; without it a hand-keyed bank could sit unverified for the ~10 business days Stripe waits before cancelling, with nobody told (gotcha #370). **Pass 3 (new): the RECURRING setup reminder ladder** — for `specialist_revenue_recurring_plans` still `status='setup_pending'`, a 2-business-day reminder email (`SPECREV_recurring_setup_reminder`, guarded by `setup_reminder_sent_at`) then a 4-business-day Tracy bell (`SPECREV_recurring_setup_tracy_bell`, guarded by `setup_pf_notified_at`), both rule-driven (2d/4d defaults). Pass 3 closes gotcha #296, where an abandoned recurring setup was completely silent because the ladder only ever queried the one-off table. Setup: `vfo-edge-functions/supabase/cron/specialist-revenue-payout-sweep.sql`. (The **recurring** Specialist Revenue billing itself is still webhook-driven, not cron-driven: each monthly plan bills through its own dedicated Stripe subscription customer, so `router/webhooks.ts` pre-creates the monthly `specialist_revenue_requests` row on `invoice.finalized` and flips it to received on `invoice.paid` — reusing the existing invoice/receipt + payout chain — with zero collision with the specialist-license routing. Abandoned *setups* are now also caught immediately by the `checkout.session.expired` handler, gotcha #299.)
  11. **Daily recurring Growth Credit sweep** — `automation_GC_recurring_sweep` at 12:30 UTC (jobid 17, added 2026-08-27 / v797). Charges every due `gc_subscriptions` row out of the member's **credit** balance — this sweep touches no Stripe and moves no money. Per row it re-reads the service (deactivated, or flipped back to `one_time`, means **skip in place**), charges the service's **current** `credit_cost`, claims the period **optimistically before deducting** (advance `next_charge_date` filtered on the value just read, then `.select()`; zero rows means a concurrent run already has it), and **re-anchors from TODAY rather than the stored due date** — anchoring on the due date would charge a funded hold once a night until it caught up (gotcha **#456**). A short balance parks the row `on_hold` with `on_hold_notified_at` (one `GC_recurring_out_of_credits` draft per hold episode) and deliberately does **not** advance the date. Renewals write `gc_transactions` only, **never** `gc_redemptions`. **No weekend early-return**, deliberately unlike the `growth-overdue` job it was cloned from. See [../flows/gift-credits.md](../flows/gift-credits.md) Flow E.
  12. **Onboarding preliminary-meeting reminder sweep** — `automation_ONBOARDING_MEETING_sweep` every **5 minutes** (jobid 18, added 2026-09-04 / v811). One PUBLIC service-role handler (`actions/onboarding/meeting-reminder-sweep.ts`) driving BOTH the advisor and accountant pipelines. Three tiers: (a) the reminder itself when `meeting_reminder_due_at <= now` **and `meeting_at > now`** — that second half is what makes a meeting booked inside the one-business-day window send on the next tick rather than never; (b) 60 minutes out and (c) 10 minutes out, **both gated on `meeting_response='confirm'`**. Each tier stamps its own guard column only after the send succeeded, and **every query filters `status='active'`**, so a stopped onboarding is silent across all three. Its six templates (3 × 2 pipelines) are `send_mode=true` — real sends, taking that census from 11 to 17 (#325). See [flows/advisor-accountant-onboarding.md](../flows/advisor-accountant-onboarding.md).

  The MAP 1 revshare sweep (#1 above) also drives a three-stall reminder ladder (PCADMIN Undecided email, agreement signing, Pay1 link) — 2-business-day client reminder + 4-business-day PF notification per stall. Timer-base columns are `c14_email_sent_at`, `c17_followup_sent_date`, `pay1_email_sent_at`; idempotency guards are `*_reminder_sent_at` / `*_pf_notified_at`. The older `c14_followup*` / `c17_followup1/2_sent` / `pay1_followup*` columns were dropped in migration `map1_reminder_ladder_columns` (2026-05-21). The `pay{2,3,4}_reminder_sent` columns are unrelated to this ladder — they're the pre-due-date nudges for check clients (7 **business** days ahead), written by sweep #3.

  **Every sweep reminder/stall ladder counts BUSINESS DAYS (Mon–Fri UTC), not calendar days — 2026-08-14.** The single helper is `utils/notify.ts businessDelayCutoffIso(days)`: a backward weekday walk from `now`, so a trigger on Thursday stalls on Monday rather than Saturday (the fractional part — the Notification Editor exposes `step=0.5` — is subtracted as plain hours AFTER the walk, which is what keeps a larger `delay_days` monotonically earlier). Its forward counterpart `businessDayHorizonDateOnly(fromDateOnly, days)` does the same walk for the two **lookahead** windows — the Tax 2 assess-form countdown before `tax3_meeting_date` and the check-client pre-due-date nudge. **The stored `notification_rules.delay_days` numbers did not change; only the unit they are counted in did**, so every "48h/2-day" tier is now 2 business days and every "96h/4-day" tier is 4 business days, and the bell copy reads "N business day(s) have passed". The old calendar helper `delayCutoffIso` still exists in `notify.ts` but has **ZERO callers** — do not reach for it in a new sweep. `growth/overdue-sweep.ts` was the one job with no delay offset to convert, so instead it **early-returns on a Saturday/Sunday UTC tick** (`{ok, notified:0, skipped:"weekend"}`).

  **DELIBERATE CALENDAR SURVIVORS — do NOT relabel these as business days:** the advisor + accountant **14-day implicit-No auto-decline** (#5/#6), the Tax 4 **"meeting has passed"** nudge (#2), the membership **30-day advance renewal notice** (jobid 16), the whole **chargescheduled sweep** (#3 — charges land on the real `payN_date`, weekends included), the **notifications purge** (>90 days read), **personal reminders** (`fire_at`), and every **token/session expiry** window (14-day login-setup, 7-day setup/card-update tokens, 1-hour self-service reset).

  **Every stall ladder above now also has a MANUAL third tier (2026-08-12, v734).** A `<stall>_pf_ack_at` column per stall — **26 across `pipeline_map1`, `client_tax_plans`, `advisor_onboarding`, `accountant_onboarding`, `specialist_onboarding`, `pft_engagement` and `client_priority_tracks`** (that last one named `map4_stall_ack_at`) — records that a human actually chased the second-tier (4-business-day) escalation, written **only** by the admin ticking "Reached out?" in the AI PC Admin block via `automation_stall_ack`. The reminder and escalation rows in the UI are rendered **only** when their own guard column is stamped. Gotcha **#381**.

  **CORRECTED 2026-08-19 (v760) — the ack column is no longer inert, and a sweep author now DOES have to handle it.** These columns originally gated nothing and were read by nothing; both halves of that changed in one pass. (1) **Every sweep that mints a stall bell now filters `.is("<stall>_pf_ack_at", null)`** — all seven (`pipeline/contract-revshare-sweep.ts`, `tax/revshare-sweep.ts`, `advisor/sweep.ts`, `accountant/sweep.ts`, `onboarding/sweep.ts`, `pft/sweep.ts`, `regular/map4-followup-sweep.ts`), so a ticked box is a real satisfied-on-fire guard instead of something the next nightly tick undoes. **A new stall ladder must add the column AND the guard**, not just the column. (2) Ticking the box now also **marks read every unread bell of that step** (the reach-out bell plus, where one exists, the step's "requested extra meeting" bell), **regardless of `dismissible`** — see [../flows/notifications.md](../flows/notifications.md) for the per-pipeline scoping and gotcha **#418** for why the two extra-meeting title shapes cannot share one pattern. Unchecking is one-way: it nulls the column and restores nothing.
