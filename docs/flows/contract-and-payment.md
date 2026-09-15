# Contract and Payment flow (MAP1)

The master flow. From "PF wants to reconfirm with the client" all the way to "VFO has been paid and member's revenue share has been transferred." Touches every integration: Stripe, BoldSign, Gmail, Google Sheets, Google Drive, Supabase Storage.

The state machine is the column values on a single `pipeline_map1` row — see [../tables/pipeline.md](../tables/pipeline.md). Each step in this flow either creates that row, advances some columns, or branches based on column values.

> **Changes 2026-06-09 (branch `claude/confident-lovelace-50775e`):**
> - **Revenue-share receipt numbers are now collision-safe** — `contract-invoice-receipt.ts` allocates INV/REC via `utils/doc-numbers.ts` `allocateDocNumber()` (bump-and-retry against `UNIQUE(number)`); see [documents.md](../tables/documents.md) + GOTCHAS.md gotcha #92.
> - **`automation_CONTRACT_revshare`** drops a **Tracy "client has paid" FYI** once per payment (`utils/revshare-tracy-notify.ts` `notifyTracyClientPaid`, independent of any sheet — the old "enter the split" prompt + the `pending`/"numbers not yet verified" branch were removed with the Tracy Revenue-Master cross-check, gotcha #164), and a **Jake failure FYI** (`jlatham@`) when the Stripe Connect transfer fails. The MAP 1 quarterly off-session charge sweep (`contract-chargescheduled-sweep.ts`) also fires the Jake failure FYI on a declined/failed charge.
> - **Frontend track view** (`map1/ClientTrackViewV2.jsx`, dev-only until deploy): "Revenue share paid" now greens only on terminal `rec1_rev_paid` (was truthy on `'Pending'`); "Member notified of revenue share" now checks `c24_email_sent === true` (the column is boolean — the old `=== 'Yes'` never matched; gotcha #94).
> - MAP 1 quarterly **ACH P2 off-session auto-charge** verified working this session (it always set `payment_method_types[]=us_bank_account`; the tax implementation charge was fixed to match — see [tax-planning.md](tax-planning.md) Failure mode #9).

## Lifecycle overview

```
PIP1 reconfirm  →  PIP follow-up   →  PCADMIN          →  BoldSign        →  Payment          →  Confirmation +  →  Revenue share
                   decision            (pricing /          send agreement     (Stripe)            invoice/receipt    (Stripe Transfer
(create row)       (Yes/Undecided/     extra meeting)      (PDF + signers)                                            + Sheets read)
                    No)
```

Each arrow is implemented either as:
- A user clicking something in the admin UI (`callApi(...)`), OR
- A token-link landing page (raw fetch, no session), OR
- A webhook (Stripe / BoldSign), OR
- A server-to-server chain (admin-api → admin-api with service-role auth).

---

## Step 1 — PIP confirmation emails (PIP 1 / PIP Follow-up)

**Trigger:** Admin opens the MAP 1 automation track ([ClientTrackViewV2.jsx](src/components/admin/map1/ClientTrackViewV2.jsx)). Two track steps use this handler: **PIP 1 Confirmation Email** (in the Initial Contact phase, after "Call outcome") and **PIP Follow-up Confirmation Email** (in the PIP 1 phase, renamed from the old "PIP Follow-up meeting re-confirmation/declined email"). Each is the reusable `PipConfirmStep` component with **3 buttons**: *Send email (with date)* → date/time/timezone inputs (`confirm_date`); *Send email – date not confirmed* (`confirm_no_date`); *Meeting declined – email client* (`declined`).

> **RESCHEDULE (2026-08-16, v747) — frontend-only.** A sent step now offers **Reschedule**, reopening the same date/time/timezone form pre-filled and re-sending the SAME template. The slot lives in the task's **notes string**, so rescheduling **re-writes that notes slot** and `parseSlotNotes` is what pre-fills the form (the component also keeps the last-sent slot in local state so a second reschedule in the same session pre-fills without a reload). **No backend change and no ladder to re-arm here** — this handler owns nothing but the email. Note the accepted consequence shared by all nine reschedule sites (#404): rescheduling a send originally made as *"date not confirmed"* **upgrades that record to confirmed**.

**Handler:** `automation_PIP1_reconfirmationemail` ([actions/pipeline/pip1-reconfirmation-email.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/pipeline/pip1-reconfirmation-email.ts)) — AUTH handler, fired from `PipConfirmStep`.

**What it does:**
1. Loads `clients`, `members`, `pipeline_sandbox_config`.
2. Picks the template: `declined` → `PIP_meeting_declined`; else `PIP_meeting_confirm`.
3. Computes `[NEXT_MEETING]` from `body.meeting` (`pip1` → "your Partners in Planning meeting"; `followup` → "…follow-up meeting") and `[CLOSING]` ("on \<date\> at \<time\> \<tz\>" for `confirm_date`, "in due course" for `confirm_no_date`).
4. Substitutes `[Client Name]`, `[Client First]`, `[NEXT_MEETING]`, `[CLOSING]` + signature.
5. Refreshes Gmail OAuth token, creates a Gmail draft to the client (CC member + PF; BCC `aanderson@elitert.com` and `platham@elitert.com`).
6. Returns the draft id. **No DB writes** — the frontend records the task status via `msm_save_client_task` (the old version's `pipeline_map1` stub insert was removed).

**Tables read:** `clients`, `members`, `pipeline_sandbox_config`, `email_templates` (`PIP_meeting_confirm`/`PIP_meeting_declined`).
**Tables written:** none (drafts only).

> **Note:** the old 2-outcome `PIP1_reconfirmation|Yes`/`|No`/`|No (member…)` templates were scrapped. A single neutral `PIP1_reconfirmation|No` (id 125) was re-created **only** for the PCADMIN decline paths below (see gotcha #87) — it is NOT used by this step.
**External calls:** Google OAuth token endpoint, Gmail drafts API.
**Chains:** none.

---

## Step 2 — PIP follow-up decision

**Trigger:** Admin opens the c13 task in MAP1 tab → fills out [PIPDecisionForm](src/components/admin/map1/PIPDecisionForm.jsx) (Yes/Undecided/No, priorities, pricing).

**Handler:** `automation_PIPFU_decision` ([admin-api:4077-4338](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)) — fired from [PIPDecisionForm.jsx:107](src/components/admin/map1/PIPDecisionForm.jsx) AFTER a sibling `msm_save_client_task` records the c13 task as `Completed - <decision>`.

**What it does (branches by decision):**

### Decision = "Yes" (with grossServiceValue)

1. UPDATEs the existing `pipeline_map1` row (creating one if none yet via fallback at [admin-api:4087-4113](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)) with all pricing fields: `c13_decision`, `current_priorities`, `parked_priorities`, `service_level`, `gross_fee`, `member_contribution`, `net_invoice`, `member_share`, `vfos_share`, `payment_plan`, `pip_meeting_count`. *(`extra_cc` is no longer written — the form field is gone; see the Additional Contacts note below.)*
2. **Chains** `automation_CONTRACT_sendagreement` — server-to-server.

### Decision = "Undecided"

1. UPDATEs `pipeline_map1` with priorities, undecided reasons, lite/core/max costs. *(no `extra_cc` — see below.)*
2. Generates a fresh `c15_token` (32-byte hex) and saves to row.
3. Loads `email_templates` row `'PCADMIN_followup|Undecided'`.
4. Builds HTML buttons that link to `https://vfoportal.com/decide?token=<c15_token>&clientRef=...&decision=Yes&serviceLevel=<Lite|Core|Max>` (and a No, and an ExtraMeeting button). Max button is suppressed when `form_data.maxNA === true`.
5. **Fetches three PDFs from the public `map1-agreements` Supabase Storage bucket** — `proactive-lite.pdf`, `proactive-core.pdf`, and (when `maxNA` is falsy) `proactive-max.pdf` — base64-encodes each as a `multipart/mixed` part. The Gmail draft is built as multipart with the email body as the first part and each PDF attached. CC member + PF; BCC `aanderson` + `platham`.
6. Marks `c14_email_sent='Yes'` AND `c14_email_sent_at=now()`. The `_sent_at` write only happens on the Undecided branch — see [tables/pipeline.md](../tables/pipeline.md) and the reminder-ladder section below.

### Decision = "No"

1. UPDATEs `pipeline_map1` with `c13_decision='No'`. *(no `extra_cc` — see below.)*

> **Extra Cc left this form on 2026-08-20 (v771), and this is where the bug was.** `PIPDecisionForm`'s "Additional CC recipients" chip list wrote `pipeline_map1.extra_cc` — and **`pipfu-decision.ts`'s own Undecided/No email never read it back**, so an address entered here was silently ignored on the very email it was entered for (Veronica Esmero on Dane Rogol, client 163, 2026-08-17 `PCADMIN_followup|Undecided`). Portal-wide only 5 of ~114 sender files ever read the column. The form field, the write and every read are gone; every MAP 1 / contract handler now reads the client's **Additional Contacts** (`client_contacts.cc_on_emails`, set on the client profile). `contract-send-agreement.ts`'s legacy read was **REPLACED, not merged**, and `utils/extra-cc.ts` was deleted. The column is dormant, kept only so past submissions stay auditable. Full mechanism → [additional-contacts.md](additional-contacts.md).
2. Loads template `'PCADMIN_followup|No'`.
3. Plain `text/html` Gmail draft (no PDFs attached on the No branch).
4. Marks `c14_email_sent='Yes'`. **Does NOT write `c14_email_sent_at`** — the reminder ladder fires only for Undecided rows; a "No" client doesn't need nudging.

**Tables read:** `pipeline_map1`, `clients`, `members`, `pipeline_sandbox_config`, `email_templates`.
**Tables written:** `pipeline_map1` (insert if missing + update).
**Chains:** `automation_CONTRACT_sendagreement` (only on Yes + grossServiceValue).

---

## Step 3a — Client clicks decision button on `/decide` (Undecided path only)

**Trigger:** Client receives the email with C15 buttons, clicks one. Browser navigates to [DecidePage.jsx](src/pages/DecidePage.jsx) at `/decide?token=...&decision=...&serviceLevel=...&clientRef=...`. **Opening the link records NOTHING** — the page validates the params and renders a confirmation card ("You're about to confirm moving forward with the <serviceLevel> Membership."); the client must click its button to submit (2026-07-27, gotcha #290 — email link-scanners were executing the old on-mount POST).

**Handler:** `automation_PCADMIN_finaldecision` ([admin-api:586-742](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)) — fired via raw `fetch` (no session) from [DecidePage.jsx](src/pages/DecidePage.jsx), on the confirm button's `onClick`. Handler, body and token are unchanged.

**What it does:**
1. Looks up `pipeline_map1` by `c15_token`. If `c15_final_decision` is already set, returns `existing_decision` (idempotent).
2. UPDATEs `c15_final_decision`, `c15_service_level`.
3. Branches by decision:
   - **`Yes`**: inserts a `notifications` row (recipient `'admin'`, title `"<Client> chose <Service>"`, link to admin client detail). Admin must then submit the pricing form.
   - **`ExtraMeeting`**: inserts a `notifications` row asking admin to schedule the extra meeting.
   - **`No`**: loads template `'PIP1_reconfirmation|No'`, creates Gmail decline draft. No notification.

**Tables read:** `pipeline_map1`, `clients`, `members`, `pipeline_sandbox_config`, `email_templates`.
**Tables written:** `pipeline_map1` (c15_final_decision, c15_service_level), `notifications`.
**Chains:** none — admin still needs to submit pricing manually for Yes path.

---

## Step 3b — PCADMIN pricing (Undecided→Yes path)

**Trigger:** After client picks Yes via `/decide`, admin sees the notification, opens the client, fills out [PFPricingForm](src/components/admin/map1/PFPricingForm.jsx).

**Handler:** `automation_PCADMIN_pricing` ([admin-api:4377-4415](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)) — fired from [PFPricingForm.jsx:19](src/components/admin/map1/PFPricingForm.jsx).

**What it does:**
1. UPDATEs `pipeline_map1` pricing fields.
2. Marks all unread `notifications` for this `client_id` as read.
3. **Chains** `automation_CONTRACT_sendagreement`.

**Tables written:** `pipeline_map1` (pricing fields), `notifications.read=true`.
**Chains:** `automation_CONTRACT_sendagreement`.

---

## Step 3c — PCADMIN extra meeting (ExtraMeeting path)

**Trigger:** After ExtraMeeting was requested via `/decide`, admin schedules + holds the meeting, then submits [PFExtraMeetingForm](src/components/admin/map1/PFExtraMeetingForm.jsx) with the outcome.

**Handler:** `automation_PCADMIN_extrameeting` ([admin-api:4418-4566](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)) — fired from [PFExtraMeetingForm.jsx:21](src/components/admin/map1/PFExtraMeetingForm.jsx).

**What it does:**
- **Yes**: UPDATEs `c15_final_decision='Yes'`, `c15_via_extra_meeting=true`, all pricing fields. Marks notifications read. **Chains** `automation_CONTRACT_sendagreement`.
- **No**: UPDATEs `c15_final_decision='No'`, `c15_via_extra_meeting=true`. Loads template `'PIP1_reconfirmation|No'` and creates Gmail decline draft. Marks notifications read. No chain.

---

## Step 4 — Send agreement to BoldSign

**Trigger:** Server-to-server chain from `automation_PIPFU_decision` (Yes), `automation_PCADMIN_pricing`, or `automation_PCADMIN_extrameeting` (Yes). NOT directly user-triggered.

**Handler:** `automation_CONTRACT_sendagreement` ([admin-api:4584-4945](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)).

**What it does:**
1. Validates `gross_fee` is set and `c16_sent !== 'Yes'`.
2. Loads `agreement_templates` row keyed on `(service_level, payment_plan)`.
3. Renders HTML body with placeholder substitutions (client name, fees, payment dates +91/+182/+273 days).
4. POSTs to `https://api.html2pdf.app/v1/generate` to produce PDF.
5. POSTs to `https://api.boldsign.com/v1/document/send` with `EnableSigningOrder=true`, `DisableEmails=true`, two signers (client first, then CEO Anton Anderson), form fields built from `agreement_templates.field_map`. Hardcoded `BrandId=f6b2e092-73a4-438e-b786-ebd20e472732`.
6. Polls `getEmbeddedSignLink` for the client signer (5 retries × 5s waits).
7. UPDATEs `pipeline_map1`: `c16_sent='Yes'`, `boldsign_doc_id`, `c17_client_signed='No'`, `c18_ceo_signed='No'`, `c17_followup_sent_date=<today>`.
8. Loads template `'CONTRACT_agreementsent|Yes'`, substitutes `[ENGAGEMENT]` with the embedded sign link `<a>` tag.
9. Creates Gmail draft to client (`From: VFO Services <aipc@vfo-services.com>`). CC member + PF + the client's **Additional Contact** Cc list (2026-08-20 — replaced the `pipeline_map1.extra_cc` read). BCC `aanderson` + `platham`.

**Tables read:** `pipeline_map1`, `clients`, `client_enrollments`, `members`, `agreement_templates`, `pipeline_sandbox_config`, `email_templates`.
**Tables written:** `pipeline_map1` (c16_sent, boldsign_doc_id, c17/c18, c17_followup_sent_date).
**External calls:** html2pdf.app, BoldSign send + getEmbeddedSignLink, Google OAuth + Gmail drafts.
**Chains:** none — waits for BoldSign webhook.

---

## Step 5 — Client signs in BoldSign

**Trigger:** Client opens the Gmail draft (after admin reviews + sends), clicks the embedded sign link, signs in the BoldSign-hosted iframe.

**Handler:** `boldsign-webhook` ([standalone function](C:/vfo-edge-functions/supabase/functions/boldsign-webhook/index.ts)) receives `event.eventType='Signed'` with the client's signer email.

**What it does:**
1. Looks up `pipeline_map1` by `boldsign_doc_id`.
2. Determines signer is NOT the CEO (email ≠ `aanderson@elitert.com`).
3. If `c17_client_signed === 'Yes'` already, idempotent skip.
4. UPDATEs `c17_client_signed='Yes'`.
5. **Chains** `automation_CONTRACT_ceocountersign` to admin-api.

**Tables written:** `pipeline_map1.c17_client_signed='Yes'`.
**Chains:** `automation_CONTRACT_ceocountersign`.

> See [boldsign-webhook.md](boldsign-webhook.md) for ambiguity around which webhook target is live (standalone vs embedded). The embedded handler does NOT chain — if it's the live URL, this flow stalls here.

---

## Step 6 — CEO countersign email

**Trigger:** Server-to-server chain from `boldsign-webhook` (standalone).

**Handler:** `automation_CONTRACT_ceocountersign` ([admin-api:745-858](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)).

**What it does:**
1. Validates `boldsign_doc_id` exists, `c18_ceo_signed !== 'Yes'`.
2. Polls BoldSign `getEmbeddedSignLink` for `aanderson@elitert.com` (3 retries × 2s).
3. Loads template `'CONTRACT_ceocountersign|Yes'`.
4. Substitutes `[Client Name]`, `[Service Level]`, `[Total Fee]`, `[SIGNING_LINK]`.
5. Creates Gmail draft to CEO with embedded sign link.

**Chains:** none — waits for CEO to sign.

---

## Step 7 — CEO signs in BoldSign

**Trigger:** CEO opens the Gmail draft (after admin sends), clicks the sign link, signs.

BoldSign fires `event.eventType='Signed'` with CEO email AND eventually `event.eventType='Completed'` once both signers done.

**Handlers (standalone webhook):**

- On `Signed` with CEO email → UPDATE `c18_ceo_signed='Yes'` only. No chain.
- On `Completed` → UPDATE both `c17_client_signed='Yes'` and `c18_ceo_signed='Yes'` (re-sets). **Chains** `automation_CONTRACT_stripecustomer`.

> The chain only fires on the `Completed` event, not on `Signed`-by-CEO — important behavioral detail.

---

## Step 8 — Create Stripe customer + send payment email

**Trigger:** Server-to-server chain from `boldsign-webhook` (Completed event).

**Handler:** `automation_CONTRACT_stripecustomer` ([admin-api:861-936](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)).

**What it does:**
1. Validates pipeline row exists. If `stripe_customer_id` already set, idempotent return.
2. POSTs to `https://api.stripe.com/v1/customers` with `email`, `name`, `metadata[client_id]`.
3. UPDATEs `pipeline_map1.stripe_customer_id`.
4. Generates 32-byte `checkout_token` (hex), UPDATEs `pipeline_map1.checkout_token`.
5. **Chains** `automation_CONTRACT_paymentemail`.

**Then:** `automation_CONTRACT_paymentemail` ([admin-api:939-1050](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)):
1. Validates `checkout_token`.
2. Loads template `'CONTRACT_paymentemail|Yes'`.
3. Substitutes `[PAYMENT_LINK]` with `<a href="https://vfoportal.com/pay?token=<checkout_token>">Complete Payment</a>`.
4. Creates Gmail draft to client.

**Tables written:** `pipeline_map1.stripe_customer_id`, `.checkout_token`.
**External calls:** Stripe customers create, Google OAuth + Gmail drafts.

---

## Step 9 — Client pays on `/pay` page

**Trigger:** Client opens the Gmail draft (after admin sends), clicks the Complete Payment button. Lands on [PayPage.jsx](src/pages/PayPage.jsx) at `/pay?token=<checkout_token>`.

**Handlers (raw fetch, no session):**

> **`/pay` collects whichever installment is OPEN, not always payment 1 (2026-08-21, v773).** Both handlers resolve it server-side through the shared `utils/map1-open-installment.ts` `resolveOpenInstallment(row)`: the **lowest** N in 1..4 whose `payN_status` is `declined`/`auth_required`, **or** is null with `payN_date` set and ≤ today. `pending` / `processing` / `succeeded` are NOT open, so a processing ACH can never be paid twice. **Payment 1 is open on a null status alone** — `pay1_date` is only written once payment 1 clears, so the date test cannot apply to it. No open N ⇒ `400`: *"Payment already completed"* when every scheduled installment succeeded, otherwise *"No payment is due right now"* (covers processing, pending and future-dated). A non-Quarterly plan needs no special case — `pay2-4_date` are null, so only N=1 is ever scheduled. Before this, both handlers hard-guarded on `pay1_status` and hardcoded payment 1, which made the `/pay` URL in the installment-failure email a **dead link for P2–P4** from the day that email shipped.

1. **`automation_CONTRACT_loadpayment`** ([actions/pipeline/contract-load-payment.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/pipeline/contract-load-payment.ts)) — looks up `pipeline_map1` by `checkout_token`, returns `client_name`, `service_level`, `payment_amount`, `payment_x` (the resolved N), `payment_y` ('1' or '4'), and `card_fee_waived` (so the page stops showing a fee the backend will not charge). A real DB error now returns `500` *"Unable to load payment details"* instead of masquerading as an invalid token (**#187**).
2. Client picks ACH or Card → **`automation_CONTRACT_stripecheckout`** ([actions/pipeline/contract-stripe-checkout.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/pipeline/contract-stripe-checkout.ts)) — same resolver + guard, then creates a Stripe Checkout Session with `customer=<stripe_customer_id>`, line item, success/cancel URLs, `payment_intent_data.metadata.client_id`, `.checkout_token` and **`.payment_number`** (the resolved N — this is what routes the webhook to `payN_status`; see [stripe-webhook.md](stripe-webhook.md) Branch B1). The memo reads *"Payment N"*, and the **2.9% + $0.30 gross-up is skipped when `card_fee_waived=true`**, mirroring the nightly sweep's charge math exactly. Returns Stripe URL.
3. Client redirected to Stripe → enters payment → Stripe charges → Stripe redirects to `https://www.vfo-services.com/payment-successful/`. **Note:** the success URL leaves the SPA entirely.

> **The ACH session no longer pins `verification_method='instant'` (2026-09-08, v816).** The builder used to append `payment_method_options[us_bank_account][verification_method]=instant`, which restricts Stripe's hosted page to the **Financial Connections bank-login flow only** — every bank Financial Connections does not support, and every payer who hits MFA trouble, was simply locked out (**#298**, proved on SpecRev). Omitting the parameter falls back to Stripe's `automatic` default: **bank sign-in first, with "Enter bank details manually" (account + routing numbers, verified by 1-2 business-day micro-deposits) as the fallback**. In its place the builder now appends **`custom_text[submit][message]`** from the shared constant `constants/ach-checkout-note.ts` `ACH_BANK_SIGN_IN_NOTE`, whose bolded first sentence asks the client not to use manual entry unless bank sign-in fails. **That sentence is the only client-facing lever there is** — Stripe's own *"Enter bank details manually (may take 1-2 business days)"* link text is Stripe's and cannot be edited, and the fallback itself must stay available. Card sessions get no `custom_text`.
>
> **What manual entry costs downstream:** `checkout.session.completed` becomes a **SUBMIT** event — the PaymentIntent is parked in `requires_action`, no debit has been attempted, and the row is stamped `pay1_bank_verification_pending_at` while `pay1_status` still reads `'processing'` (Step 10). See [stripe-webhook.md](stripe-webhook.md) Branch A2 and **#475**.

**Chains:** none — waits for Stripe webhook.

---

## Step 10 — Stripe webhook fires

**Trigger:** Stripe sends `checkout.session.completed` to admin-api with `stripe-signature` header. See [stripe-webhook.md](stripe-webhook.md) for full handler dispatch.

**For MAP1 first payment** ([admin-api:290-392](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)):
1. Looks up `pipeline_map1` by `stripe_customer_id`.
2. Expands the PaymentIntent to get `payment_method.type`, `last4` **and `status`**.
3. UPDATEs `pay1_status` ('succeeded' for card, 'processing' for ACH), `payment_method_type`, `acct_last4`, `card_processing_fee`, `pay1_date`, plus `pay2/3/4_date` for Quarterly (today + 91/182/273 days). Sets `confirmation_status='Confirmation Needed'`, and writes **`pay1_bank_verification_pending_at`** — `now()` when the PI came back `requires_action` on a non-card (the client typed account + routing numbers and Stripe is waiting on micro-deposits), an explicit NULL otherwise. The column is written on every pass, never left untouched.
4. **On the pending path only:** raises the dismissible FYI `MAP1_ach_bank_verification_pending` to Jake + Tim (*"Bank verification pending — «Client» (MAP 1 payment 1)"*, `dedupe:"unread"`). Nothing in the portal clears it — the client verifies (`payment_intent.processing`) or Stripe cancels after ~10 days (`payment_intent.canceled`), and both come back as their own webhook.
5. **Chains** `automation_CONTRACT_confirmationemail` (always — for BOTH methods, deliberately). The handler is far more than an email: it also raises the "client paid" PF bell, copies the signed agreement into the ERT vault and drafts Tracy's new-case email (+ the load-bearing `c24_email_sent` stamp). It decides INTERNALLY whether to draft the client email — a **card** first payment does not get one (see Step 11).
6. **Chains** `automation_CONTRACT_invoicereceipt` for card only — ACH waits.

> **`pay1_status` deliberately gained NO new value.** It still says `'processing'` all the way through a micro-deposit wait, so the settle branch, the late-ACH failure branches, the sweeps, the open-installment resolver and the frontend status maps needed **zero** changes — a fourth status value would have meant auditing every one of them (**#371**). The sub-state lives in the nullable side-column, and code that does not read it cannot see it. Migration `20260908120000_ach_bank_verification_pending_columns.sql`; no backfill, because NULL already means *"not awaiting verification"* for every pre-existing row.

**For ACH first payment cleared** (subsequent `payment_intent.succeeded` with `pipeRow.pay1_status === 'processing'`):
- UPDATEs `pay1_status='succeeded'` and **NULLs `pay1_bank_verification_pending_at`**, **chains** `automation_CONTRACT_invoicereceipt` for payment 1.

**If the client never verifies** (`payment_intent.canceled`, ~10 business days after submit, or a dashboard Cancel): the widened failure block treats a cancelled P1 as a **first payment**, not as an off-session installment — `pay1_status='failed'` + `FAILURE_first_payment_declined` to Jake. That arm had to be written explicitly, because a P1 PaymentIntent carries `metadata.payment_number = "1"` and the `isOffSession` test would otherwise have skipped it. A P1 **bounce** stays with `checkout.session.async_payment_failed`, which fires the same bell title and dedupes. See [stripe-webhook.md](stripe-webhook.md) Branch C. **VERIFIED LIVE 2026-09-08** — `pipeline_map1` row 149, a dashboard Cancel at 20:54:27Z → `pay1_status='failed'` + bell **1891** *"… canceled (requested_by_customer)"*. The `pay1_bank_verification_pending_at` stamp is deliberately **left set** on the failed row; nothing reads it.

**For quarterly payment 2-4** (subsequent `payment_intent.succeeded` with `metadata.payment_number` ∈ {2,3,4}):
- UPDATEs `pay${n}_status='succeeded'`, **chains** `automation_CONTRACT_invoicereceipt` for that payment number — **unless `rec${n}_email_sent` is already `true`, in which case the chain is skipped with a log line (2026-08-04, gotcha #327).** That guard exists because Stripe **redelivers** an event whose 200 we were too slow to return (the PDF → Drive → Gmail chain can exceed ~30s) and `router/webhooks.ts` has no event-id dedupe — which produced **two identical receipt drafts sharing one receipt number** for a live client. The `paid_at` write and the revshare chain either side of it are unchanged, and **the P1 ACH branch below is NOT guarded**. (Installments 2-4 get **no confirmation email at all** — the sweep's charge-time confirmation was removed 2026-07-15 because the two-email flow confused clients; this receipt-on-clear is the ONLY client email for 2-4. See Step 10½.)

> **How payments 2-4 are created:** by the daily scheduled-payment charger — see Step 10½ below.

---

## Step 10½ — Scheduled-payment charger (quarterly P2-4)

**Trigger:** daily `pg_cron` job `chargescheduled-sweep-daily` at 03:00 UTC (cron SQL: `vfo-edge-functions/supabase/cron/chargescheduled-sweep.sql`).

**Handler:** `automation_CONTRACT_chargescheduled_sweep` ([actions/pipeline/contract-chargescheduled-sweep.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/pipeline/contract-chargescheduled-sweep.ts)) — PUBLIC, service-role-gated.

**What it does:**
1. Loads `pipeline_sandbox_config` for `MAP 1` to pick live vs sandbox Stripe key.
2. Selects `pipeline_map1` rows where `pay1_status='succeeded'` AND `stripe_customer_id IS NOT NULL` AND `payment_method_type IN ('card','ach')` AND `payment_plan='Quarterly'`.
3. For each row and each N in [2, 3, 4]: emits a candidate if `payN_date <= today` AND **`payN_status` is EMPTY** (never attempted). Any non-empty value — known or not — is left alone.

> **The charge predicate was INVERTED from a denylist to a positive test on 2026-08-26 (v789, #431).** It used to read `const skipStatuses = new Set(["succeeded","processing","pending","declined","auth_required"]); … if (status && skipStatuses.has(status)) continue;` — *charge unless the status is one of these five*. **`skipStatuses` is DELETED**; the gate is now `if (status) continue;`. **Behaviour is identical for every value that column has ever held** — the only charge-eligible states were NULL and `check_pending`, and a check row cannot reach here (the select filters `payment_method_type` to card/ach) — so the denylist's real meaning was always *"charge only when nothing has happened yet"*. The inversion exists for the value that landed the same day: **"Cancel all remaining payments" writes `payN_status='cancelled'`, and the old denylist had never heard of it — every cancelled installment would have been CHARGED on the next nightly run** (Step 10¾). An unknown status now means "someone else owns this slot", not "charge it". The five old members stay skipped for their old reasons: succeeded/processing/pending = money done or in flight; declined/auth_required = a previously-failed attempt that must NOT be re-raised nightly (recovery is the client's `/pay` link). **The first live proof of the inversion is the next 03:00 UTC run.**
4. For each candidate: lists saved payment methods on the Stripe customer (`GET /v1/customers/{cus}/payment_methods?type=card|us_bank_account`), picks the most recent.
5. Payment method: **prefers the row's `default_payment_method_id`** if set (an admin-updated card/bank — see [payment-method-change.md](payment-method-change.md)); otherwise lists the customer's saved methods (`GET /v1/customers/{cus}/payment_methods?type=card|us_bank_account`) and picks the most recent — the exact prior behavior for rows that never had a card update.
6. POSTs to `/v1/payment_intents` with `confirm=true off_session=true`, `metadata.payment_number=N`, `metadata.client_id`, `metadata.checkout_token`, and a **LOGICAL, date-less** `Idempotency-Key: chargescheduled-{client_id}-P{N}` (v612 — was `…-P{N}-{YYYY-MM-DD}`; the date suffix let a lost post-charge status write re-charge the SAME installment the next night, since within Stripe's 24h idempotency window a re-select must replay the same PaymentIntent, not mint a second one — gotcha #228).
7. Charge amount uses the same gross-up as P1 checkout for card (`round((base + 0.30) / (1 - 0.029) * 100)` cents); ACH at base. **Exception (2026-07-15):** rows with `card_fee_waived=true` (payment-continuation setup-link clients — the ONLY writer is `migration_backfill_map1`) charge base even on card.
8. **On success** (`status: succeeded` or `processing` for ACH): the sweep **stamps `payN_status` immediately** (card → `succeeded`, ACH → `processing`) so the Payments tab reflects the charge instead of staying "scheduled" until ACH clears (this also makes a same-day cron re-run skip the installment — the candidate gate charges only an EMPTY status). **As of v612 the post-charge status write is error-checked** — if the charge succeeded in Stripe but the row write fails, the sweep alerts Jake ("charge SUCCEEDED in Stripe but row status write FAILED — fix payN_status manually") rather than silently leaving the installment re-armed (this, plus the logical idempotency key, is what makes a lost write safe — gotcha #228). **No client email is sent at charge time** — the charge-time confirmation chain was removed 2026-07-15 (the automatic charge + double email confused clients); the client's ONLY email per installment is the **receipt on clear** (the `payment_intent.succeeded` webhook branch owns the `processing → succeeded` flip + the `invoicereceipt` + `revshare` chains — see Step 10).
9. **On failure:** sets `payN_status='auth_required'` (Stripe code `authentication_required`) or `'declined'` (everything else), **drafts the client email FIRST**, then inserts one admin notification whose follow-up sentence reports what that draft actually did (built by the shared util `utils/map1-installment-failure.ts` `draftMap1InstallmentFailureEmail`, extracted verbatim from the sweep in v612 so the late-ACH `payment_intent.payment_failed` branch reuses it), and routes a Jake failure FYI (`utils/notify-jake-failure.ts`). **The bell's follow-up sentence was CORRECTED on 2026-09-04 (v808) and the ORDER is now load-bearing (#468a).** It used to read *"Client emailed a payment link."*, composed from nothing but the presence of a `checkout_token` and several statements ABOVE the draft call it described — while `CONTRACT_installment_charge_failed` is `send_mode=false`, so **no client has ever been emailed by this branch**: the draft waits in Gmail for a human to send it, and the bell was telling that human the job was done. Lenny Genna's P3 (client 272) sat `declined` for two weeks behind that sentence. `draftMap1InstallmentFailureEmail` now returns `"sent" | "drafted" | false` (via `deliverRaw`, so a `drafts.send` that FAILS correctly reads as `"drafted"` — the draft is still there) and the bell prints one of four honest lines: no checkout token, SENT, *"waiting in Gmail Drafts - it has NOT been sent yet"*, or could-not-be-created. **Compose the sentence after the operation, from its return value.** Failed states are NOT retried by the sweep — recovery is client-driven via the `/pay` link, which on successful payment triggers the webhook and flips `payN_status` back to `succeeded`. **Late ACH bounce:** an off-session ACH installment returns `processing` at charge time and can bounce days later; that late `payment_intent.payment_failed` is now caught by the webhook (gotcha #229), not just this synchronous path.

---

### Step 10½a — Manual retry of a FAILED installment *(2026-09-04, v808)*

A `declined` / `auth_required` installment is **never re-charged** (the sweep charges only an EMPTY slot, above), so its money stays open indefinitely and the client's only route in is the `/pay` link. Until v808 the only email carrying that link was the one drafted at failure time, from a draft-mode template — if nobody sent it, the client was never told and there was no way to produce another. Accounting → Outstanding Payment Links covered MAP 1 first payments, tax retainers, tax implementation retries and continuation tokens: **every open-money case except this one.**

**Surface:** Accounting → VFO Services → Holistic Planning → Outstanding Payment Links → **"Failed Installments - Retry Links"** (`OutstandingLinksPanel.jsx`, `kind='map1'`; the MAP 1 twin of the tax implementation-retry section). Fed by `accounting_outstanding_links_load`'s new `map1.installment_links` array — quarterly, non-sandbox rows with any `pay2/3/4_status` in `REOPEN_STATUSES`, de-duped against `map1.continuation` the same way the tax section de-dupes.

**Action:** `accounting_redraft_installment_link` (`actions/migration/redraft-installment-link.ts`), `TAB_ACTIONS.accounting`, body `{ row_id }` only.

**The installment is DERIVED, never passed in.** Both the loader and the handler call `resolveOpenInstallment()` — the same function the public `/pay` page runs — so the card, the email's *"Complete Payment N"* and the page the client lands on cannot disagree. When two installments have failed the resolver returns the LOWEST (the only one the link can collect), so the row shows ONE card and clearing it surfaces the next. `REOPEN_STATUSES` is `export`ed from `utils/map1-open-installment.ts` for the same reason: one list, two readers.

**Nothing is stamped.** Unlike the first-payment link there is no reminder ladder on a failed installment, so no column would be disarmed — the button is deliberately re-clickable.

**Editing the template.** `CONTRACT_installment_charge_failed` (id 179) may only use `[Client First]`, `[Client Name]`, `[X]` and `[PAY_BUTTON]` — those are the four `subst()` handles in `utils/map1-installment-failure.ts`. The closer 29 other templates use names the PF via `[PF Name]`, which this handler does **not** substitute and would print literally in the client's inbox (#324). Its close was aligned on 2026-09-04 with its two twins (`TAX_implementation_charge_failed` 180, `TAX_final_retainer_charge_failed` 243) — the previous *"If you'd prefer to handle this another way, just reply to this email and we'll help"* offered a route that does not exist.

---

## Step 10⅔ — Check-payment branch (parallel to Steps 10/10½ — never both)

Some clients prefer to pay by physical check instead of using Stripe. The check branch replaces Steps 10 and 10½ entirely for those clients. The Stripe webhook + chargescheduled sweep do NOT run.

**Entry point:** in the AdminPortal Automation tab, after the `/pay` email has been sent (`checkout_token IS NOT NULL`) but before any payment has been received (`pay1_status IS NULL`), a **"Pay via check"** button appears on the row. Admin clicks it when the client tells them they'd rather mail a check.

**Handler: `automation_CONTRACT_paidbycheck`** ([actions/pipeline/contract-paidbycheck.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/pipeline/contract-paidbycheck.ts)) — admin-only.

**What it does:**
1. Validates row has `checkout_token` set and `pay1_status IS NULL`.
2. Sets `payment_method_type='check'`, `pay1_status='check_pending'`, `pay1_date=CURRENT_DATE`.
3. If `payment_plan='Quarterly'`: sets `pay2/3/4_date = today + 91/182/273 days` (same offset Stripe would use).
4. Drafts a Gmail to the client with the check mailing address (template `CONTRACT_paidbycheck|check`). Sandbox-aware (redirects to `sandbox_email` when sandbox_mode is true). Email draft is non-fatal — if Gmail fails, the DB state still reflects the check path and admin can manually email the address.

**Side effect:** `automation_CONTRACT_stripecheckout` finds no open installment on a `check_pending` row (`check_pending` is not a re-openable status, and the P2–P4 dates it just set are all in the future), so the `/pay` link is auto-blocked with *"No payment is due right now"* — no risk of accidental double-pay. **Watch the later quarters, though:** once the first check clears (`pay1_status='succeeded'`) and `pay2_date` arrives, the resolver DOES call P2 open, so a check-paying client holding an old `/pay` link could pay that quarter online. Money is still collected exactly once — the webhook books it by `payment_number` — but the row then mixes check and card/ACH installments. *(2026-08-21 — a deliberate consequence of the open-installment resolver, not yet seen live.)*

---

### Step 10⅔a — Admin clicks "Check cleared P{N}" once each check actually clears the bank

For each payment cycle (P1 for one-time, P1+P2+P3+P4 for quarterly), the row shows a **"Check cleared P{N}"** button when `payment_method_type='check'` AND `pay{N}_date` is set AND `pay{N}_status != 'succeeded'`.

**Handler: `automation_CONTRACT_checkcleared`** ([actions/pipeline/contract-checkcleared.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/pipeline/contract-checkcleared.ts)) — admin-only.

**What it does:**
1. Validates `payment_method_type='check'` and `pay{N}_status` is NULL or `'check_pending'`.
2. Sets `pay{N}_status='succeeded'`. For N=1 also sets `confirmation_status='Confirmation Needed'`.
3. Chains (HTTP fetch + service-role auth, refactor safety rule):
   - For N=1 only: `automation_CONTRACT_confirmationemail` (uses the `CONTRACT_confirmationemail|check` template; `[PROCESSING_TIME]` substituted to "Your check has been received and cleared."). **The check path is deliberately EXEMPT from the card receipt-only policy** — a cleared check still gets both the confirmation and the docs.
   - For all N: `automation_CONTRACT_invoicereceipt` (renders "Check" on the invoice and "Via Check" on the receipt PDF; no `acct_last4`, no `card_processing_fee`)
   - For all N: `automation_CONTRACT_revshare` (same revshare path as card/ACH — no special handling for check)

---

### Step 10⅔b — Daily check-reminder sweep

**Trigger:** daily `pg_cron` job `check-reminder-sweep-daily` at 04:00 UTC (cron SQL: `vfo-edge-functions/supabase/cron/check-reminder-sweep.sql`).

**Handler:** `automation_CONTRACT_checkreminder_sweep` ([actions/pipeline/contract-check-reminder-sweep.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/pipeline/contract-check-reminder-sweep.ts)) — PUBLIC, service-role-gated.

**What it does:**
1. Loads sandbox config + the `CONTRACT_checkreminder|check` email template (returns 500 if template missing).
2. Selects `pipeline_map1` rows where `payment_method_type='check'` AND `payment_plan='Quarterly'` AND `pay1_status='succeeded'`.
3. For each row and each N in [2, 3, 4]: emits a candidate if `payN_date IN [today, <horizon>]` AND `payN_status != 'succeeded'` AND `payN_reminder_sent=false`. **The horizon is a 7 BUSINESS DAY forward walk as of 2026-08-14** — `businessDayHorizonDateOnly(today, delay_days)` (`utils/notify.ts`), Mon–Fri UTC with no holiday calendar — not `today+7` calendar days, so a due date the far side of a weekend still gets its full week of warning. The 7 is the rule's editable `delay_days`; only the unit changed.
4. For each candidate: drafts Gmail to client (`sandbox_email` redirected target when sandbox_mode is true) including the check mailing address (`12636 High Bluff Drive, Suite 400, San Diego, CA 92130`).
5. On successful draft: `pay{N}_reminder_sent=true` (so we don't re-send tomorrow). On Gmail failure: `reminder_sent` stays false, next day's cron retries.

**Two other passes ride this same sweep, and both are business-day as of 2026-08-14.** (a) The **uncleared-check bells** (`MAP1_check_uncleared_bell` / `TAX_check_uncleared_bell`) — a check recorded but never marked cleared after **14 business days** (editable `delay_days`, `businessDelayCutoffIso`) raises a bell whose body reads *"…has not been marked cleared after N business days"*; it covers P1, overdue quarterly P2–P4 and the Tax Planning retainer. (b) The **Payment Continuation / migration setup-link ladder** (2 tiers, now **2 and 4 business days**) — see [payment-method-change.md](payment-method-change.md#step-5--stripe-webhook-applies-the-new-method). Note the contrast with the sibling `automation_CONTRACT_chargescheduled_sweep`, which is **deliberately still CALENDAR** — a scheduled installment is charged on its real due date, weekend or not.

**v1 limitation:** the reminder email is text-only — does NOT include a "pay this cycle by card/ACH" link. If a check client wants to switch to Stripe for a single cycle, admin manually issues them a fresh `/pay` link (or extends them a different option). Flagged for follow-up.

---

## Step 10¾ — "Cancel all remaining payments" (superadmin) *(v: 2026-08-26)*

**Trigger:** a superadmin expands a **MAP 1** (or Tax) group on the admin client **Payments tab** and clicks the button rendered at the bottom of the expanded group. [PaymentsTable.jsx](src/components/payments/PaymentsTable.jsx) gained the **Cancelled** chip, its place in the tally ordering and three **OPT-IN** props (`cancellableGroups` / `onCancelGroup` / `cancelBusyKey`) plus an exported `parseGroupKey`; [ClientPaymentsTab.jsx](src/components/payments/ClientPaymentsTab.jsx) carries the superadmin gate, the confirm dialog and the result banner. **The member / specialist / global payment surfaces share the same table and render read-only** — they simply do not pass the opt-in props.

**Handler:** `payments_cancel_remaining` ([actions/payments/cancel-remaining.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/payments/cancel-remaining.ts)) — AUTH, listed in **both** `SUPERADMIN_ONLY_ACTIONS` and `ADMIN_ONLY_ACTIONS` (`constants/role-gates.ts`) and re-checking `auth.isSuperadmin` itself. Action count 469 → 470, shipped in v789. **That file's header comment is the authoritative description** — this section is a summary of it.

**What it does:** writes the literal status **`'cancelled'`** onto every still-uncollected slot in **ONE** engagement group, plus a `*_cancelled_at` audit stamp, and stops. **No Stripe call, no email, no notification, no revenue-share column** — a payment that was never collected has no payout leg to settle, and writing a terminal value onto one is how money gets silently swallowed (#303 / #377).

- **Cancellable is a positive ALLOWLIST (#431):** `NULL`/`''` | `declined` | `auth_required` | `manual_required`. **Never cancellable:** `succeeded` | `processing` | `pending` | `check_pending` — money is done or in flight. A denylist is wrong the moment a seventh value lands; an allowlist merely gets conservative. A repeat click returns `count: 0`, because `'cancelled'` is not itself in the set, and there is **no un-cancel in the UI** — the only route back is a deliberate SQL correction.
- **PAYMENT 1 IS DELIBERATELY EXCLUDED on MAP 1.** It is the engagement's **opening** payment, not an installment of a running schedule: `pay2-4_date` do not even exist until pay1 settles, and `utils/map1-open-installment.ts` treats pay1 as open on a null status **alone**. "Cancel the remaining payments" on such a row is really *"cancel the whole engagement"* — a different decision, with agreement/contract/decision consequences this button does not offer. So it only ever closes 2/3/4; a Pay-in-Full row returns *"Pay-in-Full engagement has no remaining installments"*. An untouched slot with **no `payN_date`** is skipped too — it was never part of the client's schedule and the tab does not render it. **What the tab shows is what the button closes.**
- **Audit stamps** — migration `20260826150000_cancel_remaining_stamps.sql` (applied live and committed) adds `pipeline_map1.pay1_cancelled_at … pay4_cancelled_at` and `client_tax_plans.final_retainer_cancelled_at` + `implementation_cancelled_at`. **Nothing reads them for behaviour**; they exist only so an operator can tell a slot VFO cancelled from one that was never scheduled. `pay1_cancelled_at` is created for symmetry and is never written.
- **~12 readers were taught that `'cancelled'` means CLOSED**, and that is what actually makes the state safe: the charge sweep (the inversion in Step 10½), **both** passes of `contract-check-reminder-sweep.ts`, `contract-checkcleared.ts` (**refuses** to clear a cancelled slot — marking it cleared would flip it to `succeeded` and fire the receipt + revshare chains for money that was written off), `actions/migration/connect-load.ts` + `outstanding-links.ts` + `utils/migration-schedule.ts` (the emailed Payment Continuation schedule), `actions/payments/card-update-shared.ts` (a cancelled slot is not a future charge — see [payment-method-change.md](payment-method-change.md)), `actions/clients/overview-map1.ts` (`PAY_SETTLED`, so no *"Quarterly payment N"* next action for a client who owes nothing), the two Tax charge handlers and both `/tax-pay` handlers (see [tax-fee-process.md](tax-fee-process.md)), and `actions/payments/normalize.ts` (the red **Cancelled** chip). **`normStatus` itself was deliberately NOT taught** — its FAILED set already holds Stripe's own `canceled`/`cancelled` spelling, which arrives on other columns and means a different thing, so the row builders branch on the raw column *before* calling it.
- **Cancelled-but-COLLECTED hardening.** If money nevertheless arrives on a slot VFO already cancelled — the charge was raised before the cancel landed, or Stripe redelivers (#327) — the `payment_intent.succeeded` P2–P4 branch still records `succeeded`, the receipt and the revenue share, **because the money did move**, and additionally raises the action-required bell `FAILURE_map1_cancelled_installment_collected` (rule row seeded live, to Jake). See [stripe-webhook.md](stripe-webhook.md) Sub-branch B1.
- **Concurrency** with the 03:00 sweep is accepted by design (its window is minutes a night); the update is still guarded per column — only slots that read cancellable at load time are written.

**LIVE-TESTED on the MAP 1 side ONLY** — client 149 (`pipeline_map1` 130), payments 3 and 4 cancelled for real (chips, tally, the button disappearing once nothing is left to close, persistence), a negative check on an all-paid client, and no button on the member / specialist / global tabs. **The entire Tax half is code-only** — see [tax-fee-process.md](tax-fee-process.md).

---

## Stopping an engagement — `pipeline_map1.status` *(2026-08-26, v793)*

The counterpart to Step 10¾ and **not to be confused with it**: cancelling closes uncollected **money**; stopping closes the **conversation**. Migration `20260826180000_pipeline_map1_status.sql` adds `pipeline_map1.status` — `'live'` | `'stopped'`, **NOT NULL DEFAULT `'live'`**, bare `text`, no CHECK (#431).

**Stopping does exactly two things.**

1. **Display.** The MAP 1 track header renders a **Live/Stopped toggle** (`ClientTrackViewV2.jsx`), and `actions/clients/overview-map1.ts` reports the track closed. Two changes there: `track_status` is now `pd.status` (it was hard-coded `null`), and `closedReason` gained a precedence rule — **a recorded decline still reads *"Client declined"***, because that says *why*; plain *"Stopped"* is what is left for a row VFO closed by hand.
2. **Sweep silencing.** The **six** reminder-ladder queries in `contract-revshare-sweep.ts` — c14 decision, c17 signing, pay1 payment, each in a client-email tier and a PF-bell tier — filter `.eq("status","live")`.

**MONEY IS DELIBERATELY UNAFFECTED, and the line runs through the middle of one handler.** In that same `contract-revshare-sweep.ts`, the **rev-share candidate loop, the strategic-partner retry and the PIP held-release are NOT filtered**. `contract-chargescheduled-sweep.ts` (Step 10½) and `contract-check-reminder-sweep.ts` (Step 10⅔b) were **never opened**. A signed client who owes money keeps being charged and chased for it after a stop — if the intent is to stop *collecting*, use **Cancel all remaining payments** (Step 10¾), which is entirely independent of this column.

**`NOT NULL DEFAULT 'live'` is load-bearing** — the filters are `.eq`, and PostgREST `.neq` silently drops NULL rows (#437), so a nullable column would have hidden every legacy row from its own ladders.

**Writers.**

| Writer | When |
|---|---|
| `map1_update_status` (**new action**, ADMIN_ONLY, not tab-gated) | the header toggle, both directions — the only way back to `'live'` |
| `pcadmin-final-decision.ts` | the client's **"No thank you"** on `/decide`. **`'ExtraMeeting'` does NOT stop** — the engagement is live while the meeting is pending |
| `pcadmin-extra-meeting.ts` | the extra-meeting outcome recorded as **No** |
| `pipfu-decision.ts` | the PIP follow-up **c13 No**. **`'Undecided'` does NOT stop** — the whole C14/C15 cascade runs off it |

**Backfill: 0 rows matched** (`c13_decision='No' OR c15_final_decision='No'`). `overview-map1.ts`'s **third** `declined` leg — a manual `client_progress` task ("Send declined email" / "Call outcome = No" / "Client PIP decision = No") — was **deliberately not backfilled**: it lives in another table keyed by program task ids, and a wrong guess would silence a live engagement. The 2 clients that leg affects (102 Dan Niemerg, 136 Francisco Hervella) have **no `pipeline_map1` row at all**, so nothing was owed; any such row can be stopped by hand from the toggle.

**Deliberately NOT auto-stopping:** `ExtraMeeting`, `'Request no meeting'`, every tax handler, and `agreements/declined.ts`.

## Step 11 — Confirmation email *(ACH + check only — a card first payment is receipt-only)*

**Trigger:** Server-to-server chain from Stripe webhook handler (or from `automation_CONTRACT_checkcleared` on the check path).

**Handler:** `automation_CONTRACT_confirmationemail` ([actions/pipeline/contract-confirmation-email.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/pipeline/contract-confirmation-email.ts)).

**What it does:**
1. Validates `confirmation_status` is neither `'Sent'` NOR `'Skipped - Card (Receipt Only)'` — both are terminal for payment 1 (idempotent; without the second value a replayed webhook would re-raise the PF bell).
2. Loads template `'CONTRACT_confirmationemail|card'`, `'|ach'` or `'|check'` based on `payment_method_type` — **or `'|ach_verify'` (2026-09-08) when the method is ACH AND `pay1_bank_verification_pending_at` is set.** The ordinary `|ach` body says *"we have received your payment"*, which on the manual-entry path is simply false: nothing has been debited. The verify-bank twin instead tells the client to expect Stripe's verification email and the small test deposit, and says the payment is cancelled if it is not confirmed within about 10 days. Both the plain and the member-paying twins exist (`… (member signing/paying on clients behalf)`), seeded by `20260908120100_ach_verify_templates_and_rules.sql` with recipients copied **verbatim** from the `|ach` rows they twin (ids 9 / 112) and `send_mode=false`. The handler selects `*`, so the discriminator column is always present — an explicit select that omitted it would make the predicate silently, permanently false (**#448**).
3. Substitutes `[Payment Amount]`, `[CARD_FEE_TEXT]`, `[PROCESSING_TIME]`. **The `|ach_verify` bodies carry neither `[CARD_FEE_TEXT]` nor `[PROCESSING_TIME]`** — the path is never a card, and the normal "2-4 business days" sentence is exactly the promise that does not hold yet.
4. **Card first payment → the client Gmail draft is SKIPPED** (`cardReceiptOnly = isFirst && isCard`). The card has already cleared and the invoice/receipt email of Step 12 lands in the same moment, so a separate confirmation is pure duplication. **ACH and check still get the draft** — ACH sits days in flight, and the check path is untouched by this policy. Draft goes to the client, CC member + PF.
5. UPDATEs `confirmation_status='Sent'` on the emailed paths; on the skipped card path it writes the shared constant **`'Skipped - Card (Receipt Only)'`** (`constants/confirmation-status.ts CONFIRMATION_CARD_SKIP`, mirrored in the frontend at `src/lib/confirmationStatus.js`) and **deliberately does NOT stamp `confirmation_email_sent_at`**, so a manual admin resend stays possible.

> **The gate lives INSIDE the handler, not at the webhook call site, on purpose.** Steps 11a onwards — the "client paid" PF bell, the ERT vault agreement copy, Tracy's new-case email and the load-bearing `c24_email_sent` stamp — are payment-1 side effects that MUST still run for a card. A call-site gate would silently kill them. Installments 2-4 are unaffected (they never had a confirmation).

> **The `MAP1_client_paid` PF bell re-words itself on the pending path (2026-09-08).** Same rule key, same recipients, same link — but on an ACH payment carrying `pay1_bank_verification_pending_at` the title becomes *"«Client» submitted bank details (verification pending)"* and the body says the client entered their account and routing numbers manually, Stripe is waiting on micro-deposit verification, and **no money has moved yet**. The old copy — *"«Client» just made their payment"* — was reporting an INTENT as an OUTCOME on that path, the same class of error as **#468**. The rule itself was not touched; only the strings the call site passes.

**Chains:** none.

---

## Step 12 — Invoice & receipt PDFs + Drive + email

**Trigger:** Server-to-server chain from Stripe webhook handler. Fires once per payment.

**Handler:** `automation_CONTRACT_invoicereceipt` ([admin-api:1812-2188](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)).

**What it does (per payment number):**
1. **Generate document numbers**: on payment 1, generates `INV-<client_ref>-<seq>` from `document_numbers` table count (NOT serialized — concurrency caveat). Always generates `REC-<client_ref>-<seq>`. Inserts records into `document_numbers`. Updates `pipeline_map1.invoice_number` (payment 1) and `.rec{N}_number`.
2. **Render HTML**: uses inline `generateInvoiceHTML()` and `generateReceiptHTML()` ([admin-api:4-141](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)) to build branded HTML (VFO blue header, payment schedule table, amounts, contribution lines).
3. **Generate PDFs** via two POST calls to `https://api.html2pdf.app/v1/generate`.
4. **Upload to Google Drive**: finds or creates a per-client folder named `<first> <last> - <client_ref>` under `GOOGLE_DRIVE_FOLDER_ID`. Uploads both PDFs as multipart, retrieves file IDs.
5. UPDATEs `pipeline_map1.invoice_drive_id` (payment 1) and `.rec{N}_drive_id`.
6. Loads template `'CONTRACT_invoicereceipt_email|first'` or `'|subsequent'`.
7. Re-fetches the PDFs from Drive (`?alt=media`) as base64.
8. Builds **multipart MIME** Gmail draft with PDF attachments. CC member + PF + `tracy@vfo-services.com`.
9. UPDATEs `invoice_email_sent` (payment 1) and `rec{N}_email_sent=true`.

> **⚠️ The first-payment email STOPPED requesting tax returns on 2026-08-07 (v709 / v711 / v712, gotcha #341).** Templates 10 (`CONTRACT_invoicereceipt_email\|first`) and 115 (the member signing/paying variant) end in a `[TAX_UPLOAD]` token, and until v709 that token rendered an **"Upload Tax Documents"** button: the handler minted `clients.tax_upload_token` and linked `/tax-upload`. That button was the de-facto tax-returns request for Holistic clients — an email that worked and a process that did not, since no step, request stamp, received stamp or phase-scoped bell was attached to it. **The handler now references `tax_upload_token` ZERO times and never constructs a `/tax-upload` URL.** A client with any of the six `TAX_PRIORITIES` values gets a static **Tax Form** button (`https://www.vfo-services.com/holistic-planning-form/`) — and **as of 2026-08-26 that block is ALL `[TAX_UPLOAD]` renders.** The portal-setup intro and the **"Set up your secure portal login"** button were removed from this email in the same deploy: the handler no longer selects or mints `clients.client_setup_token` and never builds a `/client-setup` URL, so a **non-tax client's `[TAX_UPLOAD]` now collapses to nothing at all** (the substitution swallows the template's trailing `<br>` when it renders empty, so the priorities list is not followed by a stray blank line). Clients are invited to the portal by the manual login-setup email (`/set-password`) instead. Tax returns are now requested by the **"Request Tax Returns" step**, which both tax programs carry as the first step of Tax 1 - Diagnostic (gotcha **#340**, [tax-planning.md](tax-planning.md)). **Rows 10/115 and the handler's HTML are a matched pair:** the sentence *"Tracy will contact you directly / your client directly…"* was deleted from both templates and the code's leading `<br><br>` was deleted with it — re-adding one side without the other breaks the spacing. (The `<br>` that used to sit under the Tax Form button went with the portal block.) **`clients.tax_upload_token` is durable**, so every `/tax-upload` link already sent from an older first-payment email still resolves; that is precisely why the Holistic returns stamp is request-gated (#340).

**Tables read:** `pipeline_map1`, `clients`, `members`, `pipeline_sandbox_config`, `email_templates`, `document_numbers`.
**Tables written:** `document_numbers` (insert), `pipeline_map1` (invoice_number, recN_number, drive IDs, email_sent flags).
**External calls:** html2pdf.app ×2, Google OAuth, Drive search/create/upload/download, Gmail drafts (multipart).
**Chains:** none.

---

## Step 13 — Revenue share

> **⚠️ Updated 2026-07-01 (gotcha #164):** the **Tracy Revenue-Master cross-check was REMOVED** from `contract-revshare.ts`. `_revshare` now pays the share **immediately** when the payment clears — no sheet lookup, no `K+L+M+N+O=J` reconciliation, no `pending` bailout; the share amounts come straight from the PF input form on `pipeline_map1`. It also now transfers the 10% **strategic partner share** to the partner company when the connected member is a strategic member (+ drafts the partner rev-share email). The Revenue-Master steps below are HISTORICAL.

> **⚠️ The strategic leg is gated on a STORED share `> 0`, which makes a missing one silent (2026-08-05, gotcha #335).** `pipeline_map1.strategic_partner_share` NULL is indistinguishable from "this member has no partner": no bell fires, no `'Failed'` status is written, and the sweep's strategic retry — which selects only `='Failed'` — cannot enumerate a leg that never started. That is how Payment Continuation migrated two live Action Coach engagements in with the partner's 10% folded into VFO's cut and nothing reported it. `migration_backfill_map1` now stores the share and **pre-settles `rec{i}_strat_paid='N/A — No Share Due'` + `rec{i}_strat_completed_at` on every installment already collected on the old system**, so the sweep never transfers a cut of a payment this system did not take. The strategic leg keeps its **own** per-installment ladder (`rec{N}_strat_paid`) — it is NOT the member's `rec{N}_rev_paid`.

> **⚠️ That pre-settle is terminal, and it can be WRONG (2026-08-11, gotcha #362).** `rec{i}_rev_paid='N/A — No Share Due'` is one of the three values `contract-revshare.ts`'s `isResolved` guard treats as finished, so the installment is skipped **forever** — no sweep, no webhook and no later payment reopens it. If the installment was flagged already-paid at migration but our own `_chargescheduled_sweep` later collected it (or the legacy platform never actually paid the share), the money arrives and nobody is ever paid their cut, while the row asserts none was due. The tell is `rec{n}_rev_completed_at` equal to `legacy_migrated_at` to the millisecond. **Check Stripe Transfers before assuming either way** — the pre-settle exists to prevent a double payout, so treating it as always-wrong is as dangerous as trusting it. Note also that neither Accounting → Holistic panel reads these payout columns (gotcha #363), so a full split shown there is attribution, not evidence of a transfer.

> **⚠️ The strategic memo + partner email are built at FOUR call sites (2026-08-11, gotcha #364).** `transferStrategicShare` receives its `description` fully-formed, and `draftStrategicPartnerEmail` fans out the same way: `contract-revshare.ts`, `contract-revshare-sweep.ts`, `tax/revshare.ts`, `tax/revshare-sweep.ts` — immediate handler **and** nightly retry, on both pipelines. Editing only the immediate handler means the wording silently reverts whenever the leg is paid by the sweep instead, which is the common path when the partner's Connect account was not live at payment time (#159). The memo now reads **`… - Strategic Partner: <group name> - <n>/4`** (was `Strategic Member: (<number>) <name>`), and `email_templates` **178**'s subject leads with `[Partner Name]`, Cc Tracy + Tray — **one shared row, so it applies to Tax Plan IQ as well as Action Coach**.

**Trigger (two paths, both automatic):**
1. **Push chain from Stripe webhook:** `router/webhooks.ts` chains `_revshare` immediately after `_invoicereceipt` in all three Stripe webhook chain sites (MAP1 first-card, quarterly N succeeded, ACH cleared). ~~First attempt usually returns `pending: true` because Tracy's Revenue Master sheet isn't updated yet~~ — as of 2026-07-01 it pays on clear (no pending).
2. **Daily sweep via `automation_CONTRACT_revshare_sweep`:** `pg_cron` runs at 02:00 UTC (see `vfo-edge-functions/supabase/cron/revshare-sweep.sql`). The sweep enumerates every `pipeline_map1` row where any `rec1-4_number` is set but `rev_paid` is not yet `Yes`/`Money Mapping`/`N/A` — and re-invokes `_revshare` for each. Includes previously-`Failed` transfers, so misconfigured Stripe Connect accounts auto-recover once fixed. **The same sweep also drives the three-stall reminder ladder (PCADMIN Undecided, agreement signing, Pay1 link) — see "Reminder ladder" below.** No manual path.

**Handler:** `automation_CONTRACT_revshare` ([actions/pipeline/contract-revshare.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/pipeline/contract-revshare.ts)).

**What it does (per payment number):**
1. Validates `pipeline_map1.rec{N}_number` exists. **Duplicate guard:** skips only if `rev_share` is set non-`Pending` AND `rev_paid` is in `Yes`/`Money Mapping`/`N/A — No Share Due`. `Failed` and `Pending` re-attempt on next call.
2. Sets `rec{N}_rev_share='Pending'`.
3. Refreshes Google access token (covers Sheets + Gmail + Drive).
4. ~~Reads Google Sheet `MASTER_SHEET_ID` (`Home Page!A1:I200`), finds `client_ref` in col A, extracts batch sheet ID from the col-I hyperlink. If not found: returns `pending: true, reason: "Client ref not found in Revenue Master"` and exits.~~
5. ~~Reads batch sheet metadata, finds tab matching `client_ref` + 4-digit number. If none: returns `pending: true`.~~
6. ~~Reads `<tab>!G7:O200`. Finds row matching receipt number AND verifies col J = expected payment AND verifies K+L+M+N+O = J. If verification fails: returns `pending: true, reason: "Tracy's numbers not yet verified"`.~~
   > **Steps 4–6 no longer happen (2026-07-01, #164).** `contract-revshare.ts` contains **zero** Sheets references and never returns `pending` — verified by grep. They are kept struck-through only so the historical shape is legible.
7. Calculates this installment's share amount. **CORRECTED 2026-08-14 — the two bullets that used to sit here described code deleted on 2026-07-29 (v673–v675) and must not be reinstated.** The share is **always dollars of the TOTAL engagement**, never a percentage of the payment (#252); there is no `> 100` heuristic. Installment `i` gets the **cumulative difference** `cumShare(i) − cumShare(i−1)` where `cumShare(k) = round2(member_share × k / totalPayments)`, so the parts sum to the entered share to the cent and **the member is paid the entered amount IN FULL**. It is **never scaled by net/gross**: the entered share is already net of `member_contribution`, and the engine's own comment says such a row "must not shrink a second time" (#304). The old **`member_contribution` deduction step was DELETED as dead code** — nothing has ever written `member_contrib_status='Pending'`, and it carried a latent overpay-on-retry bug (the status flipped to `'Applied'` *before* the transfer, so a retry recomputed without the deduction). Note the two legs this handler does **not** pay the same way: **strategic** is gross-prorated, and **VFOS is never transferred at all** — a display surface must treat it as the residual of the net installment (#394).
8. **Stripe Transfer**, decided by an **EXHAUSTIVE branch chain** rather than a terminal default (#303 — never initialize `revPaidValue` to a terminal string with the transfer behind a condition). **The documented ORDER is load-bearing:**
   - Money Mapping → `'Money Mapping'`; zero share → `'N/A — No Share Due'`; **member out of good standing → the HOLD (new 2026-08-24, see below)**; **no `stripe_account_id` → `AWAITING_CONNECT` (`'Awaiting Connect Setup'`)**, a **NON-terminal** held state that also raises an action-required bell (`utils/member-share-held.ts`, title reconstructable so it self-clears); missing `STRIPE_KEY` → `'Failed'`.
   - Otherwise POSTs to `https://api.stripe.com/v1/transfers` with `amount`, `currency=usd`, `destination=stripe_account_id`, `description="MAP 1 Revenue Share - Client: (<client_ref>) <Client Name> - Member: (<member_number>) <Member Name> - <N>/4"` (one-time plans end `- One-Time Payment`). On success `'Yes'`, on failure `'Failed'`.
   - The completion stamp `rec{N}_rev_completed_at` is written **only on a terminal outcome** (`Yes` / `Money Mapping` / `N/A — No Share Due`).
9. UPDATEs `pipeline_map1.rec{N}_rev_share='Completed - <type>'` and `.rec{N}_rev_paid`.
10. Builds inline (NOT template-based) HTML email to member with rev-share confirmation. CC PF; BCC `aanderson` + `platham`.
11. Creates Gmail draft.
12. **On payment 1 only:** also creates a "Tracy intro email" Gmail draft to `tnmiller@elitert.com` with the priorities list. Sets `c24_email_sent=true`.

**Tables read:** `pipeline_map1`, `clients`, `members` (incl. `suspended` / `paused` / `membership_arrears`), `pipeline_sandbox_config`, `email_templates` (`MEMBERS`/`MEMBER_revshare_held`, hold only).
**Tables written:** `pipeline_map1` (rec{N}_rev_share, _rev_paid, _rev_email_sent, member_contrib_status, c24_email_sent).
**External calls:** Google OAuth, optionally Stripe transfers, Gmail drafts ×1-2 (+1 internal held notice on a hold). (**No Sheets calls** since the Revenue-Master cross-check was removed — #164.)

### The member-standing HOLD (2026-08-24) *(v: 2026-08-24)*

**A member who is suspended or paused is not paid.** `utils/member-payout-hold.ts` `memberHoldReason(member)` reads three booleans off the `members` row — `suspended` → `"suspended"`, else `paused` → `"paused"`, else (2026-09-15) `membership_arrears` → `"arrears"` (`Held - Member In Arrears`, its own Paul notice `MEMBER_revshare_held_arrears`; suspension outranks a pause outranks arrears). Non-null ⇒ this branch:

- `rec{N}_rev_paid` = **`'Held - Member Suspended'`** or **`'Held - Member Paused'`** — **non-terminal**, exactly like `AWAITING_CONNECT`. `rec{N}_rev_share` still becomes `'Completed - Revenue Share'` and **`rec{N}_rev_completed_at` is NOT written**.
- **No transfer, no member confirmation email** (that draft is gated on `Yes`/`Money Mapping`) and no held-share Connect bell.
- **Only the MEMBER leg is held.** The strategic-partner leg below runs unchanged in the same call.

**Its placement in the chain is deliberate and must not be "tidied":** *above* the no-account branch, so a suspended member never triggers the Connect-setup bell or its email; *below* Money Mapping and the zero-share close, because neither moves cash — there is nothing to withhold, so those close normally and raise no notice.

**The internal notice.** The first time a leg enters the hold, `draftMemberHeldNotice` creates ONE Gmail **draft** — `email_templates` **230**, pipeline `MEMBERS` / `MEMBER_revshare_held`, **To Paul, Cc Anton + Tray + Tracy**, tokens `[Member Name]` `[Member Number]` `[Member Status]` `[Revenue Type]` `[Source]` `[Amount]`. It has **no `sendMode`**, so the Draft/Send toggle can never turn it into a live send, and it is **best-effort**: a missing template falls back to an identical hardcoded body, and any failure logs and returns rather than throwing into the money path. **Dedupe is once per hold episode**, keyed on the leg's status as read *before* this run's write — so a Stripe redelivery (#327) or a nightly sweep tick re-holds silently. For MAP 1 the notice reads `Revenue type: Holistic Planning`, `Source: <Client Name> - Payment N of M`.

**Release.** The 02:00 sweep's resolved-set predicate was **not touched** — it treats only `Yes` / `Money Mapping` / `N/A — No Share Due` as resolved, so a held leg is already a candidate every night (logged with reason `never-attempted`, since `rev_share` is not `Pending` and `rev_paid` is not `Failed`) and pays itself the first night after reinstatement. On top of that, clearing the flags fires an **instant** release — see [07-server-chains.md § Member reinstatement](../architecture/07-server-chains.md).

---

## Reminder ladder (48h client reminder + 96h PF notification)

The MAP 1 reminder ladder mirrors the tax-planning sweep's stall-handling pattern. It rides on the existing `automation_CONTRACT_revshare_sweep` daily job at 02:00 UTC — no separate cron. Three stalls, two tiers each (six independent checks total). All emails are **To-client-only** (matching `actions/tax/revshare-sweep.ts`'s `sendReminderEmailUnified`). All PF notifications are admin-bell rows with `pipeline='MAP 1'`, `link='/admin/client/<id>?tab=map1'`.

> **All six tiers count BUSINESS DAYS as of 2026-08-14** — defaults **2 business days** (client reminder) and **4 business days** (PF bell), read from `notification_rules.delay_days` and resolved through `businessDelayCutoffIso()` in `utils/notify.ts` (Mon–Fri UTC, **no holiday calendar**). The stored numbers did not change; only the unit did, so a stall entered on a Friday is chased the following week rather than over the weekend. The bell bodies interpolate their own delay and read *"N business day(s) have passed"*. **The "48h / 96h" in this section's heading is legacy shorthand kept only so existing deep-links to the anchor keep working** — read it as the 2-/4-business-day ladder. The calendar helper `delayCutoffIso` still exists but has no callers.

| Stall | Timer base column | Stall condition | Client reminder (2 business days) | PF notification (4 business days) |
|---|---|---|---|---|
| **PCADMIN Undecided email** | `c14_email_sent_at` (written only on Undecided branch — see Step 2) | `c13_decision = 'Undecided'` | Gmail draft using `CONTRACT_pcadmin_undecided_reminder` template. Buttons rebuilt from `c15_token` + `client_ref` + Max-availability check (`max_membership != 'N/A'`). Idempotency: `c14_reminder_sent_at`. | "X hasn't responded to the MAP 1 decision email" admin notification. Idempotency: `c14_pf_notified_at`. |
| **Agreement signing** | `c17_followup_sent_date` (DATE; written by `automation_CONTRACT_sendagreement` at send time) | `c17_client_signed != 'Yes'` | Gmail draft using `CONTRACT_signing_reminder`. BoldSign embedded sign link re-fetched with 3 retries. Idempotency: `c17_reminder_sent_at`. | "X hasn't signed the MAP 1 agreement" admin notification. Idempotency: `c17_pf_notified_at`. |
| **Pay1 payment link** | `pay1_email_sent_at` (written by `automation_CONTRACT_paymentemail` after Gmail draft) | `pay1_status IS NULL` | Gmail draft using `CONTRACT_payment_reminder`. `/pay?token=<checkout_token>` button. Template body uses `[PAYMENT_LABEL]` substitution: `"first payment"` for Quarterly plans, `"payment"` for one-time. Idempotency: `pay1_reminder_sent_at`. | "X hasn't paid the MAP 1 first payment" admin notification. Idempotency: `pay1_pf_notified_at`. |

**Tier semantics:** the two tiers' queries are independent — a row already past the 4-business-day cutoff with neither tier fired will get BOTH on the same sweep run. Once each `_sent_at` / `_notified_at` guard is set, the row is filtered out of that block on subsequent runs.

**Templates** (inserted in `email_templates` with `pipeline='MAP 1'`, `active=true`):
- `CONTRACT_pcadmin_undecided_reminder`
- `CONTRACT_signing_reminder`
- `CONTRACT_payment_reminder` (uses `[PAYMENT_LABEL]` placeholder)

**Sandbox routing:** the helper reads `pipeline_sandbox_config WHERE pipeline='MAP 1'` and routes To: through `sandbox_email` when on.

**Historical note:** prior to 2026-05-21 the table had legacy columns `c14_followup_sent_date`, `c14_followup1_sent`, `c14_followup2_sent`, `c17_followup1_sent`, `c17_followup2_sent`, `pay1_followup_sent_date`, `pay1_followup1_sent`, `pay1_followup2_sent` that were never written by any code path. These were dropped in migration `map1_reminder_ladder_columns` and replaced with the timestamptz columns documented in [tables/pipeline.md](../tables/pipeline.md).

---

## Notification touch-points

`automation_PCADMIN_finaldecision` is the **client-decision** insert point:
- Decision = Yes (with chosen service level): "X chose Y"
- Decision = ExtraMeeting: "X requested extra meeting"

> **It is NOT the only MAP 1 notification insert** (an older claim here said so). The daily `automation_CONTRACT_revshare_sweep` inserts the three PF stall bells in the reminder ladder above; `contract-check-reminder-sweep.ts` inserts the uncleared-check bells and the migration setup-link ladder; `contract-revshare.ts` fires Tracy's "client has paid" FYI, the held-share bell and the Jake transfer-failure alert; `contract-chargescheduled-sweep.ts` fires the Jake failed-charge alert. Search `pipeline: "MAP 1"` under `actions/pipeline/` for the current set.

Two follow-up actions clear all unread notifications for a client_id:
- `automation_PCADMIN_pricing` (when admin completes pricing)
- `automation_PCADMIN_extrameeting` (when admin records extra-meeting outcome)

See [notifications.md](notifications.md).

---

## Cumulative state machine

The `pipeline_map1` row evolves through these column writes, in order:

| Step | Columns written |
|---|---|
| 1 | `client_id`, `client_ref`, `pf`, `c81_decision`, `c81_email_sent`, `followup_meeting_date`, `sandbox` |
| 2 | `c13_decision`, `current_priorities`, `parked_priorities`, pricing fields (Yes), undecided fields, `c14_email_sent`, `c14_email_sent_at` (Undecided branch only — reminder-ladder timer base), `c15_token` |
| 3a | `c15_final_decision`, `c15_service_level` |
| 3b/3c | pricing fields, `c15_via_extra_meeting` |
| 4 | `c16_sent`, `boldsign_doc_id`, `c17_client_signed`, `c18_ceo_signed` (initial 'No'/'No'), `c17_followup_sent_date` |
| 5/7 | `c17_client_signed`, `c18_ceo_signed` (advanced via webhook) |
| 8 | `stripe_customer_id`, `checkout_token`, `pay1_email_sent_at` (reminder-ladder timer base, written by `automation_CONTRACT_paymentemail`) |
| 10 | `pay1_status`, `payment_method_type`, `acct_last4`, `card_processing_fee`, `pay1_date`, `pay2-4_date`, `confirmation_status`, `pay1_bank_verification_pending_at` |
| 11 | `confirmation_status` — `'Sent'` + `confirmation_email_sent_at` (ACH / check), or `'Skipped - Card (Receipt Only)'` with NO `confirmation_email_sent_at` (card) |
| 12 | `invoice_number`, `rec{N}_number`, `invoice_drive_id`, `rec{N}_drive_id`, `invoice_email_sent`, `rec{N}_email_sent` |
| 13 | `rec{N}_rev_share`, `rec{N}_rev_paid`, `rec{N}_rev_email_sent`, `member_contrib_status`, `c24_email_sent` |

`AutomationPanel.getCurrentStage()` ([component code](src/components/admin/AutomationPanel.jsx)) infers the current stage from these column values via cascading checks — see [02-frontend-shell.md](../architecture/02-frontend-shell.md#what-automationpanel-shows).

---

## Failure modes

1. **PIP1 row created but Gmail draft fails** → row exists with `c81_email_sent='No'` indefinitely. No retry. Admin must investigate.
2. **`automation_CONTRACT_sendagreement` fails** → `c16_sent` not flipped, but the chain that called it (e.g., `automation_PIPFU_decision`) already completed and marked the c13 task done. No retry.
3. **BoldSign embedded sign-link polling exhausted** (5 retries) → handler still completes (sets `c16_sent='Yes'`) but Gmail draft has `[ENGAGEMENT — signing link unavailable]` placeholder text in red. Visible failure.
4. **Wrong BoldSign webhook URL** → `c17/c18` flip but no chain. CEO countersign + payment email never get created. Stalls until manual intervention.
5. **`document_numbers` race** → two concurrent `_invoicereceipt` calls could allocate the same number. Not protected by DB unique constraint or transaction.
6. **Drive folder name change** → if client is renamed, prior PDFs orphan in the old folder.
7. ~~**Sheets verification stuck** → `_revshare` returns `pending: true`. The daily `_revshare_sweep` cron auto-retries every 24h until Tracy's sheet matches.~~ **Gone since 2026-07-01 (#164)** — there is no sheet lookup and no `pending` return; the share pays when the payment clears. The daily sweep still auto-retries `Pending` / `Failed` / `Awaiting Connect Setup` legs — and, since 2026-08-24, `Held - Member Suspended` / `Held - Member Paused` (no predicate change was needed: the sweep skips only the three RESOLVED values).
8. **Stripe Transfer fails** → `rec{N}_rev_paid='Failed'`. Member email + Tracy email are **NOT** drafted on Failed (gated on `rev_paid === "Yes"` at [contract-revshare.ts:347](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/pipeline/contract-revshare.ts)). The daily sweep auto-retries Failed transfers, so once the Stripe Connect account is fixed (typically a missing `transfers` capability) the next sweep run completes the flow.
9. **Idempotency**: the rev-share duplicate guard skips only when `rev_paid` is in `Yes`/`Money Mapping`/`N/A — No Share Due` — `Pending` and `Failed` retry on next call. Other handlers check single columns: `c16_sent === 'Yes'`, `confirmation_status === 'Sent'`. The dual `Signed` + `Completed` BoldSign events are explicitly idempotent. Stripe webhook checks `pay1_status` empty.

## Cross-references

- Pipeline column dictionary: [../tables/pipeline.md](../tables/pipeline.md)
- BoldSign webhook detail: [boldsign-webhook.md](boldsign-webhook.md)
- Stripe webhook detail: [stripe-webhook.md](stripe-webhook.md)
- Stripe API + revenue share: [../integrations/stripe.md](../integrations/stripe.md)
- BoldSign API: [../integrations/boldsign.md](../integrations/boldsign.md)
- Gmail/Sheets/Drive: [../integrations/gmail.md](../integrations/gmail.md), [../integrations/google-sheets.md](../integrations/google-sheets.md), [../integrations/google-drive.md](../integrations/google-drive.md)
- Frontend touch-points table: [../architecture/06-orchestration-files.md#where-each-automation_-action-is-triggered-from-the-frontend](../architecture/06-orchestration-files.md)
