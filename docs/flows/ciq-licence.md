# CIQ licence — the $25/month Standard client portal (portal licensing L4)

> Flow of record for the member's per-client Standard portal licence. Plan + decisions: [../plans/portal-licensing/README.md](../plans/portal-licensing/README.md) §3 L4 (decisions 35-58). Tables: [../tables/ciq.md](../tables/ciq.md) (`member_portal_billing`, `ciq_licence_subscriptions`) and [../tables/tax.md](../tables/tax.md) (`client_portal_licenses`, `source='ciq'`). Webhook block: [../architecture/07-server-chains.md](../architecture/07-server-chains.md) *VFO Portal CIQ licence*. Built 2026-10-16 on `claude/vfo-session-starter-474d85`. *(v: 2026-10-16)*

## Switches

- **`ciq_licence`** (shown as the **Standard portal, $25 a month**, inside the Feature Switches card *VFO Client Portal* since 2026-10-19 — the card flips it with `portal_licensing`, `client_basic_portal` and `tpom_additional_benefits`; new subscriptions' Stripe description reads `VFO Portal - Standard portal - <client>`, the product name and the `INV-CIQ` / `REC-CIQ` numbers unchanged), keyed on the client's OWNER. It needs **`client_basic_portal`** on too — the Basic / Standard split only exists under L2. Every member action refuses (403, `FEATURE_OFF_MESSAGE`) unless BOTH are on for the caller. Off = exactly the pre-L4 behaviour: no `ciq_licence` key in any payload, no My One Page Plan tab.
- **`members.ciq_enabled`** is the MSM's "member drives CIQ" switch (decision 37). While `ciq_licence` is on for a member, the admin CIQ Settings toggle reads *Member drives CIQ (training complete)* (`ciq_load_settings` returns `ciq_licence`). While `ciq_licence` is **On for all**, every member INSERT writes `ciq_enabled=false` (`utils/feature-flags.ts newMemberCiqFields`: `members/add-full.ts`, `advisor/create-member.ts`, `accountant/create-member.ts`, and `members/profile-save.ts` for a brand-new member only). Existing members are never touched.

## What the client gets

| Tier | How | What |
|---|---|---|
| Basic | default; the member does the CIQ for free | Showroom only. Recorded as ONE `client_portal_licenses` row `source='ciq'`, `tier='basic'`, `amount 0`, `ends_on NULL` (decision 47), written fail-soft by `ciq_create` / `ciq_add_client_and_create` the first time a CIQ is started while the switch is on (`recordFreeCiqLicence`). Never lights Standard. |
| Standard | the member turns on the $25 (or the client holds a tax licence) | Vault + **My One Page Plan** (read-only, latest + history, never the answers — decision 41; `client_ciq_plan_load`, from the session only). A month is Standard only when a PAID `client_portal_licenses` row (`source='ciq'`, `tier='standard'`, the invoice's billing period) covers today. |

**2026-10-20:** the member client screen's One Page Plan card and its action `member_mirrored_ciq_plan_load` were retired — no member (owner or L5 mirrored) sees a One Page Plan card on the client Profile tab; the owner reaches the CIQs through the client page's CIQ tab. `client_ciq_plan_load` (the client's own *My One Page Plan*) is unchanged.

## The member's card (member client Profile tab → CLIENT PORTAL → *Standard portal - $25/month*)

`msm_load_client_home.ciq_licence` = `utils/ciq-licence.ts ciqLicenceView` (never for a mirrored viewer; admins see the card **read-only**, decision 6). States:

| State | Means | Buttons |
|---|---|---|
| `covered` | an active TAX licence — no charge (decision 40) | none |
| `basic` | no open subscription | *Turn on Standard portal* (greyed until portal access is sent — decision 48) |
| `processing` | active/ending but NO paid month covers today: a bank payment clearing (first month, a monthly bank renewal, or a payment just restarted on a new method), or a card payment seconds from confirming | none |
| `active` | paid month covers today | *Turn off*, *Change payment method* |
| `ending` | turned off; runs to the end of the paid month (decision 39) | *Keep it on*, *Change payment method* |
| `past_due` | a payment FAILED (`payment_failed_at` set) | *Update payment method*, *Turn off* |

After a return from Stripe (`?ciq_licence=done` / `?ciq_billing=done`, read once then dropped from the URL) the webhook usually lands a few seconds AFTER the page (#631), so the card shows *"Updating… This page updates on its own"* and polls `member_ciq_licence_status` every 3 s for up to 90 s (also while a card payment is `processing`) — nobody is asked to refresh (Jake, 2026-10-16). Back to Clients from a freshly loaded page goes to the list, never back into Stripe (history `idx`).

## Money

- **One Stripe customer per member** (`member_portal_billing`, per account + mode) and **one subscription per client** on it (decision 35). VFO Services account for now (decision 36), sandbox + account from the **TAX** `pipeline_sandbox_config` row plus the 59524 force. Every Stripe-visible text reads `VFO Portal - …`.
- **Price:** card = $25 + 2.9% + $0.30 = **$26.06**; bank = **$25.00** (decision 51, `ciqChargeCents`). Bank is Stripe sign-in only (`verification_method=instant`, #491) — first payment charged at once.
- **Turn on** (`member_ciq_licence_start`): refuses a foreign / mirrored client (403), no login (400), a tax-covered client (409 + `covered_until`), an open subscription (409). A saved method → the subscription is created off-session on the fixed product `vfo_portal_ciq_licence` (idempotency `ciq-lic-<row id>`); none (or a decline) → the token page **`/portal-license-pay`** (card / bank tiles, PUBLIC `portal_license_pay_load` / `_checkout`, the row's `checkout_token` is the whole credential, #310) → Checkout `mode=subscription` → back to the member client page.
- **Turn off / Keep it on**: `member_ciq_licence_stop` / `_resume` = `cancel_at_period_end` true / false.
- **Every paid month** writes the licence row (claimed by the unique `stripe_invoice_id`; resolved by the STORED subscription id, falling back to the subscription's own `ciq_subscription_row_id` metadata because Stripe can send `invoice.paid` before `checkout.session.completed`, #630) and chains `automation_PORTAL_ciq_licence_invoicereceipt` — the house INV-/REC-CIQ-<member ref> pair + email 319 (decision 46). A first bank payment also sends 320 at submit (#287).
- **Change / Update payment method** (`member_portal_billing_update_card {client_id, method}`): the member picks card or bank IN THE PORTAL first; the panel warns that it changes **ALL** of their Standard portal subscriptions, how many, and the new monthly amount (Jake, 2026-10-16). Checkout `mode=setup` for that one method → `ciqBillingUpdateCompleted` makes it the customer default and moves EVERY billed subscription (active / ending / past_due): sets `default_payment_method`, re-pins `payment_settings.payment_method_types` (#627), re-prices onto `vfo_portal_ciq_licence` when the price changes (#626). An overdue month on a NEW price is voided and restarted today (`billing_cycle_anchor=now`, so that client's date moves); on the SAME price it is retried on the new method. A restarted / retried month clears the failure and reads `processing`. Stamps `member_portal_billing.methods_moved_at` (what the card polls for). Anything Stripe refuses → `FAILURE_ciq_licence` bell to Jake.

## A failed payment (Jake, 2026-10-16: emails only, no bells)

1. `invoice.payment_failed` → row `past_due`; **once per invoice** (the invoice id is claimed in `failure_notified_invoice_id` before sending, #611 — Stripe re-sends the event on every retry) → email **321** `MEMBER_ciq_licence_payment_failed` (Update payment method button → the member client page; *"updating it once fixes every one of them"*). Stamps `payment_failed_at`, `failed_amount`.
2. **2 business days later**, still `past_due` → ONE reminder, email **323** `MEMBER_ciq_licence_payment_failed_reminder`. Run by the daily membership sweep (**pass 6**, inside the ET business-hours window, #552) through `utils/ciq-licence-reminder.ts`; `automation_PORTAL_ciq_payment_reminders` (PUBLIC, service-role ONLY) runs that pass alone, without the sweep's money passes.
3. A paid invoice clears `payment_failed_at` / `failure_reminder_sent_at`. Stripe's own `past_due` status no longer flips a row back to past_due unless a failure is on record — a replacement bank payment keeps the subscription past_due at Stripe for 3-5 days (#628).

The paid month already covers the client until its `ends_on`, so a renewal failure drops them to Basic at the renewal date; a member with several clients gets one failure email per client as each renews (they share one method, so one update fixes all — option 1, Jake).

## A tax licence takes over (decision 40)

`tax/invoice-receipt.ts`, only when `grantTaxLicence` returns **`granted`** (never `already` — a later payment on the same plan must not stop a $25 turned on after the tax licence ended) → `utils/ciq-licence-supersede.ts supersedeCiqLicence`: each open row is CLAIMED `superseded` first (so the `customer.subscription.deleted` that follows finds it settled), then the Stripe subscription is cancelled at once (no proration, no refund) or an open Checkout expired; a Stripe refusal puts the row back and bells Jake. Email **322** `MEMBER_ciq_licence_superseded` where a subscription was billing.

## Emails (all Draft; To member, Cc Tracy `tnmiller`, Bcc Paul + Anton; the member's Cc-flagged Additional Contacts join centrally)

| id | Template | When |
|---|---|---|
| 319 | `MEMBER_ciq_licence_invoicereceipt` | every paid month, with the INV + REC PDFs |
| 320 | `MEMBER_ciq_licence_ach_confirmation` | first month paid by bank, at submit |
| 321 | `MEMBER_ciq_licence_payment_failed` | a failed invoice, once |
| 322 | `MEMBER_ciq_licence_superseded` | a new tax licence stopped a billing $25 |
| 323 | `MEMBER_ciq_licence_payment_failed_reminder` | 2 business days after 321, still unpaid |

**Bells:** only `FAILURE_ciq_licence` (Jake — a Stripe refusal on supersede or a method move) and the reused `FAILURE_ach_first_payment` (a paid month whose INV/REC numbers could not be reserved). Nothing to the member or the team.

## Security

Every member action sits in NO gate list and is fenced in-handler: member caller only (admins read, never write), `denyIfNotOwnClient` on `auth.callerMemberNumber` (a mirrored member is refused, #601), then both switches. `client_ciq_plan_load` is in `CLIENT_ALLOWED_ACTIONS` and reads only `auth.callerClientId`. The two tables are RLS deny-all. Probe: `scripts/probe-l4-ciq-licence.ps1` (writes nothing).

## Owed at go-live

Flip 319-323 to Send before the switch goes on for real members; decision 38 (any revenue-share change when a member drives CIQ) is OPEN; the first LIVE subscription should show no `cancel_at` (the sandbox dashboard's 90-day "Auto-cancels" is display-only, #629). The tax takeover is LIVE-PROVEN in sandbox (2026-10-16, Test Client 1457 / plan 280: tax row granted, the $25 cancelled at Stripe, the row stayed `superseded` through the `.deleted` webhook, 322 drafted, no failure bell).
