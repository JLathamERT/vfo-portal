# Tax plan status: Pause, Stop, Next tax year, Completed, and which plan a form belongs to (2026-11-23/24)

Plan of record, with every decision and its date: [../plans/tax-plan-status/README.md](../plans/tax-plan-status/README.md). This doc is how it works.

## The statuses

`client_tax_plans.status` is bare text with no CHECK. `planIsLive` (`utils/tax-plan-open.ts`) treats NULL as live.

| `status` | `status_kind` | On screen | Takes money, emailed buttons, reminders | Counts as the client's open plan |
|---|---|---|---|---|
| `live` | NULL | Not started / In progress (every step ticked reads Completed by itself) | yes | yes, until every step is done |
| `paused` | NULL | Paused | no | yes |
| `stopped` | NULL | Stopped | no | no |
| `stopped` | `next_tax_year` (+ `next_tax_year`) | Next tax year | no | no |
| `completed` | NULL | Completed (closed by hand, last steps never ticked) | no | no |

Next tax year is a `stopped` plan on purpose: everything that already read `stopped` is right without a change.

**The rule is a status test, never a write to the payment slots**, so putting a plan back in progress needs no repair. Money already clearing settles, and revenue share already owed still pays.

## Changing it

The **Status bar** on the plan page ([`TaxPlanStatus.jsx`](../../src/components/admin/tax/TaxPlanStatus.jsx)): an In progress / Paused / Next tax year / Stopped / Completed slider and the history cards. There is no status control on the Tax Plans cards or in the page header.

- **Who:** admins on any plan (`tax_plan_status_load` / `_set`, `ADMIN_ONLY_ACTIONS`); a member on their OWN Direct plan through the `tax_direct_plan_status_*` twins (`directMemberHandler`). **Tax planners no longer can:** `msm_update_tax_status` is gone.
- **`tax_plan_status_set`** (`actions/tax/plan-status.ts`): `{ tax_plan_id, to, send_email, message, skip_reason, check_back_on, next_tax_year }`, `to` = `paused` / `stopped` / `next_tax_year` / `completed` / `live`.
  1. Checks: a closed plan can't be paused; Pause needs a future check-back date; Next tax year needs a year later than the plan's own; a refunded plan, a Lost client's plan, or a plan whose client has another open plan can't go back to `live`.
  2. Paused, Stopped and Next tax year need the email, or the reason there is none.
  3. **The change is claimed first** (an update guarded on the status, kind and check-back date it read), then the email is sent. A failed send puts the old status back, so a double click never emails twice and a status never changes without its email.
  4. Logged in `client_tax_plan_status_log`: from, to, who, the whole email or why not.
  5. The check-back bell is cleared; Stopped, Next tax year and Completed also clear that plan's step bells (`utils/tax-plan-bells.ts`, an allowlist by title: failure, held-share and refund bells stay, and nothing comes back on a reopen). Since 2026-11-25 every automatic stop and Lost clear them too, and none is raised on a closed plan (`notify.ts`, #791).
  6. Back to `live`: `resumed_at` is stamped, a plan moved to next tax year takes that year, and a held payment email goes (below). No email about the reopening.
- **Warnings never block** (`planWarnings` / `completedWarnings`): an unused deposit, an undecided retainer (with the last day Stripe can refund a bank payment: 180 days), a payment clearing, an agreement out for signature, unpaid money on a Completed plan.
- **Stop asks "Set them to Lost too?"** only when the stop leaves the client Inactive. Setting a client to Lost with an open tax plan offers the same email.
- **Automatic stops** keep their own emails and add none: Tax 3 No, extra meeting No, either refund, the Red Light stop, and since 2026-11-23 **ROI meeting declined** (`ready-for-tax3.ts`) and **Not Implementing** (`implement-decision.ts`).

**Emails:** `TAX_plan_stopped`, `TAX_plan_paused`, `TAX_plan_next_tax_year`, each with a member-pays twin, Send mode. `[MESSAGE]` is what the team types, `[Tax Year]` the year moved to. A member-pays twin goes to the member and drops the client and the client's contacts.

