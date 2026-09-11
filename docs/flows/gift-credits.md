# Gift Credits (GC) marketplace flow

A points-economy where members buy "Growth Credits" via Stripe and redeem them against a service catalog. The Stripe purchase → credit-balance update is handled in the same Stripe webhook that handles MAP1 payments — disambiguated by Checkout Session metadata.

Since 2026-08-27 a service can also bill on a **repeating cadence** (`gc_services.billing_interval`). The first charge of a recurring service is the ordinary redemption below, unchanged in every respect; what is added is a `gc_subscriptions` row and a nightly sweep that charges it again — see **Flow E**.

---

## Which Stripe account a purchase lands on *(2026-09-11, v829)*

Growth Credit purchases are one of the three money flows now billed on the **ERT** Stripe account (Elite Resource Team LLC). Full rules: [../integrations/stripe.md](../integrations/stripe.md#two-stripe-accounts-2026-09-11).

**CONFIG MINTS.** `pipeline_sandbox_config` row **`GROWTH_CREDITS`** gained **`stripe_account`** (`'vfos'` default, `CHECK IN ('vfos','ert')`). `gc_create_checkout` reads both axes from that one row — `const { isSandbox, stripeAccount } = await loadSandboxConfig(supabase, "GROWTH_CREDITS")` — and mints the Checkout Session with `getStripeKeyFor(stripeAccount, isSandbox)`. It is flipped **by SQL, never from the UI**.

> **LIVE ON ERT since 2026-09-11 ~16:10Z.** The `GROWTH_CREDITS` row was flipped by SQL to **`stripe_account='ert'` with `sandbox_mode=false`**, so **every new credit purchase mints on ERT**. Nothing needed migrating: a GC purchase is a one-shot session with no saved customer, so there is no equivalent of the membership remap and none is needed. Historic rows keep their `'vfos'` stamp purely as a record of which dashboard holds them.

**THE ROW STAMP GOVERNS.** `gc_transactions.stripe_account` is nullable; **NULL = legacy = `vfos`**. `fulfillGrowthCredits()` in `router/webhooks.ts` writes `stripe_account: stripeAccount` on the `purchased` row — **the account taken from whichever signing secret verified the session's webhook**, not from the config — so a later reader knows which Stripe dashboard holds the purchase. The stamp is **never re-written**.

A GC purchase is a **one-shot Checkout Session**: there is no saved customer and nothing to charge again, so the stamp is a record, not a routing key. **An admin comp (`gc_add_credits`) takes no money and leaves both `stripe_session_id` and `stripe_account` NULL** — which is consistent with the `#466` discriminator rule (`stripe_session_id` present = a real sale).

> **Pre-existing gap, flagged not fixed:** the GC webhook branch has **no `event.livemode`-vs-row guard** of the kind the membership and SpecRev branches carry. That was true before this change and is unchanged by it.

**VERIFIED LIVE 2026-09-11** (sandbox ON + `stripe_account='ert'` for a short window, then reverted): a **1-credit purchase on Test Member 59524** minted on ERT, `gc_transactions` **86** stamped `ert`, **$103.30**, balance **950 → 951**.

## Trigger

Member opens [MemberPortal](src/pages/MemberPortal.jsx) → GC Marketplace tab → mounts [MemberGCMarketplace.jsx](src/components/member/MemberGCMarketplace.jsx).

## Flow A — Buying credits

### Step 1 — Initiate Stripe Checkout

**Handler:** `gc_create_checkout({member_number, amount, payment_method})` ([MemberGCMarketplace.jsx](src/components/member/MemberGCMarketplace.jsx) → [actions/gc/create-checkout.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/gc/create-checkout.ts)).

**Four fixed packages, priced SERVER-SIDE.** `GC_PACKAGES` in that handler is the single source of truth; the client-sent `amount` must be one of its keys and **any client-sent price is ignored**.

| Credits | Price | vs. the $100-per-credit headline |
|---|---|---|
| 1 | `$100` | — |
| 10 | `$950` | **5% off** ($1,000) |
| 20 | `$1,800` | **10% off** ($2,000) |
| 50 | `$4,000` | **20% off** ($5,000) *(added 2026-09-01)* |

The **member** Buy Credits modal ([MemberGCMarketplace.jsx](src/components/member/MemberGCMarketplace.jsx)) renders these as a **4-column comparison table** — struck-through headline price, an *"N% off"* line, the net price, and a **Select** button per column — computing the headline and the discount from `GC_NET_PRICES`, which mirrors the server list **for display only**. The **admin** panel ([GrowthCreditsPanel.jsx](src/components/admin/GrowthCreditsPanel.jsx)) shows the same four as reference cards with a *"Save N%"* line. **All three lists must move together when a package changes**, and the server one is the only one that decides what is charged.

**ACH or card, and the card price is grossed up.** `payment_method` is required and must be `'ach'` or `'card'`. ACH charges the flat package price; **card grosses the charge up so Stripe's 2.9% + $0.30 nets to the flat price** — `chargeCents = round((price + 0.30) / (1 - 0.029) * 100)`, the same formula as `tax/stripe-checkout.ts` and `pipeline/contract-stripe-checkout.ts`. The gross-up amount rides along as `metadata.card_processing_fee`. `payment_method_types[]` is `card` or `us_bank_account`, and the ACH session additionally sets `payment_method_options[us_bank_account][verification_method] = instant`.

Creates a Stripe Checkout Session:

```
mode: payment
success_url: <base>/member?gc_success=1&m=<payment_method>
cancel_url:  <base>/member
payment_method_types[]: card | us_bank_account
line_items[0]:
  price_data.currency: usd
  price_data.unit_amount: <chargeCents>   # grossed up on card, flat on ACH
  price_data.product_data.name: "<credits> Growth Credits - (<member_number>) <Member Name>"
  quantity: 1
payment_intent_data.description: <same memo as the product name>
metadata.member_number: <member_number>
metadata.credits: <credits>
metadata.pipeline: GROWTH_CREDITS          # what the webhook routes on
metadata.card_processing_fee: <fee>        # card only
```

Returns the Checkout URL. Frontend redirects via `window.location.href`.

> **`<base>` is the REQUEST's Origin when allowlisted.** The handler reads the `Origin` header and uses it when it appears in `ALLOWED_ORIGINS` (`constants/allowed-origins.ts`), else falls back to `https://vfoportal.com` — so local dev returns to localhost rather than production.

> **GC purchases DO have a sandbox path — and, since 2026-09-11, an account path too.** The Stripe key comes from **`getStripeKeyFor(stripeAccount, isSandbox)`**, with **both** `isSandbox` and `stripeAccount` loaded from the **`GROWTH_CREDITS`** row of `pipeline_sandbox_config` via `loadSandboxConfig`. (An older note here claimed `STRIPE_SECRET_KEY` unconditionally with no sandbox path; that is no longer true.)

### Step 2 — Client pays on Stripe-hosted page

External to this codebase. Stripe redirects back to `success_url` after payment — `/member?gc_success=1&m=<method>`, so the portal knows which method was used and can say "credits added" for a card versus "settling" for ACH.

### Step 3 — Stripe webhook fulfills the purchase

**Handler:** `fulfillGrowthCredits()` in [router/webhooks.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/router/webhooks.ts), reached through `maybeHandleStripeWebhook()` in the same file (gated by the `stripe-signature` header).

**Routed on `session.metadata.pipeline === "GROWTH_CREDITS"`**, and called from **two** event types so card and ACH cannot drift:

- `checkout.session.completed` — only when `session.payment_status === "paid"`, i.e. **card**. An ACH session completes as `processing`, with the money not yet settled.
- `checkout.session.async_payment_succeeded` — **ACH**, when it settles later.

The helper is **idempotent against Stripe retries** via a `stripe_session_id` guard: it looks for an existing `gc_transactions` row for that session id before crediting. Then:
1. Reads existing `gc_balances.balance` (or 0).
2. UPSERTs `gc_balances` with `balance = current + credits`.
3. INSERTs `gc_transactions` row: `type='purchased'`, `amount=<credits>`, `balance_after=<new>`, `description="<credits> credits purchased via Stripe"`.

See [stripe-webhook.md](stripe-webhook.md#sub-branch-a1--gc-credit-purchase) for full handler detail.

**Tables written:** `gc_balances` (insert/update), `gc_transactions` (insert).
**Chains:** none.

## Flow B — Redeeming credits

### Step 1 — Browse services

**Handler:** `gc_load_services` ([GCMarketplaceViews.jsx](src/components/shared/GCMarketplaceViews.jsx), the shared Services view that `MemberGCMarketplace.jsx` mounts → [actions/gc/load-services.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/gc/load-services.ts)). Reads all `gc_services` rows.

The payload splits by caller role. A **member** gets the active services with `allocated_admin_email` and `scheduling_link` stripped — the allocation is internal routing and the scheduling link reaches them in the confirmation email instead. An **admin** additionally gets `allocated_admin_name` resolved per service (email → `allowed_admins.name`) and a top-level `admins: [{name, email}]` list for the allocation dropdown.

### Step 2 — Initiate redemption

**Handler:** `gc_redeem({member_number, service_id})` ([MemberGCMarketplace.jsx](src/components/member/MemberGCMarketplace.jsx) → [actions/gc/redeem.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/gc/redeem.ts)).

Roughly:
1. Reads `gc_services` for `credit_cost`. **If the service is `monthly`/`yearly`, first refuses a duplicate** — an `active`/`on_hold` `gc_subscriptions` row for this member+service returns **400** *"You already have this recurring service"*, because a second subscription would have the sweep charging twice. (This is what a stale browser tab hits.)
2. Reads `gc_balances` for current balance. Returns error if insufficient.
3. INSERTs `gc_redemptions` row with `status='pending'`, `credits=<credit_cost>`.
4. UPDATEs `gc_balances.balance` -= credit_cost.
5. INSERTs `gc_transactions` row: `type='redeemed'`, `amount=-credits`, `balance_after=<new>`.

**Tables read:** `gc_services`, `gc_balances`.
**Tables written:** `gc_redemptions`, `gc_balances`, `gc_transactions`.

Then two best-effort side effects, each in its own `try/catch` — neither may fail the redemption, since the credits are already spent:

6. **Bell** — `notifyByRule('GC_credits_spent')`. If the service has an `allocated_admin_email`, the bell goes to THAT person ("<Member> has redeemed Growth Credits for <Service>"). Only an unallocated service falls back to the historical routing: the member's assigned MSM, or the whole MSM team with an "assign an MSM" prompt if they have none. The rule's `ASSIGNED_MSM` dynamic token name is retained in all three branches because the `notification_rules` row still refers to it — under allocation it simply carries the allocated team member's address.
7. **Confirmation email** — [utils/gc-redemption-email.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/gc-redemption-email.ts) drafts pipeline `GROWTH_CREDITS` / template `GC_redemption_confirmation` to the member, CC the allocated team member (`TEAM_MEMBER` role token). Draft mode by default (`send_mode = false`) and sandbox-aware via `pipeline_sandbox_config` for `GROWTH_CREDITS`. Tokens: `[Member Name]`, `[Member First]`, `[Service Name]`, `[Credits Spent]` (singular / plural / "0 Growth Credits (free of charge)"), `[Team Member Name]` (falls back to "Our team" when unallocated, which also drops the CC), and `[MEETING_LINK_TEXT]` (the service's `scheduling_link` as a sentence + anchor, empty when there is no link or no allocation).

8. **Subscription open — recurring services only.** A third best-effort step: INSERTs `gc_subscriptions` with `status='active'`, `last_charged_at=now()` and `next_charge_date = addInterval(today, billing_interval)` from the shared [utils/gc-recurring.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/gc-recurring.ts) (UTC, month-end clamped — Jan 31 + monthly is Feb 28/29, **not** Mar 3, which is where a naive `setUTCMonth()` rolls over to). On success the response carries `recurring: {billing_interval, next_charge_date}`, which is what the frontend's success banner reads; on failure it is logged and omitted, never returned as an error, because the credits are already spent.

### Step 3 — Admin processes redemption

**Handler:** `gc_update_redemption({redemption_id, status})` ([actions/gc/update-redemption.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/gc/update-redemption.ts)). `status` must be `fulfilled` or `rejected` (400 otherwise); the stored `gc_redemptions.status` column itself is not DB-constrained.

**Rejecting** a still-`pending` redemption refunds the credits — `gc_balances` is put back and a `gc_transactions` row of `type='refunded'` is filed (*"Redemption rejected — credits refunded"*). Since 2026-08-27 it **also cancels the member+service `gc_subscriptions` row** (`status='cancelled'` + `cancelled_at`, matched on `active`/`on_hold`), or the sweep would keep charging for something VFO has just declined to deliver. Renewals never file a redemption row, so a *rejectable pending* redemption is always the INITIAL one — there is no ambiguity about which subscription is meant.

## Flow C — Admin manual credit adjustment

**Handler:** `gc_add_credits({member_number, amount, description})` ([MembersPanel.jsx](src/components/admin/MembersPanel.jsx) → [actions/gc/add-credits.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/gc/add-credits.ts)).

Updates `gc_balances` and inserts a `gc_transactions` row of **`type='purchased'`** with `description` defaulting to *"Credits added"*. It is **not** `'added'`, as this line claimed until 2026-09-03 — the handler reuses the SALE's type for a comp, so a granted credit is indistinguishable from a bought one by type, and `amount_usd` / `stripe_session_id` are left NULL because no money is taken. Used to manually credit (or, with negative `amount`, debit) a member's balance.

**This conflation reached members.** Both credit histories keyed their label on `type` and so told 27 members across 31 rows that they had *purchased* credits they were given — one of them reported buying credits that appear nowhere in Stripe, correctly, because the portal said so. Since 2026-09-03 every reader derives the word from `stripe_session_id` instead (absent ⇒ *"added"*), and `load-accounting.ts` splits the totals the same way: `credits_purchased` counted 3,257 when 2 credits had ever been sold. **The row is still written as `purchased`** — the fix is at the readers, so anything new reading this table must apply the same test (#466). There is no `created_by` on `gc_transactions`, so **who granted a credit is not recorded anywhere**.

In `ADMIN_ONLY_ACTIONS`. Member callers cannot.

## Flow D — Service catalog management

**Handler:** `gc_manage_service({service_id?, name, credit_cost, description?, category?, active?, allocated_admin_email?, scheduling_link?})` ([actions/gc/manage-service.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/gc/manage-service.ts)). Flat fields, not a `{mode, service}` envelope. Insert or update on `gc_services`. `name` is required and `credit_cost` must be a finite number `>= 0` (0 is a legitimate cost — "Website Exploratory Meeting" is free).

**Delete branch:** `{service_id, mode: 'delete'}`. Runs before the name/cost validation (a delete carries neither), and requires only `service_id`. `gc_redemptions.service_id` is `ON DELETE NO ACTION`, so a service anyone has ever redeemed cannot be deleted — the handler catches Postgres `23503` and returns **400** "This service has redemption history — set it Inactive instead." Redemptions are never cascaded or deleted. The panel surfaces that message through its existing flash.

Also accepts **`billing_interval`** on both insert and update — `one_time` (the default, applied when the key is absent, null or empty) | `monthly` | `yearly`, anything else 400s, and the DB carries the same CHECK. It is the **Frequency** dropdown in the Growth Credits panel (*1 time / Monthly / Yearly*), on both the add-row and every existing row.

Also accepts the two allocation fields, on both insert and update: `allocated_admin_email` and `scheduling_link`. Both are trimmed, an empty string becomes `null`, and a non-null `allocated_admin_email` is rejected with a 400 unless it matches a row in `allowed_admins` — a typo here would silently orphan every redemption of the service. Edited in Automation & Config → Growth Credits ([GrowthCreditsPanel.jsx](src/components/admin/GrowthCreditsPanel.jsx)); the caller always sends the current values alongside whatever it is changing, so saving one field never wipes the others.

Admin-only.

## Flow E — Recurring services (2026-08-27)

### E1 — Making a service recurring

Flow D's `billing_interval`. **One-time is the not-null default, so every pre-existing service is untouched and the whole one-time path above is unchanged.** Nothing about a *service's* cadence retroactively affects redemptions already made — the sweep re-reads the service each night, and flipping a live service back to `one_time` (or inactive) makes its subscriptions skip in place (E3).

### E2 — Subscribing

There is no separate "subscribe" action: **the member redeems the service in the ordinary way** (Flow B), which pays for the first period and files the `gc_redemptions` row the fulfilment queue works off. Step 8 of that flow opens the `gc_subscriptions` row. A duplicate redeem while a live subscription exists is refused (Flow B step 1).

### E3 — The nightly sweep

**Handler:** `automation_GC_recurring_sweep` ([actions/gc/recurring-sweep.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/gc/recurring-sweep.ts)), `PUBLIC_HANDLERS`, service-role `Authorization` gate — modelled on `automation_GROWTH_overdue_sweep`. Cron `gc-recurring-sweep-daily` @ **12:30 UTC**. Returns `{ok, charged, held, skipped}`.

Candidates: `status in ('active','on_hold') AND next_charge_date <= today`. Per row:

1. **Re-read the service.** Missing, `active=false`, or back to `one_time` → **skip in place**, counted in `skipped`. The row keeps its now-past `next_charge_date`, so restoring the service charges it once on the next tick rather than back-billing the gap.
2. **Charge the service's CURRENT `credit_cost`** — a price change applies from the next renewal; nothing is snapshotted on the subscription.
3. **Claim the period optimistically, BEFORE spending anything.** The UPDATE advances `next_charge_date`, stamps `last_charged_at`, sets `status='active'` and clears `on_hold_notified_at`, filtered with `.eq("next_charge_date", <the value this run read>)`, then `.select()`s. Zero rows = another run already claimed this period → skip, balance untouched. Only after the claim lands is `gc_balances` decremented and the `gc_transactions` row filed.
4. **Re-anchor from TODAY, never from the stored due date** (gotcha **#456**). A row funded weeks after going on hold is charged **once** and lands a full period in the future; anchoring on the due date would have it charged every night until it "caught up".
5. **Insufficient balance** → `status='on_hold'` + `on_hold_notified_at` stamped (behind `.is("on_hold_notified_at", null)`, so exactly **one** out-of-credits email per hold episode; later ticks just count as `skipped`). **`next_charge_date` is deliberately NOT advanced** — the member is charged for the period they are actually starting, whenever they fund it.
6. **Renewals write `gc_transactions` ONLY** — `type='redeemed'`, description `"<Service Name> (renewal)"` — and **never** a `gc_redemptions` row. Charge 2..n is not a new request for the fulfilment queue to work, so from the second charge on the ledger is the entire audit trail.

**No weekend skip**, deliberately — unlike the growth-overdue sweep it was cloned from. These are date-anchored charges and member-facing emails, not admin bells landing on a Saturday.

### E4 — The two emails

[utils/gc-recurring-email.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/gc-recurring-email.ts), pipeline `GROWTH_CREDITS`, both fire-and-forget from the sweep and both **draft mode** (`send_mode=false`), To `RECIPIENT` (the member) / Cc `TEAM_MEMBER` (the service's allocated admin). Sandbox-aware via `pipeline_sandbox_config`; a missing or inactive template is a **logged skip**, never an error — the money has already moved. Function replacers throughout (#438).

| Template | Row | When | Tokens |
|---|---|---|---|
| `GC_recurring_renewal` | 244 | Charge 2..n succeeded | `[Member Name]` `[Member First]` `[Service Name]` `[Credits Spent]` `[Credit Balance]` (balance AFTER) `[Team Member Name]` |
| `GC_recurring_out_of_credits` | 245 | The renewal could not be taken; row parked `on_hold` | same, but `[Credits Needed]` in place of `[Credits Spent]`, and `[Credit Balance]` is the balance that fell short |

**No new `notification_rules` key.** The existing `GC_credits_spent` bell fires on the initial redemption only — a renewal is not a new ask, so nobody is rung.

### E5 — Cancelling

Three routes, all landing on `status='cancelled'` + `cancelled_at`:

- **The member**, from the Services tab — `gc_cancel_subscription`.
- **An admin on their behalf**, from MembersPanel → member → Growth Credits → Services — the same action with that member's number.
- **Automatically**, when an admin **rejects** the initial redemption (Flow B step 3).

**No refund and no proration** — the period already paid for stands; cancelling only stops the next charge. `gc_cancel_subscription` sits in `MEMBER_SCOPED_ACTIONS`, which rewrites **only `body.member_number`** — so the handler's `.eq("member_number", …)` **is** the ownership guard (#455), and a zero-row `.select()` returns 404 rather than a false success.

### E5b — Re-anchoring the schedule: `gc_update_subscription_date` (2026-09-09, v820) — ADMIN ONLY

An admin can move a live subscription's schedule from the *"Subscribed - renews «date»"* row (a borderless **Edit date** link beside Cancel, `adminMode` only — a member never sees it). Body `{subscription_id, start_date}`, `start_date` as `YYYY-MM-DD`. The action is in **`ADMIN_ONLY_ACTIONS`** and **deliberately NOT in `MEMBER_SCOPED_ACTIONS`**: it is addressed by subscription id and reads the owning member off the row, so there is no `member_number` in the body for that list to rewrite (#455 — name the field the handler filters on).

**`start_date` IS DAY 1 OF THE CURRENT PERIOD, NOT THE NEXT CHARGE DATE, AND THAT IS THE WHOLE POINT (user decision, "Option B").** `gc_redeem` deducts the service's credits **synchronously** and sets `next_charge_date` one interval out, so a subscriber is **already paid for the period they are sitting in**. Editing `next_charge_date` directly therefore invites a second deduction: a yearly service redeemed 2026-09-09 and "rescheduled" to 09/17/2026 would have taken another 10 credits eight days later — caught by Jake before Save, and indistinguishable from a legitimate renewal afterwards (**#478**). So the handler stores **`next_charge_date = addInterval(start_date, gc_services.billing_interval)`** using the **same `utils/gc-recurring.ts addInterval`** the redeem path and the sweep use, and **no credits move**.

**Refusals:** a date that is not a real calendar date; a `cancelled` subscription; a service that is no longer recurring (`billing_interval='one_time'`); and a `start_date` whose computed renewal is **before today UTC**, which would charge on the very next sweep. The UPDATE also carries an optimistic **`.eq("next_charge_date", <the value just read>)`** and returns **409** if the sweep moved the row underneath the edit.

**What the admin sees.** Dialog *"Reschedule recurring service"*: *"Set the date «service» starts. It currently starts «renewal minus one interval»."* + a date input + a live derived line *"Renews «start + interval», then every month|year. No additional credits are taken."* — red, with Save disabled, when the computed renewal is already past. On success the banner reads *"«service» now starts «d» and renews «the SERVER-derived renewal». No additional credits were taken."* `addIntervalLocal` / `subIntervalLocal` in `GCMarketplaceViews.jsx` mirror the backend's month-end clamping and say so in a comment; the displayed renewal after Save is the server's value, not the mirror's.

### E6 — What the member and the admin see

Both surfaces render the **same component**, [GCMarketplaceViews.jsx](src/components/shared/GCMarketplaceViews.jsx) (`GCServicesView` + `GCTransactionHistory`), so they cannot drift; `adminMode` only changes copy and hides Buy-credits. A recurring row reads `N credits / month|year`; a live subscription replaces Redeem with a **Subscribed — renews \<date\>** pill (or **On hold — add credits to resume**) plus a Cancel behind a confirm modal, and the recurring redeem modal spells the repeat charge out before anything is spent.

## Tables touched (composite)

- **Read:** `gc_services`, `gc_balances`, `gc_transactions`, `gc_redemptions`, `gc_subscriptions`.
- **Written:** `gc_balances` (upsert), `gc_transactions` (insert), `gc_redemptions` (insert/update), `gc_services` (insert/update/delete), `gc_subscriptions` (insert/update).

## Downstream chains

- Stripe purchase → Stripe webhook is the only chain trigger. The webhook is not chained to anything else (no email, no notification).
- `automation_GC_recurring_sweep` chains nothing; its two emails are drafted in-process.

## Frontend touch-points

- [MemberGCMarketplace.jsx](src/components/member/MemberGCMarketplace.jsx) — member view. Calls `gc_load_balance`, `gc_load_transactions`, `gc_create_checkout`; its Services/History tabs are the shared views below.
- [GCMarketplaceViews.jsx](src/components/shared/GCMarketplaceViews.jsx) — the shared Services + History views. Calls `gc_load_services`, `gc_load_subscriptions`, `gc_redeem`, `gc_cancel_subscription`.
- [MembersPanel.jsx](src/components/admin/MembersPanel.jsx) `MemberGC` — admin view per-member, sub-tabs **Dashboard | Services | History**. Dashboard is admin-only (balance, stats, `gc_add_credits`); Services and History are the shared views, passed the member's number so an admin can redeem or cancel on their behalf.

## Auth

- `gc_redeem`, `gc_add_credits` and `gc_create_checkout` are all NOT in `ADMIN_ONLY_ACTIONS`. `gc_create_checkout` sits in **`MEMBER_SCOPED_ACTIONS`** ([constants/role-gates.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/constants/role-gates.ts)), so a member calls it for their own `member_number` — the router rewrites `body.member_number` to the caller's — and the price is derived server-side from `GC_PACKAGES` rather than from the request. An earlier admin-only gate here **did** 403 the member purchase flow; it was fixed together with server-side pricing (**GOTCHAS #210**).

## Failure modes

1. **Purchase lag between the redirect and fulfillment — real, but no longer silent.** The balance still only rises when the webhook lands, so there is always a window after Stripe returns the buyer. **The size of it depends entirely on the method, and the UI now says so** (`MemberGCMarketplace.jsx`, off the `&m=` param on the return URL): a **card** payment settles in seconds, so the portal shows *"Payment received. Adding your credits…"* and **polls `gc_load_balance` every 3s for up to 30s**, confirming with the new balance the moment it rises; an **ACH** payment settles over **days**, so it shows a persistent (non-dismissing) banner explaining that the credits will appear automatically once the transfer clears. The remaining exposure is a card purchase whose webhook takes longer than the 30s poll — the banner simply stops updating and the balance is correct on the next load.
2. **Webhook double-credit — GUARDED.** `fulfillGrowthCredits()` in `router/webhooks.ts` looks for an existing `gc_transactions` row carrying the same **`stripe_session_id`** before crediting anything, so Stripe's at-least-once redelivery cannot double-credit a purchase. Routing is on **`session.metadata.pipeline === "GROWTH_CREDITS"`**, and the helper is shared by the two events that can fulfill one — `checkout.session.completed` **only when `session.payment_status === "paid"`** (card; an ACH session completes as `processing`) and `checkout.session.async_payment_succeeded` (ACH, on settlement) — so the card and ACH paths cannot drift and cannot both credit the same session. *(This doc previously said the handler did NOT check for prior fulfillment. That is stale.)*
3. **`gc_redeem` race** — the balance check + decrement are not in a DB transaction. Two concurrent redemptions could oversell. Probably benign at low volume. **Still open** — unlike the purchase path, there is no session-id equivalent to latch on.
4. **Rejected redemption — REFUNDED AUTOMATICALLY, no admin action needed.** `actions/gc/update-redemption.ts` on `status='rejected'` re-reads the redemption, and **only if it is still `pending`** credits `gc_redemptions.credits` back to `gc_balances` and appends a `gc_transactions` row of type **`refunded`** (*"Redemption rejected — credits refunded"*). It also **cancels any `active`/`on_hold` `gc_subscriptions` row** for that member + service, so the recurring sweep stops charging for something VFO just declined to deliver (renewals never file a redemption row, so a rejectable pending one is always the INITIAL redemption). The `pending` test is what stops a second rejection click from refunding twice. *(This doc previously said an admin had to refund by hand with `gc_add_credits`; that contradicted Flow B step 3, and step 3 was the correct one.)*

## Open questions

1. ~~The admin-only gate on `gc_create_checkout`~~ — **resolved**: it is `MEMBER_SCOPED`, see the Auth note (#210).
2. ~~Webhook idempotency~~ — **resolved**: the `stripe_session_id` lookup in `fulfillGrowthCredits()` is the dedupe, so Stripe's `delivery_attempt` header does not need to be read. See failure mode 2.

## Cross-references

- Marketplace tables: [../tables/marketplace-gc.md](../tables/marketplace-gc.md)
- Stripe webhook handler detail: [stripe-webhook.md](stripe-webhook.md#sub-branch-a1--gc-credit-purchase)
- Stripe API: [../integrations/stripe.md](../integrations/stripe.md)
