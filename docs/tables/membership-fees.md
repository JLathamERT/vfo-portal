# Tables — Member Membership Fees

> Added 2026-07-13 (`20260713090000_member_payment_plans` + follow-ups `…110000`, `…120000`,
> `…140000`); two further tables added 2026-08-04
> (`20260804120000_membership_renewal_meetings.sql` + `20260804140000_membership_pause.sql`).
> **All FOUR tables RLS deny-all (anon probe `*/0`, re-verified on both new tables at creation).**
> All access via the service-role edge function. Flow:
> [flows/membership-fees.md](../flows/membership-fees.md).

## member_payment_plans

One row per member membership plan. Partial unique index `member_payment_plans_one_live_idx`
on `(member_number) WHERE status <> 'canceled'` — one live plan per member
(`terminated` also counts as live for the index; the app filters `not in (canceled, terminated)`
when checking, so terminate → create-new works).

| Column | Notes |
|---|---|
| `member_number` / `member_name` | member ref + display snapshot |
| `category` | `'advisor'` \| `'accountant'` — which Accounting panel owns it |
| `advisor_model` | snapshot; `'New Model'` = card fee applies, anything else = Legacy (no fee) |
| `frequency` | `'monthly'` \| `'annual'` |
| `annual_amount` / `credit_note` / `credit_note_memo` / `net_annual` | terms; credit is FIRST-YEAR only |
| `per_pull_amount` | whole-dollar charge per pull (round half up), computed at plan-save |
| `charge_day` | 1–15 (annual plans store 15). **TWO writers as of 2026-08-21 / v776 — which one filled it decides how the plan bills, and the column itself is the only record of that.** *Pay-derived (the original):* `activate.ts` stamps it from the day the member actually paid at the setup link. *Admin-entered (monthly transfers):* `plan-save.ts` writes it from the form — the day the member has always paid on — and `activate.ts` then **defers** to it instead of re-deriving (`chargeDayOut`). plan-save writes it **unconditionally** as `isTransfer && frequency === 'monthly' ? day : null`, so an edit to annual or away from transfer CLEARS it; it is **REQUIRED** on monthly transfers (400 *"Charge day must be a whole number between 1 and 15"*). **On a monthly transfer, NULL vs non-NULL is the switch between two billing models** — non-NULL = save-only link + the whole year scheduled on that day + catch-up folded into the first scheduled charge; NULL = the legacy pay-at-the-link model (`transferLinkPulls`). `transferDaySchedule()` returning null IS that switch, and nothing on screen announces which mode a plan is in, so **a missed backfill or an omitted form key silently selects the old money behaviour** (gotcha **#429**). All 15 live transfer plans were backfilled non-NULL on 2026-08-21 |
| `start_date` | date of first payment (provisional = creation date until they pay) |
| `renewal_date` | always a 15th; derived at first payment (pay days 1–14: last 15th strictly before pay+12mo; day 15 & after-the-15th: the 15th exactly 12mo out — gotcha #235) or admin-entered for transfers; advanced +12mo at each renewal |
| `auto_renew` | default true |
| `transfer` | mid-year move from the old billing (bills only until the entered renewal) |
| `status` | `setup_pending` → `active` → `canceled` \| `terminated` |
| `stripe_customer_id` / `default_payment_method_id` / `payment_method_type` / `acct_last4` | charge rails (`ach`/`card`) |
| `setup_token` / `setup_email_sent_at` | the /membership-pay link (doubles as the update-method link once active) |
| `setup_link_expires_at` | update-method links (ACTIVE plans only) expire 30 days after last emailed; re-stamped by every link emailer + activation; NULL/past = expired (gotcha #241) |
| `next_year_amount` / `next_year_credit_note` | admin-editable renewal terms, consumed + cleared by the renewal pass |
| `termination_fee` / `terminated_at` | set by `membership_terminate` |
| `prior_payments_made` | transfers only: payments already collected this year under the OLD billing. Admin-entered on the transfer form (0–11) because the system holds no record of them; printed on the catch-up invoice. **REQUIRED on MONTHLY transfers as of 2026-07-31 / v691** (`plan-save.ts` 400s with *"Enter how many payments they already made this year (0-11)"*) — it is now the ONLY schedule input the admin gives; still optional on annual transfers. NULL falls back to `(12 − remaining)` (gotcha #280) |
| `remaining_payments` | **NEW 2026-07-31** (`20260731150000_membership_remaining_payments.sql`, additive nullable integer). Monthly transfers only: charges left this membership year, **INCLUDING** the one taken at the setup link. **DERIVED server-side at plan save as `12 − prior_payments_made` — never admin-entered**, written unconditionally (so editing a plan away from monthly/transfer clears it) and any client-supplied value is ignored. NULL for new plans, annual plans, and legacy pending transfers saved before the column existed — on those, `transferLinkPulls()` falls back to the renewal-date-derived slot count, which is exactly the pre-v691 behaviour. Drives `pullsAtLink = 1 + max(0, remaining − slots)` (the arrears catch-up) and the per-pull credit spread. Gotchas #315/#316 |
| `renewal_notice_for` | **NEW 2026-08-04** (`20260804120000`). The `renewal_date` the 30-day advance renewal notice was last emailed FOR — the once-per-renewal idempotency stamp for the sweep's pass 0. **Written ONLY after a successful Gmail draft**, so a template/Gmail failure retries tomorrow instead of silently swallowing the notice. The pass re-notices whenever this `<> renewal_date`, which means it **re-arms automatically** when the renewal date moves — including after a **pause** (`membership_pause` deliberately leaves this stale so the member is warned again for the new date). NULL = never noticed. Gotchas #332/#333 |
| `renewal_meeting_token` | **NEW 2026-08-04** (`20260804120000`). Durable 64-hex `token32()` behind the `/membership-meeting?token=` button in the renewal notice email. **Minted once per plan and reused by every subsequent notice**, and **persisted BEFORE the email is drafted** so a sent link always resolves. Partial unique index `member_payment_plans_renewal_meeting_token_key WHERE renewal_meeting_token is not null` — the token is the ENTIRE credential for the PUBLIC `membership_renewal_meeting_request`, so it must resolve to exactly one plan (#333) |
| `sandbox` | Stripe mode the customer was created in (key selection follows this, not the live toggle) |
| `stripe_account` | **NEW 2026-09-11** (`20260911120000_second_stripe_account.sql`, additive nullable `text`, named CHECK `member_payment_plans_stripe_account_check IN ('vfos','ert')`). **Which Stripe account this plan's customer and saved payment method live on. NULL = legacy = `'vfos'` (VFO Services).** The pair `(stripe_account, sandbox)` selects the secret key for **every** later charge — `getStripeKeyFor(normalizeStripeAccount(plan.stripe_account), !!plan.sandbox)` — in `setup-checkout.ts`, `sweep.ts` and `terminate.ts`. **`pipeline_sandbox_config.stripe_account` decides only where a NEW customer is MINTED; this column governs everything afterwards**, because a Stripe customer id is valid on exactly one account. **Written on the minting pass only** — `send-setup-link.ts` sets it in the same update that writes `stripe_customer_id`, and reuses the existing stamp when a customer is already there (so a `setup_pending` plan re-minted after a mode flip also follows the config, and is re-stamped in that same write). **NO charge path ever re-stamps it.** The ONE writer that does is the superadmin action **`membership_stripe_remap`**, and only after Stripe's own customer copy, behind a guarded `where stripe_account is null or = 'vfos'` update. **Backfill: `'vfos'` onto every row with a non-NULL `stripe_customer_id` — 37 plans.** Rows with no customer yet stay NULL so a later phase mints them on whichever account the config then names. Gotcha **#485**; flow: [../flows/membership-fees.md](../flows/membership-fees.md) |

## member_payment_schedule

The expected-payment ledger — one row per pull, generated at first payment (year 1) and by the
renewal pass (later years). Unique `(plan_id, due_date)` **WHERE kind='membership'** (partial
index `member_payment_schedule_plan_due_membership_key`, migration `20260717190000` — a
termination fee legitimately shares its date with a same-day membership row; gotcha #239);
sweep index `(status, due_date)`.

| Column | Notes |
|---|---|
| `plan_id` (FK cascade) / `member_number` | |
| `due_date` / `period_label` | e.g. `2026-08-13` / `August 2026` (annual: `Membership year 2026–2027`). A behind mid-year transfer's first row reads `August 2026 (includes 1-month catch-up)` — on a legacy transfer that is the row PAID at the link, and on a `charge_day` transfer (v776) it is the first SCHEDULED day-D row instead, same label and same `perPull × k` / `creditPer × k` money. **`(plan_id, due_date)` is UNIQUE where `kind='membership'`** (partial index, migration `20260717190000`) — the duplicate-charge guard. **Never write two membership rows on one date for a plan:** a multi-period collection changes the row's AMOUNT, never the row COUNT (gotcha #315) |
| `amount_due` / `credit_applied` | whole dollars; $0 rows = credit-covered, waived when due. **A catch-up row carries `perPull × N` and `creditPer × N`** — and `(amount_due + credit_applied) / grossMonthly` is exactly how `monthsCoveredByRow` recovers the number of MONTHS the row spans, which is the unit every member-facing count uses (gotcha #316) |
| `kind` | `'membership'` \| `'termination_fee'` \| **`'pause'`** (added 2026-08-04, `20260804140000` widened the inline CHECK — constraint name `member_payment_schedule_kind_check`, verified against the live catalog). **`'membership'` is the ONLY kind any money consumer reads.** A `'pause'` row is a zero-dollar MARKER (`status='waived'`, `amount_due` 0) standing in for a month skipped during a membership pause; it exists purely so the ledger shows "Paused" months between the real payments. It is invisible to the charge pass, the renewal guard, the $0-waive pass, the invoice/receipt engine, `all-payments-load`, the webhooks, terminate/cancel voids and `send-reminder` **only because every one of them filters `kind='membership'`** — so **ANY NEW READER of this table must filter `kind` or consciously decide what `'pause'` means to it** (gotcha **#332**). It also cannot collide with a real charge on the same date, because the duplicate-charge unique index is PARTIAL on `kind='membership'` (#315/#239) |
| `status` | `scheduled` → `processing`/`paid` \| `missed`/`declined` (arrears — swept into the next combined charge) \| `waived` \| `canceled` |
| `stripe_payment_intent_id` | a combined catch-up charge stamps the SAME PI on every row it covered |
| `paid_at` / `payment_method_type` / `acct_last4` / `failure_reason` | |
| `year_start` / `year_end` | the membership year this row belongs to, stamped at BOTH insert sites (activation + renewal pass). Rows sharing a `year_start` are one year; the earliest `due_date` in the group is the opener that earns an INVOICE. Needed because the renewal pass advances `plan.renewal_date` but leaves `start_date` alone (gotcha #280) |
| `invoice_number` / `receipt_number` | `INV-<member#>-NNNN` / `REC-<member#>-NNNN`, allocated via `document_numbers.member_payment_plan_id`. The invoice number lives on the year's opening row only |
| `invoice_vault_path` / `receipt_vault_path` | object paths in the `member-ert-docs` ERT vault bucket (NOT Google Drive) |
| `docs_emailed_at` | set once the invoice/receipt email is drafted — the idempotency guard against Stripe event redelivery |
| `card_processing_fee` | the fee Stripe ACTUALLY charged (`amount_received` − base), stamped at settle time in both webhook branches. A combined catch-up charge stamps the SAME total on every row it covered — read it from the primary row, never sum it (gotcha #281) |
| `reminder_sent_at` | guard so the failed-payment email drafts once per missed row |

## membership_renewal_meetings

> **NEW 2026-08-04** (`20260804120000_membership_renewal_meetings.sql`). RLS deny-all
> (anon probe `*/0` verified). One row per *"I'd like to talk before this renews"* click on the
> 30-day advance renewal notice, closed out by an admin recording the outcome.

| Column | Notes |
|---|---|
| `plan_id` (FK cascade) / `member_number` | the plan the request is against; `member_number` denormalised so the audit line survives without a join |
| `renewal_date_for` | the renewal the member is asking about. **`(plan_id, renewal_date_for)` with `completed_at IS NULL` is the idempotency key** — `membership_renewal_meeting_request` reuses an existing OPEN row rather than inserting a second one, so a double-click or a re-opened email cannot queue two meetings |
| `requested_at` / `completed_at` | open vs closed. An open row is what the panel's "Renewal meeting" section and the orange **"Meeting requested"** header pill key off |
| `outcome` | `check (outcome in ('continue','cancel'))`, NULL while open. **`cancel` also flips `plan.auto_renew=false` and drafts `MEMBERSHIP_cancel_confirmation`** (best-effort — a Gmail failure must not lose the recorded outcome) |
| `recorded_by` | email of the admin who recorded it (accounting-tab, typically Rachael — NOT necessarily a superadmin) |

**The bell is action-required and is cleared ONLY by `membership_renewal_meeting_outcome`** — on
BOTH outcomes, matched on pipeline + `dismissible=false` + `read=false` + `link LIKE %member=N%`.
Nothing else dismisses it (#179/#224 class). Gotcha **#333**.

## member_payment_plan_pauses

> **NEW 2026-08-04** (`20260804140000_membership_pause.sql`). RLS deny-all (anon probe `*/0`
> verified). **Audit only — nothing reads this table to make a billing decision.** The real
> effect of a pause lives in the shifted `member_payment_schedule` rows and `plan.renewal_date`;
> this table exists so the panel can show a pause history and so a shifted schedule can be
> explained after the fact.

| Column | Notes |
|---|---|
| `plan_id` (FK cascade) / `member_number` | as above |
| `months` | `check (months between 1 and 12)`. Every remaining scheduled row moved this many months later and `renewal_date` advanced by the same amount |
| `old_renewal_date` / `new_renewal_date` | before/after; `new` is always `old + months`, pinned to the 15th |
| `resume_due_date` | the first still-scheduled row's NEW `due_date` — the date charging actually resumes. **NULL when the plan had no scheduled rows left to move** (an annual plan mid-year, or a monthly year already fully collected); such a pause only extends the year |
| `rows_shifted` | how many `kind='membership'` `status='scheduled'` rows moved. 0 for the NULL-resume case |
| `created_by` | email of the superadmin who applied it |

**Pauses STACK.** Applying a second pause simply re-runs the same shift against the already-shifted
schedule and writes a second audit row — verified live with a 3-month pause followed by a 2-month
one. Gotcha **#332**.

## Related config

- `pipeline_sandbox_config` row `MEMBER_MEMBERSHIP` (SANDBOX as of 2026-07-13). **Gained `stripe_account` 2026-09-11** (`'vfos'` default, `CHECK IN ('vfos','ert')`) — it decides which Stripe account a NEW membership customer is minted on, and **nothing else**. Flipped **by SQL, never from the UI**; `SandboxModeToggle.jsx` renders it as a read-only `Stripe: VFO Services` / `Stripe: ERT` pill. **Flipped to `'ert'` (with `sandbox_mode=false`) on 2026-09-11 ~16:10Z — so every NEW membership customer mints on ERT, while every EXISTING plan keeps its `'vfos'` stamp and charges on VFO Services until `membership_stripe_remap` moves it.**
- `email_templates` pipeline `MEMBER_MEMBERSHIP_FEES`: `MEMBERSHIP_setup_link` (**id 190**)
  and `MEMBERSHIP_transfer_setup_link` (**id 191**) — **both flipped to SEND mode 2026-08-03,
  so they auto-send with no admin review** (gotcha #325); `MEMBERSHIP_payment_failed` and the
  other 8 rows in this pipeline stay Draft. The two setup-link rows also had their Tracy/Tray
  Cc moved to `@vfo-services.com` and their Bcc stripped to `jlatham@elitert.com` only.
  **A THIRD setup-link row was added 2026-08-10 (v714):
  `MEMBERSHIP_transfer_setup_link|annual` (id 215)** — the ANNUAL-transfer variant, seeded
  **SEND mode** with recipients cloned from id 191 (To `["RECIPIENT"]`, Cc `tnmiller@` +
  `tvaldes@vfo-services.com`, Bcc `jlatham@elitert.com`). Tokens: `[First Name]` `[Amount]`
  `[Cadence]` `[Renewal Date]` `[PAYMENT_LINK]` — deliberately NOT `[Setup Amount]` /
  `[Setup Note]` / `[Remaining Payments]`, since nothing is collected at an annual transfer's
  link. Id 191 also gained an "assumes you set up today" paragraph the same day (gotcha #349).
  Migration `20260810100000_membership_transfer_setup_link_annual.sql`. See gotcha #351.
  **A FOURTH setup-link row was added 2026-08-21 (v776):
  `MEMBERSHIP_transfer_setup_link|monthly-saveonly` (id 229)** — the variant for a monthly transfer
  that carries an admin-entered `charge_day`, whose link collects nothing. Subject *"We're moving
  your ERT Membership billing over"*. **Seeded DRAFT (`send_mode=false`) on purpose, unlike its two
  send-mode siblings 191/215** — for a member who is BEHIND, the human review of that draft is their
  only advance warning that the first charge will cover several months, so
  **`send_mode=true` is still exactly ELEVEN rows system-wide** (#325 unchanged). Extra tokens
  beyond the shared set: `[Charge Day]` (ordinal), `[Last Charge Date]`, `[First Charge Amount]`,
  `[Catch Up Note]` — all computed by `transferDaySchedule()`, never re-derived in the emailer.
  Seeded by MCP SQL, **no migration file** (data-only, no DDL). A missing row degrades gracefully:
  `membership_send_setup_link` returns 200 + `email_skipped` and the link still works.
  **Two rows added 2026-08-04**, both **Draft** (`send_mode=false`), To `["RECIPIENT"]`,
  Cc `tvaldes@` + `rhopson@`, Bcc `aanderson@` + `platham@`:
  **`MEMBERSHIP_renewal_notice` (id 212)** — subject *"Your ERT Membership renewal — [Renewal
  Date]"*, tokens `[First Name]` `[Renewal Date]` `[Renewal Terms]` `[MEETING_LINK]`; and
  **`MEMBERSHIP_cancel_confirmation` (id 213)** — subject *"Your ERT Membership — Cancellation
  Confirmation"*. Bodies end *"Kind regards,"* with **no team name** — `VFO_SIGNATURE` appends the
  team line (*"VFO Services - Proactive Coordinator Team"* since 2026-08-20; it was the two-paragraph
  AI-PC block before that). **Draft mode means a human still has to send the renewal notice out of Gmail
  Drafts every night the sweep drafts one** — that is the standing operational cost of this
  feature until someone flips it (gotcha #333, and #325 on the blast radius of flipping).
- `notification_rules` keys `MEMBERSHIP_charge_failed` and — **added 2026-08-04** —
  `MEMBERSHIP_renewal_meeting_requested` (area "Membership Fees", `kind='bell'`,
  **`action_required=true`**, `recipients` NULL so the `default_recipients`
  `["rhopson@elitert.com"]` is what fires until an admin edits it in Automation → Notification
  Editor, #176).
- pg_cron jobid 16 `membership-sweep-daily` @12:00 UTC — **five passes as of 2026-08-04**
  (renewal notices → renewals → waive → charges → auto-unsuspend). **Pass 4 also releases the
  member's held revenue-share payouts when the unsuspend leaves no hold reason at all
  (2026-08-24); summary gains `payouts_released`.**
