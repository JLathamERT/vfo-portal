# UNIT 1b BRIEF — second intake route: the CLIENT completes the form and pays via a link

Extension of unit 1 (read `unit1-brief.md` in this folder first — every rule there still applies, same two worktrees, same hard limits: no commits, no deploys, no live migrations, MCP reads only, edit only inside the two `vfo-session-setup-96fda1` worktrees). Unit 1 is already DEPLOYED as v860 with both its migrations applied; the member route is being click-tested by Jake right now — do NOT change its behaviour except where this brief says so.

## Product decisions (Jake, 2026-09-17, final)
1. Before the form the member picks a route: **(A) "I will complete the form for my client"** — the existing member route, unchanged; or **(B) "Send my client a link to complete it themselves"** — the member enters the client's first name, last name and email; the client receives a link to a PUBLIC page carrying the same 37 questions and pays the $500 at the end.
2. **Question 1 ("Who is completing this form?") is REMOVED from the UI on both routes.** The server fills `answers.q1` itself: route A → `"Advisor for Client"` or `"Accountant for Client"` from the member's type (reuse the shared `ACCOUNTANT_TYPES` list — backend copy in `constants/` or wherever `member_type` classification already lives; grep `ACCOUNTANT_TYPES`; anything not an accountant type is an advisor); route B → `"Client"`. Validation no longer requires q1 from the body (accept and ignore it if sent). Keep q1 in the stored answers and on the read-only card so the planners still see who completed it.
3. **Deposit rule is the SAME on both routes**: waived when the MEMBER already has 2 qualifying clients (`qualifyingTaxClients(member_number)`), evaluated at SUBMIT time on the row's `member_number`; otherwise the CLIENT pays $500 on route B (the member pays on route A, as now).
4. Emails are addressed by PAYER: route A → member (as built); route B → client, member Cc. Three template rows, all Draft (`send_mode=false`), bodies below — Jake approved the wording; the ONLY edit he asked for is the first sentence of the link email, use exactly what is written here.
5. After Stripe on route B the client lands on a plain public thank-you page, no login.

