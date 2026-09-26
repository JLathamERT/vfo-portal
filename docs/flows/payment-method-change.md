# Payment-method change flow

The admin-initiated "change the card/bank on file" flow (Phase D). Added 2026-06-16. An admin (Jake-only) clicks **Send Email to Change Payment Method** on a client / member / specialist Payments tab → the backend mints a person-keyed token and drafts a Gmail with a `/update-card?token=` link → the person enters a new card or bank account on Stripe's hosted **`mode:'setup'`** Checkout page (NO charge) → a webhook saves the new method as that engagement's default payment method → the **next** off-session charge (MAP 1 quarterly sweep / Tax implementation / Specialist license renewal) uses the new method automatically.

Raw card/bank data is never seen or stored — the person types it directly into Stripe's hosted page, and the backend only ever handles the resulting payment-method id.

This is the **first SetupIntent / `mode:'setup'`** usage in the system. Every prior Stripe flow either charges (`mode:'payment'`) or subscribes (`mode:'subscription'`); a setup session saves a reusable method with no charge.

## Key modeling — per-engagement, person-keyed token

Each engagement carries its **own** Stripe customer (`contract-stripe-customer.ts` creates one per `pipeline_map1` row; Tax creates one per `client_tax_plans` row; the Specialist license reuses the background-check customer). For **member-paid** MAP 1 / Tax engagements the customer holds the **member's** card, not the client's. So a payment-method change is fundamentally **per-engagement**: one Stripe setup session updates exactly one Stripe customer.

The token, however, is keyed to the **person** (`card_update_tokens.person_type` + `person_ref`), not a single engagement. One emailed link therefore covers **every** reusable engagement that person pays. The `/update-card` page lists each one and lets the person update them **separately** — a different card or bank per engagement is allowed. "Reusable engagement" = one that has a future off-session charge whose method a change would actually affect (see [card-update-shared.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/payments/card-update-shared.ts)):