## What a plan that is not live refuses

- **Emailed pages and charges:** `denyIfPlanNotLive` / `planClosedMessage` (400, `plan_closed: true`) in `load-payment`, `stripe-checkout`, `charge-final-retainer`, `charge-implementation`, `postreview-client-decision`, `final-decision`, `implement-final-decision`, `client-refund-request`, `decision-code-send`, `rapid-question`.
- **Steps:** locked on screen; on the server `denyIfPlanLocked` (`index.ts`, before dispatch) refuses the actions on `LOCKED_WHILE_NOT_LIVE` (409). **A new tax action that emails someone or commits the plan belongs on that list.** `tax_save_task` is deliberately not on it: a decline or refund saves its own step just after the plan flips. `Stop - Refund` at Client decision 1 stays possible.
- **The payment email:** an agreement signed while the plan is not live **holds** it (`payment_email_held_at`); `tax_plan_status_set` sends it when the plan is back in progress (`sendTaxPaymentEmail`, in process). The action itself, `automation_TAX_paymentemail`, is service-role only.
- **Reminders:** `revshare-sweep.ts` `liveOnly()`, `tax-reminder-chases.ts` and the presentation sweep skip a plan that is paused, stopped or completed, **or resumed less than 2 business days ago** (`planIsQuiet`). The money passes don't look.
- **Check-back bell:** `runPlanCheckBacks` in the daily tax sweep (13:10 UTC), rule `TAX_plan_check_back`, to the PF (the member on a Direct plan), once per pause (`pause_bell_sent_at`), action-required; any status change clears it.

## One open plan per client

`openTaxPlansForClient` / `denyIfOpenPlan` (409): `live` or `paused`, and not finished by the step machine. It spans both programs, throws on a read error (so callers refuse), and there is no way around it. Checked at: Start Tax Plan, every form (below), Confirm on a diagnostic, Payment Continuation (`backfill-tax.ts`), and going back to `live`.

`tax_start_plan` needs a `tax_year` and takes an optional `previous_plan_id`. `tax_plan_remove` deletes a plan nothing has happened on. `tax_plan_year_save` sets or corrects a tax year; a blank year on an old plan is never guessed.

**Tax Plans screen** ([`TaxPlanCards.jsx`](../../src/components/admin/tax/TaxPlanCards.jsx)): the open plan on top, closed plans below; year, one tag, step, progress, route, planner, and paid so far (never to members or clients).

## Next tax year list

Client Overview, tax section ([`NextTaxYearList.jsx`](../../src/components/admin/tax/NextTaxYearList.jsx), `tax_next_year_list`). **The rule: if we hold money for work not done, the same plan comes back; if not, it is a new plan with a new fee** (plan of record section 8). The list shows *Continue this plan* and *Start [year] plan*, the likely one as the main button. A client who already has another open plan is offered neither; a moved plan leaves the list once the client has a newer plan.

## The automatic client status

`clients.auto_status` (`actions/clients/auto-status.ts`): `pending`, `active`, `paused`, `next_tax_year`, `inactive`, worked out from the Client Overview engines. **Display only; nothing gates on it.** `clients.status = 'lost'` is still set by hand, stops every payment, and wins.

- Refreshed after any saved action that names a client, plan, priority or MAP 1 row (`refreshAfterAction`, `index.ts`, after the reply), on opening a profile, and nightly in the tax sweep.
- **Shown only while the `client_auto_status` switch is On** (`withShownStatus` / `shownStatus`). Off, every screen shows `clients.status` as before and `auto_status` is still kept up to date, so it can be checked first.
- A holistic client (MAP 1 finished and not stopped) stays Active between priorities. A CIQ and nothing else is Active.

## The forms picker: which plan a form belongs to

`utils/tax-form-plan.ts`. A client with no tax plan gets one, as always. A client who already has one needs a plan **picked**: any of theirs, or *New plan* (refused while one is open).

