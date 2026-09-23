# Specialist Background Check payment requests

> Added 2026-09-23 (not yet deployed). Accounting → Specialists → **VFO Specialist Background Checks** (tab key `specialist_bg`). An admin sends a specialist a one-time, any-amount background-check payment link; the specialist pays by card (fee passed on) or bank transfer (no fee).
>
> **Not the onboarding Core/Max check.** That one lives on `specialist_onboarding.bg_*`, is emailed at Stage 3 and is documented in [specialist-onboarding.md](specialist-onboarding.md). The two share a display list and nothing else — no table, no Stripe customer, no metadata, no webhook branch.

## Pieces

| Piece | Where |
|---|---|
| Table | `specialist_bg_requests` — [../tables/specialists.md](../tables/specialists.md) |
| Migrations | `20260923130000_specialist_bg_requests.sql` (table + RLS deny-all) · `20260923130100_specialist_bg_requests_templates_rules.sql` (4 templates + 4 rules) |
| Send (AUTH, `TAB_ACTIONS.accounting`) | `specialist_bg_request_send` — `actions/specialist-bg/request-send.ts` |
| Pay page (PUBLIC) | `/specialist-pay?kind=bgreq&token=` (`SpecialistPayPage.jsx`, same route as the onboarding + licence pages) → `automation_SPECIALIST_bgreqload`, `automation_SPECIALIST_bgreqcheckout` |
| Chain targets (PUBLIC + service-role-or-admin gate) | `automation_SPECIALIST_bgreqconfirmation`, `automation_SPECIALIST_bgreqinvoicereceipt` — by hand only with an `admin_sessions` token whose `login_type` is `admin` (or legacy NULL); another portal's session is refused (#425) |
| Webhook | `utils/specialist-bg-request-webhook.ts`, called from one block in `router/webhooks.ts` ahead of the customer cascade — [../architecture/07-server-chains.md](../architecture/07-server-chains.md) |
| Reminder ladder | `automation_SPECIALIST_sweep` (07:00 UTC) tier 8 |
| Loader | `specialist_bg_payments_load` → `{ payments, requests }` |
| UI | `SpecialistBgPanel.jsx` (pill 1 + the send form; exports `bgRowsFrom`) · `SpecialistBgReconciliationPanel.jsx` (pill 2) · `SpecialistBgOutstandingPanel.jsx` (pill 3) |
| Test override | `constants/test-sandbox.ts` `TEST_SANDBOX_EXPERT_IDS = [6137]` (the production "Test Specialist") — a request to it is minted `sandbox` whatever the toggle says |

## Lifecycle