## Data (migration file `supabase/migrations/20260917200000_tax_intake_client_route.sql`)
- `alter table public.tax_intake_requests add column if not exists payer text not null default 'member';` comment: `'member' = the member completed and paid (route A); 'client' = the client completed via the emailed link and paid (route B)`.
- `add column if not exists intake_token text unique;` comment: the whole credential of the public `/tax-intake` page (#310) — 32-byte hex, minted by `tax_intake_send_link`, single use.
- `add column if not exists link_sent_at timestamptz;` `add column if not exists link_opened_at timestamptz;`
- status vocabulary gains `invited` (link drafted, form not yet submitted) — update the column comment.
- Templates (pipeline TAX, active, send_mode false, idempotent inserts):
  - `TAX_intake_link` — To `["CLIENT"]`, Cc `["MEMBER","tnmiller@vfo-services.com","tvaldes@vfo-services.com"]`, Bcc `["aanderson@elitert.com","platham@elitert.com"]`. Subject `VFO Services - Tax Planning Form from [Member Name]`. Body:
    ```
    Hello [Client First],

    To get your tax planning started with VFO Services and [Member Name], please complete the short Tax Planning Form using the button below.[DEPOSIT_SENTENCE]

    [BUTTONS]

    If you have any questions, [Member Name] will be happy to help.
    ```
    `[DEPOSIT_SENTENCE]` = ` A $500 deposit is taken at the end of the form, and it is fully refundable if we are unable to proceed.` when the member is NOT waived at send time, else empty. `[BUTTONS]` = one green button "Complete the Tax Planning Form" → `${PORTAL_BASE}/tax-intake?token=<intake_token>`.
  - `TAX_new_case_confirmation|client` — To `["CLIENT"]`, Cc `["MEMBER","tnmiller@vfo-services.com","tvaldes@vfo-services.com"]`, same Bcc. Subject `Confirmation of your Tax Planning Form - [Client Name]`. Body:
    ```
    Hello [Client First],

    Thank you. We have received your Tax Planning Form[DEPOSIT_LINE]

    [RECEIPT_BUTTON]Your tax planning team will be allocated in due course, and [Member Name] will keep you updated on next steps.

    Thank you. Please do not hesitate to reach out with any questions!
    ```
    `[DEPOSIT_LINE]` = ` and your $500 deposit, for which we attach a receipt.` when a deposit was taken, else `.`.
  - `TAX_deposit_refund|client` — To `["CLIENT"]`, Cc `["MEMBER","ASSIGNED_PF","tnmiller@vfo-services.com","tvaldes@vfo-services.com"]`, same Bcc. Subject same as 181. Body (house wrapper like 181):
    ```
    Hi [Client First],

    [Refund Reason]

    We have refunded your [Refund Amount] tax planning deposit. You should see the funds back on your card within the next few days.

    If you have any questions, just let us know.

    Thank you for your time.
    ```

## Backend
- `tax_intake_send_link` (AUTH, `MEMBER_SCOPED_ACTIONS`, keys on `auth.callerMemberNumber`, admin may pass member_number): body `{ client_first_name, client_last_name, client_email }` → validates (email shape), inserts `tax_intake_requests { member_number, payer:'client', status:'invited', intake_token, client_* , answers: '{}'::jsonb (NOT NULL — store an empty object), deposit_required: computed now for the email sentence only, sandbox/stripe_account via loadSandboxConfigForMember }`, drafts `TAX_intake_link` via resolveTemplateRecipients (ctx CLIENT = client email, MEMBER = member email, RECIPIENT = client email) + gmailDraftFetch with the exact template name, stamps `link_sent_at`, returns `{ ok, intake_id }`. Re-sending for the same client email while a row is `invited` REUSES that row and re-drafts (no second token).
- PUBLIC handlers (`PUBLIC_HANDLERS`, no auth; the token row is the whole credential, the body selects nothing else — #310): 
  - `tax_intake_link_load` `{ token }` → 404 on unknown token; returns `{ status, client_first_name, client_last_name, client_email, member_display_name, deposit_required (recomputed now), deposit_amount, questions }`; stamps `link_opened_at` once. A row already `completed`/`paid` returns `{ status }` only so the page can show "already submitted".
  - `tax_intake_link_submit` `{ token, answers }` → refuse unless status is `invited` or `expired` (409 otherwise); server sets `answers.q1='Client'`; validates; recomputes waiver on the row's member; stores answers + client fields (the client may correct their name/phone; email stays the invited one); waived → `finalizeTaxIntake` immediately (payer client → confirmation `|client` template) and return `{ ok, waived:true }`; else mint the Checkout exactly like `tax_intake_submit` but with `success_url = ${base}/tax-intake?token=<token>&paid=1` and `cancel_url = ${base}/tax-intake?token=<token>`, metadata unchanged (`payment_kind: tax_intake_deposit`, `intake_id`, `member_number`), and return `{ ok, url }`. The existing webhook branch needs NO change (it keys on the session id).
- `finalizeTaxIntake`: pick the confirmation template by `intake.payer` (`TAX_new_case_confirmation` vs `|client`); on client route ctx RECIPIENT = client email, CLIENT = client email, MEMBER = member email, `[Member Name]` token added (member first+last), `[Client First]` = client first name. Everything else identical (client + enrollment + plan + Deposit Paid step + latch).
- `deposit-refund.ts`: look up the plan's intake row (`tax_intake_requests` by `tax_plan_id`, newest); `payer === 'client'` → template `TAX_deposit_refund|client`, To client, ctx as above; otherwise the current member addressing (no intake row = hand-pasted deposit → member, Jake's decision). Pass the template name actually used to gmailDraftFetch (#356).
- `tax_intake_load` response gains `payer` and `link_sent_at` so the card can say "Completed by the member" / "Completed by the client".
- `tax_intake_submit` (route A): server sets `answers.q1` from the member type; drop the q1 required rule.
- `utils/tax-intake-questions.ts` + FE mirror: q1 becomes `type: "derived"` (not rendered, not validated from the body); keep it in `TAX_INTAKE_QUESTIONS` so the card labels it.

## Frontend
- `TaxIntakeForm.jsx`: a ROUTE CHOOSER step first (two cards: "Complete the form for my client" / "Send my client a link"), except on the Holistic `?intake_client=` entry which skips straight to the form as now. Route B shows a 3-field mini form (first, last, email) + "Send link" → `tax_intake_send_link` → success card "We have drafted the Tax Planning Form link for <name>. It will be sent shortly." (it is a Gmail DRAFT until the template is switched to send — say so in the report, not on screen).
- New public page `src/pages/TaxIntakePage.jsx`, route `/tax-intake` in `App.jsx` (raw fetch, no session — copy `TaxDecidePage.jsx`'s fetch idiom and the anon-key header it uses): loads by token, shows the member's name in the intro, renders the same 37-question form component in a `publicMode` (no session, no eligibility call, deposit line from the load response), submits to `tax_intake_link_submit`, redirects to Stripe when `url` comes back; `?paid=1` or a waived submit shows the thank-you: "Thank you. Your Tax Planning Form has been received." A `completed`/`paid` row shows "This form has already been submitted." Route page count becomes 35 — say so.
- Read-only card on the plan: "Completed by the client via link on <date>" or "Completed by <member>".
- Remove the q1 radio from the rendered form on every route.

## Test script additions (write the final numbered version)
Route B end to end as 59524: send link → draft to sandbox with the right sentence → open `/tax-intake?token=` in a private window → q1 absent → submit → Stripe test card → thank-you page → admin sees client + plan + card "Completed by the client" → confirmation `|client` draft to the client with receipt → Green/Red Refund drafts `TAX_deposit_refund|client` to the client. Token misuse: reopen the link after completion → "already submitted"; a forged token → 404; submit twice → 409. Waived member (59376) on route B → no deposit sentence in the link email, no Checkout, `N/A — No Deposit`. Route A regression: q1 gone from the screen, stored as Advisor/Accountant for Client.

## Gates + report
deno check 0; action count 511 → 514 (`tax_intake_send_link` AUTH member-scoped; `tax_intake_link_load` + `tax_intake_link_submit` PUBLIC — name the gate/list for each in dispatch.ts comments); `npm run build` exit 0 with 35 route pages; migration file written, NOT applied; report files changed, the three template bodies as plain text, the exact PUBLIC_HANDLERS entries, and the test script. Do not touch the deployed member-route behaviour beyond q1 and the payer-aware template choice.