| Pipeline | Table | Counts as updatable when… | Customer holds |
|---|---|---|---|
| `MAP 1` | `pipeline_map1` | `payment_plan='Quarterly'` AND a card/ACH method is on file AND any of `pay2/3/4_status` is **not in `{succeeded, cancelled}`** (a future installment remains) | client's card, or the member's for member-paid rows |
| `TAX` | `client_tax_plans` | `implementation_amount > 0` AND a card/ACH method is on file AND `implementation_charge_status` is not `succeeded`/`processing`/**`cancelled`** | client's, or member's for member-paid rows |
| `SPECIALIST_LICENSE` | `specialist_onboarding` | the $99/mo license subscription exists (`lic_subscription_id` + `lic_stripe_customer_id` set) AND `lic_payment_status != 'canceled'` | the specialist's (reused from the background-check charge) |

One-time / pay-in-full MAP 1, check-paid plans, and already-charged engagements are **not** listed — there is no future reusable charge to redirect.

> **`'cancelled'` joined `succeeded`/`processing` as terminal here on 2026-08-26 (v789).** A slot closed by the superadmin "Cancel all remaining payments" button ([contract-and-payment.md](contract-and-payment.md) Step 10¾) will **never** be charged, so it is not a future charge and must not make a row eligible: `card-update-shared.ts` gained `MAP1_SETTLED = {succeeded, cancelled}` on the MAP 1 test and a third terminal value on the tax test. An engagement whose remaining installments were **all** cancelled therefore drops out of the list entirely — otherwise the tool would offer to update a card for money that is never coming, and `payments_send_card_update` would email a link over it. On the tax side the check is safe against the final retainer, the only other reusable tax charge: cancel-remaining closes **both** legs in one write, so an implementation reading `cancelled` while a final retainer is still collectable can only mean that retainer had already succeeded or was processing.

## Trigger graph

```
Admin opens a Payments tab (client / member / specialist) and clicks
"Send Email to Change Payment Method"  [Jake-only button]
  └─► payments_send_card_update  (AUTH, superadmin-only)
        ├─ enumerate the payer's reusable engagements (card-update-shared.ts)
        ├─ INSERT card_update_tokens row (person-keyed, 7-day expiry)
        └─ draft Gmail from email_templates (PAYMENTS / card_update)
              → link: /update-card?token=<token>

Person clicks /update-card?token=...  (UpdateCardPage.jsx, no login)
  ├─► payments_loadcardupdate     (PUBLIC token) → person + engagement list
  └─► (per engagement, person picks card or bank)
        payments_cardupdate_checkout  (PUBLIC token)
          → Stripe Checkout Session, mode:'setup', NO charge
            metadata: payment_kind=card_update, pipeline, row_id, token
          → redirect to Stripe hosted page (person enters new card/bank)

Stripe webhook  checkout.session.completed + mode='setup'
                + metadata.payment_kind='card_update'   (router/webhooks.ts)
  ├─ expand the SetupIntent → read the new payment_method (id, type, last4)
  ├─ POST /v1/customers/{cus}  invoice_settings.default_payment_method = pm
  └─ write the engagement row's default + display fields:
       MAP 1  → default_payment_method_id, payment_method_type, acct_last4,
                recompute card_processing_fee, FREEZE paid installments'
                pay{N}_method / pay{N}_last4
       TAX    → default_payment_method_id, payment_method_type, acct_last4
       SPEC   → lic_default_payment_method_id, lic_payment_method_type,
                lic_acct_last4, then PATCH the subscription's
                default_payment_method (renewals use it)

Next off-session charge prefers the stored default PM
  ├─ MAP 1 quarterly sweep  (contract-chargescheduled-sweep.ts)
  ├─ Tax implementation     (tax/charge-implementation.ts)
  └─ Specialist license     (already keys off its subscription default PM)
```

## Tables touched

| Table | R/W | Columns |
|---|---|---|
| `card_update_tokens` | R/W | NEW table. `token` (32-byte hex), `person_type` (`client`/`member`/`specialist`), `person_ref` (client id / member_number / expert id, as text), `created_by` (admin email), `expires_at` (now + 7 days). One row minted per send; re-read by the load + checkout actions. |
| `pipeline_map1` | R/W | R: `stripe_customer_id`, `payment_method_type`, `acct_last4`, `payment_plan`, `service_level`, `member_paying_on_behalf`, `pay{1..4}_status`, `net_invoice`. W (webhook): `default_payment_method_id` (NEW), `payment_method_type`, `acct_last4`, `card_processing_fee` (recomputed), `pay{N}_method` / `pay{N}_last4` (NEW — frozen for already-paid installments). |
| `client_tax_plans` | R/W | R: `stripe_customer_id`, `payment_method_type`, `acct_last4`, `implementation_amount`, `implementation_charge_status`, `member_paying_on_behalf`, `program_id`. W (webhook): `default_payment_method_id` (NEW), `payment_method_type`, `acct_last4`. |
| `specialist_onboarding` | R/W | R: `lic_subscription_id`, `lic_stripe_customer_id`, `lic_payment_status`, `lic_payment_method_type`, `lic_acct_last4`, `specialist_name`, `specialist_email`. W (webhook): `lic_default_payment_method_id` (NEW), `lic_payment_method_type`, `lic_acct_last4`. |
| `clients` | R only | `first_name`, `last_name`, `email`, `member_number` (person resolution + member→client fan-out). |
| `members` | R only | `first_name`, `last_name`, `email` (member person resolution). |
| `email_templates` | R only | id 156 — `(pipeline='PAYMENTS', template_name='card_update')`: `subject`, `body`, `cc_list`, `bcc_list`. Built-in fallback used if the row is missing. |
| `pipeline_sandbox_config` | R only | One read per involved pipeline key (`MAP 1` / `TAX` / `SPECIALIST_ONBOARDING`) to pick the sandbox-vs-live Stripe secret + sandbox recipient email. |

## Step-by-step

### Step 1 — Admin clicks the button (Jake-only)

[PaymentsHeader.jsx](src/components/payments/PaymentsHeader.jsx) renders a **Send Email to Change Payment Method** button, gated to Jake (superadmin) only. It calls `payments_send_card_update` with `person_type` (`client`/`member`/`specialist`) + `person_ref`.

### Step 2 — Mint token + draft email

`payments_send_card_update` ([actions/payments/card-update-send.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/payments/card-update-send.ts)) — **AUTH, superadmin-only** (listed in `SUPERADMIN_ONLY_ACTIONS`):

1. Resolves the person + their updatable engagements via `loadCardUpdatePerson()` (shared with the load + checkout actions).
2. **Short-circuits** with a friendly `{sent:false, reason}` if the person has no reusable engagement (`reason:"none"`) or no email on file (`reason:"no_email"`). Neither is an error.
3. **Sandbox routing:** if **any** involved pipeline is in sandbox mode, the draft is redirected to that pipeline's `sandbox_email` (test-safe) and `sandbox:true` is returned.
4. Inserts a `card_update_tokens` row — a fresh 32-byte hex token (`token32()`), `created_by` = the admin's email, `expires_at` = now + 7 days.
5. Loads the editable email body from `email_templates` `(PAYMENTS, card_update)` (id 156); falls back to a built-in subject/body if the row is absent. Substitutes `[First Name]` and `[UPDATE_LINK]` (an HTML button → `/update-card?token=…`). Template `cc_list`/`bcc_list` are applied via `templateRecipients` (empty in sandbox).
6. Drafts the Gmail via `draftGmail` / `getGmailAccessToken` ([utils/gmail-draft.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/gmail-draft.ts)). Like every other automation email it is a **draft**, not a sent message.

Returns `{sent:true, count, to_email, sandbox}`. No charge, no Stripe call — this step only mints the token and drafts the email.

### Step 3 — Person opens `/update-card`

[UpdateCardPage.jsx](src/pages/UpdateCardPage.jsx) at `/update-card?token=<token>` (public route, no login). On mount it calls `payments_loadcardupdate`.

`payments_loadcardupdate` ([actions/payments/card-update-load.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/payments/card-update-load.ts)) — **PUBLIC (token)**:

1. Looks up the token; rejects with `404` if invalid, `410` if expired.
2. Re-enumerates the person's engagements and returns `{person_name, engagements:[…]}` — each with `pipeline`, `row_id`, `label` ("what it's for"), `for_client_name` (member-on-behalf), and the **current** method + last4 (display only). The Stripe customer id is **not** exposed; the checkout action re-derives it server-side.

The page lists every engagement and offers a card / bank choice for each.

### Step 4 — Person picks an engagement + method → Stripe setup session

`payments_cardupdate_checkout` ([actions/payments/card-update-checkout.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/payments/card-update-checkout.ts)) — **PUBLIC (token)**:

1. Validates `token`, `pipeline`, `row_id`, `method` (`card`/`ach`).
2. **Authorization:** re-enumerates the token's person and confirms the requested `(pipeline, row_id)` belongs to them — a token cannot touch a stranger's engagement.
3. Picks the sandbox-vs-live Stripe secret for that engagement's pipeline.
4. Creates a Stripe **Checkout Session** for the engagement's existing customer:
   - `mode: setup` (no `line_items`, **no charge**)
   - `customer: <engagement's stripe customer>`
   - `payment_method_types[]: card` **or** `us_bank_account`
   - `metadata: payment_kind=card_update, pipeline, row_id, token` (mirrored onto `setup_intent_data[metadata]` so the SetupIntent is tagged too)
   - ACH adds `payment_method_options[us_bank_account][verification_method]=instant` — **still pinned here, and no `custom_text` note.** The 2026-09-08 unpin (**#475**) covers `/pay` and `/tax-pay` only; this builder is one of the nine deliberately left out of scope. See [../integrations/stripe.md](../integrations/stripe.md) "ACH verification" for the full per-builder split.
   - `success_url = /update-card?token=…&updated=1`, `cancel_url = /update-card?token=…`
5. Returns the Stripe URL; the page redirects. The person enters the new card/bank on Stripe's hosted page — **the only place raw payment data ever lives.**

### Step 5 — Stripe webhook applies the new method

[router/webhooks.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/router/webhooks.ts) — on `checkout.session.completed`, a NEW isolated branch fires when `session.mode === 'setup'` AND `session.metadata.payment_kind === 'card_update'`. It deliberately does **not** touch the existing MAP 1 `pipeRow` logic.

1. Reads `pipeline` + `row_id` from session metadata, `customer` + `setup_intent` from the session.
2. Picks the sandbox-vs-live key for that pipeline.
3. **Expands the SetupIntent** (`GET /v1/setup_intents/{id}?expand[]=payment_method`) to read the newly-saved method's id, type, and last4 (`card` → `method='card'`; `us_bank_account` → `method='ach'`).
4. `POST /v1/customers/{cus}` with `invoice_settings[default_payment_method]` = the new pm id — makes it the customer default for future invoices/charges.
5. Writes the engagement row, per pipeline:
   - **MAP 1**: `default_payment_method_id`, `payment_method_type`, `acct_last4`; **recomputes `card_processing_fee`** for the new method (card grossed up `(base+0.30)/(1−0.029)−base`; ACH = 0; base = `net_invoice/4` for Quarterly; **0 even for card when `card_fee_waived=true`** — payment-continuation setup-link clients, 2026-07-15); and **freezes** already-paid/processing installments' method into `pay{N}_method` / `pay{N}_last4` (only those not already frozen) so the Payments tab keeps showing each past installment's real fee instead of re-skinning it to the new method. Scheduled installments stay `null` and are projected from the new method (= what they'll actually be charged).
   - **TAX**: `default_payment_method_id`, `payment_method_type`, `acct_last4`.
   - **SPECIALIST_LICENSE**: `lic_default_payment_method_id`, `lic_payment_method_type`, `lic_acct_last4`, **then PATCHes the live subscription** (`POST /v1/subscriptions/{sub}` `default_payment_method=pm`) so renewals bill the new method.
6. **Single-use migration setup tokens (v612).** The **payment-continuation `/connect-card` flow reuses this same `mode='setup'` + `payment_kind='card_update'` webhook branch** to activate a dormant migrated row. Its session carries an extra `session.metadata.token` (a `migration_setup_tokens` token); when present, the branch stamps that token `used_at=now()` so it cannot be reused (`migration_connect_checkout` then returns 410, and `migration_connect_load` reports `done=true`). **Phase D admin card-update sessions are unaffected** — their `metadata.token` is a `card_update_tokens` value, so the `migration_setup_tokens` update matches no row (no-op). **Sandbox resolution on this flow is PER CLIENT, not global (v672, 2026-07-29 — gotcha #302).** `migration_connect_checkout` and the other four `actions/migration/*` handlers pick their Stripe key via `loadSandboxConfigForClient(supabase, 'MAP 1'|'TAX', clientId)` — the `/connect-card` token row supplies `tok.client_id` — so a test-member case (#251) is forced to sandbox even when the global pipeline toggle is LIVE. Before v672 these handlers read the global `pipeline_sandbox_config` row inline, which served the test member a **live-mode** Stripe setup page while the sweep that would charge the same row resolved to **sandbox** — a split-brain the case could never escape. A new handler in this family must use the helper; a direct `pipeline_sandbox_config` read re-opens the gap.
   - **Setup-link reminder ladder + auto-resend (added 2026-07-28, v668/v669 — gotcha #300).** A migrated client who never used their `/connect-card` link used to be chased by nothing at all, so their remaining scheduled payments silently never ran (one client sat 13 days on an expired link with a $1,350 quarterly payment past due). `sweepMigrationSetupLinks`, a new pass inside the nightly `automation_CONTRACT_checkreminder_sweep` (13:40 UTC Mon–Fri, running before that action's own early-returns), now takes the **newest UNUSED token per `(pipeline, row_id)`** and fires a **2-business-day reminder email** (`CLIENT_PAYMENT_CONTINUATION` / `setup_link_reminder`; tokens `[FIRST_NAME]` / `[CONNECT_LINK]` / `[PAYMENT_SCHEDULE]`; guarded by the new `migration_setup_tokens.reminder_sent_at`) and a **4-business-day bell** to Tracy + Jake (`MIGRATION_setup_link_stall_bell`, link `/admin/client/<id>?tab=map1|tax`, guarded by the new `pf_notified_at`). **Both tiers count BUSINESS DAYS as of 2026-08-14** — the rules' `delay_days` are still 2 and 4, but the sweep resolves each cutoff through `businessDelayCutoffIso()` in `utils/notify.ts` (Mon–Fri UTC, **no holiday calendar**), so a client emailed on a Thursday is nudged the following Monday rather than over the weekend. **The token's own 7-day expiry is unaffected and stays CALENDAR** — expiry windows were deliberately left out of the conversion, so a token minted Thursday still dies the next Thursday. **An EXPIRED token is never emailed** — the sweep instead **auto-resends**: it mints a fresh 7-day token (`created_by='sweep'`, `reminder_sent_at` stamped AT MINT so the replacement stays quiet until its own expiry) and emails that; the candidate filter is `isExpired(t) ? sweepMintCount(t) < 3 : !t.reminder_sent_at`, capped at **3 sweep-minted tokens per row**, and idempotency comes from **supersession** (the new token becomes the newest, so a failed mint simply retries the next night). The stall bell's wording is four-way truthful — reach out / *"a fresh one has been automatically emailed"* / *"re-send a fresh one from their Payment Continuation row"* / *"automatic re-sends are exhausted after 3 attempts"*. The reminder's `[PAYMENT_SCHEDULE]` block comes from the shared `utils/migration-schedule.ts buildMigrationScheduleHtml()`, extracted verbatim from `actions/migration/send-setup-link.ts` so the original and the nudge can never drift. **Since v715 (2026-08-10) that helper is branch-asymmetric: MAP 1 renders date/amount tables over the still-unpaid installments, but the TAX branch renders NO figure at all** — one fixed sentence ("This is being set up proactively as a part of your VFO Services' membership and to collect any future payments."), because the tax implementation fee is charged only *if* the client proceeds and quoting it overstated a commitment. The `/connect-card` page dropped its matching figure in the same deploy (`connect-load.ts` stopped selecting `implementation_amount`, so `amount: null` makes `ConnectCardPage` hide the headline and the whole breakdown) — **the two surfaces must move together, see gotcha #352.** **MAP 1 became PAST-DUE-AWARE on 2026-08-19 (v762) — gotcha #421, and the two surfaces are now deliberately asymmetric.** The **page** mirrors the charge sweep's candidate filter line for line (`pay1_status='succeeded'`, `payment_plan='Quarterly'`, N in 2–4, `payN_date <= today` UTC, and — **since the 2026-08-26 inversion** — `payN_status` still **EMPTY**, `connect-load.ts` having dropped its own copy of the five-value `skipStatuses` denylist in the same change; **if that sweep's gate moves, this one moves WITH it**): when any installment qualifies, `amount` becomes their **sum**, `amount_label` becomes *"total due now"*, and the response gains `due_now_rows: [{date, amount}]` + `due_now_count` — **spread in only when non-empty**, so no-past-due, non-Quarterly and TAX responses are byte-identical to before and an un-deployed frontend still renders (it falls back to the single *"total due now"* line). `ConnectCardPage.jsx` then lists **one breakdown row per installment** (*"VFO Services payment (due March 15, 2026)"*), keeps the summed headline, and swaps its intro for *"…your N past-due payment(s) totaling $X will be collected automatically."* The **email** splits the unpaid installments by **date only** into *"Past-due payments:"* (own table, plus a bold *"Total due now: $X"* when more than one row) and *"Your upcoming payments:"* (future rows), and its headings **make no collection claim** — a date-only set can include an unpaid `pay1`, a `declined`/`auth_required`/`pending` installment or a non-Quarterly row, none of which the sweep will ever auto-collect, so the email's total can legitimately exceed the page's on the same row. **The one status the date-only split DOES exclude is `'cancelled'`** (2026-08-26) — this table goes to the client, and listing a payment VFO has written off would bill them for it; `outstanding-links.ts` excludes it from the Accounting roll-up's `total_remaining` for the same reason. **Only the page mirrors the sweep, so only the page promises collection** — do not "reconcile" the two totals by widening the page or by promising collection in the email. The TAX branch and the helper's signature are untouched by this change. Per-client sandbox resolves via `loadSandboxConfigForClient` (#251); sandbox-on with no `sandbox_email` refuses to email rather than mailing the real client. Both rule keys live in the NEW Notification Editor area **"Payment Continuation"**.

   - **⚠️ Who these two emails actually Cc — corrected 2026-08-03 in v696, gotcha #324.** Both `CLIENT_PAYMENT_CONTINUATION` templates — **id 172 `setup_link`** (the admin button, `actions/migration/send-setup-link.ts`) and **id 209 `setup_link_reminder`** (this sweep) — have listed **`ASSIGNED_PF` + `MEMBER`** in `cc_list` since the day they were created. **Neither handler passed those keys in its `resolveTemplateRecipients` ctx**, and an unresolved role token is dropped **silently**, so **every payment-continuation email ever sent went To the client with an EMPTY Cc** — no error, no log line, and invisible in sandbox (which suppresses all Cc anyway). Both handlers now widen their `clients` `.select()` to include `member_number, assigned_pf`, do a guarded `members` lookup (`client.member_number ? … : { data: null }`; the sweep does one per due row inside its loop), and pass the full ctx — `RECIPIENT` + `CLIENT` + `MEMBER: member?.email` + `ASSIGNED_PF: getPfEmail(client.assigned_pf || "")`. **Residual silent drop, unchanged and system-wide:** `utils/pf-emails.ts` is a hardcoded four-name map returning `""` on a miss, so a client whose `assigned_pf` is not Evan Anderson / Bridger Silvester / Lindsay Morris / Jake Latham still gets no PF Cc. **The fix has had no click-through** — the next real send (or a deliberate test send) is its verification, and if something is still wrong the symptom is the same silent empty Cc. Both templates also gained `tnmiller@vfo-services.com` + `tvaldes@vfo-services.com` in `cc_list` (#326) and **both deliberately remain `send_mode=false` (Draft)** — they are not part of the auto-send nine (#325).

   - **⚠️ MIGRATED IS NOT THE SAME AS CUT OVER — the legacy platform is still live on the same Stripe account (2026-08-11, gotcha #361).** A migrated row brought in with **`stripeMode:"existing"`** reuses the OLD system's `stripe_customer_id` and its saved `pm_…` as `default_payment_method_id`, and mints **no `migration_setup_tokens` row** (that absence is how you recognise the mode). Our `_chargescheduled_sweep` then bills that customer with **no legacy exclusion of any kind**. Meanwhile the old platform is still subscribed to the same Stripe events: on 2026-08-11 Deanna Haines' ACH clearance produced **two identical receipts**, ours in *"Deanna Haines - 20028-001"* under **VFO Clients** and a second, 2m26s later, in *"Deanna Haines (20028-FT1)"* under the legacy **VFO Services** root — a folder our code can neither address nor create. **Tell it apart from a webhook redelivery by the folder, not the clock:** a redelivery duplicates inside the SAME folder (#327/#328). Haines was simply the first migrated client whose payment cleared *after* cutover — Flood, Vang and Moses all have legacy-folder receipts that predate their own `legacy_migrated_at`. **12 legacy MAP 1 rows still have future installments.** Duplicate receipts are paper; **if the legacy platform also still has a CHARGER armed on the same customer, the next collision is a double charge** — that remains unverified. The fix is outside this codebase: disable the legacy Stripe listener (a second webhook endpoint or a polling scenario on the live account), or give it a skip-list of migrated customer ids. **Related: the migration's rev-share pre-settle is terminal and can be wrong — see gotcha #362 and the warning in [contract-and-payment.md](contract-and-payment.md).**

### Step 6 — Next off-session charge uses the new method

The new default is picked up by whichever off-session charge runs next; nothing fires immediately at update time. **For a Payment Continuation row that is already behind, "next" means that night:** the 03:00 UTC quarterly sweep charges **every** past-due unpaid installment on its next run, not just one, which is why the `/connect-card` page quotes the summed total rather than one installment (gotcha #421).

- **MAP 1 quarterly sweep** ([contract-chargescheduled-sweep.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/pipeline/contract-chargescheduled-sweep.ts)) — **prefers `default_payment_method_id`** when set; otherwise falls back to listing the customer's saved methods and picking the most recent (the exact prior behavior for rows that never had an update).
- **Tax implementation** ([tax/charge-implementation.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/tax/charge-implementation.ts)) — **prefers `default_payment_method_id`** (this also covers a check-paid retainer that now has a reusable card/bank on file); otherwise reuses the retainer charge's payment method. The idempotency key's PM suffix derives from `default_payment_method_id` when present, so the key auto-rotates when the method changes.
- **Specialist license** — already keys off the subscription's default PM, which Step 5 just repointed.

## Stripe specifics

| Aspect | This flow |
|---|---|
| Checkout mode | **`setup`** (first use in the system — no charge, saves a reusable method) |
| Webhook event | `checkout.session.completed` with `mode==='setup'` (NEW handling — every prior `checkout.session.completed` branch assumes `mode==='payment'`) |
| Metadata discriminant | `payment_kind='card_update'` + `pipeline` (`MAP 1`/`TAX`/`SPECIALIST_LICENSE`) + `row_id` + `token` |
| Customer | the engagement's **existing** customer is reused — never a new one |
| Default-PM mechanism | `invoice_settings.default_payment_method` on the customer + the row's `default_payment_method_id` (+ subscription `default_payment_method` for the specialist license) |
| Sandbox | per-pipeline `pipeline_sandbox_config.sandbox_mode` selects `STRIPE_SECRET_KEY_SANDBOX` vs `STRIPE_SECRET_KEY` |

See [../integrations/stripe.md](../integrations/stripe.md) for the cross-flow Stripe picture (metadata table, webhook routing, off-session charge preference).

## Failure modes / open questions

1. **No reusable engagement** — the person pays nothing off-session (one-time/check-paid/already-charged). `payments_send_card_update` returns `{sent:false, reason:"none"}` and drafts nothing — the admin sees a "nothing to change" message rather than an error.
2. **No email on file** — `{sent:false, reason:"no_email"}`; no token is minted.
3. **Token expired** (> 7 days) — `payments_loadcardupdate` / `_checkout` return `410`. The admin re-sends to mint a fresh token.
4. **Engagement no longer updatable between load and checkout** (e.g. the last installment cleared in the interim) — re-enumeration in `_checkout` drops it; returns `404` "That payment is no longer available to update."
5. **Person abandons the Stripe page** — `cancel_url` returns them to `/update-card`; no row changes; the old method stays in force. Re-attempt with the same (un-expired) link.
6. **SetupIntent has no payment method** (rare Stripe edge) — the webhook branch no-ops (guarded on `pmId`); old method stays in force.
7. **No automatic re-charge on update** — saving a new method does **not** retry a previously-**failed** installment (`declined` / `auth_required` are non-empty statuses, and since 2026-08-26 the sweep charges **only** an empty one — the old `skipStatuses` denylist is gone, see [contract-and-payment.md](contract-and-payment.md) Step 10½). Recovery for a failed installment is still the client-driven `/pay` link (MAP 1) or a manual intervention. **That `/pay` recovery only actually worked from 2026-08-21 (v773):** until then both `/pay` handlers guarded on `pay1_status` and hardcoded payment 1, so the link the installment-failure email mails for P2–P4 returned *"Payment already completed"* — a dead end for the entire life of the feature. They now resolve the open installment server-side (see [contract-and-payment.md](contract-and-payment.md) Step 10⅓). The card-update flow only redirects the **next** charge. **Do not read this as "nothing is charged after a save":** an installment that is merely unpaid and past due (`scheduled`, date arrived) is not a *failed* one, and the sweep will collect it — every such installment — on its next 03:00 UTC run. That difference is exactly the line the `/connect-card` past-due total is drawn on (gotcha #421).
8. **Multi-pipeline sandbox** — if a person pays one sandbox engagement and one live engagement, the **send** email routes to the sandbox address (any sandbox pipeline wins) while each engagement's **checkout** still uses its own pipeline's key. All pipelines are currently `sandbox_mode=true`, so this is the current testing posture, not a live concern yet.

## Frontend surfaces

| Surface | File |
|---|---|
| "Send Email to Change Payment Method" button (Jake-only) | [PaymentsHeader.jsx](src/components/payments/PaymentsHeader.jsx) |
| Public update-card landing page | [UpdateCardPage.jsx](src/pages/UpdateCardPage.jsx) — `/update-card?token=` route (registered in `src/App.jsx`); lists engagements, per-engagement card/bank choice, redirects to Stripe |
| Email body editor | Admin **Email Templates** tab → "Payments — Change Payment Method" (pipeline `PAYMENTS`, template_name `card_update`) |

## Backend handlers

| Action | File | Visibility |
|---|---|---|
| `payments_send_card_update` | `actions/payments/card-update-send.ts` | AUTH (superadmin-only) |
| `payments_loadcardupdate` | `actions/payments/card-update-load.ts` | PUBLIC (token) |
| `payments_cardupdate_checkout` | `actions/payments/card-update-checkout.ts` | PUBLIC (token) |
| (shared enumeration) | `actions/payments/card-update-shared.ts` | — `loadCardUpdatePerson` + `sandboxInfo`, used by all three + mirrored by the webhook |
| (webhook branch) | `router/webhooks.ts` — `checkout.session.completed` + `mode='setup'` + `payment_kind='card_update'` | service-role (Stripe signature) |

## DB objects

- **New table** `card_update_tokens` (person-keyed tokens, 7-day expiry).
- **New columns**: `default_payment_method_id` on `pipeline_map1` + `client_tax_plans`; `lic_default_payment_method_id` on `specialist_onboarding`; `pay{N}_method` / `pay{N}_last4` (N = 1–4) on `pipeline_map1` (frozen per-installment method/last4 for the Payments-tab fee display).
- **New email template** id 156 — `(pipeline='PAYMENTS', template_name='card_update')`.

## Deployment / config status

- Backend version and sandbox posture are **DERIVED, never read from here** — `list_edge_functions` for the live `vfo-admin-api` version, `select pipeline, sandbox_mode from pipeline_sandbox_config` for the posture (#402). Phase D itself shipped in v483; the `/connect-card` past-due change in **v762** (2026-08-19). Every pipeline has since gone LIVE — the "all sandbox" line that used to sit here was two months stale, so treat any hard-coded posture claim in this file as suspect.
- Verified end-to-end via fixture **Test Client 57** (`pipeline_map1` id 86). The past-due page + email split was verified on the real **Deb Moerland** row (client 267, `pipeline_map1` 138) against v762 — page only; the email's `[PAYMENT_SCHEDULE]` split has still never been seen in a real draft (see the hub's OWED list).
