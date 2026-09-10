# 07 — Server-to-server chains

> **Canonical inventory of every server-to-server chain in `vfo-admin-api`.** Read this before adding, moving or "optimising" any handler that invokes another handler.
>
> Merged on 2026-08-14 from `SESSION_REFERENCE.md`'s "Stripe webhook chain order" + handler/cron catalog and the chain enumeration that used to be embedded in the session starter prompt. The starter now points here instead of carrying its own copy.
>
> Companions: [05-api-action-catalog.md](05-api-action-catalog.md) (every action + its file), [01-system-map.md](01-system-map.md) (crons), [flows/](../flows/) (end-to-end per pipeline), [../integrations/stripe.md](../integrations/stripe.md) (Stripe detail).

---

## THE RULE — never convert a chain to a direct function call

**NEVER convert server-to-server chain calls from HTTP fetches to direct function calls.** This is a standing non-negotiable, not a style preference.

A chain is an HTTP POST from one handler back into the same edge function:

```ts
await fetch(`${SUPABASE_URL}/functions/v1/vfo-admin-api`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_KEY}` },
  body: JSON.stringify({ action: "automation_CONTRACT_paymentemail", client_id }),
});
```

**34 files** chain this way (33 verified 2026-08-14; **`utils/member-payout-release.ts` added 2026-08-24** — the first chaining file that is a *util* rather than an action, because its two callers already hold service-role context and nothing third-party triggers it). Two credential shapes, and the difference is load-bearing:

| Caller context | Credential | Notes |
|---|---|---|
| Webhook / cron / post-auth automation | `Authorization: Bearer <SERVICE_ROLE_KEY>` | Re-enters as service-role; no session |
| An AUTH handler chaining another AUTH handler | forward **`body.token`**, not just the header | Gotcha **#11** — the header alone does not carry the caller's session |

Why it must stay HTTP: the chain target re-enters through `index.ts` → `middleware/auth.ts` → `router/dispatch.ts`, so it re-runs the **auth gate, the role gates and the dispatch lookup**. A direct import call skips all three. For a `tax_planner` caller the whole chain closure must be allowlisted and guarded (**#257**); a `PUBLIC_HANDLERS` chain target bypasses the gate and must **not** be allowlisted.

Related standing rules: **never** touch the `pipeRow` null-check pattern in `router/webhooks.ts` without explicit approval; **never** edit `boldsign-webhook` without explicit approval, and deploy it with `--no-verify-jwt` (**#10**).

---

## Stripe webhook cascade — the resolution order

`router/webhooks.ts` receives Stripe and BoldSign by request shape. The Stripe handler resolves the owning row by looking `stripe_customer_id` up **in this fixed order**, taking the first hit:

1. `pipeline_map1` (MAP 1 — implicit, no `metadata.pipeline` needed)
2. `client_tax_plans` (`TAX`)
3. `advisor_onboarding` (`ADVISOR_ONBOARDING`)
4. `client_priority_tracks` (`PIP`, by `pip_stripe_customer_id`)
5. `accountant_onboarding` (`ACCOUNTANT_ONBOARDING`)
6. `specialist_onboarding` (`SPECIALIST_ONBOARDING`, by `bg_stripe_customer_id`)

It then branches on `metadata.pipeline` and `metadata.payment_kind` ∈ {`retainer`, `implementation`, **`final_retainer`**, `onboarding`, `purchase`, `background_check`, `license`}. **Set both on every Checkout / PaymentIntent you create** (**#13**). `final_retainer` (2026-08-25) is set on BOTH the PaymentIntent and the Checkout Session, because the fresh-`/tax-pay`-link recovery path is resolved off `session.metadata`.

Three families sit **outside** this cascade as additive blocks: the specialist **monthly licence** (routed by `lic_stripe_customer_id`), **recurring SpecRev plans** (routed by each plan's dedicated `stripe_customer_id`), and `checkout.session.expired` (routed by `session.metadata.pipeline`).

**No event-id dedupe exists.** Stripe redelivers any webhook whose 200 we were too slow to return, so every chained side effect needs its own idempotency latch — only the MAP 1 P2–P4 branch is latched today (**#327**).

### Purchase-email policy — applies to every chain below

**Card → invoice/receipt ONLY, no confirmation email. ACH → confirmation at purchase + documents at settle. Check → both at clear (exempt).** Any new payment pipeline must follow it. Gate placement differs per pipeline and is load-bearing: MAP 1 / Tax / Specialist-licence gate **inside** the confirmation handler (those handlers also own the PF bell, ERT vault copy, Tracy email or have two racing call sites); everywhere else the gate belongs at the **call site** (**#287**, **#289**).

---

## Per-pipeline chain maps

### MAP 1 (Holistic)

| Trigger | Chain |
|---|---|
| Pre-auth setup | `automation_CONTRACT_stripecustomer` → `automation_CONTRACT_paymentemail` |
| Decision (Undecided) | `automation_PIPFU_decision` → agreement / payment email branches |
| Agreement | `automation_CONTRACT_sendagreement` (4 call sites, all forward `body.token`) |
| First card payment | → `automation_CONTRACT_invoicereceipt` → `automation_CONTRACT_revshare` |
| First ACH payment | → `automation_CONTRACT_confirmationemail`; on `payment_intent.succeeded` → `_invoicereceipt` → `_revshare` |
| First ACH payment, **manual bank entry** *(2026-09-08)* | `checkout.session.completed` reads the PI's `status`: `requires_action` ⇒ stamp `pay1_bank_verification_pending_at` + bell `MAP1_ach_bank_verification_pending`, `pay1_status` still `processing`. Same `_confirmationemail` chain, but it picks **`CONTRACT_confirmationemail\|ach_verify`** and re-words the `MAP1_client_paid` bell. `payment_intent.processing` clears the stamp; `payment_intent.succeeded` clears it again at settle; `payment_intent.canceled` ⇒ `pay1_status='failed'` + `FAILURE_first_payment_declined` |
| Quarterly P2–P4 | off-session PI (`metadata.payment_number=N`) → `payN_status` → `_invoicereceipt` → `_revshare` (**latched on `rec{N}_email_sent`**). *Chain unchanged 2026-08-21; the client-driven `/pay` page now stamps the same `payment_number` metadata, so it feeds this identical chain instead of mis-booking as P1.* |
| Check | `automation_CONTRACT_paidbycheck` → `automation_CONTRACT_checkcleared` → confirmation **and** invoice/receipt (policy-exempt) |

`automation_CONTRACT_revshare` **pays immediately** — the Tracy Revenue-Master cross-check was removed 2026-07-01 (**#164**), amounts come straight from the PF input form. It also transfers the 10% **strategic partner** share to `strategic_member_groups.stripe_account_id` and drafts the partner rev-share email. Share proration is **not uniform across legs** — member pays in full, strategic is gross-prorated, VFOS is the residual (**#394**); copy `contract-revshare.ts`, never re-derive.

**MEMBER-STANDING HOLD (2026-08-24)** *(v: 2026-08-24)*. All four revenue-share engines — `contract-revshare.ts`, `tax/revshare.ts`, `msm/pip-revshare.ts` and `utils/specialist-revenue-payout.ts` — now carry a **hold branch** in their exhaustive branch chain (**#303**), placed **after** money-mapping and the zero-share close and **above** the no-Connect-account branch. *(The hold's position is unchanged, but since 2026-08-26 the relative order of those two preceding branches **differs per engine** — SpecRev now closes a zero share FIRST, above money-mapping; see "SpecRev payout engine" below.)* `utils/member-payout-hold.ts` `memberHoldReason(member)` reads `members.suspended || members.membership_suspended` → `"suspended"`, else `members.paused` → `"paused"`; a member with any of the three flags gets **no transfer, no member email and no completion stamp**, and the leg parks non-terminally (`"Held - Member Suspended"` / `"Held - Member Paused"` in the `rev_paid` TEXT columns; `held_member_suspended` / `held_member_paused` in `specialist_revenue_lines.payout_status`). **Only the MEMBER leg is held** — strategic-partner, tax-planner and specialist/expert legs pay normally in the same run. The ordering above the no-account branch is deliberate: a suspended member must never trigger the Connect-setup bell or its email. Each hold drafts ONE internal Gmail **draft** (`draftMemberHeldNotice`, template `MEMBERS` / `MEMBER_revshare_held`, never `sendMode`), deduped on the leg's **prior** status so a webhook redelivery (**#327**) or a nightly sweep tick re-holds silently.

**THE NO-CONNECT-ACCOUNT BRANCH IS NOW A CAPABILITY PROBE, ON TAX AND MAP 1 (2026-09-09, v820)** *(v: 2026-09-09)*. `tax/revshare.ts` and `contract-revshare.ts` used to branch on a bare `!member.stripe_account_id`. An Express account exists from the moment an admin clicks *"Set Up Payment Details"*, so that test let a **half-built** account through to a transfer Stripe could only refuse (*"…needs capabilities enabled: transfers"*), which both engines then booked as a generic transfer **`Failed`** with an action-required bell re-raised nightly — the **#159** gap, and it fired for real on plan 91 (Lisa Sheeran) on 2026-09-03. The branch order in both engines is now: hold branch (unchanged) → **`!stripe_account_id || (STRIPE_KEY && !payable)`** → the `!STRIPE_KEY` env-var `Failed` branch (now reachable only when an account id exists — the same rows as before) → transfer. `payable` comes from **`utils/connect-payout-readiness.ts connectTransfersActive(acctId, key)`**: a `GET /v1/accounts/{id}` that is true only when `capabilities.transfers === 'active'` and **false, never a throw**, on no id / no key / any error, so a Stripe outage parks the leg for a night instead of failing the run. `utils/specialist-revenue-payout.ts` has had the identical probe inline since 2026-08-24 and now imports the shared one (**#453**).

Both arms of that branch park the leg at **`AWAITING_CONNECT`** (*"Awaiting Connect Setup"*), which is non-terminal and picked up by both nightly sweeps — Tax's `isRetry` lists it, MAP 1's `resolved` test is a positive allowlist that excludes it — so **`AWAITING_CONNECT` now covers half-built accounts as well as absent ones** and the share pays itself on the first tick after the member finishes onboarding. **The BELL is gated separately from the money:** `connectSetupLinkSent(member)` (= `!!members.connect_setup_email_sent_at`, stamped by `actions/members/stripe-connect-request.ts`) decides whether there is still an ask to make. With no link sent, the held bell is raised as before, its MESSAGE branching on which case it is (*"has not finished onboarding"* vs *"no Stripe payout account"*) while its TITLE is untouched (**#365/#411**). With a link already sent there is nothing an admin can do but wait, so the engine **stays silent and `clearJakeFailure()`s BOTH** the held title and the older `Revenue share transfer FAILED — <client>` title, retiring bells an earlier run raised. **PIP (`msm/pip-revshare.ts`) is deliberately UNCHANGED**: its failure writes `pip_rev_share_status='Pending'` and the 02:00 sweep's PIP pass releases **HELD** statuses only, so parking it non-terminally would strand the payout and its failure bell is the only thing chasing it (**#479**).

### Tax

| Trigger | Chain |
|---|---|
| Retainer (both methods) | → `automation_TAX_confirmationemail` (card gate is **inside** it: stamps `Skipped - Card (Receipt Only)`, also raises the PF bell + copies the signed agreement to the ERT vault) + `automation_TAX_invoicereceipt` (card now / ACH on `payment_intent.succeeded`). On a **3-payment** plan this collects the INITIAL retainer only |
| Client decision 1 (client click **only**) — 2-payment / legacy | `automation_TAX_postreview-client-decision` → `automation_TAX_revshare` |
| Client decision 1 (client click **only**) — **3-payment** | `automation_TAX_postreview-client-decision` → confirmation email draft → `automation_TAX_charge_final_retainer` (off-session, saved method). **The revshare does NOT fire here** |
| **Final retainer settles** (`payment_intent.succeeded`, `payment_kind=final_retainer`) | → `automation_TAX_final_retainer_receipt` (+ a fresh amended invoice when `fee_amended_at_tax4`) → `automation_TAX_revshare` `payment_kind=retainer` **on the FULL retainer** → the "Complete Client decision 2" bell |
| Tax 5 implementation (client click **only**) | `actions/tax/implement-final-decision.ts` → `automation_TAX_charge_implementation` → `automation_TAX_implementation-receipt`. **The whole chain is SKIPPED when `implementation_amount` is `$0.00`** *(2026-09-09, v819)* — an amendment down to the retainer already paid is legal, so the Proceed click records the decision, raises the bell and returns `no_fee_due:true` with no ack email and no charge (#477) |
| Retainer / final-retainer fresh link, **ACH manual bank entry** *(2026-09-08)* | `checkout.session.completed` reads the PI's `status`: `requires_action` ⇒ stamp `retainer_bank_verification_pending_at` / `final_retainer_bank_verification_pending_at` + bell `TAX_ach_bank_verification_pending`; the status columns still write `processing`. The retainer's `_confirmationemail` picks **`TAX_confirmationemail\|ach_verify`** and re-words both retainer bells (the final-retainer link sends no client email, so the bell is the whole signal). `payment_intent.processing` clears the stamp, the settle branches clear it again; `payment_intent.canceled` ⇒ retainer `failed` (generic first-payment resolver), final retainer / implementation `declined` via their late-ACH branches |
| Check | `automation_TAX_paidbycheck` → `automation_TAX_checkcleared` (policy-exempt) |

**THREE-PAYMENT PLANS — the deferred retainer revenue share (2026-08-25)** *(v: 2026-09-02)*. On a revised-fee-process plan of **$31,000 or more** (`THREE_PAYMENT_MIN`; the `$30,000.01–$30,999.99` **buffer band** below it is a 2-payment plan and takes the ordinary immediate path — see [../flows/tax-fee-process.md](../flows/tax-fee-process.md)) the retainer is collected in two payments, so the retainer revshare **cannot** fire at the client's green click — only half the money is in hand. It is deferred to the `payment_intent.succeeded` branch that confirms the FINAL retainer, where it runs **once, on the full `retainer_amount`** (initial + final) with `payment_kind='retainer'`. `actions/tax/revshare.ts` needed **no change**: it already takes its amount from that column. **What holds it until then is one gate, and it is not the obvious one** — the sweep's *candidate* precondition is `retainer_receipt_number`, which is stamped at the INITIAL payment, so the sweep sees the plan as a candidate the whole time it waits; the only thing preventing an early partial payout is that the legs stay **NULL** and the sweep is retry-only. **Never pre-stamp those legs** (**#441**, **#377**). The whole block is latched on `final_retainer_confirmation_status IS NULL`, and a receipt PDF, a Gmail draft and a real Connect transfer all hang off that single latch (**#327**). `automation_TAX_charge_final_retainer` has exactly **ONE** call site — the client's own green click — and, like the implementation charge, **nothing may ever chain it from a sweep**. The "Complete Client decision 2" bell is minted HERE on a 3-payment plan rather than at the admin's Client decision 1 pick; same rule key and title, so `save-task.ts`'s single clear site retires it either way (**#365**). ACH late bounce on the final retainer has its own `payment_intent.payment_failed` branch beside the implementation one, and `payment_kind='final_retainer'` joined the `isOffSession` test so it cannot fall through to the first-payment resolver. Full detail: [flows/tax-fee-process.md](../flows/tax-fee-process.md).

**No revshare chain fires on the tax payment itself.** There is **no 24h auto-lock and no auto-charge anywhere in the tax track** — both were deleted (**#264**, **#398**). `automation_TAX_charge_implementation` has exactly **ONE** runtime call site and **nothing may ever chain it from a sweep again**. `'Auto-Locked'` has zero writers system-wide and survives only on historical rows, which `actions/clients/overview-tax.ts` and `TaxPrioritiesTab` still read — do not delete the readers.

ACH retainer → off-session implementation charge is rejected by Stripe (`us_bank_account not allowed`); the handler degrades to `declined` + a fresh `/tax-pay` link (see [flows/tax-planning.md](../flows/tax-planning.md) failure mode #9).

`automation_TAX_revshare` carries the same **member-standing hold branch** as MAP 1 (see the MAP 1 section above) — member leg only; the **strategic and tax-planner legs still pay** in the same run. The 02:30 sweep's `isRetry` predicate was widened to include the two held values so a reinstated member is paid on the next nightly tick.

### Advisor / Accountant onboarding

Structurally identical — the accountant pipeline is a **file-for-file clone**, so any advisor-shaped constant inside it is suspect (**#329**). Full flow: [../flows/advisor-accountant-onboarding.md](../flows/advisor-accountant-onboarding.md).

| Trigger | Chain |
|---|---|
| Pre-auth, **no deposit** | `automation_{ADVISOR,ACCOUNTANT}_stripecustomer` → `_paymentemail` |
| Pre-auth, **deposit `succeeded`** *(2026-09-04)* | `_stripecustomer` → **`_chargebalance`** — no link, no payment email |
| Pre-auth, **deposit `processing`** *(2026-09-04)* | `_stripecustomer` parks `balance_charge_status='awaiting_deposit'` and chains **nothing** |
| Deposit checkout completed *(2026-09-04)* | → **`_depositconfirmation`** (`<PREFIX>_deposit_received`) — **BOTH card and ACH** |
| Deposit `payment_intent.succeeded` *(2026-09-04)* | settles the deposit; **if the balance was parked `awaiting_deposit` and the agreement is countersigned → `_chargebalance`** |
| Balance `payment_intent.succeeded` *(2026-09-04)* | → `_invoicereceipt` **directly**, + `balance_charge_status='succeeded'` |
| Card payment | → `_invoicereceipt` **directly** |
| ACH payment | → `_confirmationemail`; on `payment_intent.succeeded` → `_invoicereceipt` **directly** |
| 14-day implicit-No (cron) | → `_declineemail` |

**The deposit is a SECOND collection on the same row and the same Stripe customer**, so every branch in `router/webhooks.ts` splits on `payment_kind` carried on the **session** metadata (the PI has not been fetched yet when `checkout.session.completed` picks its branch) and, redundantly, on the PI metadata for the `payment_intent.*` events. The new deposit branch sits **ahead of** the old onboarding-payment block and the old block keeps its own positive guard. Two failure helpers own the two legs — `handleOnboardingDepositFailure` (`deposit_status='failed'`, action bell to Jake, and it **re-chains `_stripecustomer`** if a countersign was parked on the deposit) and `handleOnboardingBalanceFailure` (`payment_status='declined'` + `balance_charge_status='failed'` + a fresh `/advisor-pay` link) — and **the generic first-payment failure resolver now skips both kinds**, because it writes `payment_status`, which belongs to the onboarding payment. Gotcha **#473**.

**`_depositconfirmation` on BOTH card and ACH is a deliberate exception to the #287 purchase-email policy** (card = receipt only): no receipt is issued until the onboarding payment itself completes, so the confirmation is the only acknowledgement the deposit ever gets.

**`payment_amount` still means the TOTAL engagement value.** `load-payment.ts`, `stripe-checkout.ts`, `payment-email.ts` and every webhook fee base net a settled deposit off it — a card deposit that is not netted off records a large NEGATIVE fee.

**The BoldSign `Completed` branch stamps `agreement_signed_by_ceo_at` ONCE-ONLY as of 2026-09-08** (`row.agreement_signed_by_ceo_at || nowIso`). BoldSign redelivers `Completed`, and the unconditional write had been re-dating the countersign on every redelivery — gotcha **#470**. `boldsign-webhook` itself was not touched.

**The confirmation handler no longer chains the receipt downstream** — the webhook owns receipt sequencing on every path (**#289**). Both write `renewal_date` = today + 6 months. **No revshare leg on either** — VFO holds the share internally; accountants *do* now carry a `revenue_decision`, which is **not** a reason to add one (**#375**).

### PIP Meetings

Card → `automation_PIP_invoicereceipt` + `automation_PIP_revshare`, **no confirmation**. ACH → `automation_PIP_confirmationemail` at checkout, then on `payment_intent.succeeded` (gated `pi.metadata.pipeline === "PIP"`) → `_invoicereceipt` + `_revshare`. PIP's gate is at the **call site** because its confirmation handler owns nothing but the email. `automation_PIP_revshare` also **unlocks locked child meetings** (flips `pip_paid=true` on every row whose `pip_purchased_from_track_id` matches) — and since 2026-08-24 it unlocks on a **held** member leg too, because the client has paid regardless of the member's standing. A held PIP leg writes **neither `pip_rev_share_transfer_id` nor `pip_rev_share_completed_at`**.

PIP uses no BoldSign, no storage bucket and **has no cron of its own** — a `Pending` (failed-transfer) leg or a stalled chain still needs a manual service-role re-fire. **NUANCE 2026-08-24** *(v: 2026-08-24)*: PIP rows parked by the member-standing hold ARE swept, by a **new final pass on the 02:00 MAP 1 revshare sweep** which re-fires `automation_PIP_revshare` for every `client_priority_tracks` row with `track_type='pip'` and `pip_rev_share_status` in the two held values. **Held statuses only** — `Pending` was deliberately left out, so "PIP failures are manual" is still true.

### Specialist onboarding

- **Background check** (Stage 3): → `automation_SPECIALIST_bgconfirmation` (**ACH only**, `!isCardS` gate at the call site) + `automation_SPECIALIST_bgreceipt` (card now / ACH on `payment_intent.succeeded`). `payment_intent.payment_failed` → `bg_payment_status='failed'` + Tracy FYI.
- **Monthly licence** (Stage 4, `mode=subscription`) — three separate additive blocks, **not** the customer cascade:
  1. `checkout.session.completed` → records `lic_*` + `automation_SPECIALIST_licconfirmation` (**ACH-only gate lives INSIDE the handler** — two racing call sites chain it, and it returns without stamping so a manual resend stays possible).
  2. `invoice.paid` / `invoice.payment_succeeded` (routed by `lic_stripe_customer_id`; subscription ref via `invoice.parent.subscription_details.subscription`, **#76**) — per-invoice idempotent on `lic_last_invoice_id`. First invoice → `licconfirmation` + `automation_SPECIALIST_licinvoicereceipt` + advance Stage 4→5; recurring → invoice/receipt only. **`processSpecialistLicenseInvoicePaid` now actually skips the $0 `subscription_create` stub** (`amount_due`/`total` must be > 0, mirroring the SpecRev guard, 2026-08-24 / v780) — this line previously asserted the skip while the processor had **no such check**, a pre-existing latent bug on the onboarding path too (**#198**, **#436**). The invoice object is threaded into the processor from all three call sites; no extra fetches.
  3. `invoice.payment_failed` → `lic_payment_status='failed'` + Tracy dunning FYI.

  The licence **reuses `bg_stripe_customer_id`**; the BG cascade branch harmlessly skips a licence event because `bg_payment_status='succeeded'` by Stage 4.
- **Licence CONTINUATION rows** (`specialist_onboarding.license_continuation = true`, 2026-08-24 / v780) ride the same three blocks with three differences: (a) block 1 records **`lic_payment_status='scheduled'`** + progress `payment_setup` for a **deferred** setup — a subscription exists and nothing was charged, classified off `metadata.first_charge` with Stripe's `payment_status='no_payment_required'` only as fallback (**#437**); (b) block 2's **Stage 4→5 advance is gated `!license_continuation`** (the specialist is already live), as are `license-invoice-receipt.ts`'s two Tracy go-live bells; (c) the checkout branch is **ACH-only, flat $99**, with two first-charge shapes — DEFERRED uses `subscription_data[billing_cycle_anchor]`, CATCH-UP uses `subscription_data[trial_end]` **plus a one-time $99 line** (an anchor would defer that line to the anchor's invoice — **#435**). Full flow: [../flows/specialist-license-continuation.md](../flows/specialist-license-continuation.md).
- Go-live: `automation_SPECIALIST_createspecialist` copies DD-checklist files into `specialist-documents`.

### Recurring Specialist Revenue (SPECREV)

Routed by each plan's **dedicated** `stripe_customer_id` — zero collision with licence routing or the cascade.

`checkout.session.completed` (`mode=subscription`) → plan `setup_pending`→`active`, capture ACH last4 + `next_billing_date` (**#199**) → `specialist_revenue_recurring_confirmationemail` (a *setup* confirmation, unaffected by the card policy). `invoice.finalized` pre-creates the month's request row as `processing`. Invoice-paid funnels through `processSpecrevRecurringInvoicePaid` (subscription guard + atomic `claim_specrev_recurring_invoice` RPC) → `received` → chains `specialist_revenue_invoicereceipt` + `specialist_revenue_payout`. `invoice.payment_failed` → `failed` + `SPECREV_recurring_payment_failed_bell` (plan stays active; Stripe retries).

**Never re-pin `verification_method='instant'`** (**#298**) — a recurring plan can legitimately be `active` with an unverified bank; the failure surfaces at charge day. **Both SpecRev builders also carry the shared `custom_text[submit][message]` note as of 2026-09-08** (`constants/ach-checkout-note.ts ACH_BANK_SIGN_IN_NOTE`, steering payers to bank sign-in); the recurring one **prepends** it to its existing *"No charge today…"* sentence. **The unpin is no longer SpecRev-only** — MAP 1 `/pay` and Tax `/tax-pay` joined it the same day, with the webhook work the one-time SpecRev row below describes; see the MAP 1 and Tax tables above, [../integrations/stripe.md](../integrations/stripe.md) "ACH verification", and **#475**.

### One-time SpecRev

`checkout.session.completed` means **SUBMITTED, not PAID** — the handler branches on the PaymentIntent's own `status` (**#370**): `requires_action` → `awaiting_verification` + template **218**; `succeeded` → `received` + invoice/receipt + payout in one breath; anything else → `processing` + the old confirmation. `payment_intent.succeeded` accepts **both** `processing` and `awaiting_verification` — a `processing`-only guard strands the new state forever (**#371**). Three terminal-failure branches (`payment_intent.canceled`, `payment_intent.payment_failed`, `checkout.session.async_payment_failed`) route through `markSpecialistRevenueFailed`, skipping rows already `received`/`failed` — and, since **`v824` (pending, 2026-09-10)**, also skipping a row still `requested` (never submitted) and **any event whose PaymentIntent id is not the row's own `stripe_payment_intent_id`**, because one `stripe_customer_id` collects a PaymentIntent from every Checkout page the payer ever opened and an abandoned page's 24h `automatic` cancel used to fail a booked request (**#484**).

**MAP 1 and Tax took the same shape on 2026-09-08 (v816) but chose the OTHER trade-off**: rather than a fourth status value, the sub-state is a nullable side-column (`*_bank_verification_pending_at`) and `pay1_status` / `retainer_status` / `final_retainer_status` keep saying `processing` — so no enumerating guard had to be audited at all. Both pipelines now also consume `payment_intent.processing` (clear the stamp) and `payment_intent.canceled` (the failure block, widened off `metadata.pipeline === 'TAX'` or a present `metadata.payment_number`); the SpecRev blocks keep sole ownership of `specialist_revenue_requests` via an explicit `metadata.pipeline !== 'VFO_SPECIALIST_REVENUE'` guard. Neither MAP 1 nor Tax has SpecRev's poll-based stall backstop, deliberately. See **#475**.

### SpecRev payout engine — status vocabulary + the once-only Connect email (2026-08-26) *(v: 2026-08-26)*

`utils/specialist-revenue-payout.ts` is shared by **both** SpecRev variants above, by the manual Retry button and by the nightly sweep, and it is the **ONLY writer** of `specialist_revenue_lines.payout_status` — a bare `text` column with **no CHECK**, whose 5-value comment in `20260629000000_specialist_revenue_schema.sql` is a stale snapshot **deliberately left unedited** (**#431**). Because the engine is the sole writer, this list is exhaustive: **NON-TERMINAL** (= the exported `PAYABLE_STATUSES`, re-entered by engine / sweep / Retry) `pending` · `awaiting_connect` · `failed` · `held_member_suspended` · `held_member_paused`; **TERMINAL** (never re-entered) `revenue_share_sent` · `money_mapping` · **`no_payout_due`**.

**`no_payout_due` is new, and its branch is FIRST.** A `memberShare <= 0` line now closes on the opening branch of the chain: no email, no Stripe call, no Express account minted, no bell, `email_drafted_at` and `payout_sent_at` both left **NULL**, plus a `clearJakeFailure` to retire any held bell a prior run parked on the line. It gets its own **`zero`** counter in the summary, **deliberately not folded into `sent`** — both callers spread the summary straight into their JSON response and the sweep sums each key by name, so counting it as `sent` would report money as having moved when none did. It sits **ABOVE the Money Mapping branch — a deliberate divergence from MAP 1's `contract-revshare.ts`**, which puts Money Mapping first: here a $0 Money Mapping line would REAL-SEND *"$0.00 allocated to money mapping"*. Treat the ordering difference as intentional, not as drift. The old unreachable $0 block, which wrote the terminal `revenue_share_sent`, is deleted.

**The nightly "$0.00" email that started this.** `SPECREV_connect_setup` was **real-sending every single night** to an `awaiting_connect` line, and the reason was the button: a **raw expiring Stripe `account_links` URL**, which had to be re-minted to stay valid — so re-sending *was* the design. Both halves are fixed. The button is now the durable **`/payout-setup?token=`** page (`ensureConnectSetupToken` / `connectSetupUrl` — one token per payout entity, shared with the four "Set Up Payment Details" flows, **#268**), and the initial send is **ONCE-ONLY**, guarded on a pre-write read of `email_drafted_at` and stamped only on an actual send. Chasing moved into the sweep as **passes 2c / 2d**: at **2 business days** a reminder that re-sends the *same* `SPECREV_connect_setup` template with a `"Reminder: "` subject prefix and the same durable link (rule `SPECREV_connect_reminder_email`, stamp `connect_reminder_sent_at`); at **4 business days** a **DISMISSIBLE** Tracy FYI (rule `SPECREV_connect_tracy_bell`, `action_required=false`, default `tnmiller@elitert.com`, stamp `connect_pf_notified_at`) — the line self-resolves the moment the recipient onboards, so there is nothing for an admin to action. Both are once-only via an `IS NULL` stamp guard **inside each candidate query**, both rule-configurable, both paced on `businessDelayCutoffIso` (**#396**, **#397**), and both modelled on the recurring-setup ladder already in that file.

**A member with NO Connect account is excluded from both tiers by construction** — nothing is ever drafted to them, so `email_drafted_at` stays NULL and neither `.lte()` can match. They are not forgotten: their nag remains the action-required `SPECREV_member_share_held` bell. Migration `20260826160000_specrev_connect_reminder_stamps.sql` adds the two stamp columns and re-comments `email_drafted_at`, with **no backfill, deliberately** — NULL means "not yet reminded", so the first tick after deploy sends exactly one final reminder to lines that had been receiving the same email daily. Both `notification_rules` rows were **seeded live** (`delay_days` NULL, `default_delay_days` 2 / 4). **UNTESTED LIVE as of 2026-08-26:** no non-zero `awaiting_connect` line exists, so the once-only initial send, the durable-link email, 2c and 2d have never fired.

### BoldSign webhook (standalone function)

Resolves the document through a 5-table cascade: MAP 1 → tax → advisor → accountant → specialist (`lic_boldsign_document_id`). Chains `automation_{ADVISOR,ACCOUNTANT}_stripecustomer` and `_ceocountersign` on the relevant Completed / Signed events, and `automation_SPECIALIST_ceocountersign` / `_licstripecustomer`. A `Declined`/`Expired`/`Revoked` early-return branch chains `automation_AGREEMENT_declined` via service-role (**#180**).

**Column-name trap:** the doc-id column differs per pipeline — `boldsign_doc_id` (MAP 1 / Tax) vs `boldsign_document_id` / `lic_boldsign_document_id` (onboarding) (**#205**). **MAP 1 and Tax never record WHEN an agreement was signed** — bare `'Yes'` flags, `*_at` stamped only on the advisor/accountant branches; Tax's `client_signed_at`/`ceo_signed_at` columns are dead. Raised and **PARKED** (**#384**).

### Failure-event handling

`utils/notify-jake-failure.ts` routes every money-movement failure to Jake's bell **in addition** to existing Tracy/admin/PF alerts. Covered: `checkout.session.async_payment_failed`, `payment_intent.payment_failed` (incl. LATE-ACH bounces of off-session MAP 1 installments and Tax implementation charges, each guarded on `'processing'` — **#229**), **`payment_intent.canceled`** (SpecRev since 2026-08-11; **MAP 1 + Tax since 2026-09-08**, running the same block as `payment_failed` — micro-deposit expiry emits `canceled`, not `payment_failed`, **#475**), `customer.subscription.updated`/`deleted`, `charge.dispute.created`/`closed`, `charge.refunded` + refund events, `transfer.reversed`, and `payment_intent.partially_funded` (bank-transfer SpecRev; received-so-far derived from `amount_remaining` because a `customer_balance` PI reports `amount_received=0` until fully funded — **#184**).

**Alert policy:** action-required + auto-clear for rev-share / licence / disputes; dismissible FYI for the rest (**#122**). Every one of these only fires if the Stripe endpoint **subscribes to the event** in both modes.

### `checkout.session.expired` — abandonment

One additive isolated block, **two SPECREV pipelines only**, branching on `session.metadata.pipeline`, each carrying the `event.livemode`-vs-row-`sandbox` guard → `SPECREV_checkout_abandoned_bell`. An expired session has **no PaymentIntent**, so routing keys must be stamped at **session** level (**#299**).

---

## Sweeps — the cron half of the chain graph

**17 `pg_cron` jobs, all active** (verified live 2026-09-08 — derive, never trust this number). Staggered to avoid races on the same row. All invoke `vfo-admin-api` with the service-role key.

| Time (UTC) | Job | Handler | Does |
|---|---|---|---|
| `*/5 * * * *` | `reminder-sweep-5min` | `reminders/sweep.ts` | Delivers due `personal_reminders` via a **direct** `notifications` insert — the one documented **#176** exception |
| `*/5 * * * *` | `onboarding-meeting-reminder-sweep-5min` (**jobid 18, NEW 2026-09-04**) | `onboarding/meeting-reminder-sweep.ts` | The preliminary-meeting **countdown** ladder for BOTH onboarding pipelines. (a) reminder when `meeting_reminder_due_at <= now` **AND `meeting_at > now`** — the second half is what makes a meeting booked inside the window send on the next tick instead of never; (b) 60 min and (c) 10 min out, **both gated on `meeting_response='confirm'`**. Each tier stamps its guard column only after the send succeeded; **every query filters `status='active'`**. All six templates are **`send_mode=true`** (real sends; census 11 → 17, #325) — a draft nobody sends in time is no reminder. Reschedule RE-ARMS the whole ladder incl. `meeting_response` (**#472**, the inverse of #404) |
| 02:00 | `revshare-sweep-daily` | `pipeline/contract-revshare-sweep.ts` | Retries failed MAP 1 revshare + the MAP 1 3-stall reminder ladder + **(2026-08-24) a final pass re-firing `automation_PIP_revshare` for every held PIP member leg** — PIP has no cron of its own, so this is the only thing that releases one; returns `pip_held_refired`. **The 3-stall ladder (6 queries) filters `status='live'` since 2026-08-26; the three money loops in the same handler deliberately do NOT** — see *What ELSE stops a ladder* below |
| 02:30 | `tax-revshare-sweep-daily` | `tax/revshare-sweep.ts` | **Sextuple duty** — see below. Its `isRetry` now also accepts the two member-held values (reason `member-held`) |
| 03:00 | `chargescheduled-sweep-daily` | `pipeline/contract-chargescheduled-sweep.ts` | Off-session MAP 1 installments — **calendar dates, weekends included** |
| 04:00 | `check-reminder-sweep-daily` | `pipeline/contract-check-reminder-sweep.ts` | 7-business-day pre-due nudges + uncleared-check bells + `sweepMigrationSetupLinks` |
| 05:00 | `advisor-sweep-daily` | `advisor/sweep.ts` | **4 stalls** × 2/4 + the 14-**calendar**-day auto-decline. **All queries filter `status='active'` since 2026-08-26** (the auto-decline also WRITES `status='stopped'`). **Tier (d) added 2026-09-04**: the unpaid Membership **Deposit** — rules `ADVISOR_stall_deposit_email` / `_bell`, template `ADVISOR_deposit_reminder`, ack column `deposit_pf_ack_at` |
| 06:00 | `accountant-sweep-daily` | `accountant/sweep.ts` | Same shape as advisor, incl. tier (d) |
| 07:00 | `specialist-sweep-daily` | `onboarding/sweep.ts` | **7 stalls** × 2/4; no auto-decline. **+ tier 7b (2026-08-24)**: licence **CONTINUATION** link sent but not set up — same 2/4 ladder, template `SPECIALIST_lic_continuation_reminder` (pipeline `SPECIALIST_LICENSE_CONTINUATION`), **reusing tier 7's rule keys and guard columns** (no new `notification_rules`). "Done" is `lic_subscription_id IS NOT NULL`, **not** a payment — a deferred setup completes with no money moved (**#437**). Tier 7 unchanged |
| 08:00 | `pft-sweep-daily` | `pft/sweep.ts` | Partnership Fast Track, 3 ladders; no auto-decline |
| 09:00 | `tax-presentation-sweep-daily` | `tax/presentation-sweep.ts` | Drafts `TAX_presentation_link` — **drafts only, never auto-sends** |
| 09:30 | `regular-map4-followup-sweep-daily` | `regular/map4-followup-sweep.ts` | MAP 4 3-tier chained ladder (**#175**) |
| 10:00 | `growth-overdue-sweep-daily` | `growth/overdue-sweep.ts` | No delay offset → **early-returns on Sat/Sun UTC** |
| 10:30 | `notifications-purge-daily` | `notifications/purge-sweep.ts` | Hard-deletes READ notifications > 90 days; unread never touched |
| 11:00 | `specialist-revenue-payout-sweep-daily` | `specialist-revenue/payout-sweep.ts` | **Five pass groups**, numbered 1 · 2 · 2b · 2c/2d · 3: payout retries, one-off payment ladder, awaiting-verification backstop, **NEW (2026-08-26) Connect-setup ladder 2c/2d** (2-business-day reminder email + 4-business-day dismissible Tracy FYI, clocked off the line's `email_drafted_at` — see "SpecRev payout engine" above), recurring-setup ladder. **Pass 1's candidate query is the EXPORTED `PAYABLE_STATUSES`** from `utils/specialist-revenue-payout.ts` (2026-08-24) — not a literal list — so it can never drift from the engine's own re-entry set, and it now carries `held_member_suspended` / `held_member_paused`. Being a **positive** list it also excludes the new terminal `no_payout_due` by construction |
| 12:00 | `membership-sweep-daily` | `membership/sweep.ts` | **5 passes**: renewal notices → renewals → waive $0 → one combined charge per plan → auto-unsuspend. **Pass 4 now also CHAINS** — see "Member reinstatement" below; summary gains `payouts_released` |
| 12:30 | `gc-recurring-sweep-daily` | `gc/recurring-sweep.ts` | **NEW 2026-08-27.** Charges every due `gc_subscriptions` row out of the member's **credit** balance (no Stripe, no money). **NO weekend skip** — deliberately unlike `growth-overdue-sweep-daily` above, which it was cloned from: these are date-anchored charges and member-facing emails, not admin bells landing on a Saturday. Charges the service's **current** `credit_cost`; a deactivated / re-`one_time`d service **skips in place**. **Claims the period optimistically BEFORE deducting** (advance `next_charge_date` with `.eq` on the value read + `.select()`; zero rows ⇒ another run has it). **Re-anchors from TODAY, never the stored due date (#456)** — else a funded hold is charged nightly until it catches up. Short balance ⇒ `on_hold` + one `GC_recurring_out_of_credits` draft per episode (`on_hold_notified_at` is the guard) and the date is **not** advanced. Renewals write `gc_transactions` only, **never** `gc_redemptions`. Returns `{charged, held, skipped}` |

### Reminder-ladder time unit — read before touching any tier

**Every reminder / stall ladder counts BUSINESS DAYS (Mon–Fri, UTC), not calendar days.** The mechanism is `utils/notify.ts` `businessDelayCutoffIso(days)` — a backward whole-weekday walk, with any fractional part subtracted as plain hours **AFTER** the walk. **That order is load-bearing**: reverse it and a fractional delay goes non-monotonic across a weekend, so a "4 day" PF bell fires before its "2 day" reminder (**#397**). The forward counterpart `businessDayHorizonDateOnly` serves the **countdown** horizons — the Tax 2 assess-form reminder (**two tiers since 2026-08-20**: early at 5 business days, last-call at 2) and the MAP 1 check lookahead.

`notification_rules.delay_days` was **not** renumbered — only the unit moved, so a rule row read in isolation no longer tells you which calendar it counts against; the caller does (**#396**). The calendar helper `delayCutoffIso` survives with **zero callers**, kept so a future tier can opt back in deliberately.

### What ARMS a ladder — and why a resend must not (2026-08-16, #404)

A ladder's clock is a `*_sent_at` / `*_notified_at` column stamped by the handler that sent the thing being chased. **That makes every "resend" button a live re-arm hazard**: calling the send handler again re-stamps the clock and the chase restarts from zero, silently, for a form the recipient has had all along. The nine reschedule affordances added on 2026-08-16 therefore pass an explicit **`reschedule: true`** and each ladder write sits behind `!reschedule`:

| Handler | Ladder column(s) skipped on `reschedule` | Sweep that reads them |
|---|---|---|
| `pft/meeting-email.ts` | `discovery_email_sent_at`, `discovery_pf_notified_at` (token preserved) | `pft/sweep.ts` |
| `onboarding/prelim-email.ts` | `sif_email_sent_at` | `onboarding/sweep.ts` |
| `onboarding/stage2-email.ts` | Tracy's `allDone` revenue-share bell (not a column) | — |

**Three sites deliberately DO re-arm, and the difference is the direction the delay is counted.** `tax/ready-for-tax3.ts` nulls `tax3_assess_reminder_sent_at` **and, since 2026-08-20, `tax3_assess_reminder_early_sent_at`** when the booked date genuinely moves, because that reminder **counts down to the meeting** (#359) and a moved meeting invalidates it — the guard is an OR over the two stamps and the clear covers both, so a new countdown tier must be added in both places or it silently survives a reschedule. `regular/map4-set-meeting-date.ts` nulls all three of `map4_followup_sent_at` / `map4_reminder_sent_at` / `map4_stall_notified_at` on a genuine date change — a user-approved decision to re-draft the MAP 4 follow-up ladder against the new date. `tax/highlevel-meeting-confirm.ts` needed no change at all: it already nulls `tax4_meeting_reminder_last_sent_at` on every confirm. **Forward-counted ladders must not re-arm; backward-counted (countdown) ones must.**

**The mirror case — a COUNTDOWN ladder must re-arm, and #404 does not apply to it (2026-09-04, #472).** The preliminary-meeting reminder counts DOWN to an instant (`meeting_at`), not FORWARD from an unanswered ask. When the meeting moves, every stamp describes a moment that no longer exists, so **Reschedule nulls `meeting_reminder_sent_at`, `meeting_reminder_60m_sent_at`, `meeting_reminder_10m_sent_at` AND `meeting_response` / `meeting_response_at`** and lets the whole ladder run again. Clearing the *response* with the stamps is the part that is easy to miss: the 60- and 10-minute tiers are gated on `meeting_response='confirm'`, so a kept confirmation would fire two countdown emails at a time the prospect never agreed to — the answer belonged to the old question. **Ask which kind of ladder you have before copying either rule.**

### What STOPS a stall ladder — the ack refire guard (2026-08-19, v760)

Until v760 a stall ladder had **no off switch**: the 4-business-day PF bell was minted whenever the stall's own guard column said the tier had not fired, and the "Reached out?" acknowledgement (`<stall>_pf_ack_at`, #381) was written by nobody's reader. Ticking the box therefore did not stop the chase — it recorded that someone had chased, and the next nightly tick minted again over the top of it. **Every sweep that mints a stall bell now filters `.is("<stall>_pf_ack_at", null)`:**

| Sweep | Pipeline |
|---|---|
| `pipeline/contract-revshare-sweep.ts` | MAP 1 |
| `tax/revshare-sweep.ts` | TAX |
| `advisor/sweep.ts` · `accountant/sweep.ts` | advisor / accountant onboarding |
| `onboarding/sweep.ts` | specialist onboarding |
| `pft/sweep.ts` | Partnership Fast Track |
| `regular/map4-followup-sweep.ts` | Regular Priorities (MAP 4) |

So the ack is now a genuine **satisfied-on-fire guard** in the #365 sense, and the same tick also clears the step's existing unread bells (see [../flows/notifications.md](../flows/notifications.md)). **Two consequences for a sweep author.** (1) A new stall ladder must add the column, the UI checkbox **and** this guard — a column without a guard is the old inert shape and reads as done while the chase continues. (2) The guard stops a re-*mint*, not a re-*arm*: `pft/meeting-email.ts` still **nulls `discovery_pf_notified_at`** on a plain (non-`reschedule`) send, which resets the tier the guard was protecting, so the two mechanisms can still disagree on that one path. Verification is owed against the first cron run after 2026-08-19.

**Deliberate calendar survivors — owner decisions, do not "finish the job":** advisor + accountant 14-day auto-decline, the Tax 4 meeting-passed nudge, the membership 30-day renewal notice, the chargescheduled sweep, the notifications purge, personal reminders, and every token/session expiry window.

### What ELSE stops a ladder — a stopped engagement (2026-08-26, v793)

The ack guard above silences **one tier of one stall**. A **stopped engagement** silences every ladder on the row at once, by making the sweep's own row selection consult a first-class status column. Three pipelines gained one:

| Column | Values | Silences |
|---|---|---|
| `pipeline_map1.status` | `'live'` \| `'stopped'` | the **6** ladder queries in `pipeline/contract-revshare-sweep.ts` — c14 decision, c17 signing, pay1 payment, each in an email tier and a PF-bell tier |
| `advisor_onboarding.status` | `'active'` \| `'stopped'` | all **8** ladders in `advisor/sweep.ts` (**6 + the deposit tier's pair, 2026-09-04**) **plus the 14-day auto-decline query** — and, since 2026-09-04, **all three tiers of the preliminary-meeting countdown** in the shared `onboarding/meeting-reminder-sweep.ts` |
| `accountant_onboarding.status` | `'active'` \| `'stopped'` | the same eight + auto-decline in `accountant/sweep.ts`, and the same three meeting tiers |

`specialist_onboarding.status` already carried `'active' \| 'stopped' \| 'completed'` and its sweep was already filtered — no change there, and it is the shape the two new columns were modelled on.

- **Every one of these columns is `NOT NULL DEFAULT '<live value>'`, and that is load-bearing.** The filters are `.eq("status","live")` / `.eq("status","active")`. PostgREST **`.neq` silently drops NULL rows** (#437), so a nullable column would have made every legacy row invisible to its own ladders — the exact inverse of the intended behaviour, and silent. Do not relax the NOT NULL.
- **MONEY IS DELIBERATELY UNFILTERED, and the split runs THROUGH one handler.** Inside `contract-revshare-sweep.ts` the six ladder queries filter on status while the **rev-share candidate loop, the strategic-partner retry and the PIP held-release in the same function do not** — a client who owes money keeps being collected from and paid out on after a stop. `contract-chargescheduled-sweep.ts` and `contract-check-reminder-sweep.ts` were **never touched at all**. Stopping is about silence, not about writing money off; **"Cancel all remaining payments" (Step 10¾ of [../flows/contract-and-payment.md](../flows/contract-and-payment.md)) is the money tool** and is entirely independent of this.
- **The auto-decline WRITES the status as well as reading it.** `advisor/sweep.ts` and `accountant/sweep.ts` now set `status:'stopped'` alongside `final_decision:'Auto-Declined'`, so a row the sweep implicitly declined stops chasing itself on the next pass.
- **Bare `text`, no CHECK** (#431) — every enumerating predicate has to be taught a new value by hand.

### `tax-revshare-sweep` — the seven blocks

1. **Retries only** — failed tax revshare (retainer + implementation) and stranded strategic transfers. It does **not** auto-start revshare on a plan that has not reached an explicit client click. `isRetry` = `rev_share='Pending'` **OR** `rev_paid` ∈ {`Failed`, `Awaiting Connect Setup`, **`Held - Member Suspended`, `Held - Member Paused`** *(added 2026-08-24)*} — all of them writable only AFTER the client's decision-1 click, which is what keeps "retry-only" true.
2. Tax 4 post-review timers — 2-business-day reminder + 4-business-day PF bell on **both** the Continue and Undecided picks (shared guard columns, **#264**).
3. Tax 5 implementation timers — **four tiers, no charge among them** (**#398**). Proceed and Undecided ladders share `implementation_reminder_sent_at` / `implementation_pf_notified_at`; safe only because `implementation_decision` is single-valued.
4. Tax 3 reminder timers — 2/4 on three stalls.
5. Tax 4 meeting-date nudge — **one persistent action-required bell** per plan (`dismissible:false`), not an email, not a daily repeat. Recipients: assigned PF + allocated planner + Tracy, with a per-recipient planner link override (**#292**).
6. Tax 2 assess-form reminder, **last-call tier** (2 business days) — **one of the only rules that count DOWN** (business days *before* `tax3_meeting_date`, via `businessDayHorizonDateOnly`). Forks to `TAX_tax3_assess_reminder|vault` for vault-assess groups, and **that chosen name must be passed to both the template lookup and `gmailDraftFetch`** or the Draft/Send toggle silently resolves against nothing (**#356**, **#400**). Stamps its guard column **only after a successful draft**.
7. Tax 2 assess-form reminder, **early tier** (2026-08-20, rule `TAX_tax3_assess_reminder_early_email`, default 5 business days) — block 6 repeated a working week out, on its own guard column `tax3_assess_reminder_early_sent_at` and its own `…_early` / `…_early|vault` template pair. **Its window is the half-open range past block 6's horizon** (`> assessHorizon` and `<= assessEarlyHorizon`), which is what keeps the two tiers off the same night and makes the block self-empty if the early delay is ever configured at or below 2. Same fork discipline, same stamp-only-on-success semantics.

### Member reinstatement — TWO new chain sources (2026-08-24) *(v: 2026-08-24)*

Reinstating a member releases every revenue-share leg the standing hold parked, **instantly** rather than at the next nightly sweep. Both callers go through `utils/member-payout-release.ts` `releaseHeldMemberPayouts(supabase, memberNumber)`, which resolves the member's clients by **BOTH linkages** — `clients.member_number` **and** `clients.client_ref LIKE '<member>-%'`, because MAP 1 reads the owner off the ref prefix while Tax/PIP read the column — and then chains, sweep-style, over HTTP with `Authorization: Bearer <SERVICE_ROLE_KEY>`. Nothing throws: a failed leg is collected into `results` and the rest still run.

| Held leg found | Chained body |
|---|---|
| `pipeline_map1.rec{N}_rev_paid` (N = 1–4) | `{ action: "automation_CONTRACT_revshare", client_id, payment_number: N }` |
| `client_tax_plans.{retainer\|implementation}_rev_paid` | `{ action: "automation_TAX_revshare", tax_plan_id, payment_kind }` |
| `client_priority_tracks.pip_rev_share_status` (`track_type='pip'`) | `{ action: "automation_PIP_revshare", priority_track_id }` |
| `specialist_revenue_lines.payout_status` (member lines) | `{ action: "specialist_revenue_payout", request_id }` — deduped to the distinct parent requests, since that engine is per REQUEST |

**The two call sites:**

1. **`actions/members/profile-save.ts`** — reads the three standing flags **before** the upsert, and when a hold existed it **re-reads the row after** the upsert (never merges the payload: several call sites save a PARTIAL profile). Non-null → null transition ⇒ release. The response gains an **additive** `payout_release: { fired, results }` key; a save with no transition returns the old bare `{ success: true }`.
2. **`actions/membership/sweep.ts` pass 4** — after `membership_suspended` is cleared for a caught-up plan, it re-reads the row and releases **only if no hold reason remains** (the admin's own `suspended` / `paused` toggles hold independently, **#240**). `summary.payouts_released` accumulates the fired count.

Re-firing a member who is **still** flagged is a safe no-op: every engine re-checks standing on entry and re-holds idempotently, and the internal held notice is deduped on the leg's prior status. So the release is "fire everything that is parked", not "decide who is eligible".

### Admin-driven paths (no webhook involved)

Check payments (`_paidbycheck` → `_checkcleared`, MAP 1 P1–P4 and tax retainer) and the tax **deposit refund** run entirely admin-driven. The refund lives on one decision step in Tax 1 (`program_client_tasks` 116, sentinel `tax_refund`): **Proceed** writes status `'Proceed'`; **Refund** writes no status at all and fires `automation_TAX_depositrefund`, which **requires** a `reason` (400 without it) filling `[Refund Reason]` in template 181 (**#293**).

---

## Adding a new chain — checklist

1. Chain over **HTTP**, never a direct call. Forward `body.token` if the target is an AUTH handler (**#11**).
2. Name the **idempotency column** that proves the side effect already happened, and check it first — Stripe redelivers (**#327**).
3. Set `metadata.pipeline` **and** `metadata.payment_kind` on anything you create in Stripe (**#13**).
4. Decide the purchase-email gate's **placement** deliberately — call site vs inside the handler (**#287**).
5. If a `tax_planner` can reach the entry point, allowlist **and** guard the entire chain closure (**#257**).
6. Subscribe any new Stripe event on the endpoint **in both modes**, or the handler is dead code.
7. Pick the ladder's time unit explicitly — business days by default (**#396**).
8. Run the 5-pipeline smoke gate after deploy; it proves wiring only, never chain semantics.
