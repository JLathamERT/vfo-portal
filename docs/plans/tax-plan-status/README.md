# Tax plan status: Pause, Stop, Next tax year + the Tax Plans screen

**Status: BUILDING (Jake's "go", 2026-11-23, which covers the phase 1 database changes).** Decisions below are dated. Nothing is released.

| Phase | What | State |
|---|---|---|
| 1 | Database: columns + log table | on the test site (2026-11-23); the three migrations (`20261123180000`, `180100`, `180200`) go on live at release, with the `client_auto_status` switch Off until the result is checked against the old status for every client |
| 2 | Backend: change status, emails, payment blocks, one-open-plan rule, next year list | built, passed 2026-11-23 (emailed buttons, pay page, held payment email, cleared bells on a seeded plan) |
| 3 | Plan page: Status bar, window, locked steps (the headline) | built, Jake's steps 1-17 passed 2026-11-23 |
| 4 | Tax Plans screen, automatic client status, Client Overview filters + next year list, Set to Lost email, planner lists | built, passed 2026-11-23 except the planner portal list, Tax Planners > Clients and Regular Priorities tags (built, not clicked) |
| 5 | Forms: the plan picker | built 2026-11-23; its migration (`20261124090000_tax_form_plan_pick.sql`, additive) is on the test site (Jake's go, 2026-11-24). Passed 2026-11-24 (Jake's click-through, card and bank payments, both refunds, the lead's Confirm; the Direct warning; the MAP 1 Tax Form button through the server only) |
| 6 | Docs, release | not started. Also check the KPI Summary that landed on main 2026-11-24 (`tax_plan_kpi_summary`): it reads `stopped` only, so check what it does with a paused, next-tax-year or completed plan |

Branches when it was written: react `claude/tax-planning-pause-stop-f58393`, edge `claude/tax-planning-pause-stop-7c81a6`.

## 1. What Jake asked for

1. A **Pause** in tax planning, as an alternative to Stop, and a Stop variation for clients **moving to next tax year**, which gives a list of those clients to get back in contact with.
2. A **closing email** when a client stops: standard opening and ending, a middle the team writes. It must work **anywhere in the track**, not only at set steps.
3. The same kind of email on **Pause** and **Next tax year**.
4. Replace the Live / Stopped switch, which "feels like it doesn't do much", with something cleaner and more intentional.
5. A clearer **Tax Plans** screen: plans pile up behind *+ Start Tax Plan* and nobody can tell which is which.

## 2. What exists today (code- and data-checked 2026-11-23)

- **The switch is a label.** `msm_update_tax_status` writes `client_tax_plans.status` = `live` / `stopped` and nothing else. Stopped plans get no reminders (`revshare-sweep.ts` `liveOnly()`, `tax-reminder-chases.ts`, `reminders/sweep.ts`, the presentation sweep).
- **Stop does not stop money.** The charge handlers and the pay / decision pages (`load-payment`, `stripe-checkout`, `charge-final-retainer`, `charge-implementation`, `postreview-client-decision`, `implement-final-decision`, `decision-code-send`, `final-decision`) refuse a **Lost** client and a `cancelled` slot, never a stopped plan. On live, 9 of 50 stopped plans still hold an open emailed decision button.
- **MAP 1's Stop does not stop money either** (`map1-update-status.ts` says so; `contract-chargescheduled-sweep.ts` filters Lost only). No stopped MAP 1 row had an uncollected payment.
- **No email** goes out on the switch (17 stopped plans) or when a client is set to Lost (17 more). The automatic stops do send their own: Tax 3 No, extra meeting No, deposit refund, Red Light stop, retainer refund.
- **Two ends leave the plan reading Live:** ROI meeting declined (`ready-for-tax3.ts`) and Not Implementing (`implement-decision.ts`). Both already email the client.
- **The retainer refund confirmation is a Draft:** `TAX_refund_email|Yes` and its member-pays twin have `send_mode=false`. It is the LAST email of the refund sequence (after an admin's Confirm refund); `TAX_postreview_refund_request` before it sends by itself.
- **`tax_start_plan` inserts on one click:** no name, year, check or confirm. 106 plans; 5 clients have two; 2 plans have no progress rows; one client has two live plans, both paid through implementation.
- **Client status is hand-set** (Pending / Active / Lost). 26 Active clients have only stopped tax plans, 17 of them with no open MAP 1; 1 Lost client has a live tax plan.
- **Forms:** a form started from a client's Vault is refused if the client has ANY program-4 plan, a stopped one included (`clientHasTaxCase`). A form whose email matches the member's own client goes on that client and creates a plan without looking for an open one (`findOwnClientByEmail`, `finalizeTaxIntake`). A Direct form always creates a new client (Issue JLathamERT/vfo-edge-functions#563). No plan has more than one form (86 have none, 20 have one).
- **Tags:** the list's *Live* + *In Progress* are the old square style. The house tag is `statusPillStyle` (`shared/statusColors.js`). `RegularPrioritiesTab.jsx` has the same old tags.

## 3. Decisions

| # | Decision | When |
|---|---|---|
| 1 | One **Change status** button replaces the switch, on every plan at any step: **Pause**, **Stop**, **Move to next tax year** | 2026-11-23 |
| 2 | All three turn reminders off and block payments and emailed buttons. Money already clearing settles as normal and revenue share already owed still pays. Stopping never refunds | 2026-11-23, outline |
| 3 | **Who:** admins on any plan; members on their own Direct plans. Tax planners lose the switch they have today | 2026-11-23 |
| 4 | **Pause needs a check-back date** that rings the PF's bell | 2026-11-23 |
| 5 | **The email is a checkbox, ticked by default.** Unticking it asks why (for example "Already told them on a call"), and the reason shows on the plan | 2026-11-23 |
| 6 | **Steps lock** while a plan is paused or stopped; notes stay open | 2026-11-23 |
| 7 | ROI meeting declined and Not Implementing also flip the plan to Stopped. They keep their own emails, so no closing email is added | 2026-11-23 |
| 8 | **REPLACED by 28.** Client status: the hand-set status stays. The portal adds a second tag by itself (*Tax paused*, *Tax: next year 2027*, *Tax stopped*), on the profile and in client lists | 2026-11-23 |
| 9 | **One open plan per client.** In progress and paused are open; stopped, next tax year and completed are not. The server refuses everywhere a plan can be created or reopened: Start Tax Plan, every form, Confirm on a diagnostic, Payment Continuation, Resume, Reopen. There is no way around it | 2026-11-23 |
| 10 | **Forms picker:** a form for a client who already has a tax plan needs a plan picked: any plan, or *New plan*. *New plan* while one is open is refused with "Stop the current tax plan first". A member picks before paying; on public forms, emailed links and the MAP 1 Tax Form button the TEAM picks in admin Tax Diagnostics under Pending. A client or the public never sees the picker (it would reveal a client's plans to anyone who types their email) | 2026-11-23 |
| 11 | **No second deposit:** none is asked for when we know before payment that the plan has one; otherwise the Pending card offers the refund. A Holistic plan never takes one | 2026-11-23 |
| 12 | `TAX_refund_email\|Yes` + the member-pays twin switch to Send, at release, on live and the test site | 2026-11-23 |
| 13 | One tag per plan in the house style: Not started, In progress, Paused, Next tax year, Stopped, Completed. Fix `RegularPrioritiesTab` too | 2026-11-23 |
| 14 | MAP 1 and Regular Priorities keep their own switches for now | 2026-11-23 |
| 15 | Screens are built from the portal's own components and house style (the chat's drawing was only a sketch) | 2026-11-23 |
| 16 | **One form per plan.** Picking a plan that already has one asks to *Replace its form*; the old one is kept in the history | 2026-11-23 |
| 17 | Setting a client to Lost with an open tax plan shows the same email checkbox | 2026-11-23 |
| 18 | When a stop leaves nothing else open for the client, the window asks "Set them to Lost too?" | 2026-11-23 |
| 19 | The email wording in section 5 is approved | 2026-11-23 |
| 20 | **Holding money is fine.** Pausing with money held shows no warning; we keep it. Stop and Move to next tax year show a warning (what is held, and the last day Stripe can refund a bank payment) and go ahead. Nobody is made to refund or choose first | 2026-11-23 |
| 21 | The next year list shows both *Continue this plan* and *Start [year] plan*, the likely one as the main button (section 8) | 2026-11-23 |
| 22 | The 15% for a returning client is NOT in the portal: no reminder, no automatic discount. The team enters the fees | 2026-11-23 |
| 23 | **Status bar:** the plan page always shows a Status bar (same shape as Tax Planning Route) with an In progress / Paused / Next tax year / Stopped / Completed slider, history cards and the whole email. No button in the header or on the Tax Plans cards: status is changed inside the plan only | 2026-11-23 |
| 24 | **Completed** is a fifth choice: no email, no reason. It closes a finished plan whose last steps were never ticked (`status = 'completed'`); a plan with every step ticked stays `live` and reads Completed by itself | 2026-11-23 |
| 25 | Stop, Next tax year and Completed clear that plan's action-required **step** bells (title allowlist); failure, held-share and refund bells stay. Reopening doesn't bring them back | 2026-11-23 |
| 26 | An agreement signed on a paused or closed plan **holds the payment email**; it goes when the plan is back in progress | 2026-11-23 |
| 27 | The member-pays wording of the three emails is approved | 2026-11-23 |
| 28 | **One automatic client status**, no separate tag: Pending (nothing started), Active (anything in progress in any program), Paused, Next tax year, Inactive (everything finished or stopped); Lost stays by hand and wins. Kept in `clients.auto_status`, shown while the `client_auto_status` switch is On, so all live clients can be checked against the old status before anyone sees it. A CIQ and nothing else reads Active, as today. A holistic client (MAP 1 finished, not stopped) stays Active between priorities, so stopping their tax plan never makes them Inactive. "Set them to Lost too?" is asked only when the stop leaves them Inactive. A moved plan leaves the Next tax year list once the client has a newer plan | 2026-11-23 |
| 29 | A paid $500 is always refunded (base only) when the plan picked for its form takes no deposit | 2026-11-24 |
| 30 | An existing plan takes a form's deposit only if it is VFO Tax Planning, in progress, not migrated, and has never had a deposit or retainer. The member's usual waiver still applies | 2026-11-24 |
| 31 | No new email wording for the picker. A waiting form emails nobody; the team email goes at the pick; a form with no deposit sends the client confirmation only when its plan is in progress; a refund is told only by Stripe | 2026-11-24 |
| 32 | The Vault's "Start the Tax Diagnostic" notice hides while any tax plan is open in either program, and returns when all are closed | 2026-11-24 |
| 33 | A waiting form has a Dismiss button, which refunds a paid $500 | 2026-11-24 |
| 34 | The picker's three bells (waiting for its plan, received on an existing plan, received on a paused plan) go to Tracy Miller only, whatever the route, on rules of their own: the ordinary Tax Diagnostics and new-case bells keep Tracy, Tray and Evan | 2026-11-24 |
| 35 | The three thank-you messages (deposit paid, no deposit needed, form received) end "The tax planning team will be in touch." for everyone and promise no email: a waiting form may get none, and a different message would reveal who already has a plan. The bank-payment message keeps its invoice and receipt line | 2026-11-24 |

**Still open:** nothing.

## 4. The design

**Status.** `live` stays. `paused` and `completed` (decision 24) are new. Next tax year stays `stopped` plus a kind and a year, so everything that reads `stopped` treats it correctly without a change. Every reader of `stopped` / `live` is checked one by one for `paused`.

**The window.** Choose the status; the email (standard opening, the middle box, standard ending, preview); the check-back date or the year; on Stop and Next tax year, warnings that never block (an unrefunded deposit or retainer, a payment clearing, an agreement out for signature). The email goes first, and a failed send leaves the status alone. Every change is logged: who, when, from, to, reason, the email sent or why not.

**Resume / Reopen.** No email. Reminders wait 2 business days from the resume, so an old ladder doesn't fire that night. Refused while another plan is open.

**Payments.** One shared check, "is this plan open?", beside `isClientLost` in every handler listed in section 2. It reads the status, so nothing is written to the payment slots and a resume needs no repair. The pages answer "paused" or "closed" with who to contact. The Refund button on a closed plan is blocked the same way.

**The next year list.** Client Overview's tax section gets In progress / Paused / Next tax year / Stopped. Next tax year shows client, member, PF, contact details, step reached, paid so far, year and reason, with export, plus *Start [year] plan* and *Reopen this plan*. A plan already stopped can be moved to next tax year.

**The Tax Plans screen.** The current plan on top, closed plans below. Each card: tax year, one tag, step and who owns it, progress, route, planner, paid so far (never to members or clients), and the status banner (who, when, reason, email sent or why not). *Start Tax Plan* opens a window that asks for the tax year; while a plan is open it can't be used. A plan with nothing done can be removed. A blank tax year on an old plan is never guessed.

**Forms.** Section 3, decisions 9-11. A form put on a paused plan rings Tracy Miller's bell, not the PF's (Jake 2026-11-24), and doesn't resume it; on a closed plan it is filed and the plan stays closed. One form per plan (decision 16). A replacement form never changes the plan's route or international setting. A Direct form shows the member a warning, because it creates a new client (#563) and the rule can't see a duplicate.

## 5. Emails (wording approved by Jake, 2026-11-23; the template rows are created at build)

Client versions below. Each has a member-pays twin (*Dear [Member First]*, "your client's tax planning"). To the client; Cc the member, PF, planner, Tray and tvaldes; Bcc Anton and platham: the same list as `TAX_decision_decline`. Send mode.

**Stop:** `VFO Services - Your Tax Planning - [Client Name]`

> Dear [Client First],
>
> Thank you for the time you have given to the tax planning process. This email confirms that your tax planning with VFO Services is now closed.
>
> [MESSAGE]
>
> Should you ever wish to reconsider your tax planning options, please do not hesitate to email [PF Name] or [Member Name].
>
> Regards,

**Pause:** `VFO Services - Your Tax Planning is Paused - [Client Name]`

> Dear [Client First],
>
> This email confirms that we have paused your tax planning for now.
>
> [MESSAGE]
>
> When you are ready to continue, please email [PF Name] or [Member Name] and we will pick up where we left off.
>
> Regards,

**Next tax year:** `VFO Services - Your [Tax Year] Tax Planning - [Client Name]`

> Dear [Client First],
>
> This email confirms that we have closed your tax planning for this year and will look at it with you again for the [Tax Year] tax year.
>
> [MESSAGE]
>
> We will be in touch. In the meantime, please do not hesitate to email [PF Name] or [Member Name] with any questions.
>
> Regards,

## 6. Risks

- **`paused` is a new value in a bare text column** (#431): every reader must be found. Roughly: `revshare-sweep.ts`, `tax-reminder-chases.ts`, `reminders/sweep.ts`, `presentation-sweep.ts`, `tax-plan-steps.ts`, `tax-planners/clients-load.ts` + `portal-clients.ts`, `overview-tax.ts`, the KPI tracker function, `client-lost.ts`, `set-rapid-route.ts`, `rapid-question.ts`, `presentation-schedule.ts`; website `TaxPrioritiesTab.jsx`, `ClientOverviewPanel.jsx`, `PlannerClientsList.jsx`, `TaxPlannersPanel.jsx`, `TaxPlanKpiPanel.jsx`, `ClientVaultTab.jsx`.
- **Release effect:** the 9 open buttons on stopped plans close.
- **Public forms wait for the team** when the client already has a plan; today they create the plan straight away.
- **Client 2-live case:** the one client with two live plans has to be settled (both look finished) before the rule can hold for them.
- **Backend and website ship together** (#543, #564).
- **Rollback:** the schema only adds. The old code would treat `paused` as open, so paused plans are set to stopped first.

## 7. Testing

Test site only, in phases: every status from Tax 1, 3, 4, 5 and 6; email sent, skipped and failed; each emailed button and pay page on a paused, stopped and next-year plan; a payment clearing while the plan is stopped; resume and the 2-day wait; the check-back bell; Direct member and planner refusals; the one-open-plan refusal at every creation point; each form route with and without an open plan; the member view on a phone (390 and 360).

Related open Issues in `vfo-edge-functions`: #395, #454, #462, #563.

## 8. When a next-year client comes back (decisions 20-22)

**The rule: if we still hold money for work we haven't done, the same plan comes back. If not, it's a new plan with a new fee.** Money never moves between plans: receipts, revenue share, refunds and the licence are all keyed on the plan that took it.

| How far they got | Where the money is | Next year |
|---|---|---|
| Nothing paid | None | New plan, normal deposit |
| Deposit paid, review not answered | All $500 still held, refundable | **Same plan**, no second deposit |
| Review Proceed, no retainer | $250 sent to the planning team, $250 kept; the review is done | New plan, new deposit |
| Retainer paid, Client decision 1 not answered | All held, no share paid, Guarantee 1 still owed | **Same plan**, or refund instead |
| Client decision 1 continued, implementation not paid | Retainer earned and shared out | **Same plan**, only the implementation is left |
| All paid | All earned | Not "next tax year": the plan is Completed. New plan, new fee |

The next year list shows both *Continue this plan* and *Start [year] plan*, with the one from the table as the main button. A new plan always has the normal deposit. Continuing sets the plan's tax year to the new one.

What was checked on live: both clients who finished a plan and came back have a separate second plan with its own retainer. Agreement rows 25-28 (in use, `tpom_additional_benefits` on for all) promise **15% off future tax planning fees against standard for that tax year**; nothing in the code applies it. Rows 29-32 don't promise it. Guarantee 1 (refund 100% of the initial retainer if not satisfied with the detailed plan) has no time limit in the wording.

Watch-outs:
- **Bank refunds:** 7 of the 9 live plans holding an undecided retainer paid by bank; Stripe refunds a bank payment for 180 days from the payment (docs.stripe.com/payments/ach-direct-debit, read 2026-11-23). After that the refund is paid by hand. The Stop / Next tax year warning shows the date.
- **The 12-month licence** starts at the retainer and keeps running.
- **A card on file** may expire before the implementation charge; the existing failed-charge link covers it.
