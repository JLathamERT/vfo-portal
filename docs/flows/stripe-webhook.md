# Stripe webhook flow

What happens when Stripe tells the system that a payment occurred. The Stripe webhook handles **two unrelated flows** at the same endpoint, disambiguated by Checkout Session metadata: MAP1 service payments and GC credit purchases.

## Trigger

Stripe POSTs an event to the admin-api endpoint with the `stripe-signature` HTTP header set:

```
POST https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api
Headers:
  stripe-signature: t=<timestamp>,v1=<HMAC-SHA256>
Body: <raw event JSON>
```

The Stripe webhook URL is configured **outside this codebase** in the Stripe Dashboard.

## Handler dispatch ([admin-api:222-441](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts))

Triggered by presence of the `stripe-signature` header. Always returns before reaching the action dispatcher.

### Step 0 — Signature verification ([lines 226-262](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts))

1. Reads BOTH `STRIPE_WEBHOOK_SECRET` and `STRIPE_WEBHOOK_SECRET_SANDBOX` env vars. At least one must be set (returns 500 otherwise).
2. Parses the `stripe-signature` header into `t` (timestamp) and `v1` (signature) parts.
3. Rejects if timestamp is older than **5 minutes** (replay guard).
4. Computes HMAC-SHA256 over `<timestamp>.<rawBody>` against EACH configured secret. Whichever matches wins — so a single endpoint can receive both live and sandbox webhooks.
5. Returns 401 if neither secret produces a matching signature.
6. Parses raw body as JSON. Returns 400 on parse failure.

### Step 1 — Dispatch by event type

The handler `if`-checks `event.type === "checkout.session.completed"` and `event.type === "payment_intent.succeeded"` (Branches A/B below). It ALSO handles a set of failure/lifecycle events (`payment_intent.payment_failed`, **`payment_intent.canceled`**, `checkout.session.async_payment_failed`, subscription/dispute/refund/transfer events — see [SESSION_REFERENCE.md](../SESSION_REFERENCE.md) "Failure-event handling"), including the v612 late-ACH off-session branches described in **Branch C** below, and **`payment_intent.processing`** (**Branch D**). All other event types are ignored (200 OK with `{received: true}`).

> **`payment_intent.processing` and `payment_intent.canceled` reach MAP 1 / Tax as of 2026-09-08 (v816).** Both were previously consumed for **SpecRev only**. They matter now because the `/pay` and `/tax-pay` ACH builders no longer pin `verification_method='instant'`, so a client can type their account and routing numbers and leave the PaymentIntent parked in `requires_action` — `processing` is the "bank verified, debit moving" signal and `canceled` is what micro-deposit expiry looks like. Both are already subscribed on the live and sandbox endpoints (they had to be, for SpecRev).

> **VERIFIED LIVE 2026-09-08 (test client 62, sandbox, all fixtures wiped afterwards).** **Tax retainer** — plan 185 ($3,500, `fee_process_version` 2026-08-25): manual bank entry → `retainer_status='processing'`, `retainer_bank_verification_pending_at` **20:41:28Z**, PI `pi_3UDVp5Rv8yMNbvOJ0lglNbxH`, last4 6789, function log `pi_status: requires_action`, bells **1882** (Jake) + **1883** (Tracy), and the `TAX_confirmationemail|ach_verify` Gmail draft read end to end (correct subject and body, *"$3,500.00"*, *"retainer"*). Micro-deposits then verified on Stripe's own hosted page → `retainer_status='succeeded'`, stamp back to **NULL**, invoice `INV-59524-001-0050` + receipt `REC-59524-001-0038` at 20:47Z. **Holistic P1** — `pipeline_map1` row 149 (Quarterly, net 5400, P1 $1,350): manual entry → `pay1_status='processing'`, stamp **20:51:41Z**, last4 6789, bells **1888** (Jake) + **1889** (Tracy), and the `CONTRACT_confirmationemail|ach_verify` draft read (Payment 1 of 4, Core Membership). The **Stripe page's bolded first sentence** was confirmed rendering bold. **Not proved:** Branch D (below), the final-retainer manual path, and the re-worded "client paid" bells — the pre-v817 bells (1884/1885/1890) fired with the OLD wording, which is exactly what v817 fixes.

---

## Branch A — `checkout.session.completed`

