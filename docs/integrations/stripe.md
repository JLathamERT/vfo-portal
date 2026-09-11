# Stripe integration

## Two Stripe accounts (2026-09-11)

Since **2026-09-11** (`feature/second-stripe-account`, `vfo-admin-api` **v829**) the portal bills on **TWO Stripe accounts**:

| Key | Label (`stripeAccountLabel`) | Legal entity | Carries |
|---|---|---|---|
| `vfos` | **VFO Services** | VFO Services | The original account and still the **default for everything**. Tax, MAP 1, PIP, SpecRev, the specialist background check + the $99 licence subscription, **every Connect account / transfer / account_link** (ERT's own connected account included — see “ERT is ALSO a connected account” below), the `/update-card` (`mode=setup`) flow, and the whole migration / Payment Continuation family. |
| `ert` | **ERT** | Elite Resource Team LLC | Member membership fees, Growth Credit purchases, and advisor / accountant onboarding money (deposit, balance, paid-in-full, refund). **Live since 2026-09-11 ~16:10Z** — see "Go-live posture" below. |

The vocabulary is one file: **`constants/stripe-accounts.ts`** — `type StripeAccount = "vfos" \| "ert"`, `STRIPE_ACCOUNT_PRIMARY` / `STRIPE_ACCOUNT_ERT`, `normalizeStripeAccount(v)` (only the exact string `"ert"` selects the second account; NULL / undefined / anything unrecognised falls back to the primary, and it never throws), `stripeKeyEnvName(account, isSandbox)`, `stripeWebhookSecretEnvName(account, isSandbox)`, and `stripeAccountLabel(account)`.

### ERT is ALSO a connected account — transfer destination only (2026-09-11)

**Separately from the two BILLING accounts above**, ERT's existing Stripe account is *also* a **Standard connected account of the VFO Services platform**. This does **not** contradict the rule in the table that every Connect account / transfer / `account_link` lives on `vfos` — it is an instance of it. The platform is still VFO Services, the connected account is a connected account **of** VFO Services, and the transfer is still sent from the VFO Services balance. ERT is the **destination**, never the platform.

It is a **destination only**. No customer, Checkout Session, invoice, subscription or webhook of ERT's *billing* account is involved, and the connection is unrelated to the `ERT_STRIPE_SECRET_KEY` family. Two different things share the letters "ERT":

| | What it is | Where it lives | Secrets |
|---|---|---|---|
| **ERT the billing account** | A second account the portal charges customers on | Its own Stripe account, its own customers + webhooks | `ERT_STRIPE_SECRET_KEY[_SANDBOX]`, `ERT_STRIPE_WEBHOOK_SECRET[_SANDBOX]` |
| **ERT the connected account** | A payout destination hanging off the VFO Services platform | A connected account **of VFO Services** | `ERT_CONNECT_ACCOUNT_ID[_SANDBOX]` — an `acct_…` **id**, never a key |

**Today it has exactly one user: the SpecRev ERT share leg** (see "Stripe Connect & revenue share" below), which forwards ERT's slice of a specialist's payment out of the VFO Services balance.

**The one-time OAuth setup (done by hand, 2026-09-11) — connecting an EXISTING account, not creating one.** This is the part that is easy to get wrong: there is no "create an account for ERT" step, and doing so would have made a second, empty account. The flow is an authorization handshake between two accounts that already exist:

1. **VFO Services dashboard → Connect → enable OAuth**, with redirect URI `https://vfoportal.com/`.
2. **ERT authorizes** at `connect.stripe.com/oauth/authorize` (`scope=read_write`, `client_id` = the VFO Services platform's Connect client id), signed in as ERT.
3. The redirect returns a one-time `code`, **exchanged** at `connect.stripe.com/oauth/token` using a **temporary VFO Services secret key** — which was expired immediately afterwards.
4. The response's **`stripe_user_id` is ERT's EXISTING account id**. That is the whole point: OAuth *links* the account that is already there.
5. That id is stored as the secret **`ERT_CONNECT_ACCOUNT_ID`** (live). For sandbox, a **test connected account in the VFO Services sandbox stands in for ERT** and its id is stored as **`ERT_CONNECT_ACCOUNT_ID_SANDBOX`** — there is no sandbox copy of the real ERT account.

Both names are resolved through **`ertConnectAccountEnvName(isSandbox)`** in `constants/stripe-accounts.ts`, never read inline, so mode selection cannot drift between the payout engine and the manual tool.

> **Registry-version note.** Like the four billing secrets before them, writing these two secrets **bumped every edge function's registry version with no code change** — a version jump with an empty diff is expected after a secret write, not a sign of a stray deploy.

### Rule 1 — CONFIG MINTS

**`pipeline_sandbox_config.stripe_account`** (`'vfos'` default, `CHECK IN ('vfos','ert')`) decides which account a **NEW customer or checkout session for that pipeline is minted on**. It is the only place the choice is ever made, so moving a pipeline to ERT is one row edit and affects nothing that already exists. `integrations/sandbox-config.ts` surfaces it as `SandboxConfig.stripeAccount` (already normalized).

**Go-live posture — the column is SPLIT 4/4 as of 2026-09-11 ~16:10Z:**

| `stripe_account` | Pipelines |
|---|---|
| **`'ert'`** | `MEMBER_MEMBERSHIP`, `GROWTH_CREDITS`, `ADVISOR_ONBOARDING`, `ACCOUNTANT_ONBOARDING` |
| **`'vfos'`** | `MAP 1`, `TAX`, `PARTNERSHIP_FAST_TRACK`, `SPECIALIST_ONBOARDING` |

All eight rows are `sandbox_mode=false`. **Be precise about what the flip did: from that moment every NEW membership customer, GC checkout session and onboarding customer is minted on ERT — and every EXISTING row keeps its `'vfos'` stamp and keeps charging on VFO Services** until the copy + remap moves it. Four `UPDATE`s moved nothing that already existed, which is the entire payoff of keeping rule 1 and rule 2 apart.

It is flipped **by SQL, deliberately not by the UI.** `SandboxModeToggle.jsx` renders a **read-only** `Stripe: VFO Services` / `Stripe: ERT` pill beside the LIVE/SANDBOX button, and it is **evidence-gated** — `hasAccount = sandboxConfig.stripe_account !== undefined`, so a loader that did not ship the column prints nothing rather than a confident "VFO Services" it has no evidence for. `specialist_revenue_load` (`actions/specialist-revenue/load.ts`) selects an **explicit column list** (`sandbox_mode, stripe_test_mode, boldsign_test_mode`) and therefore shows **no pill** — accepted, not a bug.

### Rule 2 — THE ROW STAMP GOVERNS

A nullable **`stripe_account`** column now sits on **`member_payment_plans`**, **`advisor_onboarding`**, **`accountant_onboarding`** and **`gc_transactions`** (each with the same `CHECK IN ('vfos','ert')`). **NULL = legacy = `vfos`.** Once a customer or session exists, its own row stamp governs **every later Stripe call for that row** — never the config:

```
getStripeKeyFor(normalizeStripeAccount(row.stripe_account), isSandbox)
```

A Stripe customer / payment-method / PaymentIntent id is valid on **exactly one account**, so **no charge path ever re-stamps a row.** The ONE writer that does is the superadmin action **`membership_stripe_remap`** (below).

Migration **`20260911120000_second_stripe_account.sql`** adds the five columns (named CHECK constraints in separate `do $$` blocks, each guarded on `pg_constraint` so a re-run is safe) and backfills `'vfos'` onto **every row that already holds a Stripe object** — `stripe_customer_id is not null` for the three plan/onboarding tables, `stripe_session_id is not null` for `gc_transactions`. **37 plans, 2 advisors, 3 accountants, 4 GC purchases.** Rows with no Stripe object yet are left NULL so a later phase mints them on whichever account their pipeline config then points at.

### Env vars — 8, not 4

Four new secrets join the original four. **Both of an account's key + webhook-secret pair must name the same account in the same mode** — the #5 rule, now squared (see [env-vars.md](env-vars.md)).

| Account | Mode | Secret key | Webhook signing secret |
|---|---|---|---|
| `vfos` | live | `STRIPE_SECRET_KEY` | `STRIPE_WEBHOOK_SECRET` |
| `vfos` | sandbox | `STRIPE_SECRET_KEY_SANDBOX` | `STRIPE_WEBHOOK_SECRET_SANDBOX` |
| `ert` | live | **`ERT_STRIPE_SECRET_KEY`** | **`ERT_STRIPE_WEBHOOK_SECRET`** |
| `ert` | sandbox | **`ERT_STRIPE_SECRET_KEY_SANDBOX`** | **`ERT_STRIPE_WEBHOOK_SECRET_SANDBOX`** |

`integrations/stripe/client.ts` gained **`getStripeKeyFor(account, isSandbox)`**; the pre-existing **`getStripeKey(isSandbox)` is now a thin wrapper that always resolves the PRIMARY account**, so every caller that has not been converted keeps its exact previous behaviour.

> **Registry-version note.** Writing the four new secrets **bumped every edge function's registry version by 4 with no code change** (`vfo-admin-api` v824 → v828, `boldsign-webhook` v40 → v44, identical hash and timestamp) before the v829 deploy. A version jump with no deploy is what a secret write looks like.

### The webhook verifier now RECORDS which secret matched

Two **new ERT webhook endpoints** (live + sandbox) were added on the **same function URL**, so four endpoints now deliver there (two accounts × two modes). Each is subscribed to **14 events**: `checkout.session.completed` / `.async_payment_succeeded` / `.async_payment_failed` / `.expired`, `payment_intent.succeeded` / `.processing` / `.payment_failed` / `.canceled`, `charge.dispute.created` / `.closed`, `charge.refunded`, `charge.refund.updated`, `refund.updated`, `refund.failed`.

`router/webhooks.ts maybeHandleStripeWebhook` builds a candidate list of **all four `(account, mode)` signing secrets** (unset ones are skipped; zero configured = 500), HMACs the payload against each, and **keeps the candidate that matched** — `stripeAccount` and `matchedSandbox`. That match is the **only** evidence of which Stripe account the event came from (gotcha **#485**). Detail: [../flows/stripe-webhook.md](../flows/stripe-webhook.md).

### The remap — moving existing plans to ERT — **DONE 2026-09-11**

**Decision (Jake, 2026-09-11): existing membership plans move via copy + remap, not attrition.** Stripe's self-serve **"Copy PAN data across Stripe accounts"** migration **preserves customer ids** (old == new) and **mints new payment-method ids**. It copies cards **and US ACH** (the recipient must acknowledge the ACH mandates) but **no charges, subscriptions or invoices**, and **no member contact is needed**. The action that applies its output is `membership_stripe_remap` — see [../flows/membership-fees.md](../flows/membership-fees.md).

**UPDATE 2026-09-11 (later the same day): the frontend section is GONE.** The superadmin “Move plans to ERT Stripe” card was **deleted from `MembershipFeesPanel.jsx`** once the migration was complete. The backend action **`membership_stripe_remap` still exists and is still registered and gated**, but it now has **NO frontend caller at all** — it is reachable only by a direct API call. Kept rather than deleted because it is the only writer allowed to re-stamp `member_payment_plans.stripe_account`, and a future account move would need it again. (This also discharges the owed “four-column header copy fix” on that panel — the text it applied to no longer exists.)

**It has been run. Result: 37 of 37 plans moved to ERT, 0 left on `vfos`** — 13 `active` plans re-pointed method-for-method onto ERT `pm_1UEY…` ids (the old payment-method ids matched the DB **13/13** before Apply) and 24 `setup_pending` plans moved as **customer-only** rows. Verified in the DB afterwards: every `member_payment_plans` row with a Stripe customer reads `stripe_account='ert'`, the 13 active ones carry ERT payment-method ids, and the 24 `setup_pending` ones are unchanged apart from the stamp.

**Running it — the operational mechanics, none of which are in Stripe's documentation (gotcha #486).**

1. **The sender-side control is role-gated.** "Copy customers" is the **"Copy to account"** icon on the **Customers** page (menu: *Copy all customers* / *Upload file* / *Status page*) and it is **hidden from an Administrator**. Jake had to grant himself the **Data Migration Specialist** role before the button appeared.
2. **The upload file is a HEADER-LESS single column of customer ids.** A header row is validated as data and rejected per-row as **"Customer not found"** — a formatting problem reported as a data problem.
3. **The recipient authorizes, and answers the ACH question.** ERT (`acct_1HRP3SA6agMWAt8d`) authorized on its own Customers page and answered **Yes** to *"Do you have ACH mandates for these customers?"*. **Decision (Jake): Yes, accepted risk** — exactly one active ACH plan was in the batch and its authorization was collected under **VFO Services'** name through Checkout; both companies are his. The copy of **37 customers** completed within the hour.
4. **The mapping CSV has SIX columns, not four.** What Documents actually delivers is `customer_id_old,v2_account_id_old,source_id_old,customer_id_new,v2_account_id_new,source_id_new`; it was converted to the panel's required four-column shape by **dropping the two `v2_account_id_*` columns**. A customer with **no saved payment method** arrives as a row with **blank source columns**, which is byte-identical to the action's *customer-only* row shape — so **one converted file covered all 37 rows**.
5. **The panel's Dry run can exceed the front end's timeout.** 37 rows × 2-3 Stripe probes blew through `api.js`'s **20 s** limit on the first attempt; the handler ran to completion anyway and the second Dry run returned **37 `would_move`**, then Apply returned **37 `moved`**. `api.js` does not retry writes and every outcome is idempotent, so neither the timeout nor a re-submission can double-apply (gotcha **#487**).

**What the move did NOT change.** `setup_token` is untouched, so **every `/membership-pay` link already sent still works and now pays on ERT** — `setup-checkout.ts` reads the plan's row stamp. No schedule row, no `sandbox` flag, no `payment_method_type`, no email and no bell.

### What is NOT converted

**44 files** still read `STRIPE_SECRET_KEY` / `STRIPE_SECRET_KEY_SANDBOX` directly (down from 57). All of them belong to **primary-only pipelines** and were **deliberately not refactored** — converting a handler that can only ever run on `vfos` adds risk and buys nothing. The four converted directories are clean: `grep -rn "STRIPE_SECRET_KEY" actions/membership actions/advisor actions/accountant actions/gc` returns **nothing**.

---

Stripe handles **nine** distinct payment flows in this system:

1. **MAP1 service payments** — recurring quarterly or one-time payment for the VFO membership engagement. Customers, Checkout Sessions, PaymentIntents, and Transfers (revenue share to advisors).
2. **Tax Planning payments** — retainer (Tax 3) + implementation off-session charge (Tax 5). Routed by `metadata.payment_kind` in `retainer` / `implementation`. **"Off-session" describes the charge, not the trigger: as of 2026-08-14 the implementation fee fires from exactly ONE runtime call site — the client's own Proceed click on `/tax-implement-decide` (`actions/tax/implement-final-decision.ts`). The nightly sweep's 24h auto-charge tier is deleted; no cron, sweep or timer charges this fee.** See [../flows/tax-planning.md](../flows/tax-planning.md).
3. **Advisor Onboarding payments** — one-time charge for advisor's chosen plan combo (dynamic $4,000–$8,600 based on vfo_ft / pft / corporate checkbox picks at BoldSign sign time). `setup_future_usage=off_session` so the card is saved for 6-month renewal review (no auto-renew cron yet). See `ADVISOR_ONBOARDING_RESUMPTION.md` at repo root.
4. **Accountant Onboarding payments** — one-time charge for accountant's plan combo (dynamic $2,000 / $2,600 / $4,000 / $4,600 based on partnership choice + corporate add-on). `setup_future_usage=off_session` so the card is saved for 6-month renewal review (no auto-renew cron yet). See `ACCOUNTANT_ONBOARDING_RESUMPTION.md` at repo root.
5. **PIP Meetings purchases** — one-shot purchase for Tax Planning or N Additional PIP meetings. See [../flows/pip-meetings.md](../flows/pip-meetings.md).
6. **GC marketplace purchases** — one-shot Stripe Checkout for buying gift credits.
7. **Specialist Onboarding background-check payments** (2026-06-03) — one-time Core ($350) or Max ($950) charge for the specialist's background check (Stage 3). ACH or Card; card grosses up the 2.9%+$0.30 fee. No `setup_future_usage`. Confirmation email at payment time; receipt + invoice PDFs on clearance. See [../flows/specialist-onboarding.md](../flows/specialist-onboarding.md).
8. **Specialist Onboarding monthly LICENSE** (2026-06-05) — the **first and only Stripe SUBSCRIPTION in the system** (`mode=subscription`). $99/mo recurring after the Stage-4 agreement is signed; card grossed-up / ACH flat; reuses the specialist's background-check Stripe customer. Stripe owns the recurring billing/dunning — **no custom sweep**. Routed by `metadata.payment_kind=license`. See [../flows/specialist-onboarding.md](../flows/specialist-onboarding.md).
9. **Admin-initiated payment-method change** (2026-06-16, Phase D) — the **first `mode=setup` / SetupIntent flow in the system** (no longer the only one — see the membership save-only cases below). **No charge** — it saves a new reusable card/bank so the **next** off-session charge of an existing engagement (MAP 1 quarterly sweep / Tax implementation / Specialist license renewal) uses it. An admin (Jake-only) emails the payer a `/update-card?token=` link; the payer enters the new method on Stripe's hosted setup page; a `checkout.session.completed` + `mode=setup` webhook saves it as the customer/engagement default. Routed by `metadata.payment_kind=card_update` (+ `pipeline` + `row_id`). Because each engagement has its **own** Stripe customer, a change is **per-engagement**. See [../flows/payment-method-change.md](../flows/payment-method-change.md).

All nine flows route through the same webhook **URL** (the `vfo-admin-api` function gated by `stripe-signature`) — **four Stripe endpoints deliver there as of 2026-09-11: VFO Services live/sandbox and ERT live/sandbox.** They are disambiguated by Checkout-Session metadata. The webhook verifies the signature against **all four** configured signing secrets and **records which one matched**, because that match is the only evidence of which Stripe account the event came from (see "Two Stripe accounts" above and gotcha **#485**). Of the nine flows, only **Advisor Onboarding**, **Accountant Onboarding** and **GC marketplace purchases** — plus member membership fees, which is not in this list — can arrive on ERT; every other flow is primary-only and its branches are made inert for a non-primary event by `fromPrimary`. **Events handled:** `checkout.session.completed` (now also handles **`mode=setup`** sessions — the Phase D card-update flow, 2026-06-16), `payment_intent.succeeded`, `payment_intent.payment_failed` (SPECIALIST bg → `bg_payment_status='failed'`), and — added 2026-06-05 for the license subscription — **`invoice.paid` / `invoice.payment_succeeded`** AND (2026-07-07, newer Stripe API versions) **`invoice_payment.paid`** (all three funnel through the shared `processSpecialistLicenseInvoicePaid()`; recurring billing + receipts; routed by `lic_stripe_customer_id`; the subscription ref is read from whichever location the event provides — `invoice.subscription`, `invoice.parent.subscription_details.subscription`, or the line-item `subscription_item_details.subscription` — falling back to the row's stored `lic_subscription_id` if the event provides none at all, so the handler is never gated on it, gotchas #76/#187) and **`invoice.payment_failed`** (dunning FYI to Tracy). For the CARD-payment case, the first invoice/receipt + Stage 4→5 advance ALSO fires inline from `checkout.session.completed` by expanding the subscription's `latest_invoice`, so it no longer depends on a separate invoice event arriving at all (gotcha #187). The per-invoice idempotency claim (`lic_last_invoice_id`) is written via a `SECURITY DEFINER` RPC (`claim_specialist_license_invoice` — atomic conditional UPDATE, committed to the repo as migration `20260708130000_claim_specialist_license_invoice_rpc.sql`, gotcha #196), not a plain table update — a PostgREST schema-cache anomaly was observed intermittently rejecting direct writes to that column (gotcha #188). Hardening (2026-07-08, v561): because the license reuses the background-check's Stripe customer, the processor now SKIPS an invoice whose event names a subscription that differs from the stored `lic_subscription_id` (a foreign-subscription invoice on the shared customer must never be claimed as a license payment); the event-omits-ref fallback is unchanged. ⚠️ The `invoice.*` events must be **enabled on the Stripe webhook endpoint** — done on **sandbox**; the **live** endpoint still needs them before any real specialist license payment (gotcha #75).

### Metadata convention

| Field | MAP1 | Tax | Advisor | Accountant | PIP | GC | Specialist | Card-update |
|---|---|---|---|---|---|---|---|---|
| `metadata.pipeline` | (none) | `TAX` | `ADVISOR_ONBOARDING` | `ACCOUNTANT_ONBOARDING` | `PIP` | (none) | `SPECIALIST_ONBOARDING` | `MAP 1` / `TAX` / `SPECIALIST_LICENSE` (which engagement) |
| `metadata.payment_kind` | (none — uses `payment_number` for quarterly) | `retainer` / `implementation` | `onboarding` / **`onboarding_deposit`** / **`onboarding_balance`** *(2026-09-04)* | `onboarding` / **`onboarding_deposit`** / **`onboarding_balance`** *(2026-09-04)* | `purchase` | (none — uses `member_number` + `credits`) | `background_check` (+ `bg_type=core\|max`) **or `license`** (`mode=subscription`, $99/mo) | **`card_update`** (`mode=setup`, no charge) |
| `metadata.payment_number` | `1` (P1) / `2-4` (chargescheduled sweep) | — | — | — | — | — | — | — |
| `metadata.client_id` / `metadata.onboarding_id` | `client_id` | `tax_plan_id` (via `client_tax_plans`) | `onboarding_id` | `onboarding_id` | `priority_track_id` | — | `row_id` (the engagement row) + `token` |

The webhook router uses these fields to pick the right DB table on `checkout.session.completed` and `payment_intent.succeeded`. Fallback chain: MAP1 lookup by `stripe_customer_id` → Tax lookup → Advisor lookup → PIP lookup → Accountant lookup. The **card-update** `mode=setup` branch is matched by `payment_kind=card_update` and routed directly by `metadata.pipeline` + `metadata.row_id` (no customer-id cascade).

**2026-09-04 — the customer-lookup cascade is no longer sufficient on its own for the two onboarding pipelines (#473).** The refundable **Membership Deposit** and the onboarding payment are two collections on the SAME `advisor_onboarding` / `accountant_onboarding` row and the SAME Stripe customer, so the branch is chosen by `payment_kind` rather than by the lookup: `payment_kind` is set on **both** the Checkout Session and the PaymentIntent, because `checkout.session.completed` picks its branch before the PI is ever fetched. A deposit session also carries **`setup_future_usage=off_session`**, which is what lets `automation_<P>_chargebalance` charge the remainder off-session at CEO countersign. The generic first-payment failure resolver **skips both new kinds** — it writes `payment_status`, which belongs to the onboarding payment.

## Env vars

**Eight since 2026-09-11** — two accounts × two modes × (secret key + webhook signing secret). The full matrix is in the "Two Stripe accounts" section at the top of this file; this table adds the per-var detail.

| Var | Account | Purpose | Selected by |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | `vfos` | Live secret key | `getStripeKeyFor('vfos', false)` / the legacy `getStripeKey(false)` |
| `STRIPE_SECRET_KEY_SANDBOX` | `vfos` | Test-mode secret key | Selected when the pipeline's `pipeline_sandbox_config.sandbox_mode=true` (or a plan/onboarding row's own `sandbox` flag) |
| `STRIPE_WEBHOOK_SECRET` | `vfos` | HMAC secret verifying **live** webhook signatures | One of four candidates the verifier tries; the one that matches names the account **and** the mode |
| `STRIPE_WEBHOOK_SECRET_SANDBOX` | `vfos` | HMAC secret verifying **sandbox** webhook signatures | same |
| **`ERT_STRIPE_SECRET_KEY`** | `ert` | Live secret key | `getStripeKeyFor('ert', false)` |
| **`ERT_STRIPE_SECRET_KEY_SANDBOX`** | `ert` | Test-mode secret key | `getStripeKeyFor('ert', true)` |
| **`ERT_STRIPE_WEBHOOK_SECRET`** | `ert` | HMAC secret verifying **live** ERT webhook signatures | same four-candidate verifier |
| **`ERT_STRIPE_WEBHOOK_SECRET_SANDBOX`** | `ert` | HMAC secret verifying **sandbox** ERT webhook signatures | same |
| **`ERT_CONNECT_ACCOUNT_ID`** | *(platform `vfos`)* | **NEW 2026-09-11.** ERT's **connected-account id** (`acct_…`) on the VFO Services platform — the `destination` of the SpecRev ERT-share transfer and of the manual catch-up transfer. **Not a key, and not an ERT-billing secret** | `ertConnectAccountEnvName(false)` |
| **`ERT_CONNECT_ACCOUNT_ID_SANDBOX`** | *(platform `vfos`)* | **NEW 2026-09-11.** Same, for sandbox — a **test connected account in the VFO Services sandbox stands in for ERT** | `ertConnectAccountEnvName(true)` |

Nothing reads these names inline any more where two accounts are possible: **`stripeKeyEnvName(account, isSandbox)`** and **`stripeWebhookSecretEnvName(account, isSandbox)`** in `constants/stripe-accounts.ts` return the NAME, and the caller reads the value.

Sandbox switching is per-pipeline and per-action: handlers read `pipeline_sandbox_config` at the top of each call and pick the live/sandbox key accordingly. **Correction (this doc used to say `gc_create_checkout` has no sandbox path — that is stale):** `actions/gc/create-checkout.ts` reads the **`GROWTH_CREDITS`** config row via `loadSandboxConfig` and calls `getStripeKeyFor(stripeAccount, isSandbox)`, so it is now both sandbox-aware **and** account-aware. **The exception that matters:** every **client-scoped** TAX / MAP 1 / PIP handler — and, since **v672** (2026-07-29), all five **migration / Payment Continuation** handlers under `actions/migration/` — must NOT read `pipeline_sandbox_config` directly at all. They resolve through `loadSandboxConfigForClient(sb, pipeline, clientId)`, which layers the per-case test-member override on top of the global row (see the "Per-case test-member sandbox override" section below, gotchas #251 + #302).

## API endpoints used

| Stripe API | When | Where (admin-api) |
|---|---|---|
| `POST /v1/customers` | Create customer for new MAP1 client | line 896 (`automation_CONTRACT_stripecustomer`) |
| `POST /v1/checkout/sessions` | MAP1 payment Checkout Session | line 1140 (`automation_CONTRACT_stripecheckout`) |
| `POST /v1/checkout/sessions` | GC purchase Checkout Session | line 2824 (`gc_create_checkout`) |
| `GET /v1/payment_intents/{id}?expand[]=payment_method` | Read card last4 + payment method type after webhook | lines 317, 1190 (Stripe webhook handler + dead `_stripewebhook` action) |
| `POST /v1/transfers` | Revenue share payout to member's connected account | line 1463 (`automation_CONTRACT_revshare`) |
| `POST /v1/transfers` | **SpecRev ERT share** — forwards a line's `ert_share` from the VFO Services balance to ERT's connected account (2026-09-11) | `utils/specialist-revenue-payout.ts` (the ERT loop, after the member loop) |
| `POST /v1/transfers` | **Manual ERT catch-up** — superadmin-only free-hand transfer for money collected before the ERT share existed (2026-09-11) | `actions/specialist-revenue/ert-transfer.ts` (`specialist_revenue_ert_transfer`) |
| `GET /v1/accounts/{id}` | **Transfers-capability probe** before any Connect transfer — true only when `capabilities.transfers === 'active'`; never throws. Probed once per request on the ERT leg, and by the manual action | `utils/connect-payout-readiness.ts` `connectTransfersActive` (shared with `automation_CONTRACT_revshare` + `automation_TAX_revshare`) |
| `POST /v1/charges/<destination_payment>` **with header `Stripe-Account: <ERT acct>`** | Copies an ERT transfer's description + metadata onto the payment Stripe created on **ERT's** side, which is otherwise bare (2026-09-11). Best-effort — never affects payout status | `utils/ert-destination-memo.ts` `stampErtDestinationPayment` |

All requests use HTTP **Basic auth** with `Authorization: Basic <base64(STRIPE_KEY + ":")>` — no Stripe-Account or Stripe-Version header is set. **That is still true with two accounts: the ACCOUNT IS THE KEY.** There is no `Stripe-Account` header anywhere; which account a call lands on is decided entirely by which secret key `getStripeKeyFor(account, isSandbox)` resolved. `stripeAuthHeader(secretKey)` in `integrations/stripe/client.ts` builds the header.

## Customer lifecycle

A `pipeline_map1.stripe_customer_id` is created **once** by `automation_CONTRACT_stripecustomer` ([line 861](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)) and reused for the life of the engagement. The handler is idempotent — if `stripe_customer_id` already exists it returns success without re-creating.

The customer is created with:
- `email` = `clients.email`
- `name` = `clients.first_name + ' ' + clients.last_name`
- `metadata[client_id]` = the integer `clients.id`

## Checkout Session shape — MAP1 payment

[`automation_CONTRACT_stripecheckout`](../architecture/05-api-action-catalog.md) ([line 1086](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)):

```
mode: payment
customer: <pipeline_map1.stripe_customer_id>
payment_method_types: ["card"] OR ["us_bank_account"]
line_items[0]:
  price_data.currency: usd
  price_data.unit_amount: <chargeAmount cents>
  price_data.product_data.name: "MAP 1 - (<client_ref>) <Client Name> - Payment 1"   (one-time plans: "- One-Time Payment")
  quantity: 1
success_url: https://www.vfo-services.com/payment-successful/   (hardcoded)
cancel_url:  https://vfoportal.com/pay?token=<token>
payment_intent_data.description: <same memo as the product name>
payment_intent_data.setup_future_usage: off_session
payment_intent_data.metadata.client_id: <int>
payment_intent_data.metadata.checkout_token: <pipeline_map1.checkout_token>

if ACH:
  custom_text[submit][message]: <constants/ach-checkout-note.ts ACH_BANK_SIGN_IN_NOTE>
  # NO payment_method_options[us_bank_account][verification_method] — see "ACH verification" below
```

> **The `instant` pin was REMOVED here on 2026-09-08 (v816)** and replaced by the `custom_text` note. `/tax-pay` (`actions/tax/stripe-checkout.ts`) took the identical change in the same deploy. **Never re-pin it** — see the ACH-verification section below.

### Card-fee gross-up

For `method === "card"`, `chargeAmount = round((baseAmount + 0.30) / (1 - 0.029) * 100)` cents — i.e. the customer pays the gross-up so that VFO receives `baseAmount` net of Stripe fees. ACH has no fee gross-up.

> **Frontend note:** [PayPage.jsx:79](src/pages/PayPage.jsx) displays the card amount using a *different* (naive add-on) formula. The displayed total is informational; the actual Stripe charge uses the gross-up. See [02-frontend-shell.md](../architecture/02-frontend-shell.md).

## Checkout Session shape — GC purchase

[`gc_create_checkout`](../architecture/05-api-action-catalog.md) ([line 2806](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)):

```
mode: payment
success_url: https://vfoportal.com/?gc_success=1
cancel_url:  https://vfoportal.com/
line_items[0]:
  price_data.currency: usd
  price_data.unit_amount: <price * 100>
  price_data.product_data.name: "<amount> Growth Credits - (<member_number>) <Member Name>"
  quantity: 1
payment_intent_data.description: <same memo as the product name>
metadata.member_number: <member_number>
metadata.credits: <amount>
```

No `customer` is attached. Sandbox keys are not honored here — purchases always go to live Stripe.

## Webhook handler ([line 222](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts))

A request is identified as a Stripe webhook by the presence of the `stripe-signature` HTTP header. The handler:

1. **Verifies signature** using HMAC-SHA256 over `<timestamp>.<rawBody>`.
2. **Rejects timestamps older than 5 minutes** — replay protection (line 243).
3. **Parses event JSON.**
4. Dispatches by `event.type`:

### `checkout.session.completed`

Two handlers run in sequence on this event:

- **GC purchase fulfillment** (lines 270-288): reads `session.metadata.member_number` and `session.metadata.credits`. If both present, updates `gc_balances` (or inserts new row) and appends `gc_transactions` row with `type='purchased'`.
- **MAP1 first-payment handler** (lines 290-392): looks up `pipeline_map1` row by `session.customer` (Stripe customer id). If found and `pay1_status` empty:
  - Expands the PaymentIntent to extract `payment_method.type` (`card` or `us_bank_account`) and `last4`.
  - Sets `pay1_status` = `succeeded` (card) or `processing` (ACH).
  - Computes `card_processing_fee` from `amount_received - baseAmount`.
  - For Quarterly plans, computes `pay2_date`, `pay3_date`, `pay4_date` as +91/+182/+273 days.
  - Sets `confirmation_status='Confirmation Needed'`.
  - **Chains** `automation_CONTRACT_confirmationemail` (always — but for a **card** the handler skips the client email; see the policy box below).
  - **Chains** `automation_CONTRACT_invoicereceipt` only for card (ACH waits for `payment_intent.succeeded`).

### Purchase-email policy — SYSTEM-WIDE *(2026-07-26, v663)*

**One email at purchase time, selected by payment method. Any NEW payment pipeline must follow this.**

| Method | At purchase | At settle |
|---|---|---|
| **Card** | invoice/receipt only — **no payment-confirmation email anywhere in the system** | (already settled) |
| **ACH** | payment-confirmation email (it exists to break the 2–4 day silence) | invoice/receipt |

**ONE documented exception (2026-09-04): the Advisor / Accountant Membership Deposit sends `<PREFIX>_deposit_received` on BOTH card and ACH.** The policy's card rule assumes a receipt is issued at purchase; the deposit issues none — no invoice or receipt exists until the onboarding payment itself completes — so the confirmation is the deposit's only acknowledgement. Do not "correct" it to ACH-only.
| **Check** | confirmation **+** docs at check-clear — **deliberately unchanged** | n/a |

A card clears the moment the buyer submits, so the invoice/receipt lands in the same breath and says everything the confirmation would; two emails read as a duplicate. Applies to MAP 1 payment 1, Tax retainer, Advisor onboarding, Accountant onboarding, PIP purchases, Specialist background check, Specialist monthly licence, SpecRev one-time, and Membership first sign-up. Growth Credits sends no purchase emails at all (unchanged). MAP 1 installments 2–4 and Tax implementation charges already had no confirmation.

**Where the gate lives differs, and it matters:**

- **Inside the handler** for MAP 1 (`actions/pipeline/contract-confirmation-email.ts`), Tax (`actions/tax/confirmation-email.ts`) and the Specialist licence (`actions/onboarding/license-confirmation-email.ts`). MAP 1 / Tax because those handlers also own non-email side effects that must still run for a card — the "client paid" PF bell, the ERT vault agreement copy, Tracy's new-case email and the load-bearing `c24_email_sent` stamp; a call-site gate would silently kill them. The licence because TWO racing webhook paths chain it and both must obey the same rule.
- **At the webhook call site** for Advisor, Accountant, PIP, Specialist background check, SpecRev and Membership — those handlers own nothing but the email.

MAP 1 and Tax record the skip as **`'Skipped - Card (Receipt Only)'`** (`constants/confirmation-status.ts CONFIRMATION_CARD_SKIP`, mirrored frontend-side in `src/lib/confirmationStatus.js`) in `pipeline_map1.confirmation_status` / `client_tax_plans.retainer_confirmation_status`. It is **terminal-equivalent to `'Sent'`** for the idempotency guards (a replayed webhook must not re-raise the PF bell), but it deliberately does **NOT** stamp `*_confirmation_email_sent_at`, so a manual admin resend stays possible. Admin surfaces render it as a "skipped" pill rather than a stuck-pending step.

**Advisor / Accountant / PIP were restructured, not just gated** — they were inverted (card got confirmation + receipt instantly, ACH got total silence until clear). Now `checkout.session.completed` chains ONE action selected by method (card → `*_invoicereceipt` directly; ACH → `*_confirmationemail`), and `payment_intent.succeeded` (the ACH settle) chains `*_invoicereceipt` (+ PIP revshare) directly. **The advisor/accountant confirmation handlers no longer chain `_invoicereceipt` downstream** — the webhook owns receipt sequencing on every path. Re-adding a chain there would double-send the documents (gotcha #289).

### `payment_intent.succeeded`

Two cases (lines 394-438):

1. `metadata.payment_number` ∈ {2,3,4}: subsequent quarterly payment cleared. Sets `pay${n}_status='succeeded'`. **Chains** `automation_CONTRACT_invoicereceipt` for that payment number — **but only when `rec{N}_email_sent` is not already `true`** (see the redelivery box below).
2. `pipeRow.pay1_status === 'processing'`: ACH first-payment cleared. Flips to `'succeeded'`. **Chains** `automation_CONTRACT_invoicereceipt` for payment 1. **This branch is NOT latched.**

> **⚠️ STRIPE REDELIVERS, AND THIS ROUTER HAS NO EVENT-ID DEDUPE (2026-08-04, gotcha #327).** `maybeHandleStripeWebhook` does all of its work — DB writes plus `fetch`-chained `automation_*` calls that render PDFs, upload to Drive and create Gmail drafts — **before** returning 200. Stripe waits ~30s for that 200 and, not getting it, **redelivers the identical event**. Nothing remembers `evt.id`, so the branch re-runs from the top. This happened live: a MAP 1 continuation payment's receipt chain outran the timeout and produced **two identical Gmail receipt drafts sharing one receipt number**, while the revshare chain — which carries an `isResolved` guard — fired exactly once. Only ONE charge was taken (the sweep's idempotency key held). **The fix applied is narrow:** the P2-4 branch above widens its `.select()` to `rec2/3/4_email_sent` and skips the invoicereceipt chain when the flag is already `true`. It closes the realistic late-retry case, **not** two genuinely overlapping in-flight deliveries, and **every other branch in this file — the P1 ACH branch, tax, advisor, accountant, PIP, specialist — remains unguarded.** The systemic fix (return 200 immediately, run the chains under `EdgeRuntime.waitUntil`, plus a real event-id dedupe) was proposed and **NOT built**. **When you add any side effect to this router, name the column that proves it already happened and check it first** — and note that a reused `rec{N}_number` is NOT a dedupe (#328): it makes the duplicate *identical* rather than preventing it.

> **How `metadata.payment_number` gets set for payments 2-4:** by `automation_CONTRACT_chargescheduled_sweep`, a daily-`pg_cron`-driven PUBLIC action (service-role gated). It uses the saved-on-customer payment method (captured by P1's `setup_future_usage: off_session`), creates the PaymentIntent server-side with `Idempotency-Key: chargescheduled-{client_id}-P{N}-{YYYY-MM-DD}`, and stamps `metadata.payment_number=N` so this webhook branch fires the correct chain. See [flows/contract-and-payment.md](../flows/contract-and-payment.md) Step 10½ and [flows/stripe-webhook.md](../flows/stripe-webhook.md).

### `checkout.session.expired` — abandonment detection (added 2026-07-28, v667)

Until this event was consumed, a payer who opened a hosted Checkout page and walked away was **completely invisible**: nothing was charged, nothing was written, and no sweep looked at the row (gotcha #296 — a $800/mo recurring plan sat abandoned for 14 days). `router/webhooks.ts` now carries ONE additive, isolated block on `checkout.session.expired`, handled for the **two VFO Specialist Revenue pipelines ONLY** and branching on `session.metadata.pipeline`:

| `metadata.pipeline` | Resolved by | Acts only while | Raises |
|---|---|---|---|
| `VFO_SPECIALIST_REVENUE_RECURRING` | `metadata.plan_id` → `specialist_revenue_recurring_plans` | `status='setup_pending'` | `SPECREV_checkout_abandoned_bell` |
| `VFO_SPECIALIST_REVENUE` | `metadata.request_id` → `specialist_revenue_requests` (falls back to `session.customer`) | `payment_status='requested'` | `SPECREV_checkout_abandoned_bell` |

Both branches carry the standard `event.livemode` vs row `sandbox` mode-mismatch guard and bell Tracy + Jake (dismissible FYI, `dedupe:"unread"`; the message says the link the payer already has still works, because a SPECREV setup link stays valid while the row is unresolved). Three things to know before extending this (gotcha #299):

- **It only fires if the Stripe endpoint subscribes to `checkout.session.expired`** — same config dependency as `invoice.finalized` and `checkout.session.async_payment_succeeded`. Subscribed on both the live and sandbox endpoints as of 2026-07-28.
- **An expired session has no PaymentIntent, so `payment_intent_data[metadata]` is ABSENT from the event** — only `session.metadata` survives. The one-off SPECREV builder previously stamped the request id only under `payment_intent_data`, so expiry could not be routed; it now also appends `metadata[request_id]` at session level. **Any session whose expiry you may want to consume must carry its routing keys in the SESSION metadata.**
- **Since 2026-08-21 the one-off row can be GONE by the time the expiry arrives.** `specialist_revenue_delete_request` hard-deletes a `payment_status='requested'` request, and a session opened before the delete still expires up to 24h later. Both lookups are null-tolerant `maybeSingle()`s, so the branch falls through silently and no bell is raised — correct, and the same reason the delete makes no Stripe call. Do not "fix" the missing bell.
- **The block is deliberately scoped to those two pipelines.** Every other pipeline's expired sessions fall through untouched — MAP 1 / Tax / onboarding sessions expire routinely and harmlessly. A new abandonment consumer must add its own `session.metadata.pipeline` branch inside the same block, never act on every expired session.

Expiry timing differs by mode: the SPECREV recurring session is capped to **1 hour** via `expires_at` (so the billing anchor is still in the future at completion); a one-off Checkout session uses Stripe's **24 hour** default.

## ACH verification (`verification_method`) — which builders pin `instant`, and which do not

**Started SPECREV-only on 2026-07-28; extended to MAP 1 `/pay` and Tax `/tax-pay` on 2026-09-08 (v816).**

Pinning `payment_method_options[us_bank_account][verification_method]='instant'` restricts Stripe's hosted page to the **Financial Connections bank-login flow with no manual account/routing fallback** — every bank Financial Connections does not support, and every payer who hits MFA trouble or bails at the final authorize click, is locked out with no other way through (that is how Dan Zimanski produced six expired sessions in 14 days, **#296**). Omitting the parameter falls back to Stripe's `automatic` default: **bank sign-in first, PLUS manual account/routing entry verified by 1-2 business-day micro-deposits**. The three values are `automatic` (the default when omitted) / `instant` / `microdeposits`.

**Builders that OMIT the pin** (the manual-entry fallback is available, and all five carry the `custom_text` note below):

| Builder | Flow |
|---|---|
| `actions/pipeline/contract-stripe-checkout.ts` | MAP 1 `/pay` *(2026-09-08)* |
| `actions/tax/stripe-checkout.ts` | Tax `/tax-pay` *(2026-09-08)* |
| `actions/specialist-revenue/checkout.ts` | SpecRev one-time *(2026-07-28)* |
| `actions/specialist-revenue/recurring-checkout.ts` | SpecRev recurring setup *(2026-07-28)* |
| `actions/onboarding/license-checkout.ts` — **continuation branch only** | Specialist licence continuation |

**Builders that still pin `instant`, deliberately out of scope:** `actions/advisor/stripe-checkout.ts`, `actions/accountant/stripe-checkout.ts`, `actions/msm/pip-stripe-checkout.ts`, `actions/gc/create-checkout.ts`, `actions/membership/setup-checkout.ts`, `actions/migration/connect-checkout.ts`, `actions/onboarding/bg-checkout.ts`, `actions/onboarding/license-checkout.ts` (the **first-charge** branch, not the continuation one) and `actions/payments/card-update-checkout.ts`. Grep `verification_method` for the current list rather than trusting this one; each of those flows would need its own webhook work before the fallback is safe to expose.

**Never re-add `'instant'` to any builder in the first table** — it is a narrowing, not a hardening (**#298**).

### The consequence each side has to design around

`checkout.session.completed` fires **at submit** while micro-deposit verification is still pending, so it means SUBMITTED, not PAID:

- **SPECREV recurring** — the plan flips to `active` **before the bank is verified**. That is not a bug: the payer has ~10 days to verify through Stripe's own hosted page, and an unverified bank at charge day surfaces through the existing `invoice.payment_failed` branch (bell, plan stays active, Stripe retries). **Do not add a second verification gate** (**#298**).
- **SPECREV one-time** — a fourth `payment_status` value, `awaiting_verification`; see the next section.
- **MAP 1 P1 / Tax retainer / Tax final-retainer fresh link** *(2026-09-08)* — the completed branch reads the fetched PaymentIntent's `status` and, on a non-card `requires_action`, stamps `pay1_bank_verification_pending_at` / `retainer_bank_verification_pending_at` / `final_retainer_bank_verification_pending_at` and bells `MAP1_ach_bank_verification_pending` / `TAX_ach_bank_verification_pending`. **The status columns keep saying `processing`** — a side-column, not a new status value, so no enumerating guard changed (**#371**). The MAP 1 and Tax retainer confirmation emails swap to their `|ach_verify` templates and their "client paid" bells re-word. `payment_intent.processing` clears the stamp; `payment_intent.canceled` (micro-deposit expiry, ~10 business days) now routes those two pipelines into the failure block it previously served for SpecRev alone. Full detail: [../flows/stripe-webhook.md](../flows/stripe-webhook.md) Branches A2 / C / D, and **#475**.

### `custom_text[submit][message]` — the only client-facing lever

Stripe renders this string above the submit button on the hosted page and **supports `**bold**` markdown in it** (confirmed live 2026-09-08). Stripe's own *"Enter bank details manually (may take 1-2 business days)"* link text belongs to Stripe and **cannot be edited or hidden**, and the fallback itself must stay available — so this sentence is the entire steering mechanism. The wording lives in ONE place, `constants/ach-checkout-note.ts` `ACH_BANK_SIGN_IN_NOTE`, and every builder in the first table appends it on the non-card path only:

- `/pay` and `/tax-pay` send the note alone.
- The two **recurring** builders (SpecRev recurring setup, licence continuation) **prepend** it to their existing *"No charge today…"* sentence, separated by a blank line — that sentence still has to be said, and the note goes first.

Do not fork the string; a second copy is a second thing to keep true.

### One-time SPECREV — PI-status-aware *(2026-08-11, gotcha #370; UNDEPLOYED at time of writing)*

The recurring case above tolerates an unverified bank because the failure surfaces at charge day. The **one-time** path had no such surface, so it needed the opposite treatment. `checkout.session.completed` was writing `payment_status='processing'` for every non-card payment while already holding the PaymentIntent it had fetched for `payment_method` — it now branches on that PI's `status`:

| PI `status` | Row `payment_status` | Email / chain |
|---|---|---|
| `requires_action` (hand-keyed → micro-deposits) | **`awaiting_verification`** (new) | template **218** `SPECREV_payment_verify_bank` |
| `succeeded` (instant-verified, already settled) | `received` | invoice/receipt + payout now |
| anything else | `processing` (unchanged) | template 168 confirmation |
| card | `received` (unchanged) | invoice/receipt + payout |

`specialist_revenue_confirmationemail` picks its template from the row's `payment_status`, so no new action was added. `payment_intent.processing` advances `awaiting_verification` → `processing`; **`payment_intent.succeeded` must accept BOTH `processing` and `awaiting_verification`** — a `processing`-only guard strands the new state permanently (gotcha #371, which lists every guard that enumerates this column). Terminal failures now exist for this pipeline: **`payment_intent.canceled`** (micro-deposit expiry ~10 business days, or a dashboard Cancel — previously handled nowhere in `router/webhooks.ts`), `payment_intent.payment_failed` and `checkout.session.async_payment_failed` all route through `markSpecialistRevenueFailed` → `payment_status='failed'` + `SPECREV_payment_failed_bell`, skipping rows already `received`/`failed` — **and, since `v824` (pending, 2026-09-10), the helper takes the event's PaymentIntent id as a 5th argument and refuses BOTH a row still `requested` and any event whose PI is not the row's booked `stripe_payment_intent_id`**, since every Checkout page the payer opens mints its own PaymentIntent on the one shared customer (**#484**). **All three are already subscribed on the endpoint.** `payout-sweep.ts` gained a fourth pass belling Tracy after 5 days in `awaiting_verification` (`SPECREV_awaiting_verification_bell`, deduped on unread) as a poll-based backstop. All four link-bearing SPECREV templates (164/170/188/208) carry a tip steering payers to bank sign-in; 208's sentence recommending manual entry was removed.

### Failure events (added 2026-06-15)

Every money-movement failure routes an alert to Jake's bell via `utils/notify-jake-failure.ts` (`notifyJakeFailure`, with an `actionRequired` flag + `clearJakeFailure`/`clearJakeFailuresContaining` for auto-clear), in ADDITION to any existing Tracy/admin/PF alert. A shared `utils/resolve-stripe-failure.ts` maps a Stripe customer + metadata to the right pipeline row + status column (same cascade as `checkout.session.completed`).

- **`checkout.session.async_payment_failed`** — an ACH first payment that bounced after the session completed (previously silent everywhere). Flips the row's first-payment status to `failed` across MAP 1 / Tax retainer / Advisor / Accountant / PIP / Specialist bg.
- **`payment_intent.payment_failed`** — broadened beyond Specialist to all first-payment pipelines. **As of v612 it ALSO handles LATE-ACH failures of OFF-SESSION charges** (previously skipped on the card-only rationale that the sweeps alert synchronously — but an off-session ACH returns `processing` and can bounce days later): two additive branches — MAP1 installment (`metadata.payment_number` 2-4, acts only when `pay{N}_status==='processing'`) and TAX implementation (`payment_kind='implementation'`, acts only when `implementation_charge_status==='processing'`) — each flip to `declined` + fire their `*_charge_failed` rule + `notifyJakeFailure`; the `'processing'` guard prevents double-alerting a card sync-decline the sweep already handled (gotcha #229).
- **`payment_intent.canceled`** — SpecRev only until 2026-09-08 (v816); **the whole `payment_intent.payment_failed` block above now ALSO runs for it** when `metadata.pipeline === 'TAX'` or `metadata.payment_number` is set. Micro-deposit expiry (~10 business days on the ACH manual-entry path) and a dashboard Cancel both emit `canceled`, **not** `payment_failed`, so before this a MAP 1 or Tax row would have sat at `processing` forever. `failReason` reads `cancellation_reason`; Holistic P1 needed an explicit arm out of the `isOffSession` test because a P1 PaymentIntent carries `payment_number='1'`. See [../flows/stripe-webhook.md](../flows/stripe-webhook.md) Branch C.
- **`payment_intent.processing`** — SpecRev advances `awaiting_verification → processing`; MAP 1 and Tax (2026-09-08) only NULL their `*_bank_verification_pending_at` stamp, touching no status. See [../flows/stripe-webhook.md](../flows/stripe-webhook.md) Branch D.
- **`customer.subscription.updated` / `.deleted`** — Specialist $99/mo license past_due/canceled → "consider revoking access" alert (routed by `lic_subscription_id`); auto-clears + restores `lic_payment_status` on return to active.
- **`charge.dispute.created` / `.closed`** — chargeback alert (action-required); close clears the opened alert, then posts the won/lost outcome.
- **`charge.refunded`** + **`charge.refund.updated` / `refund.updated` / `refund.failed`** — tracks every refund (incl. Stripe-Dashboard-issued) and alerts on a failed refund.
- **`transfer.reversed`** — a rev-share Connect transfer reversed/clawed back.
- Catch-all `console.log("Stripe webhook event:", event.type)` logs every event for observability.

These only fire if the Stripe endpoint subscribes to the event types (config, both live + sandbox). Alert policy: action-required + auto-clear for rev-share/license/disputes (clean recovery event); dismissible FYI for the rest (no programmatic recovery → would be permanent clutter).

> Note: the `checkout.session.completed` / `payment_intent.succeeded` sections above are MAP 1-centric and carry pre-refactor line refs; the **authoritative current webhook routing** (tax / advisor / accountant / pip / specialist cascade + these failure events) lives in `SESSION_REFERENCE.md` → "Stripe webhook chain order".

## Setup mode / SetupIntent — admin-initiated card-update (2026-06-16, Phase D)

This was the **first `mode=setup` / SetupIntent usage** in the system, and for a while the only one. **It is no longer the only one — `/membership-pay` mints `mode=setup` on FOUR save-only cases:** an ACTIVE plan (the update-method page), a fully-credited $0 plan, an **annual transfer**, and — since 2026-08-21 / v776 — **a MONTHLY TRANSFER carrying an admin-entered `charge_day`**, whose whole year is scheduled on that day so nothing is collected at the link. Everything else is still `mode=payment` (charges) or `mode=subscription` (the specialist license). See [../flows/membership-fees.md](../flows/membership-fees.md). A setup session **saves a reusable payment method with no charge** so the *next* off-session charge of an existing engagement uses it. Full flow: [../flows/payment-method-change.md](../flows/payment-method-change.md).

**Checkout Session shape — card-update** (`payments_cardupdate_checkout`, [actions/payments/card-update-checkout.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/payments/card-update-checkout.ts)):

```
mode: setup                         # no line_items, no charge
customer: <the engagement's EXISTING Stripe customer>
payment_method_types: ["card"] OR ["us_bank_account"]
success_url: <portal>/update-card?token=<token>&updated=1
cancel_url:  <portal>/update-card?token=<token>
metadata.payment_kind: card_update
metadata.pipeline:     MAP 1 | TAX | SPECIALIST_LICENSE
metadata.row_id:       <engagement row id>
metadata.token:        <card_update_tokens.token>
setup_intent_data.metadata: { payment_kind, pipeline, row_id }   # mirrored onto the SetupIntent
if ACH: payment_method_options.us_bank_account.verification_method: instant
        # STILL PINNED here — the 2026-09-08 unpin covers /pay and /tax-pay only
```

**Webhook — `checkout.session.completed` with `mode==='setup'` and `metadata.payment_kind==='card_update'`** ([router/webhooks.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/router/webhooks.ts)): a NEW isolated branch (does **not** touch the MAP 1 `pipeRow` logic). It expands the **SetupIntent** (`GET /v1/setup_intents/{id}?expand[]=payment_method`) to read the new method's id/type/last4, then:

1. `POST /v1/customers/{cus}` → `invoice_settings.default_payment_method = <pm>` (customer-level default for future invoices/charges).
2. Writes the engagement row's `default_payment_method_id` (`lic_default_payment_method_id` for the specialist license) + `payment_method_type` + `acct_last4`.
3. **MAP 1** also recomputes `card_processing_fee` for the new method and **freezes** already-paid installments' `pay{N}_method` / `pay{N}_last4`.
4. **SPECIALIST_LICENSE** also `POST /v1/subscriptions/{sub}` → `default_payment_method = <pm>` so renewals bill the new method.

> Because each engagement has its **own** Stripe customer (member-paid MAP 1 / Tax → the *member's* customer), a card-update is **per-engagement** — one setup session per customer. The `card_update_tokens` token is person-keyed, but the setup session and webhook operate on exactly one engagement.

### Off-session charges now prefer the stored default PM

After Phase D, the two custom off-session charge paths **prefer the engagement's `default_payment_method_id`** when set (saved by the card-update webhook), falling back to their prior method-selection otherwise:

- **MAP 1 quarterly sweep** ([actions/pipeline/contract-chargescheduled-sweep.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/pipeline/contract-chargescheduled-sweep.ts)) — uses `default_payment_method_id` if present, else lists the customer's saved methods and picks the most recent (prior behavior).
- **Tax implementation** ([actions/tax/charge-implementation.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/tax/charge-implementation.ts)) — uses `default_payment_method_id` if present (this also lets a check-paid retainer be charged off-session once a card/bank is added), else reuses the retainer charge's method. The idempotency-key PM suffix derives from `default_payment_method_id` when set, so the key auto-rotates when the method changes.
- The **Specialist $99/mo license** already keys off its subscription's default PM, which the webhook repoints in step 4 above.

## Stripe Connect & revenue share

`automation_CONTRACT_revshare` ([line 1248](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)) creates a Stripe Transfer:

```
POST /v1/transfers
amount: <round(shareAmount * 100)>
currency: usd
destination: <members.stripe_account_id>
description: "MAP 1 Revenue Share - Client: (<client_ref>) <Client Name> - Member: (<member_number>) <Member Name> - <N>/4"   (one-time plans: "- One-Time Payment")
```

> **Memo convention (2026-07-15):** every Stripe money movement carries a human-readable memo — Checkout sessions put it in BOTH the line-item product name (client-visible) and `payment_intent_data.description` (dashboard); off-session PaymentIntents and Connect transfers use `description`. Formats per pipeline are itemized in the payment-memo session entry in [SESSION_REFERENCE.md](../SESSION_REFERENCE.md).

This requires:
- A Stripe Connect account configured for each member (`members.stripe_account_id` populated). **Since 2026-08-27 that id is not necessarily the member's OWN** — a Corporate Member may be paid into their lead member's account by a straight copy of the id, marked by `members.stripe_account_linked_from`; the engines are unchanged and neither know nor care (gotcha #454, section below).
- The platform's Stripe account (the `STRIPE_SECRET_KEY` holder) to have sufficient balance for the transfer.

The handler **only transfers** if:
- `members.revenue_decision !== "Money Mapping"` (else: marked `"Money Mapping"`, no transfer)
- `shareAmount > 0` (else: marked `"N/A — No Share Due"`)
- **The member is in good standing (2026-08-24)** *(v: 2026-08-24)* — `utils/member-payout-hold.ts` `memberHoldReason` finds none of `members.suspended` / `membership_suspended` / `paused`. Otherwise the MEMBER leg parks **non-terminally** at `Held - Member Suspended` / `Held - Member Paused` (`held_member_*` in `specialist_revenue_lines.payout_status`) with **no transfer, no member email and no completion stamp**, and one internal Gmail draft goes to Paul. **This check sits ABOVE the account check below**, so a suspended member never even reaches the Connect-setup path. It gates all four engines (MAP 1 / Tax / PIP / Specialist Revenue) and the **member leg only** — strategic-partner, tax-planner and specialist/expert transfers in the same run are unaffected. Released by the nightly sweeps, or instantly by `utils/member-payout-release.ts` when the flags clear.
- `members.stripe_account_id` is set — **and a missing one is NOT "skipped silently" any more (2026-07-29, gotcha #303).** It writes the **non-terminal** `'Awaiting Connect Setup'` (`AWAITING_CONNECT`, `utils/member-share-held.ts`) and raises an action-required bell naming the held dollars, whose title is reconstructable so it self-clears when the share finally pays. The daily sweeps enumerate that value alongside `Pending` / `Failed`, and no `*_rev_completed_at` is stamped until a terminal outcome

> **Proportional split (2026-07-21, gotcha #252):** a `share` value is ALWAYS a dollar amount of the TOTAL engagement; the portion transferred on any one installment is `portion = (share / totalGross) × paymentReceived`. The legacy ">100 → dollars else percent-of-payment" heuristic was removed from every leg (MAP1 member + strategic, tax member + strategic, tax planner) AND from the Payments-tab display math (`actions/payments/normalize.ts`) so the transfer and the displayed split always agree.

### SpecRev ERT share — the platform forwards a sister company's slice (2026-09-11)

Not every transfer goes to a *member*. A SpecRev recipient line can carry an `ert_share` instead of a `vfos_share` (never both — form, handler and DB CHECK all enforce it), and `utils/specialist-revenue-payout.ts` settles it with its **own** transfer, in a loop that runs after the member loop and is **independent of it**:

```
POST /v1/transfers
amount: <round(ert_share * 100)>
currency: usd
destination: <ERT_CONNECT_ACCOUNT_ID[_SANDBOX]>        # ERT's connected account, NOT an ERT key
description: "Specialist Revenue ERT Share - Specialist: <name> - For: <(member#) name>"
metadata: pipeline=VFO_SPECIALIST_REVENUE, request_id, line_id, expert_id, member_number, transaction_details
Idempotency-Key: specrev-ert-<requestId>-line<lineId>[-r<Date.parse(updated_at)> when the line is already `failed`]
```

Note the memo names **the member the share came from**, not ERT — the same recipient formatting as the member transfer, so the two legs of one line read as a matched pair on the dashboard.

**Why the money is collected on VFO Services and forwarded.** A Connect transfer only flows **platform → its own connected account**. Every member Connect account belongs to the VFO Services platform, so charging the specialist on the ERT *billing* account would have stranded the member legs: ERT would hold the gross while VFO Services still had to pay the members out of its own balance. Collecting the whole gross on VFO Services (unchanged) and forwarding ERT's slice keeps both legs payable from the one balance that can pay them. **Deliberate, accepted consequence:** the specialist's invoice and receipt still say **VFO Services**, including for the portion that is ERT's.

**Failure handling.** A Stripe failure — **or an unset `ERT_CONNECT_ACCOUNT_ID[_SANDBOX]`** — stamps the line `ert_payout_status='failed'` and raises the action-required bell `SPECREV_ert_transfer_failed`, one title per request; the nightly 11:00 sweep retries it, and the bell auto-clears on a clean run. The not-configured branch never throws, because the member legs of that request are already settled and must not be rolled back. There is **no email** on this leg at all. **A destination that cannot yet receive transfers is its own branch** with its own bell message (“ERT's connected account … cannot receive transfers yet (transfers capability not active)”), and it too is retried nightly.

**Probe BEFORE the call — and why the key rotates (2026-09-11, gotcha #489).** Stripe caches the **first** response per `Idempotency-Key` for **24 hours, error bodies included**. A transfer attempted while the destination's `transfers` capability was still inactive therefore poisoned its own key: every retry replayed the identical refusal (observed live on request 37 line 86 — the retry came back with the same `request_log_url`). Two changes fix it. (1) **`connectTransfersActive(ertDestination, STRIPE_KEY)` is probed ONCE per request**, before the ERT loop — the same helper and the same discipline as the member leg. A not-active destination parks every ERT leg of that request `failed` with the bell and makes **no Stripe call at all**, so no key is ever consumed until the money can actually move. (2) **The key rotates once the line already carries a `failed` stamp**, gaining `-r<Date.parse(updated_at)>`. That is safe precisely because `failed` is only stamped **after Stripe returned an error body** — no transfer exists behind it, so a fresh key cannot double-pay. The genuinely dangerous case is the opposite one (a network drop *after* Stripe created the transfer), and it leaves the line `pending` with `updated_at` untouched, so that retry reuses the **original** key and gets the same transfer back. The member leg's key and probe are unchanged.

**Stripe does NOT copy the memo to ERT's side — so the portal stamps it (2026-09-11).** A transfer's `description` and `metadata` live on the **platform's** transfer object; the `py_…` charge Stripe creates on the connected account is born bare. On ERT's own dashboard — the one Jake actually reads — the $4,119.77 catch-up showed Description **"-"** and **"No metadata"** (`py_1UEbptA6agMWAt8dMnI7a5IP`). So after every successful ERT transfer, engine and manual action alike, `utils/ert-destination-memo.ts` **`stampErtDestinationPayment`** POSTs `/v1/charges/<transfer.destination_payment>` with the header **`Stripe-Account: <ERT acct>`**, setting the same description and metadata. Acting as ERT is permitted because ERT granted `read_write` when it connected by OAuth. **Best-effort by contract:** the money has already moved by the time it runs, so a failure is cosmetic — it logs one line, returns `false`, and must never change a payout status, raise a bell or abort a run. Live-proven on the $978.68 catch-up (`tr_1UEc2xRwdhysCa6FgnfQHEQ4`).

### Manual "Send funds to ERT" catch-up transfer (2026-09-11)

`specialist_revenue_ert_transfer` (`actions/specialist-revenue/ert-transfer.ts`) is a **superadmin-only**, hand-typed transfer on the same rails, for money that landed on VFO Services **before** the ERT share column existed — gross amounts collected whole, with no line, no request and no `ert_payout_status` for the nightly engine to retry.

```
POST /v1/transfers
amount: <round(amount * 100)>        # amount > 0 and <= 50000 (typo guard)
currency: usd
destination: <ERT_CONNECT_ACCOUNT_ID[_SANDBOX]>        # same secret as the automated leg
description: "Manual transfer to ERT - <memo> - by <email>"
metadata: pipeline=VFO_SPECIALIST_REVENUE, kind=manual_ert_catch_up, memo, created_by
Idempotency-Key: specrev-ert-manual-<client_ref>
```

It is deliberately **DB-free** — no row, no email, no bell — so **Stripe's own transfer list is the ledger** for these corrections rather than a second, diverging record of money Stripe already tracks. Double-click safety without a DB comes from the idempotency key: the frontend mints one `client_ref` per form and re-mints it **only after a success**, so retries of one submission collapse onto a single transfer while a second deliberate send is genuinely a second transfer. Mode follows the shared `pipeline_sandbox_config` "MAP 1" toggle, and the destination comes from the same secret as the automated leg, so the tool can never send somewhere the engine would not. **It probes first too (2026-09-11):** `connectTransfersActive` runs before the transfer and a not-active destination returns **502** without calling Stripe — otherwise a refusal would burn that submission's `client_ref` for the rest of the day (gotcha #489). Its idempotency key is **not** rotated, and does not need to be: the operator gets a fresh `client_ref` on the next successful send, and the probe removes the refusal that would have poisoned the current one. **After a success it stamps the destination payment** via `stampErtDestinationPayment` and returns **`stamped: boolean`** to the operator alongside `transfer_id` — purely informational, since the money has already moved.

### Tax Planner Share → the GROUP account (2026-07-21)

The Tax Planning 3-way split adds a **third Connect transfer** (beyond the member share + the 10% strategic-partner share): the **Tax Planner Share**, paid by `utils/tax-planner-payout.ts transferPlannerShare`. Its destination is NOT the planner's own account but the planner's **Tax Planning Group** ("company") account, resolved `tax_planners.member_type` → `tax_planning_groups.name` (exact match) → `tax_planning_groups.stripe_account_id` (exactly mirrors the strategic-partner group model). It lands `Failed` (Jake bell + daily sweep retry) when the planner has no `member_type`, the group is missing, or the group has no Stripe account. Idempotency key `planner-tax-<plan.id>-<retainer|implementation>`; memo `Tax Planning Revenue Share - Client: (<ref>) <name> - Tax Planner: <planner> — <group> - Retainer|Implementation`. Group Connect setup is `tax_planning_group_stripe_connect_request` (mirrors `strategic_group_stripe_connect_request`). Gotcha #253.

### Per-case test-member sandbox override (2026-07-21; migration handlers converted 2026-07-29, v672)

Independent of the per-pipeline `pipeline_sandbox_config` toggle, every client-scoped TAX/MAP1/PIP money/email/BoldSign handler now resolves its mode via `loadSandboxConfigForClient(sb, pipeline, clientId)` (`integrations/sandbox-config.ts`) instead of the bare `loadSandboxConfig`. It reads the global row, and if the pipeline is LIVE it force-flips ONLY cases whose client belongs to a `constants/test-sandbox.ts TEST_SANDBOX_MEMBER_NUMBERS` member (currently `59524`) to sandbox (sandbox Stripe key + BoldSign test + `sandbox_email` redirect). Force-ON-only and fail-safe: any lookup failure returns the unchanged global result, so it can never push a real case to live. It exists so Jake can exercise the live automations end-to-end on the test member without a real charge. 

**The coverage claim above was not literally true until 2026-07-29.** The **migration / Payment Continuation** family (`actions/migration/backfill-map1.ts`, `backfill-tax.ts`, `connect-checkout.ts`, `send-setup-link.ts`, `stripe-lookup.ts`) was written separately and read the GLOBAL `pipeline_sandbox_config` row inline. With the global toggle LIVE that split the flow in half for a test-member case: the `/connect-card` setup session was minted against the **LIVE** Stripe key while the row and the charge sweep resolved per-client to **sandbox**, so the case could never complete — and on 2026-07-29 a real card was entered on that live-mode page (no charge; `/connect-card` is `mode:'setup'`). **All five were converted in v672**, and `grep -rn "pipeline_sandbox_config" actions/migration/` must stay at **zero matches**. Two contract details: **`migration_stripe_lookup` takes `client_id` as OPTIONAL** (the lookup can run before a row exists; a null falls through to the global config, byte-identical to the old read) and the admin tab `PaymentContinuationTab.jsx` now passes it; and **`send-setup-link`’s refuse-to-email-without-`sandbox_email` guard reads the helper’s `sandboxEmail`**, so a forced test-member send still redirects to the sandbox address rather than mailing the real client. Non-test clients are byte-identical before and after (the helper falls straight through to the global config). Gotchas #251 + #302.

### Payout-setup links are durable, not raw Stripe links (2026-07-23, gotcha #268)

Stripe account-onboarding links (`connect.stripe.com/setup/...`) are **single-use and expire**. The 4 "Set Up Payment Details" emails (member / specialist / strategic group / tax planning group, from `actions/members|specialists|strategic|tax-planners/*stripe-connect-request.ts`) therefore do **not** embed a raw account link any more — they embed a stable portal URL `${PORTAL_BASE}/payout-setup?token=<64-hex>`. One durable token per payout entity lives in `connect_setup_tokens` (`entity_type` ∈ member/specialist/strategic_group/tax_planning_group + `entity_key`, `unique(entity_type, entity_key)`, deny-all RLS); `utils/connect-setup-token.ts ensureConnectSetupToken` mints it lazily and reuses it across resends, so every email ever sent keeps resolving. The PUBLIC action **`connect_setup_link`** (`actions/payouts/connect-setup-link.ts`, in `PUBLIC_HANDLERS`) resolves token → entity → `stripe_account_id`, reads the shared "MAP 1" `pipeline_sandbox_config` toggle (so it talks to whichever platform owns the account), and mints a **fresh** `POST /v1/account_links` (`type=account_onboarding`) on EVERY click — `refresh_url` loops back to the same `/payout-setup?token=` page (Stripe's own mid-flow expiry re-mints through it), `return_url` = `/payout-setup?done=1`. `src/pages/PayoutSetupPage.jsx` auto-POSTs the action and redirects. Errors are friendly/generic (404 invalid, 410 "no longer valid" when the account can't be read — e.g. a sandbox-created account under the live key); the real Stripe error is logged WITHOUT the token (a durable bearer secret). The recovery for any previously-emailed dead raw link is a per-partner **"Resend Setup Email"** (it now carries the durable link). NOTE: the emailed `vfoportal.com/payout-setup` links only resolve once the frontend page is deployed.

**Account links must collect `eventually_due`, not just `currently_due` (2026-08-03, v693, gotcha #317).** Stripe's `account_onboarding` link asks the account holder only for what is **currently** blocking them. An Express account can be `payouts_enabled` with `capabilities.transfers='active'` — payable today — while the identity fields Stripe demands at the **$3,000 lifetime-payout threshold** (SSN, date of birth) sit unrequested in `requirements.eventually_due`. Such a person clicks the setup link, is shown an already-complete page, concludes they are done, and then has payouts stop at the cap months later. **Both mints in the codebase now append `collection_options[fields]=eventually_due`**:

- `actions/payouts/connect-setup-link.ts` — the per-click mint behind the durable `/payout-setup?token=` page, so this covers **all four** entity types (member / specialist / strategic group / tax planning group).
- `utils/specialist-revenue-payout.ts` — the automatic SPECREV "awaiting connect" setup email minted when a payout line finds `transfers !== 'active'` (gotcha #159). **NARROWED 2026-08-24:** a **member** line with **no `stripe_account_id` at all** now mints **nothing** — no Express account, no account link, no email — because the durable `/payout-setup?token=` page 404s for a member with no account, so there would be no working link to send. That line parks `awaiting_connect` (without `email_drafted_at`) and raises the action-required `SPECREV_member_share_held` bell telling an admin to run the member's own "Set Up Payment Details" flow. **Expert lines, and members who already have a half-built account, keep the mint-and-email path unchanged** — that link works.

**Any NEW account-link mint must do the same** — grep `v1/account_links` before adding one. The fix is forward-only: accounts already onboarded through an old currently_due-only link keep their cap until someone resends them a setup email. Those are exactly the accounts the member-profile status dot now renders **orange** (`eligible_capped` — "payouts eligible to $3,000"), which is how you find them; see the Connect-status read below.

### A Corporate Member can BORROW their lead member's Connect account (2026-08-27, v796, gotcha #454)

A Corporate Member (`58147-C1`) has no Connect account of their own, and their rev-share belongs in their **LEAD** member's account (`58147`). Since 2026-08-27 an admin can wire that up from the member profile — and **the mechanism is a COPY, which is the single most important thing to know before reading `members.stripe_account_id` anywhere:**

> **`member_stripe_link_lead` writes the LEAD's `stripe_account_id` onto the corporate member's row.** `members.stripe_account_linked_from` records whose account it is. **Nothing resolves through that marker column** — all four payout engines (`actions/pipeline/contract-revshare.ts`, `actions/tax/revshare.ts`, `actions/msm/pip-revshare.ts`, `utils/specialist-revenue-payout.ts`) still read `stripe_account_id` directly as the transfer `destination`, and **not one of them changed. The copy IS the routing.**

**The action** (`actions/members/stripe-link-lead.ts`, AUTH + `ADMIN_ONLY_ACTIONS`, body `{ member_number, unlink?: true }`) resolves the lead **server-side** from the member row — `connected_member_number` when non-empty, else the member-number prefix (see [tables/members.md](../tables/members.md)) — because a lead id taken from the body would let a caller point any member's payouts at any account. It refuses a non-corporate `member_type`, an unresolvable or non-existent lead, a lead with **no** Stripe account, an `unlink` when nothing is linked, and — critically — a member who already has an account of their **own** (`stripe_account_id` set with no marker), which it will not clobber. `unlink` clears **both** columns.

**Three surfaces had to be gated, because they read `stripe_account_id` meaning *"this member's own account"* rather than *"where the money goes"*.** Two of them are writes into a third party's Stripe account and one is a read leak; a bare copy would have opened all three silently:

| Surface | Without the guard | With it |
|---|---|---|
| `actions/members/stripe-connect-request.ts` | The setup email hands the corporate member an **onboarding link into the LEAD's Stripe account** — they could submit or change the lead's banking details. | **400**, naming the lead, before any Stripe call or mail side effect. |
| `actions/payouts/connect-setup-link.ts` (PUBLIC `/payout-setup?token=`) | The same hole, reached through a **durable token already sitting in an inbox** — guarding only the admin button leaves this open. | The **generic 404** (`genericInvalid`), reason logged server-side, never leaked to the page. |
| `actions/payments/member-payments-load.ts` | The payout list is `GET /v1/transfers?destination=`, so the tab shows **the lead's entire payout history and every sibling corporate member's**. | Stripe is never called; the response carries `payouts_linked_to: { member_number, name }` and the FE renders a note in place of the table. |

**Any NEW surface that reads `members.stripe_account_id` must decide which of the two meanings it wants** — grep `stripe_account_linked_from` and follow the pattern. The status dot (below) deliberately keeps reading the borrowed account and simply labels it: the pill is suffixed *"— \<Lead\>'s account"*, because the account's readiness genuinely is what governs whether the transfer lands.

### Member Connect status is read live, and it is the only surface that is (2026-08-03, gotcha #318)

`member_connect_status` (`actions/members/connect-status.ts`, AUTH + `ADMIN_ONLY_ACTIONS`) `GET`s `/v1/accounts/{id}` **fresh on every member-profile open** — no DB cache, no cron, no stored status column — and is strictly **read-only** (it writes nothing to Postgres and creates nothing at Stripe). It resolves the platform through the same shared **"MAP 1"** `pipeline_sandbox_config` toggle everything else Connect-related reads, so it always queries the platform that would actually pay the member out. Returned `status`:

| Status | Dot | Meaning |
|---|---|---|
| `none` | — | No `members.stripe_account_id` at all. |
| `complete` | green | `payouts_enabled` **AND** `capabilities.transfers==='active'` **AND** `currently_due` + `eventually_due` both empty. Only this is finished. |
| `eligible_capped` | orange | Payouts enabled + transfers active, requirements still outstanding — the $3,000-cap state created by pre-v693 links (#317). Deliberately not green. |
| `pending` | red | Payouts or transfers not enabled. |
| `mode_mismatch` | gray | 404s under the resolved mode but **resolves under the other key**. Connect accounts live under whichever sandbox/live toggle was active at creation, so this is expected, not an error — it renders neutral and names the mode, never a false red/green. |
| `unavailable` | gray | Stripe unreachable, or 404 under both keys. |

**The rule: a red or green dot must be earned from a live Stripe read.** The cross-mode retry exists so a mode-mismatched id degrades to gray rather than sending an admin to chase a member whose account is fine on the other platform.

**Scope warning.** This is one profile surface. Every other "connected" indicator in the portal — the Strategic Members, Tax Planners and Specialists panels, and the KPI donut — still infers "connected" from the **mere presence of `stripe_account_id`**, which goes green the instant the account row is created and long before anyone onboards. That false-green, and the transfers-active gate on the payout legs, are the **paused 2026-07-22 Connect-status audit** and remain **UNBUILT**. Extending the dot to those panels should reuse this action's mapping rather than inventing another.

## Sandbox vs live transitions

| Setting | Live | Sandbox |
|---|---|---|
| `pipeline_sandbox_config.sandbox_mode` | `false` | `true` |
| `pipeline_sandbox_config.stripe_test_mode` | `false` | `true` (informational — code reads `sandbox_mode` only) |
| Stripe key used | `STRIPE_SECRET_KEY` | `STRIPE_SECRET_KEY_SANDBOX` |
| Recipient email override | none | `pipeline_sandbox_config.sandbox_email` |

> **Inconsistency flagged:** the column `stripe_test_mode` exists on `pipeline_sandbox_config` but the handlers all read `sandbox_mode` instead. The `stripe_test_mode` column appears unused in the code. Either dead UX state or undocumented intent. [Schema source](../tables/pipeline.md).

## Frontend touch-points

- [PayPage.jsx:39](src/pages/PayPage.jsx) → `automation_CONTRACT_stripecheckout` → window.location to Stripe URL.
- [MemberGCMarketplace.jsx:47](src/components/member/MemberGCMarketplace.jsx) → `gc_create_checkout` → window.location to Stripe URL.
- [AutomationPanel.jsx](src/components/admin/AutomationPanel.jsx) read-only — never calls Stripe.

## Hardcoded Stripe URLs / values

| Value | Where |
|---|---|
| `https://www.vfo-services.com/payment-successful/` | MAP1 checkout success URL ([line 1120](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)) |
| `https://vfoportal.com/?gc_success=1` | GC checkout success URL ([line 2815](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)) |
| Card processing fee constants | `2.9%` and `$0.30` — embedded in the gross-up math at line 1116 and PayPage:79 |
| 5-minute timestamp tolerance | Stripe webhook replay guard ([line 243](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)) |

## Pipeline-table fields driven by Stripe

See [../tables/pipeline.md](../tables/pipeline.md) for the full column list. Quick reference:

- `stripe_customer_id` — created by `automation_CONTRACT_stripecustomer`
- `checkout_token` — created alongside, used as `/pay?token=...` URL key
- `payment_method_type`, `acct_last4`, `card_processing_fee` — set on first webhook
- `pay1_status` … `pay4_status`, `pay1_date` … `pay4_date` — written by webhook
- `rec1_rev_share` … `rec4_rev_share`, `rec1_rev_paid` … `rec4_rev_paid` — written by `_revshare`
- `default_payment_method_id` (also `client_tax_plans.default_payment_method_id`, `specialist_onboarding.lic_default_payment_method_id`) — written by the **card-update** `mode=setup` webhook; preferred by the off-session charge paths. (Phase D, 2026-06-16)
- `pay1_method` … `pay4_method`, `pay1_last4` … `pay4_last4` — frozen per-installment method/last4, written by the card-update webhook so the Payments tab keeps each past installment's real fee after a method change. (Phase D)