1. **Send.** Admin picks a specialist (must have an email) and an amount (> 0, ≤ 2 decimals, ≤ $10,000). **One open request per specialist:** if the specialist already has a `requested` or `processing` row the send is refused with 409 (wait for it to be paid, or see the Outstanding pill); a `failed` row does not block. The handler reads the `SPECIALIST_ONBOARDING` sandbox toggle (forced ON for `TEST_SANDBOX_EXPERT_IDS`), mints a FRESH Stripe customer, inserts the row (`requested`, `sandbox` stamped) and drafts `SPECIALIST_bgcheck_request`. If the draft fails the row is deleted and the admin just sends again.
2. **Pay page.** The token row is the whole credential (#310). Card = amount grossed up 2.9% + $0.30; ACH = `us_bank_account` **pinned to instant verification** (the onboarding bg-checkout.ts precedent), so there is no micro-deposit / `requires_action` state to model. Checkout is refused unless the row is `requested` or `failed`. `&paid=1` / `&canceled=1` are Stripe's return URLs back to the same page.
3. **Webhook — submit.** `checkout.session.completed` (row `requested` or `failed`) reads the PaymentIntent and lets ITS status decide: card → `succeeded` + card fee → invoice/receipt chain; ACH → `processing` → ACH confirmation chain. A PI that is neither `succeeded`, `processing` nor `requires_action` (a dead attempt, e.g. a stale redelivery) is NOT booked — the row is left alone. If the PI cannot be read on a `paid` session the row is booked `succeeded` with method `unknown`, the invoice/receipt chain is SKIPPED, and Jake gets a `notifyJakeFailure` bell (rule `SPECIALIST_bgcheck_payment_failed`) to fix `payment_method_type` / `card_processing_fee` and fire `automation_SPECIALIST_bgreqinvoicereceipt` by hand.
4. **Webhook — settle.** `payment_intent.succeeded` on a `processing` row booked on that PI → `succeeded` → invoice/receipt chain.
5. **Documents.** `INV-BGC-<id>` / `REC-BGC-<id>` (derived, no counter), both PDFs filed in Drive `VFO Specialist Onboarding/<Name> - Specialist`, emailed as `SPECIALIST_bgcheck_invoicereceipt`, then the Tracy FYI bell `SPECIALIST_bgcheck_payment_received`. Once-only on `invoice_email_sent_at`, claimed before the render; the claim is released if the PDF render or the draft fails OR throws, so a retry can run.
6. **Failure.** `payment_intent.payment_failed` / `.canceled` / `checkout.session.async_payment_failed` fail ONLY a `processing` row whose booked PI is the event's (#482/#484) → `failed` + bell `SPECIALIST_bgcheck_payment_failed` (Tracy + Jake). The same update clears `confirmation_email_sent_at`, so a re-pay by bank gets its own ACH confirmation. The original link works again.

## Reminder ladder (sweep tier 8)

`payment_status = 'requested'` only (a `failed` row already belled a human; `processing` is paid and in flight). Business days off `payment_requested_at` (#396):

- **2** (`SPECIALIST_bgcheck_reminder_email`) → drafts `SPECIALIST_bgcheck_reminder` with the same link; stamps `reminder_sent_at` only on a successful draft.
- **4** (`SPECIALIST_bgcheck_unpaid_bell`) → Tracy bell, dedupe unread; stamps `tracy_notified_at`.

Recipients follow the ROW's `sandbox` stamp. The tier sits in its own try/catch.

## Emails (pipeline `SPECIALIST_BG_CHECK`, all Draft mode)

Edited under Automation → Email Templates → **Specialist Background Check Requests** (`EmailTemplatesPanel.jsx` section `specialist_bg_check`; descriptions in `templateMeta.js`). To SPECIALIST · Cc Tracy · Bcc Anton + Paul (+ `dgorriaran@` on the invoice/receipt). No signature in any body (#512). Tokens are substituted with replacer functions (#438).

| Template | Sent by | Tokens |
|---|---|---|
| `SPECIALIST_bgcheck_request` | `specialist_bg_request_send` | `[First Name]`, `[Amount]`, `[PAYMENT_LINK]` |
| `SPECIALIST_bgcheck_reminder` | sweep tier 8 | `[First Name]`, `[Amount]`, `[PAYMENT_LINK]` |
| `SPECIALIST_bgcheck_confirmation\|ach` | `_bgreqconfirmation` (ACH only, #287) | `[First Name]`, `[Amount]`, `[Specialist Name]` |
| `SPECIALIST_bgcheck_invoicereceipt` | `_bgreqinvoicereceipt` | `[First Name]`, `[Amount]`, `[Specialist Name]`, `[CARD_FEE_TEXT]` |

## Accounting UI

`AccountingCombinedPanel` (`maxWidth` 900px) with three pills, the License Fees tab's shapes. All three read the same `specialist_bg_payments_load` through `bgRowsFrom` (onboarding rows — every `specialist_onboarding` row with `bg_payment_status` set OR `bg_step3_email_sent_at` set, Core $350 / Max $950 — plus request rows), so they cannot disagree.

- **VFO Specialist Background Checks** — the monthly ledger of RECEIVED payments only, with a year + month ("All months") filter on the paid date. Columns Specialist · Date · Amount · Status, Totals row on top. "Send Background Check Payment Request" toggles the inline form above the list.
- **Background Check Reconciliation** (`SpecialistBgReconciliationPanel.jsx`) — one row per specialist who has ever paid (onboarding or request), all-time: Payments · Total Collected · Most Recent, highest total first.
- **Outstanding Payment Links** (`SpecialistBgOutstandingPanel.jsx`) — two groups of License-style cards (Amount · Link sent · Status): unpaid requests (`requested` / `failed`), then unpaid onboarding links on LIVE onboardings (status `active` or NULL), which are chased by the onboarding flow's own ladder and shown for completeness.

## Not yet exercised

Everything — the branch is undeployed. First live proof owed: a real send, both payment methods, the ACH settle, one failure, and both sweep rungs.
