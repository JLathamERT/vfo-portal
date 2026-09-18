# UNIT 1 BRIEF — Tax intake form + $500 deposit + auto-create + $250 team leg + linked refund + footer guard

You are the implementer (Opus). Fable planned this and will review your work. Jake tests by hand. Read this whole file before touching anything.

## Absolute rules
- EDIT ONLY inside these two worktrees. Never touch `C:\vfo-react\src`, `C:\vfo-react\docs` or `C:\vfo-edge-functions\supabase` directly.
  - edge: `C:\vfo-edge-functions\.claude\worktrees\vfo-session-setup-96fda1`
  - react: `C:\vfo-react\.claude\worktrees\vfo-session-setup-96fda1`
- Branch is `claude/vfo-session-setup-96fda1` in both. Do not create branches. Do not commit, push, merge, deploy (`supabase functions deploy`, `npm run deploy`) or apply migrations to the live DB. You may run `execute_sql` for READS only. Migrations are FILES in `supabase/migrations/` — Fable applies them after review.
- Never touch `boldsign-webhook`, never touch the `pipeRow` null-check in `router/webhooks.ts`, never convert an HTTP chain call to an in-process call, never add retries to write actions in `src/lib/api.js`.
- Read first (binding DOC MAP): `docs/flows/tax-planning.md` (Step 0/0b, Tax 1 order, "Tax planner review complete", Step 13 revshare), `docs/flows/tax-fee-process.md` (skim), `docs/architecture/07-server-chains.md` (webhook + sweep sections), `docs/architecture/03-edge-functions.md` (adding a handler), `docs/architecture/04-auth-and-sessions.md` (role gates), `docs/tables/tax.md`, `docs/flows/notifications.md` (notifyByRule + rule seeds), `docs/tables/documents.md` lines 37-45 (email_templates), `docs/GOTCHAS.md` for #327 #470 #473 #488 #489 #228 #324 #326 #455 #490 #141 #142 #196 #223 #448 #505.
- Security invariants: every new table = RLS enabled + `create policy "Deny all access" ... for all to public using (false)` in the SAME migration. Every member-callable handler keys ownership on `auth.callerMemberNumber`, never a body id.
- Default: no code comments unless the WHY is non-obvious. Match the portal's existing visual style (copy neighbouring components), not the legacy design.
- When done: run `C:\Users\jakel_fjetgbx\.deno\bin\deno.exe check --no-lock supabase/functions/vfo-admin-api/index.ts` (must be 0 errors), the action-count parity commands from `docs/SESSION_REFERENCE.md` (report the new number: expect 507 + the actions you add), and `npm run build` in the react worktree (exit 0). Report all three results verbatim. Then STOP and report back to Fable with: files changed, migrations written, actions added + which gate list each is in, the test script Jake should run, and anything you could not resolve.

