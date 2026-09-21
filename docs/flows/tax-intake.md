# Tax intake — member-run tax client + $500 deposit (added 2026-09-17/18, v860–v864)

Unit 1 of [DIRECT to Tax Planning](../plans/direct-tax-planning/README.md). A member starts a **VFO Tax Planning** (program 4) client from the member portal instead of the disconnected Unbounce form: one 37-question form, a **$500 card deposit** collected on a Stripe Checkout that has no customer (the client does not exist yet), and a server-side finalize that creates the enrollment, the client, the tax plan and the house invoice + receipt pair. The same form has three entry routes; two of them create a case, the third only records answers. Everything downstream of the created plan is the ordinary [tax-planning.md](tax-planning.md) track — this page stops where the Deposit Paid step is stamped, then picks up the two deposit money movements: the $250 team share, which the **"Tax planner review complete" Proceed** triggers since 2026-09-21, and the refund, which the **Tax Plan Red Light** step triggers.

| Route | Who fills the form | Who pays | Creates | Handler |
|---|---|---|---|---|
| **A — member fills** | the member, in the portal | the member (Checkout) | enrollment + client + plan + Deposit Paid | `tax_intake_submit` |
| **B — client link** | the client, on the public `/tax-intake?token=…` page | the client (Checkout) | the same | `tax_intake_send_link` → `tax_intake_link_load` / `tax_intake_link_submit` |
| **Holistic** | the member, for an EXISTING MAP 1 client | nobody — no deposit | nothing: answers stored against the client | `tax_intake_holistic_submit` |

On A and B the deposit is **waived** once the member has two qualifying clients (below). On the Holistic route there is never a deposit.

## What a member sees

- **The VFO Tax Planning program is offered to every member** — `MemberPortal.jsx` and `MemberMSMTracking.jsx` treat `'VFO Tax Planning'` as always-visible (`ALWAYS_VISIBLE_PROGRAM` / `TAX_PROGRAM_NAME`); every other program still needs its `member_program_enabled` row. With no program-4 `member_enrollments` row the Clients tab renders empty with the **+ Add new tax client** button; the first successful intake creates the enrollment server-side and the tab re-reads enrollments (`refreshEnrollments`).
- **+ Add new tax client** opens [TaxIntakeForm.jsx](../../src/components/member/TaxIntakeForm.jsx) in the Clients tab (`mode='form'`). Step 1 is a choice: *You answer the Tax Planning Form now* (route A) or *Send my client a link* (route B — first name, last name, email only). The deposit line reads `Deposit: $500` or `Deposit: waived (you have N qualifying clients)` from `tax_intake_eligibility`.
- Route A ends on **Submit and pay deposit** (browser handed to Stripe Checkout) or, when waived, **Submit** (the case is created inline). Route B ends on **Send link**. Both land on a *Thank you* card (`mode='done'`): *"Client created. We have emailed you a confirmation."* / *"We have drafted the Tax Planning Form link for <email>. It will be sent shortly."* / *"Thank you — your Tax Planning Form has been received."* (Holistic).
- **Return URLs.** The deposit Checkout returns to `/member?tab=msm_tax&intake=<id>&paid=1` (cancel: `&paid=0`); the Holistic email opens `/member?tab=msm_tax&intake_client=<clientId>`. `MemberPortal.jsx` lands either on the Tax Planning tab regardless of the last-used tab; `MemberClientsView` reads the params once, shows the done card (paid) or opens the form prefilled for that client (intake_client), re-reads the client list (again 4 s later, because the client is created by the webhook, which can land after the browser is back), and strips the params from the URL with `replaceState`.
- **Test Member 59524 only:** a *Fill with test values* button on the member form and on the public page. The public page reads the flag from the token row (`test_member`, derived from `TEST_SANDBOX_MEMBER_NUMBERS`), never from the URL.

## The form — one definition, mirrored

[utils/tax-intake-questions.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/utils/tax-intake-questions.ts) is the single server-side definition of the 37 questions (ids `q1`–`q37`), their order, options, `required` flags and the two validation message templates; [src/components/member/taxIntakeQuestions.js](../../src/components/member/taxIntakeQuestions.js) mirrors it **verbatim** (the array bodies are byte-identical bar the TypeScript annotation). The FE pre-validates from its copy and every handler re-validates with `validateTaxIntakeAnswers` + `normalizeTaxIntakeAnswers`; the two sides must move together.

