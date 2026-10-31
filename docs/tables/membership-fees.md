# Tables — Member Membership Fees

> Added 2026-07-13 (`20260713090000_member_payment_plans` + follow-ups `…110000`, `…120000`,
> `…140000`); two further tables added 2026-08-04
> (`20260804120000_membership_renewal_meetings.sql` + `20260804140000_membership_pause.sql`).
> **All FOUR tables RLS deny-all (anon probe `*/0`, re-verified on both new tables at creation).**
> All access via the service-role edge function. Flow:
> [flows/membership-fees.md](../flows/membership-fees.md).
> **A FIFTH table, `money_mapping_ledger`, added 2026-10-30** (`20261030170000_money_mapping_ledger.sql`,
> deny-all in the same migration, anon probe `*/0`) — documented at the bottom of this file;
> flow [flows/money-mapping.md](../flows/money-mapping.md).

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
| `renewal_date` | a 15th on every portal-billed plan; derived at first payment (pay days 1–14: last 15th strictly before pay+12mo; day 15 & after-the-15th: the 15th exactly 12mo out — gotcha #235) or admin-entered for transfers; advanced +12mo at each renewal. **Exception: a `tracking_only` plan keeps ANY day** (admin-entered; the renewal pass advances it with `addYears`, not onto a 15th) |
| `auto_renew` | default true |
| `transfer` | mid-year move from the old billing (bills only until the entered renewal) |
| `tracking_only` | boolean, default false. Added 2026-10-21 (`20261021120000_membership_tracking_only.sql`). **Billed on the OLD system and only TRACKED here** — Set Up Membership → *Track billing on old system*, written once by `membership_tracking_plan_save`: created **`active`** with this year's rows already inserted (never `setup_pending`), no Stripe customer / method / token ever, `charge_day` set (annual = 15). Every row status is HAND-SET by `membership_tracking_row_save` (the only writer that accepts such a plan; it refuses every ordinary plan's rows); a hand-set Missed / Declined (amount > 0) flips `members.membership_arrears` on, any other status runs `clearMembershipArrearsIfCaughtUp`. Refused by `send_setup_link`, `pause`, `send_reminder`, a terminate FEE; skipped by the sweep's notice pass (0) and charge pass (3, before the mode guard); `next_year_save` sends no email. Renewal (pass 1), waive (pass 2) and arrears-clear (pass 4) still run. Paid rows carry `payment_method_type='old_system'` and `paid_at` = the date entered (default the due date) at 12:00 UTC |
| `paid_with_gc` / `gc_credits` / `gc_payer_member_number` | Added 2026-10-21 (`20261022120000_membership_gc_paid.sql`). **A `Corporate Member`'s annual membership paid in Growth Credits** — Set Up Membership → *Brand new membership* → **GC**, written once by `membership_gc_plan_save`: created **`active`**, annual, every $ column 0, one **`paid`** row a year (`amount_due` 0, `payment_method_type='growth_credits'`). `gc_credits` (numeric(10,2), quarters) is taken from `gc_payer_member_number` — the member or their lead — at creation and again by the sweep's renewal pass each year (short → no renewal + `MEMBERSHIP_gc_renewal_short`, retried nightly). Never charged on Stripe; refused by `send_setup_link`, `pause`, `send_reminder`, `next_year_save` and a terminate FEE; skipped by the charge pass (3) and the $ renewal notice (pass 0 sends `MEMBERSHIP_gc_renewal_notice` instead); left off the global Payments page. `tracking_only` stays false |
| `status` | `setup_pending` → `active` → `canceled` \| `terminated` |
| `stripe_customer_id` / `default_payment_method_id` / `payment_method_type` / `acct_last4` | charge rails (`ach`/`card`) |
| `setup_token` / `setup_email_sent_at` | the /membership-pay link (doubles as the update-method link once active) |
| `setup_reminder_sent_at` / `setup_stalled_notified_at` | **2026-09-15**, migration `20260915170000`. One-shot guards for the setup-link reminder ladder (pass 5 of the daily sweep, `utils/membership-setup-reminder.ts`): the reminder email 2 business days after `setup_email_sent_at` on a `setup_pending` plan, then the dismissible Tray FYI 2 business days after the REMINDER. NULL = not yet; each tier's query requires NULL so it can never repeat. Neither tier touches `setup_token` / `setup_email_sent_at` / `setup_link_expires_at` |
| `setup_link_expires_at` | update-method links (ACTIVE plans only) expire 30 days after last emailed; re-stamped by every link emailer + activation; NULL/past = expired (gotcha #241) |
| `next_year_amount` / `next_year_credit_note` | admin-editable renewal terms, consumed + cleared by the renewal pass |
| `next_year_member_type` | text, nullable. Added 2026-09-16 (`20260916130000_membership_next_year_member_type.sql`). **The member type the plan renews INTO** — set beside the two amounts by `membership_next_year_save` (trimmed, > 80 chars → 400). The renewal pass writes it to `members.member_type` **+ a `member_type_history` row** (`changed_by='membership-renewal-sweep'`) **only when it differs**, then clears it with the other two. **NULL = keep the current type.** Nothing about the money reads it — the renewal charge is tier-blind. |
| `termination_fee` / `terminated_at` | set by `membership_terminate` |
| `prior_payments_made` | transfers only: payments already collected this year under the OLD billing. Admin-entered on the transfer form (0–11) because the system holds no record of them; printed on the catch-up invoice. **REQUIRED on MONTHLY transfers as of 2026-07-31 / v691** (`plan-save.ts` 400s with *"Enter how many payments they already made this year (0-11)"*) — it is now the ONLY schedule input the admin gives; still optional on annual transfers. NULL falls back to `(12 − remaining)` (gotcha #280) |
| `remaining_payments` | **NEW 2026-07-31** (`20260731150000_membership_remaining_payments.sql`, additive nullable integer). Monthly transfers only: charges left this membership year, **INCLUDING** the one taken at the setup link. **DERIVED server-side at plan save as `12 − prior_payments_made` — never admin-entered**, written unconditionally (so editing a plan away from monthly/transfer clears it) and any client-supplied value is ignored. NULL for new plans, annual plans, and legacy pending transfers saved before the column existed — on those, `transferLinkPulls()` falls back to the renewal-date-derived slot count, which is exactly the pre-v691 behaviour. Drives `pullsAtLink = 1 + max(0, remaining − slots)` (the arrears catch-up) and the per-pull credit spread. Gotchas #315/#316 |
| `renewal_notice_for` | **NEW 2026-08-04** (`20260804120000`). The `renewal_date` the 30-day advance renewal notice was last emailed FOR — the once-per-renewal idempotency stamp for the sweep's pass 0. **Written ONLY after a successful Gmail draft**, so a template/Gmail failure retries tomorrow instead of silently swallowing the notice. The pass re-notices whenever this `<> renewal_date`, which means it **re-arms automatically** when the renewal date moves — including after a **pause** (`membership_pause` deliberately leaves this stale so the member is warned again for the new date). NULL = never noticed. Gotchas #332/#333 |
| `renewal_meeting_token` | **NEW 2026-08-04** (`20260804120000`). Durable 64-hex `token32()` behind the `/membership-meeting?token=` button in the renewal notice email. **Minted once per plan and reused by every subsequent notice**, and **persisted BEFORE the email is drafted** so a sent link always resolves. Partial unique index `member_payment_plans_renewal_meeting_token_key WHERE renewal_meeting_token is not null` — the token is the ENTIRE credential for the PUBLIC `membership_renewal_meeting_request`, so it must resolve to exactly one plan (#333) |
| `sandbox` | Stripe mode the customer was created in (key selection follows this, not the live toggle) |
| `stripe_account` | **NEW 2026-09-11** (`20260911120000_second_stripe_account.sql`, additive nullable `text`, named CHECK `member_payment_plans_stripe_account_check IN ('vfos','ert')`). **Which Stripe account this plan's customer and saved payment method live on. NULL = legacy = `'vfos'` (VFO Services).** The pair `(stripe_account, sandbox)` selects the secret key for **every** later charge — `getStripeKeyFor(normalizeStripeAccount(plan.stripe_account), !!plan.sandbox)` — in `setup-checkout.ts`, `sweep.ts` and `terminate.ts`. **`pipeline_sandbox_config.stripe_account` decides only where a NEW customer is MINTED; this column governs everything afterwards**, because a Stripe customer id is valid on exactly one account. **Written on the minting pass only** — `send-setup-link.ts` sets it in the same update that writes `stripe_customer_id`, and reuses the existing stamp when a customer is already there (so a `setup_pending` plan re-minted after a mode flip also follows the config, and is re-stamped in that same write). **NO charge path ever re-stamps it.** The ONE writer that does is the superadmin action **`membership_stripe_remap`**, and only after Stripe's own customer copy, behind a guarded `where stripe_account is null or = 'vfos'` update. **Backfill: `'vfos'` onto every row with a non-NULL `stripe_customer_id` — 37 plans.** Rows with no customer yet stay NULL so a later phase mints them on whichever account the config then names. **CURRENT VALUE (2026-09-11, after the remap): all 37 of those rows read `'ert'` — 13 `active` + 24 `setup_pending` — and NONE reads `'vfos'`.** Gotcha **#485**; flow: [../flows/membership-fees.md](../flows/membership-fees.md) |
| `tier1_monthly` | boolean NOT NULL default false. Added 2026-10-30 (`20261030150000_tier1_membership_phase3.sql`, portal licensing L6b). **A month-to-month VFO Associate / Financial Collaborator plan made at Create** by `createTier1MembershipPlan` — card fee by the stamp (not `advisor_model`), no renewal notice / next-year terms / termination fee / pause, rolls on at the same price, ends only through `membership_end_with_notice`. Every Tier 1 rule keys on this column, never on the member type alone (the pre-L6b FC / Associate members carry the same types and are not billed here). [../flows/membership-fees.md](../flows/membership-fees.md) *VFO Associate / Financial Collaborator plans* |
| `paid_by_member_number` | text, nullable. Added 2026-10-30 (`20261030150000`). The connected advisor who pays a connected VFO Associate's $25 (emails To them, the Associate Cc'd); NULL = the member pays. Copied from `accountant_onboarding.licence_paid_by` + `cc_advisor_member_number` at Create; never written by a public page |
| `ending_on` | date, nullable. Added 2026-10-30 (`20261030150000`). Written ONCE by End membership (today ET + 30 days, also `auto_renew=false`): rows due after it are `canceled`; sweep pass 3b terminates the plan once it has passed |
| `onboarding_ref` | text, nullable, partial UNIQUE index `member_payment_plans_onboarding_ref_key`. Added 2026-10-30 (`20261030150000`). `<pipeline>:<onboarding id>` the plan was made from — Create's idempotency key |
| `pay_with_mm` | boolean, default false, **nullable on purpose** (a multi-row insert fills a missing key with NULL, #215 — every reader treats NULL as false). Added 2026-10-30 (`20261030170000`). **Pay each due row from the member's Money Mapping balance first**; the card / bank pays the rest. Written by `membership_plan_save` only when the form sends it (the create form's *Pay from Money Mapping first?* No / Yes) and by `membership_mm_set` (the plan card's toggle). Refused on `tracking_only`, `paid_with_gc` and `tier1_monthly` plans (`mmRefusalFor`). A `pay_with_mm` plan may be `active` with NO `default_payment_method_id` (started on its balance at creation) — the sweep, the reminder ladder (`AWAITING_METHOD`) and the setup-link expiry gate all allow for it *(v: 2026-10-31)* |

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
| `paid_at` / `payment_method_type` / `acct_last4` / `failure_reason` | `payment_method_type` adds **`'money_mapping'`** (2026-10-30): the row was paid IN FULL from the Money Mapping balance — no PaymentIntent, `all_payments_load` skips it (no money came in), the panel tints it the stronger yellow |
| `mm_applied` | numeric(12,2), default 0, nullable (NULL = 0). Added 2026-10-30 (`20261030170000`). **The part of this row paid from the Money Mapping balance.** `amount_due` is then only what is left for the card / bank, so the row's FACE value is `amount_due + mm_applied` — `monthsCoveredByRow`, the receipt lines / totals / next amount and the panel all read the face value. Only writer: `money_mapping_apply_to_row` *(v: 2026-10-31)* |
| `year_start` / `year_end` | the membership year this row belongs to, stamped at BOTH insert sites (activation + renewal pass). Rows sharing a `year_start` are one year; the earliest `due_date` in the group is the opener that earns an INVOICE. Needed because the renewal pass advances `plan.renewal_date` but leaves `start_date` alone (gotcha #280) |
| `invoice_number` / `receipt_number` | `INV-<member#>-NNNN` / `REC-<member#>-NNNN`, allocated via `document_numbers.member_payment_plan_id`. The invoice number lives on the year's opening row only |
| `invoice_vault_path` / `receipt_vault_path` | object paths in the `member-ert-docs` ERT vault bucket (NOT Google Drive) |
| `docs_emailed_at` | set once the invoice/receipt email is drafted — the idempotency guard against Stripe event redelivery |
| `card_processing_fee` | the fee Stripe ACTUALLY charged (`amount_received` − base), stamped at settle time in both webhook branches. A combined catch-up charge stamps the SAME total on every row it covered — read it from the primary row, never sum it (gotcha #281) |
| `reminder_sent_at` | guard so the failed-payment email drafts once per missed row |
| `vfo_portal_licence_amount` | numeric, nullable. Added 2026-10-30 (`20261030150000`, decision 95). The $25 VFO Portal licence part of a Tier 1 month (every row of a `tier1_monthly` plan); what the licence transfer moves |
| `paid_on_onboarding` | boolean NOT NULL default false. Added 2026-10-30 (`20261030150000`, decision 101). Month 1, paid on the onboarding row with its `INV-ACC` / `INV-ADV` documents — recorded here only, not a second ledger payment. **A multi-row insert must name it on every row** (#215 — the first L6b plan insert failed on it) |
| `vfos_licence_transfer_status` / `_id` / `_sent_at` / `_failed_at` | Added 2026-10-30 (`20261030160000`). The $25 transfer ERT → VFO Services for this paid month; only writer `utils/tier1-licence-transfer.ts`. Bare text: NULL (not tried) \| `awaiting_link` (no `VFOS_CONNECT_ACCOUNT_ID[_SANDBOX]` — retried, no bell) \| `failed` (belled `TIER1_licence_transfer_failed`, retried nightly, idempotency key rotated off `_failed_at`) \| `sent` (terminal). A refund does not touch it |

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

- `pipeline_sandbox_config` row `MEMBER_MEMBERSHIP` (SANDBOX as of 2026-07-13). **Gained `stripe_account` 2026-09-11** (`'vfos'` default, `CHECK IN ('vfos','ert')`) — it decides which Stripe account a NEW membership customer is minted on, and **nothing else**. Flipped **by SQL, never from the UI**; `SandboxModeToggle.jsx` renders it as a read-only `Stripe: VFO Services` / `Stripe: ERT` pill. **Flipped to `'ert'` (with `sandbox_mode=false`) on 2026-09-11 ~16:10Z, and `membership_stripe_remap` then moved all 37 existing plans the same day — so BOTH new and existing membership money is now on ERT (0 plans left on `'vfos'`).**
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
  Editor, #176). **Added 2026-09-23:** `MEMBERSHIP_arrears_suspension_lifted` (area "Membership Fees",
  `kind='bell'`, FYI — `action_required=false`, `default_recipients` `["jlatham@elitert.com"]`;
  migration `20260923120000_membership_arrears_suspension_lifted_rule.sql`) — raised when an arrears
  clear switches a member's `suspended` flag off. **Added 2026-10-21:** `MEMBERSHIP_gc_renewal_short`
  (area "Membership Fees", `kind='bell'`, FYI, `default_recipients` `["tvaldes@elitert.com"]`, deduped
  while unread; migration `20261022120000_membership_gc_paid.sql`) — a Growth Credit plan's renewal
  found the paying account short; nothing taken, retried nightly.
- **Two Growth Credit templates (2026-10-21, same migration, both Draft):**
  **`MEMBERSHIP_gc_confirmation`** — *"Your ERT Membership is confirmed - paid with Growth Credits"*,
  To the corporate member + their lead (`RECIPIENT` as an array), Cc `tvaldes@`, Bcc `platham@` +
  `aanderson@`; tokens `[Member First]` `[Lead First]` `[Member Name]` `[Credits]` `[Payer Name]`
  `[Balance After]` `[Start Date]` `[Renewal Date]`. **`MEMBERSHIP_gc_renewal_notice`** — 212's subject
  and style, To the same two, Cc `tvaldes@` + `rhopson@`, Bcc `aanderson@` + `platham@`; tokens
  `[Member First]` `[Lead First]` `[Member Name]` `[Renewal Date]` `[Credits]` `[Payer Name]`; no
  meeting button (*reply all to cancel*). Both drafted by `utils/membership-gc.ts draftGcMembershipEmail`
  (a member with no lead is greeted alone).
- pg_cron jobid 16 `membership-sweep-daily` @13:30 UTC — **five passes as of 2026-08-04**
  (renewal notices → renewals → waive → charges → clear `members.membership_arrears`). **Pass 4 runs
  the shared `clearMembershipArrearsIfCaughtUp` once per member (all active plans counted), which also
  lifts a `suspended` flag (2026-09-23) and releases the member's held revenue-share payouts when the
  clear leaves no hold reason at all; summary carries `arrears_cleared`, `suspensions_lifted`,
  `payouts_released`.**
- pg_cron jobid 19 `membership-arrears-digest-weekly` @13:00 UTC Fridays (2026-09-15) —
  `automation_MEMBERSHIP_arrears_digest`, a read-only Gmail draft to platham@ of every member whose
  active plan carries missed/declined rows.
- **A `missed`/`declined` row can also be booked by the member at `/membership-pay` (2026-09-15):**
  the Checkout SESSION carries `payment_kind=membership_arrears_payment` + `row_ids`, the PI carries
  `payment_kind=membership_pull`; `utils/membership-arrears-payment.ts` flips the rows `paid`/`processing`
  with the PI id and stamps `card_processing_fee` — the same columns a sweep pull writes.

## money_mapping_ledger

> **NEW 2026-10-30** (`20261030170000_money_mapping_ledger.sql`). RLS deny-all in the SAME
> migration (`"Deny all access" … using (false)`), anon probe `Content-Range: */0`, advisor GREEN at
> the exact baseline. Read / written only by the service-role edge function. Flow:
> [flows/money-mapping.md](../flows/money-mapping.md). *(v: 2026-10-31)*

A member's **Money Mapping balance = `sum(amount)` of their rows.** Three row types:

| Column | Notes |
|---|---|
| `id` | bigserial PK |
| `member_number` | text NOT NULL. Index `money_mapping_ledger_member_idx (member_number, created_at)` |
| `entry_type` | CHECK `earned` \| `adjustment` \| `membership`. **earned** = one settled Money Mapping revenue-share leg (MAP 1 / Tax / PIP / SpecRev), written by `syncMoneyMappingEarnings` (`utils/money-mapping.ts`); **adjustment** = an admin's add / deduct on Accounting → Members → Money Mapping (`money_mapping_adjust`), with a reason; **membership** = money spent on a membership row (negative), written ONLY by `money_mapping_apply_to_row` |
| `amount` | numeric(12,2) NOT NULL, CHECK `<> 0`. Positive = in, negative = spent / deducted. Frozen at write (an earned leg is never re-priced) |
| `description` | earned: `MAP 1 - <client> - payment i of n`, `Tax Planning - <client> - Retainer`, `PIP Meetings - <client>`, `VFO Specialist Revenue - request #N`; adjustment: the reason (a `set_total` one reads `Balance set to $X - <reason>`); membership: `ERT Membership - <period_label>` |
| `source_key` | text **UNIQUE** — the write-once key. earned: `map1:<pipeline_map1.id>:p<n>` / `tax:<plan>:<retainer\|implementation>` / `pip:<track>` / `specrev:<line>`; membership: `membership-row-<row>-<cents of mm_applied before>`; adjustment: NULL |
| `source_pipeline` / `client_id` / `earned_at` | earned rows: `MAP 1` / `Tax` / `PIP` / `Specialist Revenue`, the client (NULL for SpecRev), when the leg settled |
| `plan_id` / `schedule_row_id` | membership rows: the plan + `member_payment_schedule` row paid |
| `sandbox` | membership rows: the plan's `sandbox` (picks the Stripe key + ERT account for the transfer) |
| `created_by` | the admin's NAME (`gcActorFor`, never an email — #577), `System` for earned rows, the actor passed to the RPC (`Membership sweep` / the admin) for membership rows |
| `created_at` | default now() |
| `ert_transfer_status` / `ert_transfer_id` / `ert_transfer_sent_at` / `ert_transfer_failed_at` | **membership rows only** — the VFO Services → ERT transfer of the money spent (sweep pass 3d, `utils/money-mapping-transfer.ts` is the only writer). Bare text: NULL (not tried) \| `failed` (not configured / ERT cannot receive / Stripe 4xx — belled `MONEY_MAPPING_ert_transfer_failed`, retried nightly, idempotency key rotated off `_failed_at`) \| `sent` (terminal). Index `money_mapping_ledger_transfer_idx (entry_type, ert_transfer_status)` |

**`money_mapping_apply_to_row(p_row_id bigint, p_actor text default 'Membership sweep')`** returns
`(applied, amount_due_after, status_after, balance_after)`. plpgsql, **SECURITY INVOKER**,
`search_path = public, pg_temp`; EXECUTE revoked from `public` / `anon` / `authenticated`, granted
to `service_role`. One transaction: locks the row (`for update`) and the member
(`pg_advisory_xact_lock(hashtext('money_mapping:' || member_number))`), refuses anything but a
`kind='membership'` row in `scheduled` / `missed` / `declined` with `amount_due > 0` on a
`pay_with_mm` plan, spends `least(max(balance, 0), amount_due)` (so a balance never goes below 0),
inserts the `membership` ledger row and writes the schedule row: `amount_due` lowered,
`mm_applied` raised, and when nothing is left `status='paid'`, `paid_at=now()`,
`payment_method_type='money_mapping'`, `failure_reason=NULL`. Called through
`applyMoneyMappingToRow` (`utils/money-mapping.ts`), which returns `null` on a database error.