| Route | Who picks | When |
|---|---|---|
| Member form (Tax Diagnostic tab, or a client's Vault), VFO-run | the member, in the form | before paying (`plan_pick` on `tax_intake_submit`) |
| The link a member sends the client | the member, when sending it (`tax_intake_send_link`) | the client is never asked |
| Public Tax Diagnostic | the team, admin Tax Diagnostics, Pending | after payment; a lead's Confirm also takes the pick |
| MAP 1 Tax Form button (`/tax-diagnostic?client=`, no plan) | the team | after the submit |
| Direct | nobody | it always makes a new client (#563); the form warns the member |

**A client or the public never sees the picker**, and no public page hints at it: it would tell anyone who types an email what plans that person has. That is why the three thank-you messages promise no email.

**Waiting.** `finalizeTaxIntake` decides the plan before it writes anything (`decideFormPlan`). When nobody has picked, or the pick no longer holds, `holdForPlan` stamps `plan_pick_needed_at`, pins the client in `existing_client_id`, sets `client_id` back to NULL (a form with a client and no plan shows on every plan) and raises the pick bell. It returns `{ ok: true, awaiting_plan: true }`: not a failure. `formAwaitsPlan` is the one test for "waiting".

**The team's pick** (`actions/tax/form-pick-plan.ts`, `ADMIN_ONLY_ACTIONS` + the Tax Diagnostics tab): `tax_form_plan_options_load`, `tax_form_pick_plan`, `tax_form_held_dismiss`.

| The form's $500 | A plan that takes a deposit, or New plan | A plan that takes none | Dismiss |
|---|---|---|---|
| none asked for | filed, or payment is asked for now (`payment_due`) if one is due | filed | closed |
| paid | lands on the plan | refunded (base only), then filed | refunded, then closed |
| bank, clearing | allowed; recorded when it clears | refused until it clears | refused until it clears |

An existing plan takes a deposit only if it is VFO Tax Planning, in progress, not migrated, and has never had a deposit or retainer (`takesDeposit`). A Holistic plan never does. The refund (`utils/tax-intake-deposit-refund.ts`) uses a refund already on the PaymentIntent, so a retry never pays twice.

**One form per plan.** Picking a plan that has one needs *Replace its form* (`replace_form`); the old row keeps its `tax_plan_id`, gets `replaced_at` + `replaced_by_intake_id`, and shows under *Earlier forms*. **A plan's form is its row with `replaced_at` NULL; its deposit is the row holding the plan's PaymentIntent (`depositIntakeForPlan`), which a replacement is not** (gotcha #785). A form never changes an existing plan's route, international setting or status; the bell says when the answers differ.

**Bells, all three to Tracy Miller only, on rules of their own:** `TAX_form_plan_pick` (waiting; action-required, cleared by the pick or Dismiss), `TAX_form_on_existing_plan` (filed), `TAX_form_on_paused_plan`. A new plan still rings the ordinary `TAX_new_case_created`. A failed bank deposit rings Jake only (`FAILURE_tax_intake_deposit_ach`, since 2026-11-24).

**Emails:** no new wording. A waiting form emails nobody; the team email goes at the pick; a form with no deposit on an existing plan sends the client's confirmation only if that plan is in progress; a refund is told only by Stripe.

## Tax Planner KPIs

`tax_plan_kpis` (migration `20261124180000`): a `completed` plan is not in process. Its unticked steps read *Not Decided* with no days, nothing is due, it reads Complete, and Step 6 reads *Completed* (a dash for days: the real end is not known) when Step 5 is done. Next tax year counts as Stop, with a dash for the days (the date is in `client_tax_plan_status_log`, which the function doesn't read). **A paused plan's days keep counting.** The deposit is read from the form it came in on.

## Known limits

- A Direct form can still duplicate a client, so the one-open-plan rule can't see it (Issue JLathamERT/vfo-edge-functions#563).
- Rollback: the schema only adds. The old code would treat `paused` and `completed` as open, so set those plans to `stopped` first.

## Tables

`client_tax_plans` (status columns), `client_tax_plan_status_log`, `tax_intake_requests` (pick columns): [../tables/tax.md](../tables/tax.md). `clients.auto_status`: [../tables/clients.md](../tables/clients.md).