- **Q1 "Who is completing this form?" is `type: "derived"`** — never rendered, never validated, and whatever the body sends is blanked. Route A and Holistic write `Advisor for Client` or `Accountant for Client` from the member's own record via `constants/member-types.ts isAccountantMember` (`member_category` first, the frontend's accountant `member_type` list as the fallback for rows whose category was never set); route B writes `Client`.
- **Q7–Q9** (Associated VFO Member / Introducer Email / Introducer Firm Name) are `hidden: true` — seeded from the member session (route A: name, email, `trading_name`; route B: the member's display name off the token row) and never shown.
- Q2/Q3 client first/last, Q4 email, Q5 phone, Q6 state (US states + DC + Canadian provinces), Q18 federal taxes paid — its first option is the *"Under $100k … not a good fit"* text (`TAX_INTAKE_Q18_POOR_FIT`), a legal answer that shows an inline warning but still submits.
- Answers are stored as jsonb on `tax_intake_requests.answers` and are **read-only afterwards** — nothing in the tax track pre-fills from them. Every surface renders them through the **Tax Planning Form** card (below).

## The deposit and the waiver

`TAX_INTAKE_DEPOSIT_CENTS = 50000` in [utils/tax-direct-eligibility.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/utils/tax-direct-eligibility.ts) — the price is fixed server-side; the browser never sends an amount and no body value can change it or who is charged.

**`qualifyingTaxClients(member_number)`** is the one predicate behind the waiver (and, in unit 2, Direct-route eligibility). A client qualifies when one of their `client_tax_plans` rows has `retainer_status='succeeded'` AND `post_review_client_decision` in `Proceed` / `Confirmed` / `Auto-Locked` AND `post_review_decision` in `Continue - Revenue Share` / `Undecided` AND neither `refund_status` nor `deposit_refund_status` is `succeeded` (the two "not refunded" filters run in JS because `.neq` drops NULLs, #28). **Distinct clients, not plans** — a second plan on the same person never buys a waiver. `depositWaivedFor(count)` is `count >= 2` (`TAX_DEPOSIT_WAIVER_MIN_CLIENTS`). **A lookup failure returns zero** — it charges rather than waives.

The waiver is **recomputed at every point it matters**, never read off a stored row: `tax_intake_eligibility` (what the form shows), `tax_intake_send_link` (the sentence in the client's email), `tax_intake_link_load` (the price the public page quotes) and both submits (the price actually charged). A member who crosses the line between send and submit is simply not charged.

A waived intake: `status='waived'` on insert, `deposit_required=false`, `deposit_amount_cents=0`, **no Checkout**, finalize runs inline, **no documents**, `[DEPOSIT_LINE]` empty in the confirmation, `deposit_payment_intent_id` NULL on the plan. The **Deposit Paid step is CLOSED as `N/A — No Deposit`** (finalize writes the `client_tax_progress` row with that status, 2026-09-18 / v864) — every downstream gate (Request Tax Returns, the Green/Red buttons, the Client Overview done-test in `utils/tax-plan-steps.ts`) keys on that row or on a PaymentIntent, so a waived plan with neither could never be advanced. The step renders the status as a chip with no `pi_` box. **Since 2026-09-21 the step formerly called Green/Red Light is the Stop-only "Tax Plan Red Light"**: it is shown on NO plan, waived or not, unless the reviewer said **Stop tax planning** (or it already carries history). On a waived plan that stop is **Stop tax planning** — `automation_TAX_stopnodeposit`, no money — rather than a refund. The team-share leg is stamped `N/A — No Deposit` at plan creation. See [tax-planning.md Step 0b](tax-planning.md#step-0b--tax-plan-greenred-light-decision-inside-tax-1---diagnostic).

## Route A — the member fills and pays

[actions/tax/intake-submit.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/actions/tax/intake-submit.ts) `tax_intake_submit` (AUTH, `MEMBER_SCOPED_ACTIONS`; 403 for any caller that is neither member nor admin; the member number is `auth.callerMemberNumber` for a member, `body.member_number` for an admin acting on a member's behalf — #455, the scoped-list rewrite is not itself a guard).

1. Validate + normalise the answers (first error → 400 with `errors[]`); derive Q1.
2. `qualifyingTaxClients` → `waived`.
3. `loadSandboxConfigForMember(supabase, "TAX", member)` — member-keyed because no client exists; this is what forces 59524 into sandbox. Stamps `sandbox` and `stripe_account` (TAX is on `vfos`) on the row at mint time (#485).
4. Insert `tax_intake_requests` (`payer` defaults `'member'`, `status` `'waived'` or `'pending'`, the client name/email/phone copied out of Q2–Q5).
5. **Waived:** `finalizeTaxIntake` inline → `{ waived:true, intake_id, client_id, tax_plan_id }`.
6. **Otherwise** mint a Checkout Session: `mode=payment`, **card only**, one `price_data` line at 50000 cents, no customer. Memo on the line item AND `payment_intent_data[description]`: `VFO Tax Planning Deposit - Client: <name> - Member: (<member#>) <member name>`. Metadata on the session **and** the PaymentIntent (#473): `pipeline=TAX`, `payment_kind=tax_intake_deposit`, `intake_id`, `member_number`. Success/cancel URLs as above. On a Stripe error the row is set `expired` and the member sees the Stripe message; on success `stripe_checkout_session_id` is stamped and the browser is sent to `url`.

`lib/api.js` gives `tax_intake_submit` and `tax_intake_send_link` a 30 s timeout (the waived branch creates four rows and drafts a Gmail before answering); both are writes, so a timeout never auto-retries.

## Route B — the member sends the client a link

**Send.** [actions/tax/intake-send-link.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/actions/tax/intake-send-link.ts) `tax_intake_send_link` (AUTH, `MEMBER_SCOPED_ACTIONS`, same caller rule as route A). Requires first name, last name and a regex-valid email (400s). Computes the waiver and the member-keyed sandbox config, then **reuses any outstanding invitation** for the same member + same email (matched in JS, case-insensitive — not `.ilike`, because `_` is both a legal email character and a LIKE wildcard) where `payer='client'` and `status='invited'`: the row's name, deposit flag, sandbox and `link_sent_at` are refreshed and **the same `intake_token` goes out again**, so a double click never leaves two live credentials for one person. Otherwise it inserts `payer='client'`, `status='invited'`, `intake_token=token32()` (32 random bytes as hex), `answers={}`. Then [utils/tax-intake-link-email.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/utils/tax-intake-link-email.ts) drafts template **277 `TAX_intake_link`** to the CLIENT with the green *Complete the Tax Planning Form* button onto `https://vfoportal.com/tax-intake?token=<intake_token>`; `[DEPOSIT_SENTENCE]` is the "A $500 deposit is taken at the end of the form…" sentence when the deposit applies at send time, empty when waived. The token is never echoed back to the caller. Response: `{ intake_id, email_drafted, deposit_required, client_name }`.

**Public page** [src/pages/TaxIntakePage.jsx](../../src/pages/TaxIntakePage.jsx) at `/tax-intake` (route in `App.jsx`), raw `fetch` like every other token page. Two `PUBLIC_HANDLERS` (no session) — **the `tax_intake_requests` row found by `intake_token` is the whole credential (#310)**: the body contributes the token and the answers and nothing else, so nothing in it can select a different row, member, Stripe account, price or recipient.

- [`tax_intake_link_load`](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/actions/tax/intake-link-load.ts): no/bad token → **404** *"This link is not valid."*; a `completed` / `paid` / `waived` row → `{ ok, status }` and nothing else (the page shows *already submitted*); otherwise stamps `link_opened_at` once, recomputes the waiver, and returns the client's own name/email, the member's display name, `deposit_required`, `deposit_amount`, the question list and `test_member`. Never the member number, the intake id or any other client.
- [`tax_intake_link_submit`](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/actions/tax/intake-link-submit.ts): 404 on a bad token; **409** *"This form has already been submitted."* unless the row is `invited` or `expired` (an abandoned Checkout may be retried). Validates the answers, writes `q1='Client'`, and **forces `q4` back to the invited email** — the client may correct their name and phone, but the address of record is half of what the token proved. Recomputes the waiver and re-derives the sandbox config (the link may have sat in an inbox across a live/sandbox flip). Updates the row to `waived` / `pending`. Waived → finalize inline. Otherwise the same Checkout as route A with `customer_email` set and `success_url=/tax-intake?token=<token>&paid=1`, `cancel_url=/tax-intake?token=<token>`. A Stripe error puts the row **back to `invited`** with the answers saved so the client can press the button again.

The page checks `paid=1` **before** the status so a client returning from Stripe sees a thank-you rather than *already submitted*, which the webhook has usually made true by then.

## Holistic route — an existing MAP 1 client

**Trigger:** [actions/pipeline/contract-invoice-receipt.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/actions/pipeline/contract-invoice-receipt.ts), after the invoice/receipt draft, `if (paymentNum === 1)` → `draftTaxIntakeRequestEmail(client_id)` in its own try/catch (nothing here can delay or break the money document). [utils/tax-intake-request-email.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/utils/tax-intake-request-email.ts) is **once-only via `clients.tax_intake_requested_at`** (written `.is(null)`, #327/#470 — this whole chain is redelivered on a Stripe retry) and also skips when a `tax_intake_requests` row already exists for the client. It drafts template **276 `TAX_intake_request|holistic`** to the MEMBER (needs a member email; Cc the assigned PF per the template) with the button onto `/member?tab=msm_tax&intake_client=<clientId>`; sandbox is the client's TAX config.

**Submit:** [actions/tax/intake-holistic-submit.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/actions/tax/intake-holistic-submit.ts) `tax_intake_holistic_submit` (AUTH, `MEMBER_SCOPED_ACTIONS`). `denyIfNotOwnClient(client_id)` runs **first**, before any other body field is read; then 403 for non-member/non-admin, 404 unknown client, **409** *"A Tax Planning Form has already been submitted for this client"* when any intake row carries that `client_id`. Inserts a row with `client_id` set, `deposit_required=false`, `deposit_amount_cents=0`, `status='completed'` and the derived Q1. **No deposit, no Checkout, no plan, no email, no enrollment** — the plan is started by an admin as before, and the answers card then shows on it.

## `tax_intake_requests` statuses

| Status | Meaning | Set by |
|---|---|---|
| `invited` | route B link drafted, form not yet submitted | `tax_intake_send_link`; a Stripe mint failure on link-submit puts it back here |
| `pending` | answers saved, awaiting the $500 Checkout | both submits |
| `waived` | no deposit owed; finalize runs inline | both submits |
| `paid` | deposit cleared, finalize in progress | webhook `checkout.session.completed` |
| `expired` | Checkout abandoned (`checkout.session.expired`), or route A could not mint a session | webhook / `tax_intake_submit`; route B may resubmit on the same token |
| `completed` | client + plan created (A/B), or answers stored against an existing client (Holistic) | `finalizeTaxIntake` / `tax_intake_holistic_submit` |

Other columns worth knowing: `payer` (`'member'` default / `'client'`), `intake_token` (unique), `link_sent_at` (re-stamped on a re-send), `link_opened_at` (once), `stripe_checkout_session_id` (unique), `stripe_payment_intent_id`, `paid_at`, `created_client_at` (the #327 latch), `confirmation_email_sent_at`, and the five document stamps `deposit_invoice_number` / `deposit_receipt_number` / `deposit_invoice_drive_id` / `deposit_receipt_drive_id` / `deposit_docs_at`. RLS deny-all. Schema: `20260917120000_tax_intake.sql`, `20260917200000_tax_intake_client_route.sql`, `20260917210000_tax_intake_deposit_docs.sql`.

## Webhook — two branches ahead of every TAX branch

[router/webhooks.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/router/webhooks.ts), placed after the Growth Credits fulfilment and **before the MAP 1 / TAX customer-keyed cascade**, each with a **positive guard on the session's own `metadata.payment_kind === 'tax_intake_deposit'`** (#473). The session has no Stripe customer, so nothing customer-keyed below can claim it, and nothing here can claim a retainer. Neither branch returns — the event falls through, harmlessly, to blocks that key on a customer it does not have.

- **`checkout.session.completed`** (also requires `payment_status === 'paid'` — card only, so there is no `async_payment_succeeded` twin): row by `stripe_checkout_session_id`; missing row → logged, nothing else; **`status` already `paid` or `completed` → redelivery, skipped**; otherwise stamps `stripe_payment_intent_id`, `paid_at` = **`existing || now`** (a redelivery never re-dates the payment, #470), `status='paid'`, then `finalizeTaxIntake(supabase, { ...intake, ...paid })`.
- **`checkout.session.expired`**: `status='pending'` → `'expired'` for that session id only. A row that already paid or completed is never touched.

Both are wrapped so a failure is logged and the webhook still answers 200. A declined card inside Checkout raises `payment_intent.payment_failed` on a PI that carries `pipeline=TAX` but no customer; the generic first-payment resolver finds no row for a null customer, so no bell is raised and the client simply retries inside Stripe (observed reasoning from the code, not exercised).

## `finalizeTaxIntake` — one function, two callers

[utils/tax-intake-finalize.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/utils/tax-intake-finalize.ts) — called inline by the waived branch of both submits and by the webhook, so the two cannot drift.

1. **Latch (#327):** a row with `created_client_at` AND `client_id` returns `{ already:true }` with its existing ids and touches nothing.
2. **Enrollment:** find-or-create the member's program-4 `member_enrollments` row (`date_enrolled` today, `program_status='active'`, `training_status='pre'`). Any member may start a tax client, so the first intake is what enrolls them.
3. **Client:** `nextClientRef(sb, member, false)` → `clients` insert (`client_ref`, `enrollment_id`, `member_number`, name, email, phone, `status='active'`).
4. **Junction:** `client_enrollments` (`client_id`, `enrollment_id`) — without it the client never appears in the member's list; a failure is logged loudly but does not undo the client.
5. **Plan:** `client_tax_plans` insert with `program_id=4`, `sandbox` = the intake's flag, `deposit_payment_intent_id` = the intake's PI (NULL when waived).
6. **Deposit Paid step:** the program-4 task is found by its **sentinel `status_options='tax_deposit_pi'`** (task 114, never by id or name); the `client_tax_progress` row is inserted or updated to `Completed` when money moved, or to **`N/A — No Deposit` on a waived intake** (`deposit_required=false`, 2026-09-18), with `completed_date` today either way. A missing sentinel simply leaves the step for an admin.
7. **Row update:** `client_id`, `tax_plan_id`, `status='completed'`, `created_client_at=now`.
8. **Documents — only when money moved** (next section). Best-effort: the case exists and the money is in.
9. **Confirmation email** unless `confirmation_email_sent_at` is set (the narrower second latch — a finalize that crashed after the plan insert still sends exactly one email on the retry).

## The house invoice + receipt pair

[utils/tax-deposit-docs.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/utils/tax-deposit-docs.ts) `issueTaxDepositDocuments` mirrors the retainer pair in `actions/tax/invoice-receipt.ts`: the same `document_numbers` allocation, **`INV-<client_ref>-NNNN` (global sequence) / `REC-<client_ref>-NNNN` (per owner)**, the same html2pdf render, the same Drive folder **`<First> <Last> - <client_ref>`** under `GOOGLE_DRIVE_FOLDER_ID` (found or created), no vault copy. Dedicated builders — one flat $500 line labelled *Tax Planning Deposit*, `programLabel(4)`, the *fully refundable if we are unable to proceed* footer — because the engagement renderer describes a signed agreement with a schedule.

- **Bill To / Received From = the payer**: the member on route A, the client on route B. The Drive folder is always the client's.
- Paid date and card last4 come from the PaymentIntent's `latest_charge`; both fall back (today / *Card* with no digits) and never block the documents.
- **Latch re-read fresh** off `tax_intake_requests`, not the caller's copy of the row. `deposit_docs_at` + both numbers present → **reuse arm**: the stored numbers, the two PDFs re-fetched from Drive.
- Numbers already stamped but no `deposit_docs_at` (a previous run reserved and then failed) → reused, not re-allocated. Freshly allocated numbers are **read back from `document_numbers` before either touches a document (#282)**; a missing reservation skips the documents and raises **`FAILURE_tax_deposit_docs`** (action-required, Jake by code default — there is no rule row; see Bells).
- Numbers are stamped on the row **before** the render; Drive ids + `deposit_docs_at` after the upload. A failed render returns null; a failed Drive token attaches without filing.

Returns null whenever no document could be produced, and the confirmation email then **drops its "attached" claim** rather than promising an attachment that is not there.

## Emails and recipients

| id | `template_name` | Drafted by | To | Cc (template) | `send_mode` |
|---|---|---|---|---|---|
| 275 | `TAX_new_case_confirmation` | `finalizeTaxIntake` — route A and any waived member intake | MEMBER | Tracy, Tray | false |
| 276 | `TAX_intake_request\|holistic` | `contract-invoice-receipt.ts` after MAP 1 payment 1 | MEMBER | ASSIGNED_PF, Tracy, Tray | false |
| 277 | `TAX_intake_link` | `tax_intake_send_link` | CLIENT | MEMBER, Tracy, Tray | false |
| 278 | `TAX_new_case_confirmation\|client` | `finalizeTaxIntake` — route B (`payer='client'`) | CLIENT | MEMBER, Tracy, Tray | false |
| 279 | `TAX_deposit_refund\|client` | `automation_TAX_depositrefund` when the plan's newest intake row says `payer='client'` | CLIENT | MEMBER, ASSIGNED_PF, Tracy, Tray | false |
| 181 | `TAX_deposit_refund` | `automation_TAX_depositrefund` otherwise — including a plan with **no** intake row (a hand-pasted deposit) | MEMBER (client fallback when the member has no email) | ASSIGNED_PF, Tracy, Tray | false |

All six are Draft (`send_mode=false`); all carry Anton + Paul in Bcc. **None carries an in-body footer** — the delivery layer adds it ([additional-contacts.md](additional-contacts.md#the-footer-is-also-central--utilsemail-signaturets-2026-09-17)). Every substitution uses replacer functions (#438) and every `gmailDraftFetch` call names the same template it selected (#356).

**Confirmation body (275/278):** `[Member First]` `[Member Name]` `[Client First]` `[Client Name]` `[DEPOSIT_LINE]` — the deposit sentence exists only when `deposit_required` AND a PI is on the row, and names the attachments only when both PDFs came out (*"… — your invoice and receipt are attached."*); on a waived intake it is empty (275) or a bare `.` (278). `[RECEIPT_BUTTON]` (the retired Stripe "View receipt" link) is substituted to empty for any body that still carries it; the data migration stripped it from both rows. Recipients: route A `RECIPIENT`/`MEMBER` = member; route B `RECIPIENT` = client (member fallback), `CLIENT`, `MEMBER`. **Multipart** with the two PDFs when attached, single-part otherwise; Cc/Bcc headers only when non-empty. Redirected to the sandbox address when `intake.sandbox`.

**Refund subject** (181 and 279, data migration `20260918140000_tax_deposit_refund_subject.sql`): `VFO Services - Tax Planning Deposit Refunded - [Client Name]`. Body tokens add `[Member First]` beside `[Client First]`, `[Refund Amount]`, `[Refund Date]`, `[Refund Reason]`, `[PF Name]`.

## The $250 Tax Planning Team share — the review step's Proceed

[utils/tax-deposit-team-share.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/utils/tax-deposit-team-share.ts) `transferDepositTeamShare`. Its **own leg** (#488): the deposit is collected on the VFO Services platform and half of it is **forwarded** to the planning group's connected account — fixed `DEPOSIT_TEAM_SHARE_CENTS = 25000`, never a percentage, with its own three columns `client_tax_plans.deposit_team_share_status` / `_transfer_id` / `_at`.

**Trigger — the single one, MOVED 2026-09-21:** `tax_save_task` ([actions/tax/save-task.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/actions/tax/save-task.ts)) when the saved task is **"Tax planner review complete"**, the status is **`Proceed with tax planning`**, the status genuinely changed, and the plan is program 4 — through the one shared entry point `fireDepositTeamShareForPlan`. *(Until 2026-09-21 it rode the Green/Red Light step's `Proceed`; that button no longer exists, so the review Proceed — the decision that authorises carrying on — is what forwards the money. The old call site is deleted, so a legacy `Proceed` re-saved on the Red Light step pays nothing.)* Isolated in its own try/catch so a Stripe outage never fails the step save. **Applies to every deposit plan**, the nine hand-pasted legacy ones included — the leg keys on `deposit_payment_intent_id`, not on an intake row.

| Status | When | Terminal |
|---|---|---|
| `Yes` | transfer created | yes |
| `N/A — No Deposit` | no `deposit_payment_intent_id` (waived intake, or a plan that never had one). **A waived intake is stamped with it AT PLAN CREATION** (`utils/tax-intake-finalize.ts` sets the column on the insert, 2026-09-21), so its review Proceed finds a terminal leg and does nothing. Terminal, so no trigger or sweep can ever revisit it | yes |
| `N/A — Legacy` | stamped by SQL only (migration `20260918170000`, v865): the 33 plans that had Proceeded before the leg existed, deposits split by hand — never written by code, never paid | yes |
| `Awaiting Planner Allocation` | a PI exists but `tax_planner_id` is NULL | no — released by allocation, retried by the sweep |
| `Failed` | planner has no group, group missing, group has no `stripe_account_id`, transfers capability not active, no Stripe key, or Stripe refused | no — retried by the sweep |

- Destination resolved exactly as the planner revshare leg does it: `tax_planners.member_type` → `tax_planning_groups.name` → `stripe_account_id`.
- **`connectTransfersActive` is probed before the key is spent (#489)**; `Idempotency-Key` = `deposit-team-tax-<plan.id>`, and after a recorded `Failed` the next attempt folds `deposit_team_share_at` into it (`-r<epoch>`), so a replayed error body never locks the retry out for 24 h.
- Transfer `description` (and metadata `kind=tax_deposit_team_share`, `tax_plan_id`, `client_id`, `client_ref`, `tax_planning_group`): `Tax Planning Revenue Share - Client: (<ref>) <name> - Tax Planner: <planner> — <group> - Deposit`. The same memo is stamped on the **destination payment** via `stampErtDestinationPayment`, best-effort after the status write.
- Stripe key: the platform secret picked by the client's TAX sandbox flag (`STRIPE_SECRET_KEY_SANDBOX` / `STRIPE_SECRET_KEY`).
- Success writes `Yes` + `deposit_team_share_transfer_id` and `clearJakeFailure`s the `Tax deposit team share FAILED — <name> (<ref>)` title. Every `Failed` raises **`FAILURE_tax_deposit_team_share`** (action-required) with the specific reason and *"The daily tax sweep will retry."*

**Release on allocation:** [actions/tax/allocate-planner.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/actions/tax/allocate-planner.ts) — planner slot only (never the team-member slot), a real target, a PI on the plan, status not terminal, and **`getReviewStepStatus(plan) === 'Proceed with tax planning'`** (2026-09-21; it was `getGreenRedStatus === 'Proceed'`); response carries `deposit_team_share`. **Nightly retry:** the tax revshare sweep ([actions/tax/revshare-sweep.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/actions/tax/revshare-sweep.ts)) runs a third pass over rows in `Failed` / `Awaiting Planner Allocation` with a PI, each gated on **the review step** actually reading Proceed; reported as `deposit_team_retried`. Both gates moved with the trigger, so neither can pay this leg ahead of the decision that authorises it.

In the UI the allocation step (Tax 1 order 2) sits above the review step (order 7), so `Awaiting Planner Allocation` is unreachable by normal clicking — it is the sweep's backstop and **has never fired live**.

## The refund — Tax Plan Red Light Refund

[actions/tax/deposit-refund.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/actions/tax/deposit-refund.ts) `automation_TAX_depositrefund` — the step-by-step is in [tax-planning.md Step 0b](tax-planning.md#step-0b--tax-plan-greenred-light-decision-inside-tax-1---diagnostic). What this branch changed: the refund POST carries `Idempotency-Key: deposit-refund-tax-<plan.id>` (a double click or a retried request cannot refund twice); the email is **addressed to whoever paid** — the plan's newest `tax_intake_requests.payer` picks 279 (client To, member Cc) or 181 (member To; the client's address is the fallback when the member has no email, logged); `[Refund Amount]` and every other token are substituted by function (#438); and the draft names the template it selected.

## What the three tax-plan surfaces show

All in [TaxPrioritiesTab.jsx](../../src/components/admin/tax/TaxPrioritiesTab.jsx) `TaxPlanTrackView`, mounted once from `ClientDetail.jsx` with `readOnly={isMember}` / `plannerMode={isPlanner}`.

- **Tax Planning Form card** (`TaxIntakeCard`, above the phases, all three surfaces): one `tax_intake_load` per plan view; header shows *Completed by the member* or *Completed by the client via link on <date>* and *Submitted <date>*; expands to the 37 label/answer rows. Hidden when the client has no intake row — every pre-2026-09-17 plan and every case an admin started by hand.
- **Deposit Paid** (`tax_deposit_pi`): the `pi_` text input + Save (manual paste **kept**) on admin/planner, the saved PI as a chip on the member view, plus a green **Paid via portal** chip when the intake row's `tax_plan_id` is this plan. The two document numbers ride on the same `tax_intake_load` payload.
- **Tax Plan Red Light** (`tax_refund`, display name since 2026-09-21): **shown only when the reviewer said Stop**, or when the step already carries history (a legacy `Proceed`, a `Stopped`, a succeeded refund) — otherwise it is hidden and dropped from every count on every surface. When shown it is listed on all three surfaces; the member view is read-only (a red **Refunded $500.00**, a red **Stopped**, or a legacy `Proceed`) **except on a Direct plan**, where the member owns the one button. That button is **Refund** on a deposit plan and **Stop tax planning** on a waived one.
- **Tax planner review complete**: the **$250 team share chip** (`$250 team share paid` / `$250 team share failed` / `Awaiting Planner Allocation` / `N/A — No Deposit`) moved here on 2026-09-21, beside the Proceed that now fires the leg. **Admin-only** — VFO's own money movement, hidden from `readOnly` and `plannerMode` like the pricing split card.
- **Allocation chips on the member view:** `tax_load_plans` now carries `tax_planner_name` + `team_member_name` on each plan because the member view cannot load the planner roster (`tax_planners_load` is admin-only).

## Gates and guards

| Action | List | In-handler |
|---|---|---|
| `tax_intake_eligibility`, `tax_intake_submit`, `tax_intake_send_link` | `MEMBER_SCOPED_ACTIONS` | member number = `auth.callerMemberNumber`; admin may pass `member_number`; 403 any other role |
| `tax_intake_holistic_submit` | `MEMBER_SCOPED_ACTIONS` | `denyIfNotOwnClient` first; then the same role check |
| `tax_intake_load` | **no gate list** — the card is on all three surfaces and a single allowlist would fence two out (the #309 named-gate shape); named on `TAX_PLANNER_ALLOWED_ACTIONS` because that list is a deny-by-default fence | member → `denyIfNotOwnClient`; planner → `denyIfNotPlannerClient`; admin free; else 403 |
| `tax_intake_link_load`, `tax_intake_link_submit` | `PUBLIC_HANDLERS` | the token row is the whole credential (#310) |
| `tax_start_plan`, `tax_save_task`, `tax_save_deposit_pi`, `tax_add_specialist`, `tax_remove_specialist` | **added to `ADMIN_ONLY_ACTIONS` 2026-09-17** — they were in no list, i.e. member-reachable at the API (`tax_save_task` now moves $250) | planners unaffected: the admin gate applies only to a member caller and `TAX_PLANNER_ALLOWED_ACTIONS` still lists the three they use |
| `tax_load_plans`, `tax_load_progress`, `tax_load_specialists` | (unchanged) | **2026-09-18:** gained `denyIfNotOwnClient` / the new `denyIfNotOwnPlan` ([utils/client-ownership.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/utils/client-ownership.ts)) beside the planner guard, which returns null for every non-planner and so fenced nothing for a member |

Five dead `msm_*` tax names that matched no dispatched action were removed from `ADMIN_ONLY_ACTIONS` at the same time (#256). All of it is exercised by `scripts/probe-tax-intake-refusals.ps1` in the edge repo (19 checks) — run it after any change to these handlers.

## Sandbox

`intake.sandbox` and `intake.stripe_account` are stamped at mint time from `loadSandboxConfigForMember("TAX", member)` (route A, send-link) and re-derived at link-submit; the global TAX config is `vfos`, live. Test Member 59524 is forced into sandbox by that helper on every route, the plan inherits `sandbox` from the intake, the confirmation and link emails redirect to the sandbox address off `intake.sandbox` / the global config, and the team-share and refund legs read the client's TAX config as every other tax money movement does. Route B's public page shows the test-values button only for an invitation whose token row belongs to a test member.

## Bells

| Rule key | Row in `notification_rules` | Raised by | Recipients | Kind | Cleared |
|---|---|---|---|---|---|
| `FAILURE_tax_deposit_team_share` | **seeded** by `20260917120000_tax_intake.sql` — area *Payment Failure Alerts*, sort 52, `action_required=true`, default `jlatham@elitert.com`, enabled | `transferDepositTeamShare` on every `Failed` write | Jake (editable in the Notification Editor) | action-required, `dedupe:"unread"` | `clearJakeFailure` on the successful transfer |
| `FAILURE_tax_deposit_docs` | **none** — `notifyJakeFailure` falls back to its code default recipient when no rule row exists (and cannot be disabled from the editor) | `issueTaxDepositDocuments` when a freshly allocated number is not found in `document_numbers` (#282) | Jake | action-required | nothing — the documents are issued by hand |

No other bell was added: the intake itself is silent to admins (the Tracy/Tray Cc on 275/277/278 is the signal), and the refund keeps its existing *Deposit refund issued* PF bell.

## Key files

**Backend** (`vfo-edge-functions/supabase/functions/vfo-admin-api/`):
- `actions/tax/intake-eligibility.ts`, `intake-submit.ts`, `intake-send-link.ts`, `intake-link-load.ts`, `intake-link-submit.ts`, `intake-holistic-submit.ts`, `intake-load.ts`
- `utils/tax-intake-questions.ts`, `utils/tax-direct-eligibility.ts`, `utils/tax-intake-finalize.ts`, `utils/tax-deposit-docs.ts`, `utils/tax-intake-link-email.ts`, `utils/tax-intake-request-email.ts`, `utils/tax-deposit-team-share.ts`, `utils/client-ownership.ts` (`denyIfNotOwnPlan`), `utils/email-signature.ts`
- `constants/member-types.ts`, `constants/role-gates.ts`, `router/dispatch.ts`, `router/webhooks.ts`
- touched: `actions/tax/save-task.ts`, `actions/tax/allocate-planner.ts`, `actions/tax/revshare-sweep.ts`, `actions/tax/deposit-refund.ts`, `actions/tax/load-plans.ts`, `actions/tax/load-progress.ts`, `actions/tax/load-specialists.ts`, `actions/pipeline/contract-invoice-receipt.ts`, `utils/email-delivery.ts`, `utils/gmail-draft.ts`
- migrations `20260917120000_tax_intake.sql`, `20260917120100_tax_intake_email_templates.sql`, `20260917200000_tax_intake_client_route.sql`, `20260917210000_tax_intake_deposit_docs.sql`, `20260918140000_tax_deposit_refund_subject.sql`; `scripts/probe-tax-intake-refusals.ps1`

**Frontend** (`vfo-react/src/`):
- `components/member/TaxIntakeForm.jsx` (new), `components/member/taxIntakeQuestions.js` (new mirror), `pages/TaxIntakePage.jsx` (new, `/tax-intake`)
- touched: `App.jsx`, `pages/MemberPortal.jsx`, `components/member/MemberMSMTracking.jsx`, `components/admin/tax/TaxPrioritiesTab.jsx`, `lib/api.js`

## Tables touched

- **Read:** `members`, `clients`, `client_tax_plans`, `tax_intake_requests`, `email_templates`, `pipeline_sandbox_config`, `program_client_phases` / `program_client_tasks` (the sentinel lookup), `tax_planners`, `tax_planning_groups`, `document_numbers`, `member_enrollments`.
- **Written:** `tax_intake_requests`, `member_enrollments` (insert), `clients` (insert; `tax_intake_requested_at`), `client_enrollments` (insert), `client_tax_plans` (insert; `deposit_team_share_*`; the refund columns), `client_tax_progress` (Deposit Paid), `document_numbers`, `notifications`.
- **External:** Stripe Checkout Sessions, PaymentIntents (read), Transfers, Refunds, Connect account capability probe; Gmail drafts; Google Drive folders + uploads; html2pdf.

## Proven / not proven

Live test 2026-09-18 on Test Member 59524 (sandbox-forced, fixtures deleted afterwards): route A paid, route B paid, waived A and waived B, the Holistic form entered by URL, a Green/Red Proceed with the $250 transfer, two refunds (one per payer), and — after the v864 fix — a waived plan advanced from Set Up through Request Tax Returns, allocation and a Green/Red Proceed that closed the leg `N/A — No Deposit`. **Code-only:** the Holistic MAP 1 trigger itself (the email was never produced by a real first payment), the `Awaiting Planner Allocation` arm and the sweep's third pass, the document reuse arm, `FAILURE_tax_deposit_docs`, `FAILURE_tax_deposit_team_share` on a real destination failure, a real (non-sandbox) deposit, and every template's first real send (all six are Draft).

## Cross-references

- The plan the case lands on: [tax-planning.md](tax-planning.md) (Step 0 / Step 0b)
- Webhook placement: [stripe-webhook.md](stripe-webhook.md)
- Recipients and the footer guard: [additional-contacts.md](additional-contacts.md)
- Bells: [notifications.md](notifications.md), [../NOTIFICATION_AUDIT.md](../NOTIFICATION_AUDIT.md) — **and, from 2026-09-21, the member's OWN bell**: the member portal header carries a `NotificationBell` scoped to the member's `member_logins.email`, and on a **Direct** plan (`clients.pf_member_number` set, stamped by this intake's finalize) every bell addressed to "the PF" is addressed to that member instead of a VFO login. The one exception is `TAX_client_decision_needed`, which goes to the allocated Tax Planner(s) on Direct. See [notifications.md § Direct tax plans: the PF IS the member](notifications.md#direct-tax-plans-the-pf-is-the-member-2026-09-21-unit-2-phase-5e).
- Columns: [../tables/tax.md](../tables/tax.md)
- Plan of record and the unit briefs: [../plans/direct-tax-planning/README.md](../plans/direct-tax-planning/README.md)