## Product decisions (Jake's, final — do not re-open)
1. The member starts a tax client from the member portal: Tax Planning program > Clients tab > "Add new tax client" button > the 37-question form (below) > $500 deposit Checkout > done. Same form for every tax client. Unit 1 writes NO Direct route; `tax_route` stays NULL (add the column now, write nothing but NULL).
2. **Any member can start a tax client.** The Tax Planning tab must show for every member. Today it shows only when `member_program_enabled` has a row for program 4 (`MemberPortal.jsx:96-101`, `MemberMSMTracking.jsx:274-281`) and the Clients view needs a `member_enrollments` row (`MemberMSMTracking.jsx:287-291`). Change: program 4 is always visible in the member portal regardless of `member_program_enabled`; if the member has no program-4 `member_enrollments` row, the Clients tab still renders with the Add button (empty list), and the first successful intake creates the enrollment (`program_status 'active'`, `date_enrolled today`, `training_status 'pre'`). Do NOT change gating for any other program.
3. The member pays the $500. Waived automatically when the member already has >= 2 DISTINCT clients with `client_tax_plans.retainer_status='succeeded'` AND `post_review_client_decision in ('Proceed','Confirmed','Auto-Locked')` AND `post_review_decision in ('Continue - Revenue Share','Undecided')` AND `coalesce(refund_status,'')<>'succeeded'` AND `coalesce(deposit_refund_status,'')<>'succeeded'`. Put this predicate in ONE helper `utils/tax-direct-eligibility.ts` exporting `qualifyingTaxClients(sb, memberNumber) -> { count, clientIds }` and `depositWaived = count >= 2`. Unit 2 reuses it for Direct eligibility. The form shows "Deposit: waived (you have N qualifying clients)" or "Deposit: $500".
4. On payment (or immediately when waived) the system creates: the client (`clients`), the junction row (`client_enrollments`), the plan (`client_tax_plans` with `program_id 4`), stamps `deposit_payment_intent_id` (+ marks the "Deposit Paid" task Completed exactly as `tax_save_deposit_pi` does), links the intake row to client + plan, and drafts the confirmation email.
5. Confirmation email (NEW template, pipeline TAX, name `TAX_new_case_confirmation`, Draft mode, active). To `["MEMBER"]`, Cc `["tnmiller@vfo-services.com","tvaldes@vfo-services.com"]`, Bcc `["aanderson@elitert.com","platham@elitert.com"]`. Subject: `Confirmation of new case using VFO Services Tax Planning process - [Client Name]`. Body (HTML, house style, NO in-body footer — the guard adds it):
   ```
   Hello [Member First],

   We can confirm that we have received your tax planning diagnostic in respect of [Client Name].[DEPOSIT_LINE]

   [TEAM_LINE]

   Thank you. Please do not hesitate to reach out with any questions!
   ```
   `[DEPOSIT_LINE]` = ` We have also received the $500 deposit, for which we attach a receipt.` when a deposit was taken (attach the Stripe receipt: fetch the charge's `receipt_url` and put a "View receipt" button/link in the body — do not try to attach a PDF), else empty. `[TEAM_LINE]` = `In this case, the Tax Planning Team will be [Tax Planning Team].` ONLY when a planning group is known at that moment, else empty (PENDING Jake: whether the member picks the partner on the form; build the line conditional so either answer is a one-line change). Use replacer FUNCTIONS for every substitution (#438).
6. Green/Red Light step (`program_client_tasks` 116, sentinel `tax_refund`, program 4) is the single trigger for BOTH money movements:
   - Proceed -> a NEW $250 Connect transfer to the plan's planning group (`tax_planners.member_type` -> `tax_planning_groups.name` -> `stripe_account_id`, exactly as `utils/tax-planner-payout.ts:140-163` resolves it). Copy `transferPlannerShare`'s shape but as its OWN leg per #488: new columns `deposit_team_share_status text`, `deposit_team_share_transfer_id text`, `deposit_team_share_at timestamptz`; fixed amount 25000 cents; idempotency key `deposit-team-tax-<plan.id>` rotated only after a written `Failed` (append `-r<epochOfFailure>`); probe `connectTransfersActive` BEFORE spending the key (#489); statuses `Yes | Failed | Awaiting Planner Allocation | N/A — No Deposit` (no deposit taken => `N/A — No Deposit`, terminal, no transfer). Failure => bell rule `FAILURE_tax_deposit_team_share` (action-required, Jake) via notifyByRule; add a third pass in `actions/tax/revshare-sweep.ts` picking `deposit_team_share_status in (Failed, Awaiting Planner Allocation)` on plans whose Green/Red progress row status = 'Proceed' and `deposit_payment_intent_id is not null`, and clear the bell on success. `tax_allocate_planner` already releases the withheld planner leg; add the same release for this leg (grep how it calls `transferPlannerShare` and mirror).
   - Where to hook Proceed: the FE saves `'Proceed'` through `tax_save_task` (`TaxPrioritiesTab.jsx:3822-3890`). Add the transfer in `actions/tax/save-task.ts` right where the review-complete bells are handled (~258-347), keyed on task sentinel `tax_refund` + status `'Proceed'`, try/catch isolated so the save never fails because of Stripe. Idempotent: skip when `deposit_team_share_status` is already terminal.
   - Refund -> `actions/tax/deposit-refund.ts` unchanged in mechanism, BUT: add an `Idempotency-Key: deposit-refund-tax-<plan.id>` on the Stripe refund POST; re-address the email to the MEMBER (ctx MEMBER + `[Member First]` + `[Client Name]` tokens). Template 181 `TAX_deposit_refund` data migration: `to_list '["MEMBER"]'`, `cc_list '["ASSIGNED_PF","tnmiller@vfo-services.com","tvaldes@vfo-services.com"]'`, bcc unchanged; body becomes exactly:
     ```
     Hi [Member First],

     [Refund Reason]

     We have refunded the [Refund Amount] tax planning deposit you paid for [Client Name]. You should see the funds back on your card within the next few days.

     If you have any questions, just let us know.

     Thank you for your time.
     ```
     (no in-body footer; strip the old AI-PC block). Keep `[Refund Reason]` HTML-escaped with newlines -> `<br>` as today. If the plan has no member email, fall back to the client as today and log it.
7. Holistic: when a Holistic client's MAP 1 first payment settles (the same place `actions/pipeline/contract-invoice-receipt.ts` drafts the first-payment invoice/receipt email — find the exact chain point and add AFTER it, try/catch isolated), draft a NEW email to the MEMBER: template `TAX_intake_request|holistic` (pipeline TAX, Draft, To MEMBER, Cc ASSIGNED_PF + tnmiller + tvaldes, Bcc aanderson + platham). Subject `VFO Services - Tax Planning Form for [Client Name]`. Body: `Hello [Member First],<br><br>[Client Name] has completed their first Holistic payment. Please complete the Tax Planning Form for them so our tax planning team can get started.<br><br>[BUTTONS]` where BUTTONS is one green "Complete the Tax Planning Form" button to `${PORTAL_BASE}/member?tab=msm_tax&intake_client=<client_id>` (the member portal must open the form for that existing client, prefilled name/email/phone, NO deposit, on submit store the intake row with client_id set and no plan_id, no client creation). Stamp `clients.tax_intake_requested_at` (new nullable column) once so redelivery never re-sends (#327/#470).
8. Footer standardisation (ride-along, Jake's explicit ask): every outbound email ends with `VFO Services - Proactive Coordinator Team` (the existing `VFO_SIGNATURE` in `utils/gmail-draft.ts:71`). Implement a guard in the delivery layer: in `draftGmail` (`utils/gmail-draft.ts:30`) append `VFO_SIGNATURE` to `htmlBody` when it does not already contain `Proactive Coordinator Team`; in `gmailDraftFetch` and `deliverRaw` (`utils/email-delivery.ts`) decode the base64url raw, and if it does not contain `Proactive Coordinator Team`, append `VFO_SIGNATURE` to the END of the first `text/html` part (single-part: end of body; multipart: immediately before the next `--boundary` line that follows the html part), re-encode, and use that. Keep it in one helper `ensureSignature(raw|html)` with unit-style self-checks in a comment-free way (a small pure function; test it mentally on both shapes). The 118 existing per-site appends stay untouched (the guard makes them idempotent). Data migration: strip the in-body `AI-PC / Proactive Coordinator / VFO SERVICES` sign-off block (and any "Regards,"/"Best regards," line that only served it) from templates 185, 178, 177, 184, 181, 198, 199 — inspect each body first with a SELECT, write the migration as targeted `update ... set body = replace(...)` per row guarded by `where body like ...`, and print before/after text for Fable. Add `VFO_SIGNATURE` is NOT needed at those 5 senders any more because the guard handles it, but do not remove anything else.
9. Security ride-along: `tax_start_plan`, `tax_save_task`, `tax_save_deposit_pi`, `tax_add_specialist`, `tax_remove_specialist` are in NO gate list and therefore member-reachable at the API (`middleware/auth.ts:241-243`). Add all five to `ADMIN_ONLY_ACTIONS` in `constants/role-gates.ts` with a comment naming this brief's date. Planners are exempt from that gate (auth.ts:236-240) and `tax_save_task`/`tax_add_specialist`/`tax_remove_specialist`/`tax_allocate_planner` stay on `TAX_PLANNER_ALLOWED_ACTIONS`, so planner behaviour is unchanged — verify by reading the gate order in `middleware/auth.ts`. Also remove the dead names `msm_create_tax_plan`, `msm_add_tax_specialist`, `msm_save_tax_progress`, `msm_remove_tax_specialist`, `msm_archive_tax_plan` from role-gates.ts (#256) after grepping dispatch.ts to prove none is dispatched.

## The 37 questions (store as jsonb keyed q1..q37; render in this order, two columns on desktop, one on mobile)
Required = `*`. In the portal Q7-Q9 are prefilled from the session and hidden (member name, member email, `members.trading_name`).
1* Who is completing this form? radio: Advisor for Client | Accountant for Client | Client
2* Client First Name  3* Client Last Name  4* Client Email  5* Client Phone Number
6* Client State of Residence — select of US states + Canadian provinces
7 Associated VFO Member (hidden, prefilled)  8 Introducer Email (hidden)  9 Introducer Firm Name (hidden)
10* Filing Status radio: Married Filing Jointly | Head of Household | Single | Married Filing Separately
11 If married & filing jointly, spouse's name & email (text)
12* Does client have children? If so, how many? (text)
13* Accredited Investor? radio: Yes | No | Not Verified  (label note: Non Accredited Investors will have limited options)
14* Household W-2 Income  15* Household Capital Gains  16* Dividends/interest or other income (if applicable)  — money text inputs, `$`-stripped
17* Estimated Net-Worth radio: Under $1m | $1m – $2.5m | $2.5m – $5m | $5m – $10m | $10m – $25m | $25m+ | Unknown
18* Federal income taxes paid last year radio: Under $100k (The client is currently not a good fit for VFO Tax Planning. Please reach out to Tracy Miller if you have any questions) | Combined $100K across previous three years | $100k - $250k | $250k - $500k | $500k+
19 Potential events or sales creating a tax liability of $100k+ in the next three years? (text)
20* Does client own a business? radio Yes | No
21 Entity type radio: Sole Proprietorship (Schedule C) or Single Member LLC | S-corp | C-corp | Partnership | Multiple Entity Types | Other
22 Estimated annual gross business revenue (all operating businesses combined)  23 Estimated annual net business profit (all operating businesses combined)
24* Roth conversion planning included if appropriate? radio Yes | No | Unsure
25 Pre-tax retirement account balances (optional)  26 Real estate values not including primary residence (optional)  27 Brokerage balances (optional)  28 Available cash or cash equivalents (optional)
29 Interested in recovering federal income taxes paid in prior years? radio Yes | No | Unsure
30* Client's primary focus radio: Prior Tax Years | Future Tax Years
31* Primary tax focus relating to radio: One-time Taxable Transaction | Continuing Taxable Planning Required
32* Professionals the client would typically run financial decisions by (text)
33* Rate that professional radio: Great | Average | Poor | N/A
34* Specific tax strategies to include or exclude (textarea)
35* Tax risk mindset radio: Very Conservative | Moderately Conservative | Average Risk Mindset | Moderately Aggressive | Very Aggressive
36* Unusual income or life changes (textarea; keep the long helper text from the form)
37 One time or large transaction details (textarea)
Validation is FE + BE lockstep (#306/#314): required fields non-blank, email shape on Q4, Q18 "Under $100k" is allowed but shows the fit warning inline. Answers are READ-ONLY afterwards (no pre-fill of any tax step).

## Data model (write the migration files; Fable applies)
Migration A `2026091<N>_tax_intake.sql`:
- `create table public.tax_intake_requests (id bigint generated always as identity primary key, member_number text not null, client_id integer null references clients(id) on delete set null, tax_plan_id integer null references client_tax_plans(id) on delete set null, program_id integer not null default 4, answers jsonb not null, client_first_name text, client_last_name text, client_email text, client_phone text, deposit_required boolean not null, deposit_amount_cents integer, stripe_account text, sandbox boolean not null default false, stripe_checkout_session_id text unique, stripe_payment_intent_id text, status text not null default 'pending', paid_at timestamptz, created_client_at timestamptz, confirmation_email_sent_at timestamptz, created_at timestamptz not null default now())` + index on member_number + RLS enabled + deny-all policy + `comment on` for status vocabulary (`pending | paid | waived | expired | completed`).
- `alter table client_tax_plans add column if not exists tax_route text null; comment ...` ("NULL = classic VFOS process; 'direct' = member-run. Single writer TBD in unit 2.")
- `alter table client_tax_plans add column if not exists deposit_team_share_status text, add column deposit_team_share_transfer_id text, add column deposit_team_share_at timestamptz;`
- `alter table clients add column if not exists tax_intake_requested_at timestamptz;`
- notification_rules insert for `FAILURE_tax_deposit_team_share` (copy the shape of the `TAX_planner_share_withheld` seed; find it with grep in migrations).
- email_templates inserts for `TAX_new_case_confirmation` and `TAX_intake_request|holistic` (idempotent `where not exists`), template 181 update, and the 7 footer strips (Migration B, separate file, DATA only).

## Backend actions (all in `actions/tax/intake-*.ts`, registered in `router/dispatch.ts`)
- `tax_intake_eligibility` (AUTH, `MEMBER_SCOPED_ACTIONS`): returns `{ deposit_required, qualifying_count, deposit_amount: 500 }` for the caller.
- `tax_intake_submit` (AUTH, `MEMBER_SCOPED_ACTIONS`; handler additionally 403s any non-member caller unless admin, per #490 shape): validates answers server-side, computes waiver via the helper, resolves sandbox/key via `loadSandboxConfigForMember(sb, "TAX", memberNumber)` (member-keyed — no client exists yet; this also covers Test Member 59524's forced sandbox), inserts the intake row. If waived -> calls the shared `finalizeTaxIntake(sb, intakeRow)` immediately and returns `{ ok, waived: true, client_id, tax_plan_id }`. Else mints a `mode=payment` Checkout on the VFO Services key (copy `actions/gc/create-checkout.ts` exactly: price table server-side, origin-derived success/cancel URLs against `constants/allowed-origins.ts`), `line_items[0][price_data][product_data][name]="VFO Tax Planning Deposit - <Client Name>"`, `metadata[pipeline]="TAX"`, `metadata[payment_kind]="tax_intake_deposit"`, `metadata[intake_id]`, `metadata[member_number]` on BOTH the session and `payment_intent_data[metadata]` (#473), card only (`payment_method_types[]=card`), stores the session id on the row, returns `{ ok, url }`. Success URL returns the member to the portal Tax Planning Clients tab with `?intake=<id>&paid=1`.
- `tax_intake_holistic_submit` (AUTH, `MEMBER_SCOPED_ACTIONS` + `denyIfNotOwnClient(client_id)` FIRST): stores the intake row with `client_id`, `deposit_required=false`, `status='completed'`, no client/plan creation. Refuses when the client already has an intake row (409, message).
- `tax_intake_load` (AUTH, in NO list, confined in-handler): `{ client_id }` -> the latest intake row's answers for that client. Member callers pass `denyIfNotOwnClient`; planner callers pass `denyIfNotPlannerClient`; admins unrestricted. Used by the plan card on all three surfaces.
- `finalizeTaxIntake(sb, intake)` in `utils/tax-intake-finalize.ts` (shared by submit-waived and the webhook): find-or-create `member_enrollments` (program 4); `client_ref = nextClientRef(sb, member_number, false)`; insert `clients` `{ client_ref, enrollment_id, member_number, first_name, last_name, email, phone, status: 'active' }`; insert `client_enrollments`; insert `client_tax_plans { client_id, program_id: 4, sandbox: intake.sandbox, deposit_payment_intent_id }`; upsert the `client_tax_progress` row for the program-4 "Deposit Paid" task (task 114) as `Completed` exactly as `save-deposit-pi.ts:40-58` does (only when a PI exists); update the intake row (`client_id`, `tax_plan_id`, `status='completed'`, `created_client_at`); draft the confirmation email through `resolveTemplateRecipients` (ctx MEMBER = member email) + `gmailDraftFetch`/`deliverRaw` with the template name actually used (#356), stamp `confirmation_email_sent_at` once. Every step idempotent: if `intake.client_id` already set, return the existing ids (this is the #327 latch — the column that proves the side effect happened is `tax_intake_requests.created_client_at`).
- Webhook: in `router/webhooks.ts`, a NEW `checkout.session.completed` branch placed AHEAD of the other TAX session branches, positively guarded on `session.metadata.payment_kind === 'tax_intake_deposit'` and `payment_status === 'paid'`: load the intake row by `stripe_checkout_session_id`; if `status` already `paid|completed` return (redelivery); set `stripe_payment_intent_id`, `paid_at = existing || now`, `status='paid'`; call `finalizeTaxIntake`. Log the account the event came from as the neighbouring branches do (#485). Card only, so no async_payment branch — but add a `checkout.session.expired` arm that marks the intake `expired` when still `pending` (so the member can resubmit).
- `automation_TAX_depositrefund` changes per decision 6 (idempotency key + member addressing).
- `save-task.ts` Proceed hook + `utils/tax-deposit-team-share.ts transferDepositTeamShare(sb, plan, stripeKey)` per decision 6; sweep pass; allocate-planner release.
- Footer guard per decision 8.
- Gate edits per decision 9. Every new action: name the gate list it sits in, in a comment at the registration line.

## Frontend
- `MemberPortal.jsx` / `MemberMSMTracking.jsx`: program 4 always visible + enrollment-less Clients view (decision 2). "Add new tax client" button at the exact spot the old "+ Add Client" lived (`MemberMSMTracking.jsx:733`, markup in the brief's source commit `85d4147`). Button opens `src/components/member/TaxIntakeForm.jsx` (new): eligibility line at top (deposit $500 vs waived + count), the 37 questions, Submit -> `tax_intake_submit`; when a `url` comes back `window.location.assign(url)`; on return with `?intake=&paid=1` show a success card ("Client created. We have emailed you a confirmation.") and refresh the client list. On waived, same success card immediately. Holistic entry: `?intake_client=<id>` opens the same form prefilled and submits to `tax_intake_holistic_submit`.
- Admin + planner + member plan views: a collapsible read-only "Tax Planning Form" card on the tax plan (in `TaxPrioritiesTab.jsx` near the Pricing & revenue split card), loading `tax_intake_load` lazily, rendering the 37 answers with their labels. Hide entirely when no intake exists.
- Admin: the Green/Red Light step shows the $250 leg status chip after Proceed (`Yes` green, `Failed` red, `Awaiting Planner Allocation` amber, `N/A — No Deposit` grey) next to the existing Proceed pill.
- Deposit Paid step: unchanged input, but when `deposit_payment_intent_id` was stamped by intake, show "Paid via portal" beside the PI.
- api.js: `tax_intake_submit` is a WRITE — no retry. Add a 30 s timeout entry only if the default is shorter than the Checkout mint needs (read `src/lib/api.js:17` table).

## Test script (write the final version for Jake; this is the shape)
1. Log in as Test Member 59524 on the dev server (`cd C:\vfo-react\.claude\worktrees\vfo-session-setup-96fda1; npm run dev`, no env override). Tax Planning tab visible even if not enabled/enrolled.
2. Add new tax client -> form -> deposit shows $500 (59524 has 0 qualifying clients) -> submit -> Stripe sandbox Checkout (4242) -> return -> success card -> client appears in list.
3. Admin: open the client -> Tax Planning -> Deposit Paid done with PI + "Paid via portal"; Tax Planning Form card shows 37 answers; Gmail Drafts has `TAX_new_case_confirmation` to the member with receipt link.
4. Admin: allocate a planner from Test Group; Tax planner review complete = Proceed; Green/Red Light Proceed -> `deposit_team_share_status='Yes'` with a sandbox transfer id to the Test Group account; re-click is a no-op.
5. Second run: Green/Red Light Refund -> refund succeeds, draft addressed to the member with the new wording.
6. Waiver: temporarily prove with SQL on a fixture member who has 2 qualifying clients (READ the count; Jake can flip a fixture) -> form says waived -> submit creates client + plan with no Checkout and `N/A — No Deposit` on Proceed.
7. Holistic: on test client 62 trigger the intake email path or hand-open `?intake_client=62` -> submit -> intake row with client_id, no new client.
8. Footer: pick one previously footer-less email (e.g. a CEO countersign draft) and one previously double-footer template (TAX_member_revshare) -> exactly one standard footer each.
9. Security: curl `tax_start_plan` / `tax_save_task` with a member token -> 403; with a planner token on an own-group plan -> 200.
Fixtures to clean afterwards: list every row/object you create.

## Reporting format back to Fable
- Files changed (path list), migrations (file names), actions added with gate list, FE components added.
- Gate results: deno check, action count (old -> new), npm run build.
- The exact before/after text of the 7 footer strips and template 181.
- Open questions / anything skipped, explicitly.
