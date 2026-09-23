# Specialist License Fee Continuation flow

Moves an **existing, already-live specialist** — one paying the $99/mo license fee on the legacy system — onto a portal-native **$99/mo Stripe subscription** — card or ACH, flat $99 either way — charged on an admin-chosen day of the month. It is NOT onboarding: the specialist is already in the directory, already has an `experts` row, and never touches Stages 1–5.

> **2026-08-24 (v780 / v781, branch `claude/vfo-session-setup-dbeb30`):** built by re-pointing the never-used **License Fee Continuation** engine (shipped 2026-06-30, zero live runs) at the **SpecRev recurring ACH setup** pattern. Shipped end to end as `live-166`. **2026-09-14 (v837 → v840, branch `claude/vfo-session-setup-c5a8e5`):** the catch-up shape was removed and micro-deposit verification added — see "The ONE first-charge shape" and "Bank verification" below; the first two real specialists (Jen McAllister row 29, Frank Soler row 30) were sent the corrected link that day.

- **Pipeline label:** `SPECIALIST_LICENSE_CONTINUATION` — used by `email_templates.pipeline` for the three continuation templates ONLY. Stripe metadata, `notifications.pipeline` and `pipeline_sandbox_config` still read **`SPECIALIST_ONBOARDING`**, because the money and bell chains are the onboarding licence engine's. *(Two pipeline labels in one flow is deliberate; see "Traps" below.)*
- **State table:** `specialist_onboarding` rows with **`license_continuation = true`** — a minimal row (no stage tracker, no votes, no meetings), `current_stage=4`, `status='active'`, plus the `lic_*` columns and the new **`lic_charge_day`** (integer 1–15, migration `20260824210000_specialist_license_continuation_charge_day.sql`). See [tables/specialists.md](../tables/specialists.md).
- **Entry point:** AdminPortal → **Accounting → VFO Specialist License Fees** → the **"Setup Monthly License Fees"** button. *(Before 2026-08-24 this lived as a "License Fee Continuation" subtab on the specialist Profile; that subtab and `SpecialistLicenseContinuationTab.jsx` were DELETED — the Accounting button replaces it.)*
- **Gate:** both actions are **AUTH + `TAB_ACTIONS.accounting`**, with the in-handler superadmin checks REMOVED — full parity with `specialist_revenue_recurring_create` (the 2026-08-07 / #338 decision). The accounting grant is the whole boundary.
- **Emails are Gmail DRAFTS** — all three templates are `send_mode=false`.

## The two actions

| Action | File | Auth | Does |
|---|---|---|---|
| `specialist_license_continuation_load` | `actions/specialist-license/continuation-load.ts` | AUTH + `TAB_ACTIONS.accounting` | Current license state for one expert: link/subscription stamps, `charge_day`, and a computed **`already_active`** — true when ANY non-canceled subscription exists on ANY of the expert's onboarding rows. That is the exact condition `_start` 409s on, so the form can warn before the click. |
| `specialist_license_continuation_start` | `actions/specialist-license/continuation-start.ts` | AUTH + `TAB_ACTIONS.accounting` | Requires `expert_id` + **`charge_day` (integer 1–15, else 400)**. Find-or-create the continuation row, stamp `lic_charge_day` on **both** insert and reuse, ensure the Stripe customer + `lic_checkout_token`, draft `SPECIALIST_lic_continuation_request`. Re-runnable = Resend. |

**Two guards inside `_start` that are easy to get wrong:**

1. **Double-enroll (409).** It scans **every** `specialist_onboarding` row for the expert (not just the latest) for a non-canceled `lic_subscription_id`. Under a deferred anchor a subscription exists with **no payment yet**, so `lic_payment_status` cannot be the test — any recorded subscription blocks, except one the webhook marked `canceled`. The "not canceled" test is done **in JS, not PostgREST**: `.neq("lic_payment_status","canceled")` drops NULL statuses, which is exactly the deferred row you must catch.
2. **Row reuse is restricted to `license_continuation = true` rows.** A real onboarding row is never borrowed. `lic_charge_day`, the deferred checkout branch, the Tracy/stage-advance guards and the sweep's tier 7b all key on that flag, so continuation billing only ever rides a row that carries it.

## The public payment page

`/specialist-pay?token=<lic_checkout_token>&kind=license` — the same page and the same two handlers as onboarding, branching on `license_continuation`:

- **`license-load-payment.ts`** — a continuation row's response gains `continuation`, `charge_day`, `charge_day_ordinal` and `first_charge_note`, plus a guard that refuses a link whose subscription is already set. `ach_only` was **REMOVED 2026-09-22** when card became selectable. Every licence response also carries `card_fee_applies: false`. **The onboarding response is byte-identical** — extra keys on the continuation branch only.
- **`SpecialistPayPage.jsx`** — a continuation link renders **both tiles** (card since 2026-09-22), shows the charge-day copy on each, and since 2026-09-14 both footers and the security note say plainly that **nothing is charged at setup**. The card tile reads *No Fee* and `$99.00`, driven by `card_fee_applies` from the loader rather than inferred from the product. Onboarding rendering is unchanged.

## The ONE first-charge shape (`license-checkout.ts` → `continuationCheckout()`)

**Card and ACH are both accepted** (card added 2026-09-22; before that it was refused with a 400). Amount is a flat **9900** on either — the licence carries **no card fee at all**, matching how a LEGACY (non-"New Model") membership plan is billed: VFO absorbs the 2.9% + $0.30 rather than passing it on. The gross-up that used to sit on the ONBOARDING licence path is gone too, so two specialists can never pay different amounts for the same product. `custom_text[submit][message]` drops the bank sign-in paragraph on a card session. The memo is `VFO Specialist - <Name> - Monthly license fee`. **Since 2026-09-14 the flow is byte-for-byte the SpecRev recurring setup** (`actions/specialist-revenue/recurring-checkout.ts`): one recurring $99 line, `subscription_data[billing_cycle_anchor]` + `proration_behavior=none`, **nothing collected at checkout**. If this month's charge day has passed (or is less than 2h away) the anchor rolls to **next** month's occurrence and this month is simply skipped. `metadata.first_charge` is always `deferred`; `metadata.next_charge_at` carries the anchor for the confirmation email.

> **The CATCH-UP shape was REMOVED 2026-09-14** (branch `claude/vfo-session-setup-c5a8e5`). It billed a one-time $99 line "charged today" plus `subscription_data[trial_end]` on next month's occurrence. Two costs killed it. (1) **A subscription-mode Checkout session with any amount due today hides Stripe's "Enter bank details manually" option** — the micro-deposit path — so a specialist whose bank Financial Connections does not support had no way through; only a **$0-today** (anchor or trial) session offers manual entry. (2) Stripe's hosted page rendered its own trial/free wording on a page that WAS collecting $99, which `custom_text[submit][message]` could only paper over. **#435** is superseded by **#491**: the mechanism it documents (a one-time line under a future anchor is invoiced at the anchor) is still true, but the construct it recommends is no longer used here. The consequence to state out loud: **a missed charge day now skips that month's fee entirely** — no catch-up, by decision.

**Date bounding** (identical to the SpecRev recurring setup): Stripe needs the target still in the future at Checkout *completion*, and an anchor may not exceed creation + 1 month. Preferred time is 17:00 UTC (1pm ET); if next month's 17:00 overshoots the limit by hours, step down to 04:05 UTC, then 00:05 UTC, then hard-clamp. The session carries `expires_at` = now + 1h so the 2h buffer always holds — and it is also why a legacy `catch_up` session cannot still be in flight, which is what lets the webhook classify on `license_continuation` alone.

## Bank verification (manual entry) — NEW 2026-09-14

Because manual account/routing entry is now reachable, a continuation setup can complete with **no verified bank**. Stripe collects the mandate for a $0-today subscription through the subscription's **`pending_setup_intent`**, and a hand-keyed account leaves it in **`requires_action`** (micro-deposits pending). Nothing is charged, the subscription exists, and the wait lasts until the specialist enters the deposit code — about **10 days** before Stripe gives up.

**The sub-state is a side column, not a `lic_payment_status` value** (**#475**). `lic_payment_status` keeps saying `scheduled` throughout, so no enumerating reader had to be re-audited.

> **FINDING THE SetupIntent IS THE HARD PART — it is on neither the session nor the subscription.** Proven live 2026-09-14 (v837, onboarding row 28, customer `cus_VG8p1skoChgnz5`, sub `sub_1UFcZiRv8yMNbvOJBypH7vWG`, hand-keyed account `000123456789`): the webhook logged `pending_setup_intent (none) status (none) next_action (none) | hosted_verification_url (none) | session.setup_intent (none)`, and `default_payment_method` was null as well (`lic_acct_last4` NULL). **In subscription mode Stripe keeps the micro-deposit SetupIntent off both objects while the bank is unverified.** `needsBankVerify` was therefore false and the specialist got the ordinary confirmation instead of the verify-bank email. The handler now falls back to **`GET /v1/setup_intents?customer=<id>&limit=5`** (newest-first). The `expand[]=pending_setup_intent` stays as the primary source — it is the documented shape, it costs nothing, and it is presumably what a card or instantly-verified bank returns.

> **AND THE LIST MUST BE SCOPED TO THIS SESSION — never searched for "any pending intent".** Found live 2026-09-14 (v839, row 28, instant-bank run). The first implementation did `find(s => s.status === "requires_action" && …)`, which matched a **stale** SetupIntent from an earlier abandoned attempt: the list came back `seti_…dnw=succeeded/-, seti_…cmg=requires_payment_method/-, seti_…cij=succeeded/-, seti_…cZg=requires_action/verify_with_microdeposits`, and the handler picked **`…cZg`** — an abandoned manual entry from run 1 — over **`…dnw`**, this session's own successfully verified bank sign-in. **The production case: a specialist abandons manual entry, then redoes the setup with bank sign-in, and is wrongly parked "awaiting verification" on a bank that is already verified** — verify-bank email, Tracy bell, tier 7c chase, and eventually a `setup_intent.canceled` that cancels a perfectly good subscription.
>
> **The rule: take THIS session's SetupIntent, then judge only that one.** The list is filtered to `created >= session.created - 120` (the slack absorbs clock skew between session creation and the SetupIntent Stripe mints for it), the **first** survivor is taken (newest-first), and verification is pending **only if that item** is `requires_action` + `verify_with_microdeposits`. A newest item that is `succeeded` — or anything else — means no verification is pending, and `pendingSetupIntent` is left as-is. The log names the chosen item and why, and prints `session.created`. If `session.created` is somehow absent the handler falls back to `data[0]` and logs that the timestamp was unavailable. **The general shape: a customer-scoped Stripe list is a history, not a current state — scope it by time to the event you are handling, or you will act on someone's abandoned attempt.**

**Four new columns on `specialist_onboarding`** (migrations `20260914120000_lic_continuation_bank_verification.sql` and `20260914130000_lic_setup_intent_id.sql`):

| Column | Written by | Meaning |
|---|---|---|
| `lic_bank_verification_pending_at` | `checkout.session.completed` (set) · `setup_intent.*` (clear) | Stripe is waiting on micro-deposit verification |
| `lic_setup_intent_id` | `checkout.session.completed` | **Which** SetupIntent the row is waiting on — the primary key for resolving `setup_intent.*` events |
| `lic_verify_email_sent_at` | `license-confirmation-email.ts` | Idempotency stamp for the verify-bank email — **deliberately separate** from `lic_confirmation_email_sent_at` |
| `lic_bank_verification_pf_notified_at` | sweep tier 7c | Tracy has been told this verification is stalled |

> **A REDO RESETS THE THREE STAMPS — because the row is reused, and the stamps outlive the subscription.** Found live 2026-09-14 (v838, row 28, third run). `continuation-start` finds and **reuses** the specialist's latest `license_continuation` row rather than inserting a new one, so `lic_verify_email_sent_at` and `lic_confirmation_email_sent_at` from the *previous* subscription were still stamped when the redo completed — and `license-confirmation-email.ts` correctly skipped as *"already sent"*. **The production case this breaks is the exact one the whole feature exists for:** a specialist whose verification expired, who is then asked to redo the setup, and who receives **no verify email and no confirmation** on the second attempt. The checkout block now clears `lic_verify_email_sent_at`, `lic_confirmation_email_sent_at` and `lic_bank_verification_pf_notified_at` in the **same update** that records the new subscription, gated on `isContinuation && subscriptionId !== spec.lic_subscription_id`. **Keyed on the subscription id changing, never on the event** — a redelivered `checkout.session.completed` carries the same id, so it cannot reset the stamps and re-send (**#327**: Stripe redelivers, and there is no event-id dedupe here). The reset is awaited before the confirmation chain fires, and the handler re-reads the row, so it sees the cleared stamps.

**Why the id is stored, and why matching is id-ONLY with no customer fallback.** One Stripe customer accumulates SetupIntents — abandoned manual entries, card updates, every earlier attempt — which is #473's "one customer, two legs" shape at its sharpest. **Each stale one runs its own ~10-day clock and then emits `setup_intent.canceled`.** A customer-scoped match would resolve that expiry to whichever row happened to be waiting at the time and **cancel a live subscription that has nothing to do with it** — concretely, the abandoned `seti_…cZg` from v839's run 1 expiring days later and killing row 28's by-then-healthy licence. So both blocks match on **`lic_setup_intent_id = si.id` and nothing else** (plus `license_continuation=true` and the non-null stamp). No customer fallback exists: if `si.id` is absent or names no waiting row, the handler logs `no licence continuation row awaiting THIS SetupIntent <id> (ignored)` and does nothing. **An event that names no row we are waiting on is not our event** — the same discipline as **#482**'s "name the column that proves the row was booked against this object".

**Two new webhook blocks** in `router/webhooks.ts`, both `fromPrimary`-gated, both resolving the row **only** by `lic_setup_intent_id = si.id` + `license_continuation=true` + a non-null `lic_bank_verification_pending_at`:

1. **`setup_intent.succeeded`** — re-reads the subscription for its real `billing_cycle_anchor`, clears the stamp, and **chains `automation_SPECIALIST_licconfirmation`** with `{first_charge:'deferred', next_charge_at:<anchor>}`. **On the manual path the confirmation email fires from HERE, not from checkout** — at checkout the specialist got the verify-bank email instead.

   **It also backfills `lic_acct_last4`, which the manual path cannot capture at checkout.** An unverified bank is not yet the subscription's `default_payment_method`, so the checkout block wrote NULL (observed live on v837 / onboarding 28) — verification is the first moment the account is knowable. The subscription fetch carries `expand[]=default_payment_method`; if that is still absent, the handler falls back to `GET /v1/payment_methods/{si.payment_method}` from the event itself, since Stripe may not have promoted the newly-verified bank to the subscription default yet. The log names the source (`subscription.default_payment_method` / `setup_intent.payment_method` / `(none)`). **The stamp clear is unconditional on both fetches** — a Stripe failure must still end the verification wait; it just leaves last4 NULL as it is today.
2. **`setup_intent.setup_failed` / `setup_intent.canceled`** — writes the row **FIRST** (`lic_bank_verification_pending_at = null` + `lic_payment_status = 'canceled'`), **then** `DELETE /v1/subscriptions/{lic_subscription_id}` (404 / already-canceled tolerated), then the failure bell. `canceled` is the value `continuation-start`'s double-enroll guard, `license-load-payment` and `license-checkout` all accept for a redo, so **the specialist's original setup link works again**. `lic_subscription_id` is deliberately **kept**.

   > **The write-then-delete ORDER is load-bearing, not tidiness.** The `DELETE` makes Stripe emit `customer.subscription.deleted`, which lands in the **subscription-lifecycle** block — and that block raises Jake's action-required *"License CANCELED — &lt;name&gt;"* bell telling him to consider **revoking the specialist's Showroom / portal access**. Completely wrong for someone whose micro-deposit check merely expired. So the lifecycle block now **early-skips** (`deleted && lic_payment_status === 'canceled'` → log, no write, no bell), and that test only holds if our row write has already landed. The skip also dedupes a redelivered `deleted`. It is safe for a *genuine* lapse too: the only other writer of `'canceled'` is that same block, on a preceding `updated` event with a terminal status — which raised the bell itself, so the `deleted` that follows has nothing new to report.

**The fourth email.** `SPECIALIST_lic_continuation_verify_bank` (pipeline `SPECIALIST_LICENSE_CONTINUATION`, `send_mode=false`, recipients copied from template 171) replaces the confirmation at checkout when the stamp is set. Tokens `[First Name]`, `[Charge Day]` (ordinal), `[First Charge Date]` (the anchor, falling back to the ordinal alone), `[AMOUNT]`. Like the confirmation it **tolerates a missing template without stamping**.

**Three new `notification_rules`**, all dismissible FYI to Tracy, area `Specialist Onboarding`, sorts 321–323:

| Key | Raised by | Title |
|---|---|---|
| `SPECIALIST_lic_bank_verification_pending` | `checkout.session.completed` | *Bank verification pending — &lt;name&gt; (License continuation)* |
| `SPECIALIST_lic_bank_verification_failed` | `setup_intent.setup_failed` / `.canceled` | *Bank verification failed — &lt;name&gt; (License continuation)* |
| `SPECIALIST_lic_bank_verification_stalled` | sweep **tier 7c** (3 business days) | *&lt;name&gt; hasn't completed their bank verification (License continuation)* |

Both webhook bells are `dedupe:"unread"` and wrapped in try/catch — a bell failure must never fail the money write (**#176**).

**Copy changes on the two existing templates.** Template **171** (setup request) no longer says the first payment may be charged *"at setup, if that day has already passed this month"* — it now opens *"Nothing is charged when you set this up"* and says *"next month's if this month's has already passed"*. Template **231** (confirmation) **lost its manual-entry Tip paragraph** entirely: a row that reaches the confirmation now has a verified bank, so the hedge was simply wrong.

> **STRIPE DASHBOARD PREREQUISITE — SUBSCRIBED 2026-09-14 (Jake, VFO Services live + sandbox; deliberately not on ERT).** `setup_intent.succeeded`, `setup_intent.setup_failed` and `setup_intent.canceled`. The licence is primary-only, so they are **not** needed on ERT's two endpoints. Why they are required at all: a $0-today subscription collects its mandate through a **SetupIntent**, so no PaymentIntent exists and none of the `payment_intent.*` events MAP 1 / Tax rely on ever arrive here. Without the subscription a manual-entry specialist stays `awaiting_verification` forever: no confirmation email, no failure bell, no cancellation.

**Deliberately NOT set:** `payment_method_options[us_bank_account][verification_method]=instant`. This mirrors the SpecRev recurring setup (**#298**) — a subscription can go active on an unverified bank and the failure surfaces at charge day. **Since 2026-09-08 the continuation branch also carries the shared bank-sign-in note** (`constants/ach-checkout-note.ts ACH_BANK_SIGN_IN_NOTE`), **prepended** to the `custom_text[submit][message]` sentence with a blank line between — the note first, then *"No charge today — your first monthly payment is collected on your charge day shown above, and monthly on that day thereafter."* Since 2026-09-14 that is the **only** sentence: the catch-up "collected today" variant went with the branch, so this is now byte-identical to the SpecRev recurring builder's note. The licence **first-charge** branch in the same file still pins `instant` and gets no note.

## Webhook (`router/webhooks.ts`)

Routing is unchanged — the licence chain is keyed on `lic_stripe_customer_id`. Three continuation-aware changes:

1. **`checkout.session.completed`, licence block.** A continuation setup records **`lic_payment_status='scheduled'`** and the progress `task_key='payment_setup'` — *not* `processing`/`payment_made`, because nothing was charged. **Since 2026-09-14 `deferred = isContinuation`**, full stop: there is only one shape and a legacy `catch_up` session cannot exist (sessions expire in 1h). The subscription fetch also expands **`pending_setup_intent`** and logs its `status` + `next_action.type` (and `session.setup_intent`) on every delivery. The chain body to `licconfirmation` carries `first_charge`, `next_charge_at` **and `bank_verify`**.
2. **`processSpecialistLicenseInvoicePaid`.** `license_continuation` joined the select, and the **Stage 4→5 advance is gated `!license_continuation`** — a continuation row is an already-live specialist and must never walk the onboarding stages.
3. **NEW: the $0-invoice guard at the top of that processor** (`amount_due`/`total` must be > 0), mirroring the SpecRev guard. This **restores #198**, which `07-server-chains.md` had documented as required for two months while the licence processor had no such code — a pre-existing latent bug affecting **onboarding too**: a $0 `subscription_create` stub would have claimed the invoice id and minted a false $99 receipt + ledger row. The invoice object is threaded through all three call sites; no new fetches. See **#436**.

## Emails

All three are `pipeline = 'SPECIALIST_LICENSE_CONTINUATION'`, `send_mode = false` (draft), recipients `to` SPECIALIST / `cc` Tracy / `bcc` Anton + Paul.

| id | template | Sent by | Tokens |
|---|---|---|---|
| 171 | `SPECIALIST_lic_continuation_request` | `continuation-start.ts` (**REWRITTEN 2026-08-24** with user-approved copy; subject *"Set up your monthly VFO Specialist License payment — VFO Services"*) | `[First Name]`, `[Charge Day]`, `[PAYMENT_LINK]` |
| 231 | `SPECIALIST_lic_continuation_confirmation` | `license-confirmation-email.ts`, continuation rows only | `[FIRST_PAYMENT_SENTENCE]` — always the deferred wording since 2026-09-14 |
| 232 | `SPECIALIST_lic_continuation_reminder` | sweep tier 7b | `[FIRST_NAME]`, `[SPECIALIST_NAME]`, `[CHARGE_DAY]` (ordinal), `[BUTTONS]` |
| new | `SPECIALIST_lic_continuation_verify_bank` | `license-confirmation-email.ts` on `bank_verify` | `[First Name]`, `[Charge Day]`, `[First Charge Date]`, `[AMOUNT]` |

`license-confirmation-email.ts` **tolerates a missing template without stamping**, so a send skipped for a missing row fires once the row exists.

## Sweep tier 7b (`onboarding/sweep.ts`, cron `specialist-sweep-daily` 07:00 UTC)

A new tier beside tier 7, running on exactly the rows tier 7 excludes. **Tier 7 is unchanged.**

- **2 business days** after `lic_payment_link_sent_at` → drafts `SPECIALIST_lic_continuation_reminder` (with the pay button + the ordinal charge day). **4 business days** → the Tracy bell *"<Name> hasn't moved their license fee onto the portal"*.
- **Reuses tier 7's rule keys** `SPECIALIST_stall_licpayment_email` / `_bell` — **no new `notification_rules` rows** — and tier 7's guard columns `lic_payment_reminder_sent_at` / `lic_payment_pf_notified_at` / `lic_payment_pf_ack_at`.
- **"Done" is `lic_subscription_id IS NOT NULL`, not a payment.** A deferred setup completes with no money moved, so a payment-based predicate would chase a specialist who already finished.
- The reminder **stamps only on a successful draft**; a missing template logs and skips without stamping. `sendReminder()` gained an optional `pipeline` argument for this (it defaults to `SPECIALIST_ONBOARDING`, so every other tier is untouched).

## Sweep tier 7c — stalled bank verification (NEW 2026-09-14)

Same file, immediately after 7b. Rows with `status='active'`, `license_continuation=true`, `lic_bank_verification_pending_at` older than the rule's business-day cutoff (`SPECIALIST_lic_bank_verification_stalled`, **default 3 business days**, paced by the same `businessDelayCutoffIso` helper) and `lic_bank_verification_pf_notified_at IS NULL` → the Tracy bell, then the stamp. **Bell only, no email** — Stripe already sends the specialist its own verification reminders, and the only useful action is a human nudge.

## The two Tracy first-invoice bells

`license-invoice-receipt.ts` gates the two first-invoice action bells — *Send invite to VFO Skool* and *Create the VFO Specialist* — on **`&& !ob.license_continuation`**. Both are go-live tasks for a NEW specialist; a continuation specialist is already live, so the bells must not fire. Verified DB-side on the 2026-08-24 live test (then the catch-up shape, since removed): zero bells.

## Accounting UI

The License area now renders through the **same `AccountingCombinedPanel` wrapper SpecRev uses**, with three pills:

| Pill | Component | Notes |
|---|---|---|
| **VFO Specialist License Fees** | `SpecialistLicensePanel.jsx` | The "Setup Monthly License Fees" gradient toggle + inline `LicenseSetupForm` (expert picker from AdminPortal's `allExperts`, 1st–15th ordinal charge-day select, fixed *$99.00 · ACH* display). Monthly table columns **SPECIALIST · DATE · AMOUNT · STATUS**, chip flush right, one money column, *"Payment received"* chip only. The amber already-enrolled note keys on the loader's `already_active`, with an `/already/i` message match as fallback (`callApi` discards the HTTP status, so the 409 is invisible to the FE). |
| **License Reconciliation** | **NEW** `SpecialistLicenseReconciliationPanel.jsx` | Client-side all-time per-specialist aggregate: payment count, total collected, most recent. **No year filter by design** (a licence is a flat monthly fee, not an engagement) and **no member-# column** — `expert_id` is a raw DB id, not a member number. |
| **Outstanding Payment Links** | **NEW** `SpecialistLicenseOutstandingPanel.jsx` | Reuses `OutstandingLinksPanel`'s exported internals. `LicenseLinkCard` reads *"Link sent &lt;date&gt; · charge day &lt;ordinal&gt;"*, $99.00 per month, expandable detail incl. payment method. **Read-only — no resend button.** |

Fed by **`specialist_license_payments_load`**, whose response gained a **`pending[]`** array: continuation rows with a link sent that are not succeeded/canceled, each with a `state` of `setup_pending` / `scheduled` / **`awaiting_verification`** / `processing` / `failed`, plus a raw `bank_verification_pending_at`. **`awaiting_verification` outranks the status column** — it is derived from the side stamp, which `lic_payment_status` deliberately never records. **Unknown values (e.g. `past_due`) pass through raw** rather than being coerced. The existing cleared-payments shape is unchanged. `specialist_license_continuation_load` returns the same stamp as `bank_verification_pending_at`.

State chips: **Setup pending** `#0095ff` · **Awaiting first payment** `#0095ff` · **Awaiting bank verification** `#e06717` · **Payment processing** `#e06717` · **Past due** `#ef4444` · **Payment failed** `#ef4444`.

**Sibling tab (2026-09-23):** Accounting → Specialists → **VFO Specialist Background Checks** uses the same three-pill shape (monthly ledger · Reconciliation · Outstanding Payment Links) for background-check payments, including the one-time admin-sent requests — see [specialist-bg-requests.md](specialist-bg-requests.md).

## Traps

- **`scheduled` is a NEW value in the `lic_payment_status` vocabulary** (subscription exists, zero money moved). The column is bare `text` with no CHECK, so nothing announces where the enumerations are — every reader that enumerates it must handle it. See **#437** (and the #431/#433 family).
- **Two pipeline labels in one flow.** Templates are `SPECIALIST_LICENSE_CONTINUATION`; Stripe metadata, bells and the sandbox toggle stay `SPECIALIST_ONBOARDING`. Look up a continuation *email* under the former and everything else under the latter — a `(pipeline, template_name)` mismatch here looks exactly like a deliberately-Draft row (**#356**).
- **Rollout is not code.** Tracy must cancel each specialist's **legacy** license billing from their first portal month, or they pay twice (the #361 exposure). Out of scope for the handlers; there is no automated check.

## Cross-references

- Onboarding licence engine this reuses: [specialist-onboarding.md](specialist-onboarding.md) (Stage 4 sign/pay/recurring-license)
- Chains + webhook + sweep table: [../architecture/07-server-chains.md](../architecture/07-server-chains.md)
- Columns: [../tables/specialists.md](../tables/specialists.md) · Actions: [../architecture/05-api-action-catalog.md](../architecture/05-api-action-catalog.md)
