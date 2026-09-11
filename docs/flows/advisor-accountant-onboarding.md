# Advisor / Accountant onboarding — Stage 1, the meeting reminder ladder, the deposit and the balance charge

The two pipelines are a **file-for-file clone** of one another: `actions/advisor/*` and `actions/accountant/*`
hold the same handlers with the table, the pipeline key, the `<PREFIX>` and the noun swapped. Every statement
below is true of both unless it names one. Any advisor-shaped constant found inside the accountant clone is a
bug, not a variant (**#329**).

Upstream of Stage 1: an accountant may arrive here from Partnership Fast Track — see
[partnership-fast-track.md](partnership-fast-track.md), which owns the handoff, the `accountant_type` split and
the `'Request no meeting'` fast path. Stopping an onboarding (`status` `'active' | 'stopped'`) is documented in
that file too and is unchanged by this rework, except that a stopped row now also silences the meeting ladder.

---

## Which Stripe account an onboarding bills on *(2026-09-11, v829)*

Onboarding money — **deposit, balance, paid-in-full and refund** — is one of the three flows now billed on the **ERT** Stripe account (Elite Resource Team LLC); the other two are member membership fees and Growth Credit purchases. Full rules: [../integrations/stripe.md](../integrations/stripe.md#two-stripe-accounts-2026-09-11).

**CONFIG MINTS.** The `ADVISOR_ONBOARDING` / `ACCOUNTANT_ONBOARDING` rows of `pipeline_sandbox_config` each gained **`stripe_account`** (`'vfos'` default, `CHECK IN ('vfos','ert')`). It decides which account a **NEW** Stripe customer is minted on, and is flipped **by SQL, never from the UI**. **Both rows are `'ert'` as of 2026-09-11 ~16:10Z.**

**THE ROW STAMP GOVERNS.** `advisor_onboarding.stripe_account` / `accountant_onboarding.stripe_account` are nullable; **NULL = legacy = `vfos`**. Every later Stripe call for that row resolves its key as `getStripeKeyFor(normalizeStripeAccount(ob.stripe_account), isSandbox)` — the row's stamp for the account, the pipeline config for the mode.

| Handler (`<p>` = `advisor` \| `accountant`) | Account source |
|---|---|
| `automation_<P>_depositemail` (`actions/<p>/deposit-email.ts`) | **Reuse-or-mint:** `ob.stripe_customer_id ? normalizeStripeAccount(ob.stripe_account) : cfgStripeAccount`. Writes the stamp **only when it mints** — `...(ob.stripe_customer_id ? {} : { stripe_account: stripeAccount })`. |
| `automation_<P>_stripecustomer` (`stripe-customer.ts`) | Same reuse-or-mint rule; stamps `stripe_account` alongside `stripe_customer_id` in the same update. |
| `automation_<P>_stripecheckout` (`stripe-checkout.ts`) | `ob.stripe_account` |
| `automation_<P>_chargebalance` (`charge-balance.ts`) | `ob.stripe_account` |
| `automation_<P>_depositrefund` (`deposit-refund.ts`) | `ob.stripe_account` |

**No charge path ever re-stamps a row.** A Stripe customer id is valid on exactly one account, so re-stamping would strand it. Neither onboarding table has a remap action; membership is the only family that does.

**The two pipelines are the only ones that genuinely run on BOTH accounts**, which is why the webhook cannot identify their rows by Stripe customer id alone. The advisor and accountant lookups on `checkout.session.completed` and `payment_intent.succeeded`, inside `handleOnboardingDepositFailure`, and in `resolveStripeFirstPaymentFailure` all pass the event's account through **`withStripeAccount(query, account)`** before `.maybeSingle()`. The four onboarding PaymentIntent expansions read the key from the **row stamp**, not the config, and now log a non-ok fetch. See [stripe-webhook.md](stripe-webhook.md).

**Clone parity holds.** The account-selection lines in `charge-balance.ts`, `deposit-refund.ts`, `stripe-checkout.ts` and `stripe-customer.ts` are **byte-identical** between `actions/advisor/` and `actions/accountant/`; only `deposit-email.ts` differs, and only in line numbers. The accountant side is therefore **code-proven but not live-exercised** — see OWED below.

**LIVE ON ERT since 2026-09-11 ~16:10Z.** Both `ADVISOR_ONBOARDING` and `ACCOUNTANT_ONBOARDING` config rows were flipped by SQL to **`stripe_account='ert'` with `sandbox_mode=false`**, so **every NEW onboarding customer is minted on ERT**. **Every EXISTING row keeps its `'vfos'` stamp and continues to charge on VFO Services** — there is no remap for these two tables, and none is needed: an onboarding's money is collected once and then done.

**VERIFIED LIVE 2026-09-11 — advisor, two tests** (each run with sandbox ON + `stripe_account='ert'`).

- **Onboarding 30, "Test ERT" — the deposit + balance legs.** The deposit email minted an ERT customer and stamped `ert`; the **$500** deposit paid → `succeeded`, fee **$15.24** read off the ERT PaymentIntent, confirmation drafted. BoldSign sandbox sign + countersign then drove `automation_ADVISOR_chargebalance`, which charged the **$1,500** remainder **off-session on ERT 3 seconds later** — fee **$45.11**, **INV-ADV30-0058** + **REC-ADV30-0084**, and the "ready to create" bell **1986**.
- **Onboarding 31, "TEst Deposit" — the refund leg.** A **$550** deposit paid on ERT (`pi_3UEWxeA6agMWAt8d1Nf1xDGz`, fee **$16.74**), then the admin **Refund deposit** button refunded the full **$566.74** on ERT (`re_3UEWxeA6agMWAt8d1UQok7sC`) → `deposit_refund_status='succeeded'`, the row stopped, the refund email sent. The generic **`charge.refunded`** bell arrived titled **"Refund issued — $566.74 (charge ch_…) [ERT]"** — **the first proof that the ERT endpoint delivers `charge.refunded` and that the `[account]` tag renders.** That matters beyond this pipeline: the dispute/refund branches do **no row lookup at all**, so the bell title is the only place the account can appear, and until this run nothing had exercised it.

**OWED on this pipeline:** the **accountant** clone on ERT — still **code-proven only** (the account-selection lines are byte-identical to advisor's in `charge-balance.ts`, `deposit-refund.ts`, `stripe-checkout.ts` and `stripe-customer.ts`; only `deposit-email.ts` differs, and only in line numbers). And **every failure / bounce / canceled / dispute branch on an ERT event** — `charge.refunded` is now the one that **is** proven.

---

## Stage 1 — strictly sequential since 2026-09-04 (v811)

Stage 1 renders as a tax-style locked cascade: each step is greyed with a lock icon and a hint until the step
above it is answered. The locks are choreography; **every one of them is backed by a handler 400** (#403).

| # | Step | Unlocks when | Backing refusal |
|---|---|---|---|
| 1 | **Team Member Responsible** | — | `meeting-reminder.ts` 400s without one — the bells route to this person |
| 2 | **Meeting Reminder Setup** *(NEW)* | a team member is picked | — |
| 3 | **Preliminary Meeting** | the reminder was **sent or skipped** | `prelim-meeting.ts`: *"Send or skip the meeting reminder first"* |
| 4 | **Deposit** *(NEW)* [advisor] / **Direct or Advisor Partnership** + **CC Connected Advisor** [accountant] | *advisor:* outcome = `Completed - Send Deposit` · *accountant:* the outcome is set and is not `No Show` | *advisor:* see *Deposit* below · *accountant:* `save-partnership.ts` |
| 5 | **Implementation value (including deposit)** [advisor] / **Deposit** *(NEW)* [accountant] | *advisor:* the deposit step is settled or absent · *accountant:* a partnership is picked | *accountant:* `deposit-email.ts` 400s *"Select Direct or Advisor Partnership first"* |
| 6 | **Preliminary Meeting Decision** | step 5 answered | — |

**The two pipelines diverge at steps 4 and 5, since 2026-09-08 (v818).** The advisor order is the original one.
On the **accountant** side the Deposit moved BELOW *Direct or Advisor Partnership* + *CC Connected Advisor*,
because the partnership choice is what sets the deposit's maximum (see *Sending the link*) — asking for the
money first would mean capping it against an answer nobody had given yet. The two new locks read
*"Complete the Preliminary Meeting step first"* (or *"Preliminary meeting was a no-show"*) on the Partnership
row and *"Select Direct or Advisor Partnership first"* on the Deposit row. **Once the deposit link is out the
partnership select is disabled** (tooltip *"A deposit link has already been sent"*) and `save-partnership.ts`
400s the same change — the cap must not move under a link that has already been priced against it.

**The reminder prerequisite only fires when `prelim_meeting_status` is currently NULL.** That is deliberate:
pre-existing rows that already carry an outcome are never forced back through a reminder they cannot arm.

**Preliminary Meeting outcome vocabulary** (bare `text`, no CHECK — #431; the allowlist lives in
`prelim-meeting.ts` as `PRELIM_STATUSES`):

- `Completed - Send Deposit` — unlocks the Deposit step.
- `Completed - No Deposit` — skips it. **Legacy `'Completed'` rows read and display as this**; there was no
  backfill, so both values are live in the column.
- `No Show` — auto-stops the onboarding (`status='stopped'`) and leaves the decision step locked.
- `Request no meeting` — **the STORED value is unchanged on purpose**, because `actions/pft/ft-response.ts`
  writes that exact literal on the PFT fast path; only the UI label changed, to *"Requested no meeting"*.

**Once a deposit link has gone out the outcome cannot be moved off `Completed - Send Deposit`** —
`prelim-meeting.ts` 400s on `deposit_email_sent_at` being set. All Stage 1 completion dates are now fixed
`MM/DD` text: `StepDate` editing was removed from both components, so the backend action
`save_onboarding_step_date` still exists and is still gated but **has no frontend caller**.

Opening an onboarding writes `?onboarding=<id>` to the URL, so a reload stays on the record.

---

## Meeting Reminder Setup — a COUNTDOWN ladder

Two buttons: green **Send reminder (with date)** and grey **Skip reminder**.

The green button opens date / time / timezone (**time is required**) and confirms with
*"This reminder will be sent to the prospective advisor 1 business day before the meeting."*
`automation_{ADVISOR,ACCOUNTANT}_meetingreminder` (AUTH, admin-only) then writes:

- `meeting_date` / `meeting_time` / `meeting_timezone` — what the admin typed;
- `meeting_at` — that wall clock resolved to an instant;
- `meeting_reminder_due_at` — **the same wall clock one BUSINESS day earlier**, via
  `reminderDueAt()` in `utils/onboarding-meeting.ts`;
- `meeting_reminder_token` — the credential for the public response page;
- `meeting_reminder_scheduled_at` — the step's own done-stamp.

Skip writes `meeting_reminder_skipped_at` and nothing else.

### Reschedule RE-ARMS everything — the opposite of #404

Reschedule reopens the same form and **nulls `meeting_reminder_sent_at`, `meeting_reminder_60m_sent_at`,
`meeting_reminder_10m_sent_at` AND `meeting_response` / `meeting_response_at`.** A countdown ladder chases an
instant that has moved, so re-arming is the correct behaviour — the exact inverse of the forward ladders in
**#404**, where a resend must NOT re-stamp. Clearing the recorded response with the stamps is the part that is
easy to miss: a stale `confirm` would let the 60- and 10-minute tiers fire against a meeting nobody has
re-confirmed. See gotcha **#472**.

### The cron — `onboarding-meeting-reminder-sweep-5min` (pg_cron jobid 18)

`*/5 * * * *` → PUBLIC `automation_ONBOARDING_MEETING_sweep`
(`actions/onboarding/meeting-reminder-sweep.ts`, service-role bearer required). One handler, both pipelines,
three tiers, each stamping its guard column **only after the email actually went out**, and **every query
filters `status='active'`** so a stopped row is silent across all three:

| Tier | Fires when | Template |
|---|---|---|
| (a) reminder | `meeting_reminder_due_at <= now` **AND `meeting_at > now`**, scheduled, not sent, not skipped | `<PREFIX>_meeting_reminder` |
| (b) 60 minutes | `meeting_at` within 60 min **and `meeting_response='confirm'`** | `<PREFIX>_meeting_reminder_60m` |
| (c) 10 minutes | `meeting_at` within 10 min **and `meeting_response='confirm'`** | `<PREFIX>_meeting_reminder_10m` |

The `meeting_at > now` half of tier (a) is what makes a meeting booked *inside* the one-business-day window
send on the next 5-minute tick instead of never.

**All six template rows (3 tiers × 2 pipelines) are `send_mode=true` — real sends, no human in between.**
That took the auto-send census from ELEVEN to **SEVENTEEN** (#325). It is deliberate: a draft nobody sends in
time is not a reminder. While a pipeline's `pipeline_sandbox_config` toggle is on they route to the sandbox
address like every other email (#324).

**Since 2026-09-08 the WHOLE of both pipelines auto-sends — census 17 → 31 (#325).** Migration
`20260908150000_onboarding_reminders_deposit_send_mode.sql` flipped the remaining **14** rows: per pipeline the
four stall reminders (`<PREFIX>_undecided_reminder`, `_signing_reminder`, `_payment_reminder`,
`_deposit_reminder`) and the three deposit emails (`_deposit_payment_link`, `_deposit_received`,
`_deposit_refund`). **No code changed** — every sender here already runs through `gmailDraftFetch` /
`deliverRaw`, which dispatch on the flag alone. Two consequences worth holding on to: the stall reminders are
produced by a **cron** and now reach prospects with no human anywhere in the loop, the first mail in the system
of which that is true; and per **#428** the flip is a **UI edit too** — the refund confirm dialog in both
onboarding components was re-worded from *"draft the refund email"* / *"drafts an email to the
advisor|accountant"* to *"send"* / *"emails"*, because draft-era copy invites a second click and a duplicate
real send.

### The response page

Each reminder carries **✓ Confirm / ✗ Cancel / Reschedule** buttons →
`/onboarding-meeting?token=<meeting_reminder_token>&response=confirm|cancel|reschedule`
(`src/pages/OnboardingMeetingPage.jsx`, route 34 of 34). The page **shows a confirmation card and records
nothing until the visitor clicks it** (#290), then calls PUBLIC `automation_ONBOARDING_meetingresponse`
(`actions/onboarding/meeting-response.ts`), which is **idempotent on `meeting_response`**: the first click is
recorded and every later click returns `existing_response`.

Each response raises an FYI bell (`dismissible`, not action-required) to the **Team Member Responsible** via the
`TEAM_MEMBER` dynamic token — `<PREFIX>_meeting_confirmed` / `_cancelled` / `_reschedule`. The reschedule
response page currently says *"We will be in touch shortly to arrange a new time."*

### Zoom + calendar links

Per-team-member maps `TEAM_MEMBER_ZOOM_LINKS` / `TEAM_MEMBER_CALENDAR_LINKS` in
`constants/onboarding-team.ts`. **Both are entirely BLANK today** (owed from Jake). Blank is a supported state,
not a bug: `zoomLine()` renders *"The Zoom link for the meeting will be sent separately."* and the rebooking
link is dropped from the email.

### Team Member Responsible roster

The dropdown is `ONBOARDING_TEAM_MEMBER_NAMES` — **Ian Welham, Vanessa Smith, Rachael Hopson, Jake Latham**.
The New Model Sale modal keeps the wider `SALES_TEAM_NAMES`; the two lists are deliberately different sizes.
`"Jake Latham"` → `jlatham@elitert.com` was added to `TEAM_MEMBER_LOGIN_EMAILS` so his bells resolve.

---

## The refundable Membership Deposit

### Sending the link

Amount (inclusive, at most 2 decimals; enforced in `deposit-email.ts` with a 400) →
`automation_{ADVISOR,ACCOUNTANT}_depositemail` (AUTH, admin-only):

| pipeline | minimum | maximum |
|---|---|---|
| **advisor** | $500 | **$4,000** |
| **accountant**, `accountant_partnership = 'No accountant partnership'` (**Direct**) | $500 | **$4,000** |
| **accountant**, `accountant_partnership = 'Accountant Partnership'` (**Advisor**) | $500 | **$2,000** |

**The accountant cap is partnership-dependent as of 2026-09-08 (v818)** — an Advisor-partnership accountant
pays a $2,000 baseline, so the deposit cannot exceed it. The hint under the field reads *"Minimum $500,
maximum $2,000"* / *"$4,000"* and the Send button gates on the same number; `deposit-email.ts` enforces it
server-side and **400s *"Select Direct or Advisor Partnership first"* when the partnership is still NULL** —
a state the UI's lock makes unreachable, which is the point (#403). The advisor pipeline is unchanged.

1. **Creates the Stripe customer EARLY if it is missing** — the deposit is now the first thing that needs one.
2. Mints `deposit_checkout_token`.
3. Sends `<PREFIX>_deposit_payment_link` (`send_mode=true` since 2026-09-08 — **this leaves for the prospect
   with nobody reviewing it**), stamps `deposit_email_sent_at` and `deposit_amount`.

### The pay page serves BOTH legs

`/advisor-pay` and `/accountant-pay` are unchanged pages serving a second token kind. `load-payment.ts` and
`stripe-checkout.ts` resolve **`checkout_token` first, then `deposit_checkout_token`**. A deposit session
carries `payment_kind='onboarding_deposit'` **on the session metadata AND on the PaymentIntent metadata**, plus
`setup_future_usage=off_session` so the balance can reuse the method. The pages label the two legs
*"Membership Deposit"* / *"Balance Payment"* and print the total / deposit / due-now line.

### Webhook branches

`router/webhooks.ts`, all of them keyed on metadata, never on the customer — **one Stripe customer now carries
two legs** (gotcha **#473**):

- **`checkout.session.completed`** — a NEW deposit branch guarded by `session.metadata.payment_kind`, placed
  **ahead of** the old onboarding-payment block. Books `processing` (ACH) or `succeeded` (card) and chains
  PUBLIC `automation_<P>_depositconfirmation` → `<PREFIX>_deposit_received`. **Both card and ACH get that
  email** — a documented exception to the #287 purchase-email policy, because no receipt is issued until the
  onboarding payment itself completes, so this is the only acknowledgement the deposit ever gets. The branch
  carries a redelivery latch (#327): a settled deposit is never re-booked and a processing one only by a
  different PaymentIntent.
- **`payment_intent.succeeded`** — branches on `pi.metadata.payment_kind`:
  `'onboarding_deposit'` settles the deposit and, **if `balance_charge_status='awaiting_deposit'` and the
  agreement is countersigned, chains `_chargebalance`**; `'onboarding_balance'` settles the balance, chains
  the invoice/receipt and writes `balance_charge_status='succeeded'`.
- **`checkout.session.async_payment_failed`** → `handleOnboardingDepositFailure` (`deposit_status='failed'`,
  action bell to Jake, and **re-chains `_stripecustomer` if a countersign was parked on it** — with the
  deposit gone the whole fee is owed, so the ordinary payment-link route resumes).
- **`payment_intent.payment_failed`** → the same deposit helper, or `handleOnboardingBalanceFailure` for a
  bounced balance (`payment_status='declined'`, `balance_charge_status='failed'`, Jake bell
  `<PREFIX>_balance_charge_failed` (action-required), and a **fresh `/advisor-pay` link for the balance**).
- **The generic first-payment failure resolver now SKIPS both onboarding legs** — it writes `payment_status`,
  which belongs to the onboarding payment and not to the deposit.

### The 4th stall ladder + AI PC Admin

`actions/{advisor,accountant}/sweep.ts` gained tier **(d)**: rules `<PREFIX>_stall_deposit_email`
(2 business days, to the prospect) and `<PREFIX>_stall_deposit_bell` (4 business days, to the Team Member),
template `<PREFIX>_deposit_reminder`, ack column **`deposit_pf_ack_at`** — whitelisted in
`actions/automation/stall-ack.ts` under `stall: 'deposit'`. That whitelist entry deliberately carries **no
extra-meeting bell coupling**: the deposit is sent before the decision email, so no extra-meeting bell can
belong to this step. AI PC Admin sub-steps render the ladder under the Deposit row like every other stall.

### Refund

A clone of the tax deposit-refund step. `automation_{ADVISOR,ACCOUNTANT}_depositrefund` (AUTH, admin-only,
`ADMIN_ONLY_ACTIONS`) refunds the deposit PaymentIntent **in full**, then writes
`deposit_refund_status='succeeded'`, `deposit_status='refunded'` and **`status='stopped'`** — a refund ends the
onboarding — and **sends** `<PREFIX>_deposit_refund` (`send_mode=true` since 2026-09-08) with a required `[Refund Reason]`, plus bell
`<PREFIX>_deposit_refunded` to the Team Member.

Refusals: already refunded · no `deposit_payment_intent_id` · `deposit_status !== 'succeeded'` ·
**`payment_status` is `succeeded` or `processing`** (*"refund it from Stripe"* — the portal will not unwind a
collected engagement).

---

## The money fork at CEO countersign

`actions/{advisor,accountant}/stripe-customer.ts` **no longer early-returns on an existing Stripe customer**
(the deposit step may already have made one). It creates the customer if missing, then forks on
`deposit_status`:

| `deposit_status` | Route | Effect |
|---|---|---|
| `succeeded` | `balance` | chains PUBLIC `automation_<P>_chargebalance`. **No link, no payment email.** |
| `processing` | `awaiting_deposit` | writes `balance_charge_status='awaiting_deposit'` and stops. Released by the deposit's own `payment_intent.succeeded` branch. |
| anything else | `link` | the original behaviour: mint `checkout_token`, chain `_paymentemail` |

`actions/{advisor,accountant}/charge-balance.ts` is copied from `tax/charge-final-retainer.ts`: an off-session
PaymentIntent on the deposit's saved method, card **grossed up** as `(base + 0.30) / 0.971`, metadata
`payment_kind='onboarding_balance'`, idempotency key `adv-balance-<id>-<pm>-<date>` /
`acct-balance-<id>-<pm>-<date>` (logical and date-scoped, #228). `amountDue <= 0` takes a **paid-in-full**
path with no PaymentIntent at all. A decline writes `payment_status='declined'`, raises the action-required
Jake bell and mints a fresh payment link.

**`payment_amount` keeps its meaning: the TOTAL engagement value.** `load-payment.ts`, `stripe-checkout.ts`,
`payment-email.ts` and every webhook fee base **net a settled deposit off it**. A card deposit that is not
netted off records a huge negative fee, which is what the netting exists to prevent.

**TRAP — `payment_amount` carries a column DEFAULT of `4000`.** Before countersign prices the engagement, that
default is indistinguishable from a written value, so the frontend gates every derived balance figure on
`agreement_signed_by_ceo_at` instead. Gotcha **#469**.

---

## Email wording that had to move with the money

- **`<PREFIX>_agreement_sent`** — the sentence promising *"a separate email with a secure payment link"* became
  the **`[PAYMENT_NEXT_STEP]`** token. `send-agreement.ts` renders the ORIGINAL sentence when there is no
  deposit and the balance sentence when there is, so a no-deposit row reads exactly as before.
- **`<PREFIX>_payment_link`** — gained **`[Deposit Note]`** after the Total Payment line. The handler renders
  `""` when no deposit settled, so the line is inert on an ordinary link and only appears on the fresh-link
  fallback after a declined balance.

Both edits shipped as data migration `20260908120000_onboarding_deposit_wording.sql`.

---

## ONE invoice + ONE receipt, deposit-aware

`actions/{advisor,accountant}/invoice-receipt.ts`. The schedule gains **Deposit** and **Balance Payment** rows,
each with its own card-fee and *Total Charged* rows — or a single **Deposit (paid in full)** row when the
deposit covered everything. The Payment Plan label reads *"Deposit + Balance"* / *"Deposit (paid in full)"* /
*"One-Time Payment"*, and the receipt gains a **Payment Breakdown** box.

**The no-deposit output is byte-identical to before**, which the `invoiceShellHtml` split was extracted to
guarantee. One small unrequested behaviour change rode along: **accountant money formatting now matches
advisor** — it used to drop cents.

---

## Stage 2 rows are deposit-aware

- The payment-link row is **hidden when a deposit is on file** (unless the fallback link exists).
- *"Payment collected"* becomes *"Remaining payment collected after deposit"*.
- **Both are hidden when the deposit covers the total**, replaced by *"Deposit covered the full onboarding
  payment"*.
- An info line reads *"Deposit of $X received … · balance calculated at countersign / balance due $Y /
  nothing further due"* — **the balance figure only appears once `agreement_signed_by_ceo_at` is set**, for the
  `payment_amount` default reason above.

---

## Once-only CEO countersign stamp

BoldSign **redelivers `Completed`**, and the advisor/accountant branch in `router/webhooks.ts` wrote
`agreement_signed_by_ceo_at: nowIso` unconditionally, re-stamping the signature date on every redelivery. It is
now `advisor.agreement_signed_by_ceo_at || nowIso` on both pipelines. Gotcha **#470**. `boldsign-webhook`
itself was NOT touched (still v40).

---

## Backend files

`actions/advisor/` and `actions/accountant/` (identical sets): **new** `meeting-reminder.ts`,
`deposit-email.ts`, `deposit-confirmation.ts`, `deposit-refund.ts`, `charge-balance.ts`; **changed**
`prelim-meeting.ts`, `stripe-customer.ts`, `stripe-checkout.ts`, `load-payment.ts`, `payment-email.ts`,
`send-agreement.ts`, `invoice-receipt.ts`, `sweep.ts`; **2026-09-08 (v818)** `accountant/deposit-email.ts` (the
partnership cap + the NULL-partnership 400) and `accountant/save-partnership.ts` (frozen once a link is out).
Shared: `actions/onboarding/meeting-reminder-sweep.ts`, `actions/onboarding/meeting-response.ts`,
`utils/onboarding-meeting.ts`, `constants/onboarding-team.ts`, `actions/automation/stall-ack.ts`,
`router/webhooks.ts`, `router/dispatch.ts`, `constants/role-gates.ts`.

**Actions (12 new).** AUTH + `ADMIN_ONLY_ACTIONS`: `automation_{ADVISOR,ACCOUNTANT}_meetingreminder`,
`_depositemail`, `_depositrefund`. PUBLIC: `automation_{ADVISOR,ACCOUNTANT}_depositconfirmation`,
`_chargebalance`, plus `automation_ONBOARDING_MEETING_sweep` and `automation_ONBOARDING_meetingresponse`.

## Frontend

`src/components/admin/AdvisorOnboarding.jsx` + `AccountantOnboarding.jsx` (the locked Stage 1 cascade, the
reminder form, the deposit + refund cards, the deposit-aware Stage 2 rows),
`src/pages/AdvisorPayPage.jsx` + `AccountantPayPage.jsx` (the two payment-kind labels),
`src/pages/OnboardingMeetingPage.jsx` (`/onboarding-meeting`, added to `scripts/emit-route-pages.mjs`,
33 → **34** route pages).
