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

## Stage 1 — strictly sequential (since 2026-09-04, v811; one shared step order since 2026-10-07, v949)

Stage 1 renders as a tax-style locked cascade: a locked step shows the same red no-entry icon (`LockedIcon`) and
grey hint as Tax in place of its control. The locks are choreography; **every one of them is backed by a handler
400 carrying the SAME hint** (#403).

**ONE step order, mirrored across the two repos.** The order, every lock and every hint come from a pair of files
that must change together — a cross-repo contract, labels included, because the hint quotes the label:

- frontend `src/components/admin/onboardingOrder.js`
- backend `utils/onboarding-order.ts`

Both export `stage1Steps(ob, pipeline)`, `stage1Lock(ob, pipeline, key)`, `depositStepDone(ob)`,
`paymentStepLabel(ob)`, `createMemberLock(ob, pipeline)` and `lockHint(label)` = `Complete "<label>" first`.

| # | Step (`key`) | On which rows | Done when |
|---|---|---|---|
| 1 | **Team Member Responsible** (`team`) | both | `onboarding_team_member` is set |
| 2 | **Meeting Reminder Setup** (`reminder`) | **advisor only** (left Accountant Onboarding 2026-11-13: never used on live, 0 of 22 scheduled, 12 skipped) | `meeting_reminder_scheduled_at` or `meeting_reminder_skipped_at` is set, **or any Preliminary Meeting outcome is recorded** — the PFT `'Request no meeting'` fast path writes an outcome with no reminder |
| 3 | **Preliminary Meeting** (`prelim`) | both | an outcome is set and it is not `No Show` |
| 4 | **Direct or Advisor Partnership** (`partnership`) | accountant | `accountant_partnership` is set |
| 5 | **CC Connected Advisor** (`cc_advisor`) | accountant, only when `accountant_partnership = 'Accountant Partnership'` | `cc_advisor_email` is set — **required** on that path |
| 6 | **Deposit** (`deposit`) | both, only when the outcome is `Completed - Send Deposit` | `deposit_confirmation_email_sent_at` is set **AND** `deposit_status` is `succeeded` or `processing` |
| 7 | **Implementation value (including deposit)** (`impl`) | advisor | `implementation_value_vfo_ft` and `implementation_value_pft` are both `> 0` |
| 8 | **Preliminary Meeting Decision** (`decision`) | both | `prelim_meeting_decision` is set |

So the advisor runs 1-2-3-(6)-7-8 and the accountant 1-2-3-4-(5)-(6)-8. **On the accountant side the Deposit sits
BELOW the partnership steps** because the partnership choice sets the deposit's maximum (see *Sending the link*) —
asking for the money first would cap it against an answer nobody had given yet.

**The lock rule (`stage1Lock`).** A step is locked while ANY step above it is unfinished. The hint names the step
DIRECTLY above it when that one is unfinished, otherwise the first unfinished step above —
`Complete "<step name>" first`; when that step is a `No Show` Preliminary Meeting the hint reads *"Preliminary
meeting was a no-show"*. **A step that is already done is never locked**, so legacy rows keep rendering what they
hold.

**The Deposit counts as done only once its confirmation email is out on a paid or clearing deposit**
(`depositStepDone`). The Deposit row itself shows done as soon as the link is sent (`deposit_email_sent_at`), but
the step BELOW it stays locked with `Complete "Deposit" first` until `deposit_confirmation_email_sent_at` is set
and `deposit_status` is `succeeded` or `processing` — so an ACH deposit unlocks the next step once its
confirmation email has gone out, while a failed or unpaid deposit keeps it locked. The *"Minimum $500, maximum
$…"* hint under the Deposit row is hidden while that row is locked.

**Backing refusals** (each returns 400 with the hint the screen shows; `<p>` = `advisor` | `accountant`):

| Handler | Refuses when |
|---|---|
| `<p>/meeting-reminder.ts` | no Team Member Responsible — `Complete "Team Member Responsible" first` (the bells route to this person) |
| `advisor/prelim-meeting.ts` | `prelim_meeting_status` is NULL and the reminder was neither scheduled nor skipped — `Complete "Meeting Reminder Setup" first` |
| `accountant/prelim-meeting.ts` | `prelim_meeting_status` is NULL → `stage1Lock(…, 'prelim')`, i.e. `Complete "Team Member Responsible" first` (2026-11-13; it was the reminder check) |
| `accountant/save-partnership.ts` | no partnership is on file yet and a value is being set → `stage1Lock(…, 'partnership')`; changing an existing choice is not re-locked. It now selects the full row (`select("*")`) to evaluate the lock. |
| `accountant/save-cc-advisor.ts` | no advisor is picked yet and a `member_number` is being set → `stage1Lock(…, 'cc_advisor')`; changing or clearing an existing pick is allowed |
| `<p>/deposit-email.ts` | `stage1Lock(…, 'deposit')` while `deposit_email_sent_at` is NULL |
| `advisor/save-implementation-value.ts` | `stage1Lock(…, 'impl')`, unless both values are already set (a correction never re-locks) |
| `<p>/decision.ts` | `stage1Lock(…, 'decision')`, only while no decision is on file |
| `<p>/create-member.ts` | `createMemberLock` — see *Stage 3* below |

**Once the deposit link is out the partnership select is disabled** (tooltip *"A deposit link has already been
sent"*) and `save-partnership.ts` 400s the same change — the cap must not move under a link that has already been
priced against it.

**Stage 2 before a decision** renders a single locked row, *"Engagement agreement created and sent for signing"*,
with the hint `Complete "Preliminary Meeting Decision" first`.

**The reminder prerequisite only fires when `prelim_meeting_status` is currently NULL.** That is deliberate:
pre-existing rows that already carry an outcome are never forced back through a reminder they cannot arm.

**Preliminary Meeting outcome vocabulary** (bare `text`, no CHECK — #431; the allowlist lives in
`prelim-meeting.ts` as `PRELIM_STATUSES`):

- `Completed - Send Deposit` — unlocks the Deposit step.
- `Completed - No Deposit` — skips it. **Legacy `'Completed'` rows read and display as this**; there was no
  backfill, so both values are live in the column.
- `No Show` — auto-stops the onboarding (`status='stopped'`) and leaves every step below it locked with the hint
  *"Preliminary meeting was a no-show"*.
- `Request no meeting` — **the STORED value is unchanged on purpose**, because `actions/pft/ft-response.ts`
  writes that exact literal on the PFT fast path; only the UI label changed, to *"Requested no meeting"*. **Since
  2026-09-14 the ADVISOR select no longer offers it** (advisors never take the PFT path; `AdvisorOnboarding.jsx` shows
  the option only if a legacy row already holds the value — none did). Accountant Onboarding still offers it, and
  `actions/advisor/prelim-meeting.ts` still accepts the literal — a frontend-only removal.

**Once a deposit link has gone out the outcome cannot be moved off `Completed - Send Deposit`** —
`prelim-meeting.ts` 400s on `deposit_email_sent_at` being set. All Stage 1 completion dates are now fixed
`MM/DD` text: `StepDate` editing was removed from both components, so the backend action
`save_onboarding_step_date` still exists and is still gated but **has no frontend caller**.

Opening an onboarding writes `?onboarding=<id>` to the URL, so a reload stays on the record. **That link is
opened only ONCE per router location key** *(since 2026-10-07)*: `AdvisorOnboarding.jsx` / `AccountantOnboarding.jsx`
each keep a module-level `consumedOnboardingLinkKey`, set when the `?onboarding=` param is consumed. A tab switch
does not navigate, so the router still holds the last link when the panel is opened again — the remembered key
sends the admin to the LIST instead of back into the last person. A reload starts with a fresh module and stays on
the record, and a bell link (a new navigation, a new key) still opens its record.

---

## Meeting Reminder Setup — a COUNTDOWN ladder

**Advisor Onboarding only since 2026-11-13.** Accountant Onboarding dropped the step (Jake: never used, every live row was skipped). Its row, form and email list are gone from `AccountantOnboarding.jsx` and from the accountant step order; `automation_ACCOUNTANT_meetingreminder`, the `ACCOUNTANT_meeting_reminder*` templates and the sweep's accountant pass remain but have nothing to act on (no live accountant row was ever scheduled).

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
server-side. **A NULL partnership is refused by the Stage 1 lock first** — `stage1Lock(…, 'deposit')` returns
`Complete "Direct or Advisor Partnership" first` (or `Complete "CC Connected Advisor" first` on the Advisor path
with no advisor picked), a state the UI's lock makes unreachable, which is the point (#403); a separate NULL-
partnership guard further down the handler is now only a backstop. The advisor pipeline has no partnership step.

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
  `'onboarding_deposit'` settles the deposit and, **if `balance_charge_status='awaiting_deposit'`, chains
  `_chargebalance`** (the park is only made once the agreement is signed; no countersign check since 2026-11-13); `'onboarding_balance'` settles the balance, chains
  the invoice/receipt and writes `balance_charge_status='succeeded'`.
- **`checkout.session.async_payment_failed`** → `handleOnboardingDepositFailure` (`deposit_status='failed'`,
  action bell to Jake, and **re-chains `_stripecustomer` if a signed agreement's balance was parked on it** — with the
  deposit gone the whole fee is owed, so the ordinary payment-link route resumes).
- **`payment_intent.payment_failed`** → the same deposit helper, or `handleOnboardingBalanceFailure` for a
  bounced balance (`payment_status='declined'`, `balance_charge_status='failed'`, Jake bell
  `<PREFIX>_balance_charge_failed` (action-required), and a **fresh `/advisor-pay` link for the balance**).
- **The generic first-payment failure resolver now SKIPS both onboarding legs** — it writes `payment_status`,
  which belongs to the onboarding payment and not to the deposit.

### The 4th stall ladder + AI PC Admin

**The payment ladder (tier c) chases only an UNPAID payment** — `payment_status` NULL, `failed`, `declined` or
`canceled` (`UNPAID_PAYMENT_FILTER`, `utils/onboarding-order.ts`). Until 2026-11-20 it chased anything not
`succeeded`, so a bank payment still clearing (`processing`) got the *payment reminder* email after 2 business
days and the team member the *hasn't paid* bell after 4 (an accountant on live, 2026-11-20; an advisor in
September).

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

## The money fork at signing

**Since 2026-11-13 this runs the moment the advisor / accountant signs, not when Anton countersigns.**
`_ceocountersign` (chained on the signer's BoldSign `Signed` event) reads the plan checkboxes, writes
`payment_amount`, then chains `_stripecustomer` (`utils/payment-at-signing.ts`) before drafting Anton's email.
The BoldSign `Completed` event still chains `_stripecustomer` once Anton signs; that second call returns on
`payment_link_sent_at`, or reaches `_chargebalance`, which skips a settled balance. `_chargebalance` requires the
signer's own `agreement_signed_by_<advisor|accountant>_at`, not `agreement_signed_by_ceo_at`. What still waits for
Anton: Stage 3 **Create Member** (`createMemberLock`), whose hint names the first open Stage 2 step once the
invoice step is done, so a paid, invoiced row reads *"Complete 'Engagement agreement signed by CEO' first"*.
Proven on the test site 2026-11-13: advisor 100047 (link 4 s after signing, paid before Anton) and accountant
100050 (card deposit, balance charged 3 s after signing, no second charge at `Completed`).

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

**TRAP — `payment_amount` carries a column DEFAULT of `4000`.** Before the signer's signature prices the
engagement (the `_ceocountersign` checkbox read), that default is indistinguishable from a written value, so the
frontend gates every derived balance figure on the signer's `agreement_signed_by_<advisor|accountant>_at`
instead (`agreement_signed_by_ceo_at` until 2026-11-13). Gotcha **#469**.

---

## Email wording that had to move with the money

- **`<PREFIX>_agreement_sent`** — the sentence promising *"a separate email with a secure payment link"* became
  the **`[PAYMENT_NEXT_STEP]`** token. `send-agreement.ts` renders the link sentence when there is no
  deposit and the balance sentence when there is. Since 2026-11-13 both open *"As soon as you have signed the
  agreement, …"* (*"…you will automatically receive a separate email…"* / *"…the balance … will automatically be
  charged…"*), no longer *"Once all parties have signed and confirmed your agreement"*.
  **Step 1** (all four: 48, 72, 334, 337) reads *"Please review and sign our … Agreement:"* with a blue
  **Review and Sign Agreement** button around `[SIGNING_LINK]`, Tax Planning's own button (2026-11-19; was a
  *"click here to open the agreement"* link). Template rows only, no code: on the test site 2026-11-19, on live at release.
- **`<PREFIX>_payment_link`** opens *"Thank you for signing your <Advisor|Accountant> Implementation Agreement."*
  (was *"…has been signed and confirmed."*), migration `20261113160000_payment_at_signing_wording.sql`, renamed
  from "Onboarding Agreement" 2026-11-19.
- **`<PREFIX>_payment_link`** — gained **`[Deposit Note]`** after the Amount Due line. The handler renders
  `""` when no deposit cleared, so the line is inert on an ordinary link and only appears on the fresh-link
  fallback after a declined balance. Since 2026-11-19 the note ends in `<br>`, so it no longer runs into the
  "Engagement Term" line.

Both edits shipped as data migration `20260908120000_onboarding_deposit_wording.sql`.

### Implementation, not onboarding, is what they pay for *(2026-11-19)*

Ian's rule: the classic Advisor / Accountant fee pays for the **6-month implementation**, and **onboarding** is
the next step after it. Migration `20261119120000_payment_wording_cleared.sql` (edge repo) and the code below
say so everywhere the client sees it:
- **Emails:**
  - agreement, signing-reminder and invoice/receipt subjects;
  - payment link and reminder;
  - decline and decision reminder;
  - deposit emails (the deposit keeps its name **ERT Membership Deposit**: "applied to your implementation fee");
  - the CEO countersign note.
- **`[PAYMENT_NEXT_STEP]`** ("the balance of your implementation fee", "to pay your implementation fee").
- **BoldSign document** title and attachment name (`<Advisor|Accountant> Implementation Agreement`,
  `*-implementation-agreement.pdf`).
- **Invoice / receipt PDFs** ("VFO <Advisor|Accountant> Implementation").
- **Stripe descriptions:** `<Advisor|Accountant> Implementation - <name>`, `… Implementation Balance - <name>`,
  and `ERT Membership Deposit - <name>`.
- **`/advisor-pay` and `/accountant-pay` headings.**

**Tier 1 rows** (VFO Associate / Financial Collaborator) are monthly membership and keep their own names.
**Left on purpose:** the internal sweep bell *"hasn't signed the … Onboarding Agreement"*, because
`automation/stall-ack.ts` matches that title word for word.

The bank-payment confirmation (`<PREFIX>_payment_confirmation|ach`) goes out at checkout, **before** the money
arrives. Its subject is now *"Bank payment on its way"*, and it opens *"Thank you. Your bank payment of $X for
your 6-month <Advisor|Accountant> Implementation (…) is on its way to us."* The payment wording standard is in
[../TEAM_RULES.md](../TEAM_RULES.md) §8.

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
- An info line reads *"Deposit of $X received … · balance calculated at signing / balance due $Y /
  nothing further due"* — **the balance figure only appears once the signer's own signed stamp is set**, for the
  `payment_amount` default reason above.

---

## Stage 3 — Create Advisor / Accountant is locked until Stage 2 is done *(since 2026-10-07)*

`createMemberLock(ob, pipeline)` (the same `onboardingOrder.js` / `utils/onboarding-order.ts` pair) keeps
**Create Advisor & Send Setup Link** / **Create Accountant & Send Setup Link** locked until every yes-path Stage 2
step is done:

1. *Engagement agreement created and sent for signing* — `agreement_sent_at`
2. *Engagement agreement signed* — `agreement_signed_by_advisor_at` / `agreement_signed_by_accountant_at`
3. *Engagement agreement signed by CEO* — `agreement_signed_by_ceo_at`
4. the payment row, under whichever label Stage 2 shows it (`paymentStepLabel`: *Payment collected* /
   *Remaining payment collected after deposit* / *Deposit covered the full onboarding payment*) —
   the payment is IN (`paymentInOrClearing`): `payment_status` `succeeded` or `processing`, or
   `balance_charge_status` `awaiting_deposit` / `processing`
5. *Invoice and receipt created and emailed to client* — `invoice_sent_at`, **waived while the bank payment is
   still clearing** (`paymentClearing`)

**Create while a bank payment clears** *(since 2026-11-20, Jake — as VFO Services' flows do)*. A bank payment
that is on its way opens Create: the member is created, announced (the team email) and sent the setup link at
once, and the invoice + receipt follow when the money clears (days later), exactly as before. Stage 2 is
unchanged (the payment row's *Bank payment clearing* chip, the invoice row *Not completed*); a note under the
Create button says the payment is still clearing. Pieces:

- **The "Ready to create" bell** (`utils/onboarding-ready-bell.ts` `raiseReadyToCreateBell`, rule
  `<PREFIX>_ready_to_create`, action-required, to the Team Member Responsible) now goes out when the money is IN:
  *Ready to create <name> — bank payment clearing* from the webhook's ACH checkout branch, `charge-balance.ts`
  (a bank balance) and `stripe-customer.ts` (a balance parked on a clearing deposit); *… — onboarding
  complete* from `invoice-receipt.ts` as before. One per record: none while one is unread, none once the member
  exists; Create marks it read.
- **At clearing** `invoice-receipt.ts` calls `afterOnboardingPaymentCleared`: a member created while it cleared
  gets no bell, and a Tier 1 one gets its monthly plan now (`createTier1MembershipPlan` needs month 1 cleared and
  invoiced, so `create-member.ts` skips it while the payment clears).
- **A bounce after Create** (ACH checkout, balance or parked deposit) adds *"They were already created as member
  N … decide whether to pause them"* to Jake's failure bell (`createdWhileClearingNote`). Nothing else changes —
  the member stays active (Jake, 2026-11-20).
- **A failed payment takes back the bell:** every onboarding payment failure (first payment, balance, a deposit a
  balance was parked on) marks an unread *Ready to create* bell read (`clearReadyToCreateBell`), and the Stage 2
  payment row shows a red *Payment failed* chip (`failed`, `declined`, `canceled`).
- **The client is emailed when a first bank payment bounces** (2026-11-20, wording approved by Jake from Tax's
  `TAX_implementation_charge_failed`): `utils/onboarding-payment-failed-email.ts`, templates
  `<PREFIX>_payment_failed`, `…|tier1` and `ACCOUNTANT_payment_failed|tier1_advisor_pays` (migration
  `20261120120000_onboarding_payment_failed_emails.sql`, Send), with the same payment link as the button — the pay
  page refuses while a payment is clearing or paid, so it cannot be paid twice. Once per bounce: Stripe sends two
  failure events, so the sender first claims the row `processing` → `failed` in one guarded update and only the
  winner sends (#611). A card declined on the Stripe page never booked `processing`, so nothing is sent. Jake's bell
  adds *"The payment link has been emailed to them again."* A failed balance charge keeps its own fresh-link email.
- `create-member.ts`'s own payment check is `paymentInOrClearing` (was `invoice_sent_at`); the accountant
  agreement copy is skipped only for an unpaid today's-path Associate.

The hint is always the step directly above Create: `Complete "Invoice and receipt created and emailed to client"
first` — also while there is no Yes decision yet. A declined row reads *"The advisor declined"* / *"The accountant
declined"*. **VFO Associate accountants are exempt** (they skip Stages 1-2; the lock returns null) — **on today's path only**: a Tier 1 Associate (portal licensing L6b, *The Tier 1 path* below) is locked like every other row until month 1 is paid. The locked
Stage 3 renders a single locked *Create … & Send Setup Link* row with that hint; once `member_created_at` is set
the lock no longer applies.

`<p>/create-member.ts` refuses with the same hint (400) — **skipped on the idempotent retry**, when
`member_number` is already on the row. The older `invoice_sent_at` payment-complete guard is still there after it
(non-Associate only on the accountant side).

---

## Once-only CEO countersign stamp

BoldSign **redelivers `Completed`**, and the advisor/accountant branch in `router/webhooks.ts` wrote
`agreement_signed_by_ceo_at: nowIso` unconditionally, re-stamping the signature date on every redelivery. It is
now `advisor.agreement_signed_by_ceo_at || nowIso` on both pipelines. Gotcha **#470**. `boldsign-webhook`
itself was NOT touched (still v40).

---

## The Tier 1 path — VFO Associate + Financial Collaborator *(portal licensing L6b, 2026-10-30)*

Plan of record: [../plans/portal-licensing/README.md](../plans/portal-licensing/README.md) §3 L6b + decisions 82-106. Switch `tier1_onboarding` released to all and removed 2026-10-30 (the row stays `enabled_for_all = true`, read by nothing).

**Which rows.** `isTier1Onboarding(ob, pipeline)` (`utils/tier1-onboarding.ts`) = `tier1_flow_at` set AND `accountant_type='VFO Associate'` (accountant) / `advisor_type='Financial Collaborator'` (advisor; NULL = Catalyst). The stamp is written ONCE, at creation, by `tier1FlowStamp`, on every new one. Rows created before keep today's path (an unstamped Associate still skips Stages 1-2). + New Onboarding always offers Financial Collaborator. **Starting price** (2026-11-19): `tier1FlowStamp(pipeline)` also writes `payment_amount` — $145 on an FC, 0 (not priced; the payment chain refuses it) on an Associate until *Direct or Advisor Partnership* is picked, when `save-partnership.ts` writes $145 / $25 (until the agreement is signed) — so the column DEFAULT 4000, the VFO FT figure, never sits on a Tier 1 row. **Type tag** (2026-11-19): every list row and detail header shows `onboardingTypeLabel` (`onboardingOrder.js`) — advisor *Catalyst* (no `advisor_type`) / *Financial Collaborator*, accountant *VFO FT* / *VFO Associate*. **The list** (2026-11-19) is one Client Overview-style table for both pipelines, `OnboardingListTable.jsx`: search (name / email / member number), Filter (Phase, Type), sort, columns Name · Type · Phase · Email · Started. The Phase filter opens on the three in-progress stages (Done and Stopped, the old folded sections, are ticked on to see them); search / filter / sort survive opening a record and coming back (`sessionStorage`). **Since 2026-11-20:** the columns read Name · Email · Type · Phase · Started, the Name column is capped so Email sits close, a created member's number sits beside the name, an in-progress phase carries its stage number (*1 - …*, *2 - …*, *3 - …*, in the filter too), the finished phase is called *Complete* and is shown by default (Stopped stays ticked off), and Complete / Stopped carry Client Overview's green / red dot (the saved view's key became `<pipeline>OnboardingListView2` so the new default applies). **On screen** (2026-11-19) stage 2 is titled *Automated steps* in both pipelines (it was *PC Admin*, as Tax Planning's own rename), the record's header is `OnboardingHero.jsx` in the client page's style (initials avatar, name, one dot-separated line: member number once created · email · started; the type is the second card's eyebrow), with a second card in MAP 1's style under it (stages completed, progress bar, step bar), and a Tier 1 record's header carries one orange fee line: *$145/month (incl. $25 VFO Portal licence)*, or *$25/month VFO Portal licence, paid by <advisor>* for a connected Associate — shown on an Associate once Direct / Advisor is picked. The old first-month note under the payment-link row is gone.

**Stage 1** (`utils/onboarding-order.ts` ↔ `onboardingOrder.js`, #594): Team Member → (FC: Meeting Reminder →) Preliminary Meeting → (Associate: Direct or Advisor Partnership → CC Connected Advisor → **VFO Portal licence paid by** for a connected one) → Decision. No deposit and no implementation value: `prelim-meeting` refuses *Completed - Send Deposit* and advisor `save-implementation-value` refuses an FC (`TIER1_STEP_REFUSAL`). *VFO Portal licence paid by* = `save_accountant_licence_paid_by` (`accountant_onboarding.licence_paid_by`, `accountant` | `advisor`, NULL until chosen — the screen preselects Accountant, nothing defaults it, #469; fixed once the agreement is sent).

**Stage 2.** `send-agreement.ts` (both) picks the active `agreement_templates` row by `service_level` too (`TIER1_SERVICE_LEVEL` `VFO Associate` / `Financial Collaborator`; classic rows `Accountant` / `Advisor`): **35** Associate Direct, **36** Associate Connected, **34** FC. Signing and the CEO countersign run as today. At the countersign `ceo-countersign.ts` writes `payment_amount` = the month (`tier1MonthlyFee`: $145, or $25 for a connected Associate — never the column DEFAULT 4000) and `stripe-customer.ts` mints the customer on ERT and drafts the **month 1** payment link (`<PREFIX>_payment_link|tier1`, or `ACCOUNTANT_payment_link|tier1_advisor_pays` To the advisor with the Associate Cc'd). `/accountant-pay` / `/advisor-pay` show the fee lines; a card adds 2.9% + $0.30 ($149.64 / $26.06), a bank nothing; the card / bank is saved off-session (`stripe_payment_method_id`). The webhook writes no 6-month renewal date for a Tier 1 row and ignores a Checkout session another pipeline minted on the same customer. Invoice + receipt keep the `INV-ACC` / `INV-ADV` numbering (decision 101) with *Membership Fee $120.00* + *VFO Portal Licence $25.00* (connected: the licence line only) — the invoice's table has the house *Status* column, so its ✓ Paid sits at the far right of the Total row (2026-11-19); the receipt keeps three columns — `utils/tier1-onboarding-documents.ts`, `utils/tier1-onboarding-payment.ts`. The stall sweep's payment reminder uses the Tier 1 template; its deposit tiers skip the row.

**Stage 3 — Create** stays locked until month 1 is IN — paid, or a bank payment clearing (decision 100, amended by decision 116 on 2026-11-20); a member created while it clears gets its monthly plan when it clears (*Create while a bank payment clears* above). Create writes member type `VFO Associate (Direct)` / `VFO Associate (Advisor)` / `Financial Collaborator` (all Tier 1), numbers it with `nextMemberNumber` in the accountant x Legacy / advisor x Legacy bucket (decision 103 — a test Create takes a REAL number, #699), links a connected Associate to its CC advisor (`member_connections`, decision 104), keeps `revenue_decision='Money Mapping'`, drafts team email **339** `new_vfo_associate_member` / **340** `new_financial_collaborator_member` (instead of 155, `utils/new-model-sale-email.ts`), then `createTier1MembershipPlan` — Membership Fees bills from month 2 ([membership-fees.md](membership-fees.md) *VFO Associate / Financial Collaborator plans*) and month 1's $25 is transferred to VFO Services.

**Emails.** Every Tier 1 version is its own row, Send since the go-live 2026-10-30 (decision 107; 333-338 undecided / agreement sent / signing reminder, 341-352 payment link / reminder / confirmation / invoice-receipt, 339 / 340 team). On a sandbox or test row every onboarding send is `draftOnly` — a `send_mode=true` template (the CEO countersign) would otherwise real-send (#696).

---

## Backend files

`actions/advisor/` and `actions/accountant/` (identical sets): **new** `meeting-reminder.ts`,
`deposit-email.ts`, `deposit-confirmation.ts`, `deposit-refund.ts`, `charge-balance.ts`; **changed**
`prelim-meeting.ts`, `stripe-customer.ts`, `stripe-checkout.ts`, `load-payment.ts`, `payment-email.ts`,
`send-agreement.ts`, `invoice-receipt.ts`, `sweep.ts`; **2026-09-08 (v818)** `accountant/deposit-email.ts` (the
partnership cap + the NULL-partnership 400) and `accountant/save-partnership.ts` (frozen once a link is out);
**2026-10-07 (v949)** the step-order refusals — `decision.ts`, `deposit-email.ts`, `create-member.ts`,
`meeting-reminder.ts` and `prelim-meeting.ts` (hint wording) on both sides, plus `advisor/save-implementation-value.ts`,
`accountant/save-partnership.ts` and `accountant/save-cc-advisor.ts`.
Shared: **`utils/onboarding-order.ts`** (the step order + every lock, mirrored by the frontend's
`onboardingOrder.js`), `actions/onboarding/meeting-reminder-sweep.ts`, `actions/onboarding/meeting-response.ts`,
`utils/onboarding-meeting.ts`, `constants/onboarding-team.ts`, `actions/automation/stall-ack.ts`,
`router/webhooks.ts`, `router/dispatch.ts`, `constants/role-gates.ts`.

**Actions (12 new).** AUTH + `ADMIN_ONLY_ACTIONS`: `automation_{ADVISOR,ACCOUNTANT}_meetingreminder`,
`_depositemail`, `_depositrefund`. PUBLIC: `automation_{ADVISOR,ACCOUNTANT}_depositconfirmation`,
`_chargebalance`, plus `automation_ONBOARDING_MEETING_sweep` and `automation_ONBOARDING_meetingresponse`.

## Accounting > Members > Advisor / Accountant Implementation *(2026-11-19)*

Replaced the *Advisor / Accountant Onboarding* fee lists (section keys `advisor_onboarding_fees` / `accountant_onboarding_fees` kept, so old links still land). `src/components/admin/ImplementationPanel.jsx`, read-only, in the Membership Fees style, from `member_onboarding_payments_load` with `implementation: true` (Tier 1 rows left out: they are monthly membership). Three pills:
- **Members** — one card per onboarding with a payment, a deposit or a signed agreement: the implementation fee, when it ends (`renewal_date`), payments made, a status (Active · Ended · Clearing · Deposit paid · Awaiting payment · Payment failed · Stopped). It opens to the Deposit + Balance rows (or one Payment in full) in the Membership Fees columns (Payment · Date · Amount · Status · Payment), then Agreement signed, the implementation dates and term, any deposit refund, and the invoice / receipt numbers. Search, a status filter and a "Paid in" year / month filter with the total collected.
- **Outstanding Payment Links** — signed, payment link sent, nothing (or only the deposit) paid: the amount or balance due and the link / reminder dates. The link itself is sent from the onboarding pipeline.
- **Implementation Ending** — by month, like Membership Fees' Renewals.

## Frontend

`src/components/admin/AdvisorOnboarding.jsx` + `AccountantOnboarding.jsx` (the locked Stage 1 cascade, the
reminder form, the deposit + refund cards, the deposit-aware Stage 2 rows, the locked Stage 3 row, the once-per-
navigation `?onboarding=` link), `src/components/admin/onboardingOrder.js` (the step order + every lock and hint —
the frontend half of `utils/onboarding-order.ts`),
`src/pages/AdvisorPayPage.jsx` + `AccountantPayPage.jsx` (the two payment-kind labels),
`src/pages/OnboardingMeetingPage.jsx` (`/onboarding-meeting`, added to `scripts/emit-route-pages.mjs`,
33 → **34** route pages).