> **Multi-pipeline routing.** As of 2026-05-28 the handler cascades through FIVE pipeline lookups by `stripe_customer_id`: MAP1 (`pipeline_map1`) → Tax (`client_tax_plans`) → Advisor (`advisor_onboarding`) → **PIP Meetings** (`client_priority_tracks` WHERE `track_type='pip'`) → **Accountant** (`accountant_onboarding`). The PIP branch additionally gates `pi.metadata.pipeline === "PIP"` on the `payment_intent.succeeded` path for ACH-clearing. The Accountant branch gates `pi.metadata.pipeline === "ACCOUNTANT_ONBOARDING"` + `metadata.payment_kind === "onboarding"` and mirrors the advisor cascade shape (card path immediately chains `automation_ACCOUNTANT_confirmationemail` → `automation_ACCOUNTANT_invoicereceipt`; ACH waits for `payment_intent.succeeded`). **No revshare chain on accountant** — unchanged, but the REASON moved: accountant-created members DO carry a `revenue_decision` as of 2026-08-12 / v730 (`'Money Mapping'`, gotcha #375). The accountant branch simply never had a revshare leg; VFO holds the share internally. Do not "restore" one by reading the new column. See [pip-meetings.md](pip-meetings.md) and `ACCOUNTANT_ONBOARDING_RESUMPTION.md` for full routing detail.
>
> **2026-09-04 — the onboarding row now carries TWO collections on ONE Stripe customer, so the cascade is no longer sufficient by itself (#473).** The refundable Membership Deposit and the onboarding payment share the customer, so **every advisor/accountant branch splits on `payment_kind`**: `'onboarding_deposit'` | `'onboarding_balance'` | the original `'onboarding'`. The discriminator is read from the **session** metadata in `checkout.session.completed` (the PaymentIntent has not been fetched yet at the moment the branch is chosen) and from `pi.metadata` on both `payment_intent.*` events; the session creator sets it on **both**. The new deposit branch sits **ahead of** the old onboarding-payment block, and the old block keeps its own positive guard. `payment_intent.succeeded` with `'onboarding_deposit'` settles the deposit and, if the balance was parked `awaiting_deposit` by a countersign that arrived while the ACH was clearing, chains `automation_<P>_chargebalance`; with `'onboarding_balance'` it settles the balance and chains the invoice/receipt. Failures route to `handleOnboardingDepositFailure` / `handleOnboardingBalanceFailure`, and **the generic first-payment failure resolver now SKIPS both kinds** — it writes `payment_status`, which belongs to the onboarding payment and not to the deposit. Full flow: [advisor-accountant-onboarding.md](advisor-accountant-onboarding.md).

### Sub-branch A1 — GC credit purchase ([lines 270-288](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts))

**Trigger:** customer paid for a GC credit purchase (initiated via `gc_create_checkout`).

**Discriminant:** `session.metadata.member_number` and `session.metadata.credits` are both set.

**What it does:**
1. Reads existing `gc_balances.balance` for the member (or 0 if no row).
2. UPSERTs `gc_balances` with `balance = current + credits`.
3. INSERTs `gc_transactions` row: `type='purchased'`, `amount=<credits>`, `balance_after=<new balance>`, `description="<credits> credits purchased via Stripe"`.

**Tables read:** `gc_balances`.
**Tables written:** `gc_balances` (insert or update), `gc_transactions` (insert).
**Chains:** none.

### Sub-branch A2 — MAP1 first payment ([lines 290-392](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts))

**Trigger:** client paid the first MAP1 payment via `/pay`.

**Discriminant:** `session.customer` matches a `pipeline_map1.stripe_customer_id`. (Note: A1 and A2 are NOT mutually exclusive — the handler runs both blocks sequentially. The metadata-based GC check fails if no `member_number` is present, so it's a no-op for MAP1 payments. Vice versa, the customer-based MAP1 check fails if no `stripe_customer_id` matches, so it's a no-op for GC purchases.)

**What it does:**
1. Looks up `pipeline_map1` by `stripe_customer_id`. Bails if no row or `pay1_status` is already set (idempotent).
2. Reads `pipeline_sandbox_config` to pick live vs sandbox Stripe key.
3. Calls Stripe `GET /v1/payment_intents/<id>?expand[]=payment_method` to get:
   - `payment_method.type` → `'card'` or `'us_bank_account'`
   - `card.last4` or `us_bank_account.last4` → `acct_last4`
   - **`status`** *(2026-09-08, v816)* — `requires_action` on a non-card means the client typed their account and routing numbers, so Stripe is holding the PaymentIntent for micro-deposit verification and **no debit has been attempted**. `checkout.session.completed` on this path is a SUBMIT event, not a payment.
4. Computes `card_processing_fee = (amount_received_cents / 100) - baseAmount` (only for card; ACH has no fee).
5. UPDATEs `pipeline_map1`:
   - `pay1_status` = `'succeeded'` (card) or `'processing'` (ACH)
   - `payment_method_type`, `acct_last4`, `card_processing_fee`
   - `pay1_date` = today
   - For Quarterly plan: `pay2_date`, `pay3_date`, `pay4_date` = today + 91/182/273 days
   - **`pay1_bank_verification_pending_at`** = now when the PI is `requires_action` on a non-card, else an explicit **NULL** — the column is written on every pass of this branch, never left untouched
   - `confirmation_status='Confirmation Needed'`

   > **The status vocabulary did NOT gain a value — that is the whole design.** `pay1_status` still says `'processing'` while verification is pending, so every guard that ENUMERATES it (the `payment_intent.succeeded` settle, the late-ACH failure branches, the sweeps, the frontend status maps) keeps working untouched (**#371**). The sub-state lives in the nullable side-column. Migration `20260908120000_ach_bank_verification_pending_columns.sql`, no backfill — NULL correctly means "not awaiting verification".

6. **On the pending path only:** raises `MAP1_ach_bank_verification_pending` via `notifyByRule` — a dismissible FYI to Jake + Tim (`dedupe:"unread"`), titled *"Bank verification pending — «Client» (MAP 1 payment 1)"*, saying no money has moved, that Stripe cancels the payment after about 10 days, and that the Gmail draft is the verify-bank version. Nothing in the portal clears it: the client either verifies (Branch D) or Stripe cancels (Branch C), and both arrive as their own webhook.
7. **Chains** `automation_CONTRACT_confirmationemail` (always — both methods, deliberately). On the pending path that handler picks the **`CONTRACT_confirmationemail|ach_verify`** template instead of `|ach` and re-words its "client paid" PF bell — see [contract-and-payment.md](contract-and-payment.md) Step 11. That handler owns the "client paid" PF bell, the ERT vault agreement copy and Tracy's new-case email in addition to the email, so the gate lives INSIDE it: for a **card** first payment it skips the client Gmail draft and stamps `confirmation_status='Skipped - Card (Receipt Only)'` (no `confirmation_email_sent_at`); ACH gets the confirmation. See [contract-and-payment.md](contract-and-payment.md) Step 11.
8. **Chains** `automation_CONTRACT_invoicereceipt` for card only (ACH waits for `payment_intent.succeeded` to chain).
9. **Chains** `automation_CONTRACT_revshare` for card only (P1). As of 2026-07-01 (gotcha #164) the Tracy Revenue-Master cross-check was removed — this **pays the share immediately** on clear (amounts from the PF input form) and also transfers the 10% strategic-partner share when the connected member is a strategic member; the daily 02:00-UTC `_revshare_sweep` cron now only retries **failed** transfers.

**Tables read:** `pipeline_map1`, `pipeline_sandbox_config`.
**Tables written:** `pipeline_map1` (many columns).
**External calls:** Stripe `GET /v1/payment_intents`.
**Chains:** `automation_CONTRACT_confirmationemail`, `automation_CONTRACT_invoicereceipt` (card), `automation_CONTRACT_revshare` (card).

---

## Branch B — `payment_intent.succeeded`

[Lines 394-438](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)

**Trigger:** PaymentIntent moved to `succeeded` state. This fires:
- After ACH bank-debit clears (typically 2-4 business days after `checkout.session.completed`)
- For each subsequent quarterly payment (2, 3, 4) when charged off-session

### Sub-branch B1 — Quarterly subsequent payment

**Discriminant:** `pi.metadata.payment_number` ∈ {2, 3, 4}.

**What it does:**
1. Looks up `pipeline_map1` by `stripe_customer_id` (the `.select()` includes `rec2_email_sent, rec3_email_sent, rec4_email_sent` for step 3's guard, and — since 2026-08-26 — `pay2_status, pay3_status, pay4_status` for step 2's).
2. Reads `pay${n}_status` **before** overwriting it, then UPDATEs `pay${n}_status='succeeded'` + `pay${n}_paid_at`.
3. **Chains** `automation_CONTRACT_invoicereceipt` for that payment number — **SKIPPED (with a log line) when `rec${n}_email_sent` is already `true`.**
4. **Chains** `automation_CONTRACT_revshare` for that payment number (guarded independently by `contract-revshare.ts`'s own `isResolved` check).

> **CANCELLED-COLLECTED HARDENING (2026-08-26, v789).** A superadmin can close a MAP 1 installment from the client Payments tab — `pay{N}_status='cancelled'`, see [contract-and-payment.md](contract-and-payment.md) Step 10¾ — and money can still land on it: the charge was raised (by the sweep or a `/pay` link) **before** the cancel wrote, or Stripe **redelivers** this event afterwards (**#327** — there is still no event-id dedupe here). **The branch does NOT skip.** The money really moved, so the row must still say `succeeded` and the receipt + revshare chains must still run — a silent skip would leave a collected payment with no receipt and an unpaid member share. What the branch adds is the **action-required bell `FAILURE_map1_cancelled_installment_collected`** (`notifyJakeFailure`, `actionRequired: true`, `notification_rules` row seeded live, to Jake, link `/admin/client/<id>?tab=payments`), whose body says the installment was recorded as succeeded and the chains ran, and asks whether the client is owed a **refund** — because somebody had deliberately decided this money was written off. `pay{N}_status='cancelled'` is the ONLY discriminant; the pre-write read in step 1/2 is what makes it observable.

> **⚠️ THIS WEBHOOK CAN BE DELIVERED TWICE AND ONLY THIS ONE BRANCH IS LATCHED (2026-08-04, gotcha #327).** The router acks Stripe only after `await`ing the whole chain, and the receipt chain (PDF → Drive upload → Gmail draft) can exceed Stripe's ~30s timeout; Stripe then **redelivers the identical event**, and `router/webhooks.ts` keeps **no event-id dedupe**. Live consequence: two identical Gmail receipt drafts for one $1,050 MAP 1 installment, **sharing one receipt number** — while the revshare chain fired once, because it had a guard. Step 3's `rec{N}_email_sent` check was added in response. It does **not** cover two deliveries overlapping in flight, and **no other branch on this page is protected** — B2 (ACH first payment), the tax / advisor / accountant / PIP / specialist branches all remain able to double-fire. The systemic fix (ack immediately + `EdgeRuntime.waitUntil`) is **not built**. Adding any new chained side effect here means adding its own latch first; note a reused `rec{N}_number` is **not** one (#328).

> **Two sources now stamp `metadata.payment_number` (2026-08-21, v773).** The nightly sweep below is the automatic one; the **client-driven `/pay` page is the other** — `automation_CONTRACT_stripecheckout` resolves the open installment and stamps `payment_intent_data.metadata.payment_number=N`, so a client paying a failed P2–P4 from the emailed link lands in **this** branch rather than being mis-booked as payment 1. The `checkout.session.completed` MAP 1 branch self-skips such a session on its `if (pipeRow && !pipeRow.pay1_status)` guard, so the two never collide. See [contract-and-payment.md](contract-and-payment.md) Step 10⅓.
>
> **How payments 2-4 are created:** `automation_CONTRACT_chargescheduled_sweep` (PUBLIC, service-role gated) is invoked by a daily `pg_cron` job at 03:00 UTC. It scans `pipeline_map1` for due-but-unpaid quarterly payments, lists saved payment methods on the Stripe customer, and POSTs to `/v1/payment_intents` with `confirm=true off_session=true metadata.payment_number=N` and a **LOGICAL, date-less** `Idempotency-Key: chargescheduled-{client_id}-P{N}` (v612 — the old date suffix let a lost post-charge status write double-charge; gotcha #228). The resulting `payment_intent.succeeded` is what this webhook branch handles. See [contract-and-payment.md](contract-and-payment.md) Step 10½ and [05-api-action-catalog.md](../architecture/05-api-action-catalog.md#public-token-automation-public_handlers-in-routerdispatchts).

### Sub-branch B2 — ACH first-payment cleared

**Discriminant:** No `payment_number` metadata, AND `pipeRow.pay1_status === 'processing'` (i.e., this is the ACH bank-debit clearing).

**What it does:**
1. UPDATEs `pay1_status='succeeded'` **and NULLs `pay1_bank_verification_pending_at`** (belt-and-braces — Branch D normally clears it at `payment_intent.processing`, but a bank that goes straight to `succeeded` never emits that event; this is the path that actually fired in the 2026-09-08 sandbox test).
2. **Chains** `automation_CONTRACT_invoicereceipt` for payment 1.
3. **Chains** `automation_CONTRACT_revshare` for payment 1.

### Sub-branch B3 — TAX final retainer settled *(added 2026-08-25, 3-payment plans)*

**Discriminant:** `pi.metadata.payment_kind === 'final_retainer'`, row from `client_tax_plans` by `stripe_customer_id`. Card arrives here immediately after the off-session charge; ACH days later.

**Latched on `final_retainer_confirmation_status IS NULL`** — and that single latch is all that protects a receipt PDF, a Gmail draft **and a real Connect transfer** from a redelivery (**#327**).

**What it does:**
1. Expands the PaymentIntent's payment method; derives the fee from **`final_retainer_amount`, NOT `retainer_amount`** — the full retainer is initial + final, so grossing against it writes a large NEGATIVE fee. The same bug existed on the initial-retainer branch in `checkout.session.completed` (which now derives its base from `initial_retainer_amount` on a 3-payment plan) and both were fixed in one change. **It writes that fee to `final_retainer_card_fee`, its OWN column (2026-08-26, v792)** — `card_processing_fee` belongs to the FIRST retainer payment for the life of the plan and is never touched here; the implementation branch below owns `implementation_card_fee` the same way (**#450**).
2. UPDATEs `final_retainer_status='succeeded'` + `final_retainer_confirmation_status='Confirmation Needed'`, **NULLs `final_retainer_bank_verification_pending_at`**, and **re-states** the PI id and charge date, because on the fresh-link recovery path Stripe can deliver `payment_intent.succeeded` *before* `checkout.session.completed`.
3. **Chains** `automation_TAX_final_retainer_receipt` (which also issues a fresh amended invoice when `fee_amended_at_tax4` is set).
4. **Chains** `automation_TAX_revshare` with `payment_kind='retainer'` — the **deferred** retainer revenue share, paid on the FULL `retainer_amount`.
5. Mints the "Complete Client decision 2" bell, but only after a `'Continue - Revenue Share'` decision — matching the 2-payment condition exactly.

See [tax-fee-process.md](tax-fee-process.md) for why the revshare is deferred and which gate actually holds it (**#441**).

> **A final retainer can also arrive through Branch A.** If the off-session charge failed and the client paid through a fresh `/tax-pay` link, `checkout.session.completed` books it off `session.metadata.payment_kind === 'final_retainer'` (card → `succeeded` + chain the receipt; ACH → `processing`, chains nothing). That block deliberately does **not** set `final_retainer_confirmation_status` — this branch owns the latch. **Since 2026-09-08 it also reads the fetched PaymentIntent's `status`** and, on a non-card `requires_action`, stamps `final_retainer_bank_verification_pending_at` + raises `TAX_ach_bank_verification_pending` (title *"Bank verification pending — «Client» (Tax final retainer)"*). No confirmation email exists on this path, so — unlike the retainer — there is no template swap; the bell is the whole signal.

---

## Branch C — `payment_intent.payment_failed` **and `payment_intent.canceled`** (late-ACH off-session, v612; canceled widened 2026-09-08)

An off-session charge (a swept quarterly installment or a Tax implementation charge) paid by **ACH** returns `processing` at creation and can **bounce days later**. The old blanket rationale ("payment_intent.payment_failed skips off-session installments because the sweeps alert synchronously") is CARD-ONLY; the late ACH failure was being dropped, stranding the row in `processing` forever. v612 adds two additive branches, each keyed on a `'processing'` status guard so a card sync-decline the sweep already handled is not double-alerted (gotcha #229):

- **MAP1 installment** — `metadata.payment_number` ∈ {2,3,4}, row by `stripe_customer_id`, acts ONLY when `pay{N}_status === 'processing'`: flips it to `declined` + `notifyByRule MAP1_installment_charge_failed` + `notifyJakeFailure FAILURE_map1_installment_charge` + drafts the client `/pay` email via the shared `utils/map1-installment-failure.ts` (bell text conditional on `checkout_token`).
- **TAX implementation** — `metadata.payment_kind === 'implementation'`, acts ONLY when `implementation_charge_status === 'processing'`: flips it to `declined` + `notifyByRule TAX_impl_charge_failed` + `notifyJakeFailure FAILURE_tax_implementation_charge` (status + alerts only, no email — admin re-sends via Tax 5).
- **TAX final retainer** *(added 2026-08-25)* — `metadata.payment_kind === 'final_retainer'`, acts ONLY when `final_retainer_status === 'processing'`: flips it to `declined` + `notifyByRule TAX_final_retainer_charge_failed` + `notifyJakeFailure FAILURE_tax_final_retainer_charge`. Unlike the implementation twin the bell text is conditional on `checkout_token`, because the client's **existing `/tax-pay` link self-serves the retry** — `stripe-checkout.ts` resolves kind `final_retainer` once the status is `declined`.

`payment_kind === 'final_retainer'` also joined the `isOffSession` test at the top of this branch, so a late final-retainer failure cannot fall through to `resolveStripeFirstPaymentFailure`.

The rule keys deliberately reuse the synchronous sweep paths'. See [SESSION_REFERENCE.md](../SESSION_REFERENCE.md) "Failure-event handling" for the full failure-event roster.

### The `payment_intent.canceled` widening *(2026-09-08, v816)*

**The whole block now also runs for `payment_intent.canceled`** when `metadata.pipeline === 'TAX'` **or** `metadata.payment_number` is set. This exists because of the ACH manual-entry path: when micro-deposit verification is never completed, Stripe cancels the PaymentIntent after **~10 business days** and emits **`payment_intent.canceled`, NOT `payment_intent.payment_failed`** — and a dashboard Cancel does the same. Before this, `canceled` was consumed for SpecRev only, so a MAP 1 or Tax row would have sat at `'processing'` **forever**, with no bell and no client email.

- **`failReason`** reads `piF2.cancellation_reason` on a cancel (rendered *"canceled (…)"*) and `last_payment_error.message` on a failure. Every message in the block — the four bells and the three log lines — uses that one value.
- **Holistic payment 1 needed an explicit arm.** A P1 PaymentIntent carries `metadata.payment_number = "1"`, and `isOffSession` is `!!md.payment_number`, so P1 was being classified as an off-session installment and skipped by the generic first-payment resolver. `isFirstInstallmentCancel` (`canceled` **and** `payment_number === "1"`) now removes it from `isOffSession`, so a cancelled P1 reaches `resolveStripeFirstPaymentFailure` → `pay1_status='failed'` + `FAILURE_first_payment_declined`. **A P1 BOUNCE is deliberately still left to `checkout.session.async_payment_failed`** — that path already owns it and fires the same bell title, which dedupes.
- **Tax retainer cancel** carries no `payment_number` and no off-session `payment_kind`, so it falls through to the same generic resolver → `retainer_status='failed'` — **but only when the row is already `'processing'`; see the `processing` gate below.**
- **Tax final retainer / implementation cancel** stay `isOffSession` and land in their existing late-ACH branches → `declined` + the `*_charge_failed` bell + `notifyJakeFailure` + the recovery-link wording. Their `'processing'` guards are unchanged, which is what stops a cancel on an already-settled row from doing anything.

> **VERIFIED LIVE 2026-09-08 — on the Holistic P1 arm, which is the one that needed new code.** Test client 62, `pipeline_map1` row 149 (Quarterly, net 5400, P1 $1,350), sandbox: manual bank entry booked `pay1_status='processing'` with the stamp at 20:51:41Z, then a **Cancel from the Stripe dashboard** delivered `payment_intent.canceled` at 20:54:27Z → `pay1_status='failed'`, bell **1891** *"Payment FAILED — Test Client (MAP 1 first payment) … canceled (requested_by_customer)"*, and the log line `payment_intent.canceled — MAP 1 pipeline_map1 row 149`. That proves `isFirstInstallmentCancel`, the `failReason` read of `cancellation_reason`, and the whole block firing on the widened event. **The stamp is deliberately left set on the failed row** — nothing reads it, and clearing it would be a write with no reader.
>
> **Still CODE-ONLY:** the **Tax retainer** cancel through the same generic resolver, and the final-retainer / implementation `isOffSession` arms. A genuine ~10-business-day micro-deposit expiry has also never been observed — the dashboard Cancel is the same event with a different `cancellation_reason`.

#### The `'processing'` gate on the generic first-payment arm *(2026-09-09, v822 hotfix — gotcha #482)*

**A canceled PaymentIntent is a failed payment ONLY when the row was booked `'processing'` against it.** The generic first-payment branch guarded on `target.currentStatus !== "succeeded"`, which asks *"is this row unpaid?"* — true of every row that has never been touched. It now computes `cancelWithoutBooking = event.type === "payment_intent.canceled" && target?.currentStatus !== "processing"` and, when true, **logs and ignores** the event (`… not booked, abandoned Checkout page — ignored`). The `payment_failed` behaviour is unchanged, and the three late-ACH arms above already required `=== 'processing'`, so they were never exposed.

**The case the widening missed is the ABANDONED CHECKOUT PAGE.** Stripe mints the PaymentIntent when the Checkout page **opens**, not when the payer submits — so a client who opens a durable `/pay` or `/tax-pay` link, selects *"US bank account"* and closes the tab leaves a live PI behind. That session expires unpaid **24 hours** later and emits `checkout.session.expired` + **`payment_intent.canceled` with `cancellation_reason: 'automatic'`** — the identical event shape to the ~10-business-day micro-deposit expiry, so **`cancellation_reason` cannot distinguish the two**; only the row's own booking can.

> **The incident it fixes.** Pat Hurst (client 123, tax plan 87, retainer $6,750, `fee_process_version 2026-08-25`) opened his `/tax-pay` link and chose ACH twice on 2026-09-08 without submitting; the three expiries on 2026-09-09 flipped `retainer_status` **NULL → `'failed'`** and belled `FAILURE_first_payment_declined` (notification **1898**, *"canceled (automatic)"*), which made `actions/tax/stripe-checkout.ts` read the link as *"Payment already completed"* and **killed his only way to pay**. One client estate-wide (census: one `retainer_status='failed'`, zero `pay1_status='failed'`); remediated by SQL at ~18:30Z the same day (`retainer_status` back to NULL, guarded on `retainer_payment_intent_id IS NULL`). The exposure ran exactly one day — before the 2026-09-08 widening this event was ignored for TAX / MAP 1 altogether.

#### The SpecRev twin — the PI-id gate on `markSpecialistRevenueFailed` *(2026-09-10, `v824` — gotcha #484)*

The three SpecRev terminal-failure branches resolve the request by `stripe_customer_id` alone, and one customer collects a PaymentIntent from **every** Checkout page the specialist ever opened, so `markSpecialistRevenueFailed` now also takes the event's PaymentIntent id (`pi.id`, or `session.payment_intent` on `async_payment_failed`) and **ignores the event when the row is still `requested` (nothing was ever submitted) or when the row's booked `stripe_payment_intent_id` is a different PI** — the gap that let Deborah Snyder's abandoned first page (request 32, $4,180) mark her live, verified second payment `failed` a day later.

---

## Branch D — `payment_intent.processing` *(MAP 1 / Tax, 2026-09-08, v816)*

The MAP 1 / Tax twin of the SpecRev block that advances `awaiting_verification → processing`. **Nothing here touches a status**: these rows never left `'processing'`. All it does is NULL the `*_bank_verification_pending_at` stamp, which is what made the row read as *"waiting on the client"* — the bank is verified and the debit is now moving.

**Guard:** `pi.customer` present AND `metadata.pipeline !== 'VFO_SPECIALIST_REVENUE'`, so the SpecRev block keeps sole ownership of `specialist_revenue_requests`. Then:

| `metadata` | Row + column cleared |
|---|---|
| `pipeline='TAX'`, `payment_kind='retainer'` | `client_tax_plans.retainer_bank_verification_pending_at` |
| `pipeline='TAX'`, `payment_kind='final_retainer'` | `client_tax_plans.final_retainer_bank_verification_pending_at` |
| `payment_number='1'` (no TAX pipeline tag) | `pipeline_map1.pay1_bank_verification_pending_at` |
| anything else | nothing — falls through silently |

Each update is matched by `stripe_customer_id` and further narrowed with `.not(<column>, 'is', null)`, so a `processing` event on a row that was never pending writes nothing. A failed clear logs `console.error`; it does not throw.

> **CODE-ONLY as of 2026-09-08.** The clear did not fire in the sandbox test — the test bank went straight from verification to `succeeded`, so `payment_intent.succeeded` did the clearing instead (see B2 and the two Tax settle branches). The belt-and-braces NULL on those three settle updates is what makes that harmless.

---

## Tables touched (across all branches)

- **Read:** `pipeline_map1`, `pipeline_sandbox_config`, `gc_balances`, `client_tax_plans`.
- **Written:** `pipeline_map1` (status/method/dates, **+ `pay1_bank_verification_pending_at`**), `gc_balances` (insert/update), `gc_transactions` (insert), `client_tax_plans` (retainer / implementation / **final-retainer** status, method, dates, **+ `retainer_bank_verification_pending_at` / `final_retainer_bank_verification_pending_at`**, and **a card fee per payment** — `card_processing_fee` / `final_retainer_card_fee` / `implementation_card_fee`, never shared), `notifications` (the failure bells + the two bank-verification-pending FYIs).

> This list has always been MAP1-centric and is still not exhaustive — the tax, advisor, accountant, PIP and specialist branches all write their own pipeline tables. Derive from `router/webhooks.ts`, not from here.

## Downstream chains

| Branch | Chains |
|---|---|
| A1 (GC) | none |
| A2 (MAP1 card) | `automation_CONTRACT_confirmationemail` (side effects only — **no client email**, status `'Skipped - Card (Receipt Only)'`) + `automation_CONTRACT_invoicereceipt` + `automation_CONTRACT_revshare` (payment 1) |
| A2 (MAP1 ACH) | `automation_CONTRACT_confirmationemail` only (client confirmation email **is** drafted — `\|ach`, or **`\|ach_verify`** when `pay1_bank_verification_pending_at` was just stamped) |
| B1 (Quarterly N) | `automation_CONTRACT_invoicereceipt` + `automation_CONTRACT_revshare` (payment N) |
| B2 (ACH cleared) | `automation_CONTRACT_invoicereceipt` + `automation_CONTRACT_revshare` (payment 1) |

## Dead-code note

There is also `if (action === "automation_CONTRACT_stripewebhook")` at [admin-api:1156](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts) — but reaching this requires a request that has neither the `stripe-signature` header nor an `action` field, just `body.object === "event"` (which line 540 then sets `body.action` to). In production, every Stripe webhook arrives with the signature header and gets handled at line 222 before line 1156 is ever reached. Treated as dead code in [03-edge-functions.md](../architecture/03-edge-functions.md#possibly-dead-code).

## Failure modes

1. **Signature missing or invalid** → 401, Stripe retries with backoff per its standard policy.
2. **Replay (timestamp > 5 min old)** → 400.
3. **`pipeline_map1` lookup fails** → returns 200 with no action. Stripe considers it delivered. Pipeline stalls.
4. **Chain call fails** (admin-api → admin-api) → caught and logged. DB writes succeeded, but downstream emails/PDFs not produced. Manual replay required.
5. **Both A1 and A2 blocks execute** for an event that incidentally has both a customer match AND member_number metadata — they touch independent tables (gc_* vs pipeline_map1) so this is benign, but worth noting that they're not gated as exclusive.
6. **Idempotency** — A2 is gated on `!pipeRow.pay1_status` — duplicate webhooks won't double-process. B2 is gated on `pay1_status === 'processing'` — won't fire if already 'succeeded'. A1 is **not idempotent** — duplicate delivery would credit twice. Stripe's "at-least-once" delivery model means this is theoretically possible.

## Open questions

1. **Subsequent quarterly payment creation mechanism** — see B1 above.
2. **Webhook idempotency for GC purchases** — A1 has no idempotency guard. Is Stripe's at-least-once delivery a real concern here? Confirm with user.

## Cross-references

- Master flow: [contract-and-payment.md](contract-and-payment.md#step-10--stripe-webhook-fires)
- Stripe integration detail: [../integrations/stripe.md](../integrations/stripe.md)
- GC marketplace flow: [gift-credits.md](gift-credits.md)
- Pipeline columns: [../tables/pipeline.md](../tables/pipeline.md)
