# VFO Tax Diagnostic — the public form and its queue (added 2026-09-23)

The public, no-login replacement for the Unbounce tax page. Anyone can open **`vfoportal.com/tax-diagnostic`**: a client for themselves, or a member (with or without a portal login) for their client. It asks the same 39 questions as the member-run [tax intake](tax-intake.md) (37 until q38, the Rapid Route preference, was added on 2026-09-25; q39, the personal "anything else" question, on 2026-09-28), plus three of its own. Decisions 30–37 in [plans/direct-tax-planning/README.md](../plans/direct-tax-planning/README.md) are the plan of record for the original queue.

**PAY-FIRST since 2026-09-30 (Jake; v924/v925, migrations `20260930120000` + `20260930130000`).** The form's last button is **Proceed**, and what happens depends on the member the form names:

| The form names | What happens |
|---|---|
| **One member** (the client's referrer, or the member completing it) | **Auto-approved**: the diagnostic is stored `confirmed` with `confirmed_by='Tax Diagnostic form (auto)'`, an intake row is minted, and the payer (the client if *I am the client*, the member if a member filled it in) goes straight to `/tax-deposit-pay`. The case is created by the webhook's `finalizeTaxIntake` when the deposit clears. **If that member already qualifies for the deposit waiver, nobody pays and the case is created at once** (Jake accepted that a public pick of such a member's name is trusted). |
| **"No one"** (a lead) | The CLIENT pays first: an intake row with **no member** (`member_number` NULL) is minted and the client goes to `/tax-deposit-pay`. Once paid it waits under **Pending** for the team to choose the member (**Confirm** — creates the case) or **Deny** (refunds the $500). An unpaid lead never appears on the admin page (only paid forms show, since 2026-10-07), so there is nothing to dismiss. |
| **A name that matches two members**, or a member payer with no email | Queued exactly as before: no pay step; the team chooses the member and payer and Confirms, and the deposit-link email follows. |

The whole routing switches on only when the page sends **`pay_first: true`** (only the new page does), so an older copy of the page — or the published page between a backend and a frontend deploy — is queued as before rather than stranded on "Thank you" with a payment it cannot reach (#564). From there the case runs the ordinary intake pipeline: the `/tax-deposit-pay` card-or-ACH choice page, the Stripe webhook and `finalizeTaxIntake` ([tax-intake.md](tax-intake.md)).

## The release switch

`portal_feature_flags` row **`tax_diagnostic`**, seeded `enabled_for_all=false` and **switched ON for everyone on 2026-09-23 (Jake's call)** — and the frontend was published 2026-09-24 (`live-206-tax-diagnostic`), so the page is live to the public. A public page has no member, so **only `enabled_for_all` is read** (`featureEnabledGlobally`, fail-closed). While it is off:
- the five public actions answer 404 (the three below plus the personal link's `tax_holistic_form_load` / `_submit`);
- the page shows "This form is not available" (the personal `?client=` link too);
- the deposit link of an already-confirmed diagnostic 404s as well (the choice page's `tax_intake_deposit_load` / `_checkout` and the old `/tax-intake` link actions alike), because such an intake row rides this flag (decision 34).

The admin tab stays usable and shows an amber "public page is switched off" banner. **Switch = the superadmin Feature Switches tab (More ▾ → Feature Switches, 2026-09-28) — this card has Off for all / On for all only, no test-member position — or `update portal_feature_flags set enabled_for_all=<true|false>, updated_at=now() where key='tax_diagnostic'`; no deploy either way.** See [tax-planning.md → Feature Switches](tax-planning.md#feature-switches-2026-09-28).

## The public page

[src/pages/TaxDiagnosticPage.jsx](../../src/pages/TaxDiagnosticPage.jsx) renders `TaxIntakeForm` in public mode with a `prelude` of three questions and the numbering continued after them (`numberOffset` 1–3 depending on the prelude answers; q20's follow-ups q21–q23 show only on a Yes and are lettered, e.g. 17a–17c — see [tax-intake.md](tax-intake.md#the-form--one-definition-mirrored)). It is not a token page, but it uses raw `fetch` like the token pages do.

1. **Who is completing this form?** *I am the client* / *I am a VFO member completing this for my client*. Nobody can verify this answer on a public page. It only PRE-SETS the payer at Confirm.
2. **A client** is asked **Were you referred by a VFO member?**: *Yes* / *No one / I heard about VFO elsewhere*. **A member** skips this and goes straight to **Your name (VFO member)**.
3. The follow-up depends on that answer:
   - **Yes** (or any member) → the member-name type-ahead (`tax_diagnostic_member_search`, debounced, from 3 letters, NAMES only).
   - **No one** → **How did you hear about us?** Friend / Business partner / Social media / Post / Other (Other opens a text box).

   The search only appears once the answer calls for it (Jake, 09-23 click-through). Switching "Who is completing" clears the questions below it.

The 39 intake questions follow. Q1 is derived and Q7–Q9 are hidden, exactly as elsewhere. On the diagnostic page q4 is typed freely, because there is no invitation to lock it to. **Q38 "Client would prefer"** (Traditional 6-Step Process, pre-selected / Rapid Route) is optional and is stored with the other answers; it takes effect only when a confirmed diagnostic's deposit finalizes, where `finalizeTaxIntake` stamps `client_tax_plans.rapid_route` from it ([tax-intake.md](tax-intake.md)). **Q39**, the last question (optional), reads *"…would help us know **you** better?"* when *I am the client* is picked and *"…know **the client** better?"* otherwise (the question's `selfLabel`, passed as `clientFilling`); the admin card shows the "the client" wording. The page:
- says under its title that **Proceed** leads to the $500 deposit by card or bank transfer, unless no deposit is due; its submit button reads **Proceed** and the request carries `pay_first: true`;
- follows a returned `pay_token` straight to `/tax-deposit-pay?token=…` (the deposit is taken there, never on this page);
- otherwise ends on "Thank you." — *"…no payment is needed…"* for a waived member, *"…in touch shortly with the next step"* for a queued one;
- carries a hidden **honeypot** input (`website`);
- shows the "Fill with test values" button on the **dev server only** (`import.meta.env.DEV`), never in the production build.

## The personal link for an EXISTING client (since 2026-10-07; per plan since 2026-10-09)

**Two kinds of token open the same page** (`formTarget` in `actions/tax/holistic-form.ts`):
- **The PER-PLAN link (2026-10-09, Holistic Tax Priorities plans only)** — `/tax-diagnostic?client=<client_tax_plans.personal_form_token>`. The team copies it from the **Personal Tax Planning Form link** box at the top of a Holistic tax plan (admin view only; `PersonalTaxFormLink.jsx` → `tax_personal_link_get {tax_plan_id}`, `ADMIN_ONLY_ACTIONS`). The box loads the link when the plan opens (minting the plan's token the first time, race-safe `.is(null)`, never changed after), shows only **Copy link** (no URL), and is **hidden once the plan shows a Tax Planning Form**. The token is the plan's OWN — it does NOT open the client's `/tax-upload` page. A VFO Tax Planning plan (program 4) never gets one: the action 400s and the form treats such a token as invalid — that client's route in is the deposit-paying diagnostic / intake. The form is stored ON the plan (`tax_intake_requests.tax_plan_id`, `program_id` = the plan's), and the plan link counts as submitted (load `submitted`, submit **409**) exactly when the plan page SHOWS a form: the plan's own, or a client-level one with no plan. The bell title adds `(tax plan <id>)` so a second plan's form is not deduped away (`dedupe:"ever"` keys on title + client).
- **The client-level link (2026-10-07)** — the original, below; unchanged, one form per client.

**`/tax-diagnostic?client=<clients.tax_upload_token>`** — the same page, but for a client who already exists: the member is known, there is **no $500 deposit**, and the answers are stored against that client. It is the **Tax Form** button in the MAP 1 payment-1 invoice + receipt email (`[TAX_UPLOAD]` in `actions/pipeline/contract-invoice-receipt.ts`, shown only when a tax priority was picked; the token is minted there if the client has none — the same per-client token the `/tax-upload` links carry). It replaced the old vfo-services.com holistic-planning-form page. It is the no-deposit, no-login alternative to the member portal's [Holistic route](tax-intake.md#holistic-route--an-existing-map-1-client), which stays behind `tax_intake`; this link rides **`tax_diagnostic`** like the rest of the page.

[TaxDiagnosticPage.jsx](../../src/pages/TaxDiagnosticPage.jsx) switches to `PersonalTaxForm` when `?client=` is present:
- Q1 is **Who is completing this form?** — *I am the client (<client name>)* / *I am <member> (VFO member), completing this for my client*. There is no "referred by" question and no member search.
- The client's first name, last name and email (q2–q4) come from the client record, prefilled and **locked** (`TaxIntakeForm` prop `lockClientIdentity`); there is no deposit line. Q39 uses the client wording when *I am the client* is picked, as on the public form.
- It ends on *"Your Tax Planning Form has been received. No payment is needed."* A second open of the same link shows **Already received**; a bad token shows *"This link is not valid."*
- Same hidden honeypot (`website`); the test-values button is dev-server only.

**Actions** (`actions/tax/holistic-form.ts`, `PUBLIC_HANDLERS`, 404 while `tax_diagnostic` is off). **The `clients` row found by `tax_upload_token` is the whole credential (#310)**: the body carries only `token`, `completed_by`, `answers` and the honeypot `website` — nothing in it selects a client, a member or a price.
- `tax_holistic_form_load` — returns the client's name + email, the member's display name, `test_member`, the question list, and `submitted` (true once any `tax_intake_requests` row exists for the client).
- `tax_holistic_form_submit` — honeypot → fake `{ok:true}`; the flag; `completed_by` ∈ client/member (400); **409** *"A Tax Planning Form has already been submitted for this client."* when any intake row exists for the client; the server **forces q2/q3/q4 from the client row**, then runs `validateTaxIntakeAnswers` + the same public sanitizing as the submit below (#532: CR/LF/tab and `<` `>` stripped from single-line answers, 4 000 characters per answer, 40 000 for the body, options checked, Q1/Q7–Q9 blanked); Q1 and Q7–Q9 are then written by `diagnosticIntakeAnswers` from `completed_by` and the client's own member. It inserts ONE `tax_intake_requests` row: `client_id` set, `member_number` = the client's member, `payer` = `completed_by`, `deposit_required=false`, `deposit_amount_cents=0`, `status='completed'`, `sandbox` for a test member, **no `diagnostic_id`, no plan, no new client**. Then the FYI bell `TAX_new_case_created` (Tracy + Tray), and **(since 2026-10-09) the team email `TAX_personal_form_submitted` (template 313)** — see the emails table below, title **`Tax Planning Form received (no deposit due): <client>`**, linking the client's Tax tab (`/admin/client/<id>?tab=tax&program=4`); a bell failure does not fail the submit.

The form then shows on the admin Tax Diagnostics page under **Confirmed** as an *Existing client (no deposit)* card (below), and on the plan's Tax Planning Form card: `tax_intake_load` takes the plan's `tax_plan_id` (2026-10-09) and returns THAT plan's own form, else the client's latest form with no plan (a client-level submission), inside the same per-role fence.

**An existing client who used the PUBLIC link and paid (#598).** A "No one" lead for a client who already exists must be taken out of the queue by hand — **Confirm** would make a second tax case (deposit steps, $250 share) and **Deny** auto-refunds. The 2026-10-09 John Ericson repair (client 125, Holistic plan 164): copy the lead's answers onto the existing plan as a no-deposit `completed` intake (`client_id`, `tax_plan_id`, `member_number`, `program_id` = the plan's), dismiss the diagnostic with a reason, and leave the paid intake untouched (no member on it, so the finalize-retry sweep ignores it) for a refund by hand. Never put a member on a `paid` intake you do not want finalized.

## Public actions — what they can and cannot touch

All three are `PUBLIC_HANDLERS` and ride the flag (the personal link's two actions are described above).

| Action | Can | Cannot |
|---|---|---|
| `tax_diagnostic_load` | return `{ok, questions}` (already public — `/tax-intake` serves the same list) | anything else |
| `tax_diagnostic_member_search` | read `members` (`first_name`, `last_name`, `elite_status`, `member_type`, and `member_number` ONLY to drop test members) and return **display names**: de-duplicated, word-prefix matched, ≥ 3 letters, ≤ 8, 60/5 min per IP | return a number, email, type, id or match count. A query that is not letters/space/`.'-` gets `[]` |
| `tax_diagnostic_submit` | insert ONE `tax_diagnostics` row, draft the team email, raise the queue bell when the team must act; **since 2026-09-30, with `pay_first`:** insert ONE `tax_intake_requests` row for a one-member or "No one" form and return its token (`pay_token`), and — for a member already past the waiver line — create the case (client + plan) through `finalizeTaxIntake` | select any row (the body carries no id — the member arrives as a NAME and is resolved server-side against the same public pool; no match → 400), set any status / payer / member field from the body (all derived server-side), create a Stripe object (the choice page does, on the payer's click), or **email the address typed on the form** (nothing reaches the submitter at submit; Stripe's own receipt goes to the payer's address only once they pay) |

Fences on the submit, in order:
1. The flag.
2. The honeypot: filled → a fake `200 {ok:true}` and nothing is stored.
3. `completed_by` ∈ client/member.
4. The shared `validateTaxIntakeAnswers`, then stricter public checks:
   - radio/select values must be one of their options;
   - 4 000 characters per answer, 40 000 for the body, 200 for name/phone;
   - Q1/Q7–Q9 blanked;
   - **CR/LF/tab and `<` `>` stripped from every single-line answer**. Downstream, finalize's confirmation Subject and the house invoice PDF read q2/q3/q5, so a typed name must not be able to inject a header or markup.
5. The referrer rules.
6. **60 submissions per hour globally** (a read-only count of `tax_diagnostics`).
7. The member name resolved against the public pool (no match → 400).
8. **5 submits per IP per hour** (`public_rate_hits`, `utils/public-rate-limit.ts`). This hit is recorded last, only for a submission about to land, so a refused form never spends the caller's allowance.

**Dev-server testing (2026-09-30, Jake).** A request whose browser `Origin` is a localhost page (`isDevOrigin`, `constants/public-member-directory.ts`) may also find and pick the **Test Member(s)** (`isDiagnosticPickable`), and a "No one" lead from it is minted in **sandbox** — so the whole pay-first flow is testable without real money. The header is forgeable by a script, so its reach is sandbox-only by construction: a test member's case is force-sandboxed by the member-keyed config (#251), and **Confirm refuses to link a sandbox lead to a real member, or a live lead to a test member**.

The search has **60 per IP per 5 minutes plus 600 per 5 minutes globally**. The limiter keys on the IP the PLATFORM saw: `cf-connecting-ip`, then `x-real-ip`, then the LAST `x-forwarded-for` entry. The function logs show Supabase's Cloudflare front sets the first two, and a caller-typed X-Forwarded-For first entry would hand every request a fresh key. It stores an HMAC of the IP, never the raw address. It FAILS CLOSED (a failed count is treated as blocked). It lives in its own table, not `login_attempts`: that table's per-IP count is the login throttle, so diagnostic traffic there would lock a member out of logging in.

## The queue — `tax_diagnostics`

RLS deny-all in the same migration (`20260923180000_tax_diagnostics.sql`); anon probe `*/0`.

**`status`** (a CHECK constraint, four values — `denied` added by `20260930120000`):
- `new` — written by the submit: a queued form, or a pay-first **lead** (paid or not).
- `confirmed` — written by the submit itself for a one-member form (**auto-approved**, `confirmed_by='Tax Diagnostic form (auto)'`), or by Confirm.
- `dismissed` — written by Dismiss (nothing was paid). Never shown on the admin page.
- `denied` — written by Deny (a paid lead, its $500 refunded).

**Other columns:**
- `completed_by`, `answers`, and the client name/email/phone copied out of them;
- `referrer_name` / `referrer_none` / **`suggested_member_numbers`**: every eligible member whose name matched, so two members sharing a name give the admin a choice;
- `heard_from` / `heard_from_other`, `ip_hash`, `team_email_sent_at`;
- the Confirm stamps: `confirmed_member_number`, `deposit_payer`, `confirmed_by`, `confirmed_at`, `intake_id` (since pay-first a one-member or "No one" form carries `intake_id` from the submit);
- the Dismiss stamps: `dismissed_by`, `dismissed_at`, `dismiss_reason`;
- the Deny stamps: `denied_by`, `denied_at` (the reason reuses `dismiss_reason`); the refund itself is stamped on the intake row.

**The admin tab** — [TaxDiagnosticsPanel.jsx](../../src/components/admin/TaxDiagnosticsPanel.jsx):
- a top-level tab behind the grantable key **`tax_diagnostics`** (Admin Editor tick box; superadmin always sees it), in the FAQ/GC page frame;
- the intro shows the public form's address as a **one-click copy button** (hover *Copy link*, click → *Copied*; `navigator.clipboard`, with a hidden-textarea fallback);
- **every tax questionnaire in one place (since 2026-10-07):** the public submissions AND every member-portal tax intake form (`portal_intakes`, below), newest first;
- filter pills **Pending** / **Confirmed** / **Denied** / **All** (Pending was *New*; there is no Dismissed pill), a blue **Refresh** button, and a card per form (open/hide pill with a chevron) with every answer as a scrolling list;
- **ONLY PAID FORMS SHOW (Jake's rule, since 2026-10-07; `isShown`).** A form appears once its deposit is paid or clearing (intake `paid` / `completed` / `waived` / `refunded`, or `deposit_processing_at` set), or when no deposit is due. An abandoned, never-paid form stays off the page and appears the moment its payer pays; a dismissed diagnostic is never shown. Two exceptions still show because they need the team before anyone can pay: a **queued** public form (no intake row yet — a two-member name match: Pending, Confirm box with Confirm / Dismiss), and a **confirmed** public form whose deposit-link email failed (`invited`, no `link_sent_at`: Retry);
- a **Pending card with an intake row is a paid lead** (the lead box): bank transfer clearing → wait; **paid → choose the member (Confirm) or Deny and refund**, with a note on a sandbox lead that it links to the Test Member only. A Pending card with no intake is the queued Confirm box (member + payer, Confirm, Dismiss) — the only Dismiss left on the page; the unpaid-lead *Dismiss* and the confirmed card's *Dismiss (never paid)* were removed with the paid-only rule;
- the bell deep link `/admin?tab=tax_diagnostics&diag=<id>` opens and scrolls to that card;
- a confirmed card shows the member, who pays, who confirmed (*Approved automatically by the form (one member named)* for an auto-approved one), and a **Deposit step track** read from the intake row (nothing on it writes): **Payment link sent** (date, *opened* date) — or **Sent to the payment page from the form** (the submit date) for any paid or clearing form that never had a link email (an auto-approval, or a paid lead the team confirmed afterwards) → **Payment made** (*Card* or *ACH Bank Transfer* + date; red *Bank payment failed — link works again* after a released ACH) → **Payment cleared** (date; orange *Pending — bank verification* / *Pending — ACH clearing* while in flight) → **Client created** with an **Open client profile** button onto `/admin/client/<id>?program=4&tab=home` (*Creating the case…* while `paid`; *Choose the member* on an unlinked lead). A waived case shows one *Waived — member has 2+ qualifying clients* step then Client created. The header reads *Deposit (sandbox)* on a sandbox row;
- **a portal form card** (`source: 'portal'`) is read-only and always under **Confirmed** (green chip): the sub-line reads *Via the member portal · Completed by the member* / *Completed by the client (member's link)*, and the body shows the member, who paid and the same Deposit step track. **An existing-client form** (the personal `?client=` link above, or the member portal's Holistic route: `client_id` set, no plan, `deposit_required=false` — `isHolisticForm`) reads *Existing client (no deposit)* and shows no deposit track;
- a denied card carries the chip **Denied — $500 refunded** and shows who denied it, when, and the refund (`$500.00 refunded to the client (re_…)`).

**Admin actions** — `ADMIN_ONLY_ACTIONS` + `TAB_ACTIONS.tax_diagnostics`:
- `tax_diagnostic_list` — every row plus its suggested members and its intake row's progress (incl. `member_number`, the card fee and the refund stamps), the member picker (every Active member + the test member(s), with numbers — admin-side only), and **`portal_intakes`** (since 2026-10-07): every `tax_intake_requests` row with `diagnostic_id` NULL and `status` ≠ `invited` (an unanswered client link is not a questionnaire yet), newest first, capped at 500 — each shaped like a diagnostic card (`key` `portal-<id>`, `source:'portal'`, client name, `answers`, `completed_by` / `deposit_payer` from `payer`, `confirmed_member`, `intake`). A failed read of them answers 500.
- `tax_diagnostic_confirm` — see below.
- `tax_diagnostic_dismiss` — see *Dismiss and Deny*.
- `tax_diagnostic_deny` (2026-09-30) — see *Dismiss and Deny*.

## Confirm

`actions/tax/diagnostic-confirm.ts`. Since pay-first, Confirm has TWO arms, chosen by whether the diagnostic already has an intake row:

**A paid lead (`intake_id` set, status `new`) — body `{ id, member_number }`.** `confirmPaidLead`: refuses while the intake is not `paid` (*"not paid yet"* / *"bank payment is still clearing"*) or already has a member; the member must exist and be Active (a test member exempt); **a sandbox lead links to a Test Member only and a live lead never to one**. Latch `new → confirmed` (`deposit_payer='client'` — the client paid), then write the intake's `member_number` + Q1/Q7–Q9 (guarded `member_number IS NULL` and `status='paid'`; on a miss the latch is undone), clear the bell, and run `finalizeTaxIntake` — the case, the deposit invoice + receipt and the client's confirmation (278). A finalize failure answers 500 with *"Press Confirm again"*; the nightly sweep's retry pass also picks it up now that the row has a member.

**A queued diagnostic (no intake) — body `{ id, member_number, deposit_payer }`**, the original flow below. The UI pre-selects the member when the form named exactly one, offers the matches when a name hits several, and asks for a pick on a lead. It pre-sets the payer from `completed_by`, with a toggle (decision 36). Both arms build the intake row through the one shared helper `utils/tax-diagnostic-intake.ts` (`insertDiagnosticIntake` / `diagnosticIntakeAnswers`), which the public submit uses too.

1. Refusals:
   - the member must exist and be Active (a test member is exempt);
   - a member payer needs an email on file;
   - **409 while the `tax_diagnostic` flag is off and a deposit is due**, because the link would 404 for the payer (a waived case may still be confirmed).
2. Compute the waiver (`qualifyingTaxClients` of the CONFIRMED member) and the member-keyed sandbox config. This is what forces Test Member 59524 into sandbox.
3. **Latch:** a conditional `new → confirmed` update BEFORE any side effect. A double click gets 409.
4. Build the answers:
   - Q1 = `Client`, or the confirmed member's Advisor/Accountant-for-Client value when a member completed it;
   - Q7–Q9 = that member's name / email / trading name.
5. Insert a `tax_intake_requests` row:
   - `payer` = the confirmed payer, `tax_route` NULL, **`diagnostic_id`** = the diagnostic;
   - `status` `waived` or `invited`, a fresh `intake_token`, the deposit fields.

   On failure the latch is undone (back to `new`).
6. Stamp `intake_id` and clear the bell.
7. **Waived:** run `finalizeTaxIntake` inline. That creates the client + plan, closes Deposit Paid `N/A — No Deposit`, and drafts the payer-appropriate confirmation (275 to the member / 278 to the client).
8. **Otherwise:** draft the deposit-link email. **`link_sent_at` is stamped only once the draft succeeds**, so a failed draft reads "NOT drafted yet" on the card rather than "link sent".

**Retry — Confirm called again on a `confirmed` diagnostic.** The card shows the button for four states, and each resumes on the SAME intake row, never a second one:
- **No `intake_id` stamped:** the intake is found by `diagnostic_id` and stamped. If there is none, the claim is undone and the team confirms afresh.
- **A `waived` intake whose finalize failed** (a queued Confirm, or an auto-approved waived submit): the resumable finalize runs again.
- **A `paid` intake WITH a member whose finalize failed** (a paid lead after Confirm): finalize again.
- **An `invited` intake with no `link_sent_at`:** the link is drafted again.

## Dismiss and Deny (2026-09-30)

**Dismiss** (`actions/tax/diagnostic-dismiss.ts`) closes a diagnostic that has taken **no money**: a `new` one, or an auto-approved `confirmed` one whose payer never paid. If it has an intake row, `closeUnpaidDiagnosticIntake` (`utils/tax-diagnostic-intake.ts`) first expires any open Checkout with the key it was minted on (#485 — a session Stripe reports COMPLETE means money is moving: refused, use Deny), then moves the intake to **`dismissed`** (guarded on a payable status and no ACH in flight). The choice page then reads **`closed`** and shows *"This payment link is no longer active."*; the checkout refuses with the same sentence. Refused: a paid or clearing deposit (*use Deny*), or a case already created. **The open-Checkout expiry arm is code-only** (the one live test closed the page before a session existed). **Since 2026-10-07 the admin page calls it only from the queued Confirm box** (a two-member match, no intake row): unpaid leads and unpaid auto-approved forms are hidden rather than dismissed. The action itself is unchanged and still accepts both.

**Deny** (`actions/tax/diagnostic-deny.ts`, new action, action count 553 → 554) — only a `new` diagnostic whose intake is `paid` with **no member** (a paid lead). Latch `new → denied` (`denied_by`, `denied_at`, reason in `dismiss_reason`) BEFORE the refund; read the PaymentIntent (what it took caps the refund); refund **`deposit_amount_cents` only — $500, never the card fee** (Jake: as on every other refund), `reason=requested_by_customer`, metadata `refund_kind=tax_diagnostic_deny`, `Idempotency-Key tax-diagnostic-deny-<intake>`; a refused refund undoes the latch. On success the intake moves to **`refunded`** with `deposit_refund_id` / `deposit_refund_amount` / `deposit_refunded_at`, and the queue bell clears. **No email** — Stripe's own receipt is the payer's notice; the existing Stripe refund handler raises its usual *Refund issued — $500.00 …* bell to Jake. Refused while a bank transfer is still clearing.

**Route B's "Send my client a link" never reuses a diagnostic row.** Its reuse query carries `.is('diagnostic_id', null)`, so a member cannot re-route a team-confirmed classic case to Direct.

**The deposit-link email in detail:** `TAX_diagnostic_deposit_link` goes to the client (Cc member, Tracy, Tray, Evan); `TAX_diagnostic_deposit_link|member` goes to the member (Cc Tracy, Tray). Both carry Bcc Anton + Paul and the green button **Pay deposit** onto **`/tax-deposit-pay?token=…`** (the label and URL live in `utils/tax-diagnostic-emails.ts`; migration `20260923210000` dropped "review the answers and" from both bodies), and are Draft.

## The pay link — the deposit choice page

**The link is PAY-ONLY** (Jake, 09-23 click-through: the answers were already given and confirmed, so there is no review step). The email's button opens the public **`/tax-deposit-pay` card-or-ACH choice page** that every intake deposit uses ([tax-intake.md § The choice page](tax-intake.md#the-choice-page--tax-deposit-pay-2026-09-23)): ACH $500.00 with no fee, or card $515.24 (`cardChargeCents(500)`). What is particular to a diagnostic row (`diagnostic_id` set):
1. **Flag:** `depositFlagOpen` reads `tax_diagnostic`, not the inviting member's `tax_intake`.
2. **Payable as `invited`:** `depositState` treats a diagnostic `invited` row as payable (its answers are stored); the checkout moves it to `pending` when it mints.
3. **Return:** success and cancel both come back to `/tax-deposit-pay?token=…` (`&paid=1[&ach=1]` / `&canceled=1`) — the payer has no portal to return to.
4. **Stripe `customer_email`:** the member's `members.email` when `payer='member'`, the client's invited address otherwise.
5. **Pay-first rows (2026-09-30)** arrive `pending` straight from the submit (no link email, `link_sent_at` NULL). A **lead** row has no member: the checkout skips the member read and the waiver, mints on the **`sandbox` / `stripe_account` stamped on the row at submit** (there is no member to key the config on), and the memo reads *Member: none named yet (Tax Diagnostic)*. When a lead's deposit clears, `finalizeTaxIntake` answers `awaiting_member` — **not a failure**: no Jake bell; the webhook raises the queue bell instead, then the `Tax case paid:` FYI bell and, for a card payer, the `TAX_deposit_received|lead` email (see below), and the row stays `paid` until Confirm or Deny.

An older `/tax-intake?token=…` link for a diagnostic row still works: `tax_intake_link_load` returns `diagnostic:true` + `payer` (**never the answers**) and `TaxIntakePage` forwards the browser to `/tax-deposit-pay` with the same token. `tax_intake_link_submit` on such a row uses the **stored answers exactly as Confirm wrote them** and ignores the body's, then returns the choice-page URL.

A card payment creates the case at `checkout.session.completed`; an ACH payment creates it only when the transfer **settles**, and a failed or expired ACH releases the row so the same link works again (the card's step track shows it). The webhook and finalize need nothing diagnostic-specific: `payer` already drives:
- the documents (Bill To the member with the "Client:" line, or the client);
- the confirmation (275 / 278);
- the refund email (181 / 279).

## Bell and emails

| Key / template | When | To | Mode |
|---|---|---|---|
| bell `TAX_diagnostic_submitted` (area Tax, sort 273, action-required) | **only when the team must act (2026-09-30):** a queued submission (two-member name, member payer with no email, or any submission from an older page without `pay_first`), and a **lead whose deposit has cleared** (raised by the deposit webhook) | Tracy, Tray, Evan (login emails; the rule can override) — never Jake or Paul since 2026-10-07 (was Tracy, Evan, Paul, Jake + Tray on a paid lead) | title `New Tax Diagnostic — <client>`, link `/admin?tab=tax_diagnostics&diag=<id>`; one unread bell per LINK **and** TITLE (since 2026-10-07: the link alone is shared with the paid FYI bell below, which swallowed the queue bell in testing; a redelivered payment event still raises no second). On a paid lead the webhook raises this bell FIRST, then the FYI. **Cleared by its LINK** on Confirm, Deny or Dismiss, so two diagnostics for one name clear independently — `clearDiagnosticBell` skips any `Tax case paid: %` title, so the FYI is never marked read with it. `utils/tax-diagnostic-bell.ts` |
| bell `TAX_new_case_created` (area Tax, sort 279, FYI, 2026-09-30) | **ONE bell per form, every route (since 2026-10-07)**, raised the moment the money is in (card at `checkout.session.completed`, ACH at settle) or at a waived submit. A **paid "No one" lead** is belled AT PAYMENT by the deposit webhook (`notifyTaxLeadPaid`, before any client exists), and the case creation at Confirm skips it (latch: an existing `Tax case paid:` bell on that diagnostic's link). Every other diagnostic and every portal intake is belled by `finalizeTaxIntake` on first completion (`notifyTaxCasePaid`, see [tax-intake.md](tax-intake.md#bells)) | Tracy + Tray + Evan (Evan since 2026-10-07) | title *"Tax case paid: <client>"* (money in) / *"Tax case added (no deposit due): <client>"* (waived); message *"<client> — member: <name \| not yet chosen>. Submitted through the public VFO Tax Diagnostic. $500 deposit paid."* (or *No deposit due.*); link = the diagnostic's queue link for a paid lead, else the new plan. `dedupe:"ever"`. The personal `?client=` link raises the same rule with title *"Tax Planning Form received (no deposit due): <client>"* |
| `TAX_deposit_received\|lead` (template 310, since 2026-10-07) | a **card-paying "No one" lead's** deposit goes through (finalize answers `awaiting_member`); drafted once by `utils/tax-lead-paid-email.ts`. A bank-transfer payer is skipped (they already had `TAX_deposit_processing\|client`) | CLIENT; Cc `tnmiller@vfo-services.com` + `tvaldes@vfo-services.com` + `eanderson@vfo-services.com`; Bcc `aanderson@elitert.com` + `platham@elitert.com` | **Draft** (copy approved by Jake): *"…we have received your $500 Tax Planning Deposit…"*, the team will now match a member, then the invoice + receipt follow. Latch `tax_intake_requests.lead_paid_email_sent_at`, read fresh and stamped only after the draft succeeds; fail-soft (a failure never fails the webhook); sandbox-rerouted off the row's `sandbox` |
| `TAX_diagnostic_submitted` (template 286) | every submission | To `tnmiller@vfo-services.com`; Cc `eanderson@vfo-services.com`, `platham@elitert.com`, `aanderson@elitert.com`, **`tvaldes@vfo-services.com`** (2026-09-30); no Bcc | **Draft** (Jake, 09-23, migrations `20260923190000` + `20260923200000`; seeded as Send to four) — internal only, never sandbox-rerouted; every value HTML-escaped. Since `20260930130000` its fixed sentences are one **`[NEXT_STEP]`** line the submit fills per outcome: auto-approved (*"…approved automatically. The payer was sent straight to the $500 deposit page…"*), waived (*"…their deposit is waived, so the case has been created."*), lead (*"No member was named… choose the member or Deny."*), queued (*"Please choose the member… the deposit link follows."*), or the old line for an older page |
| `TAX_personal_form_submitted` (template 313, since 2026-10-09) | a **personal-link** submission (`tax_holistic_form_submit` — the per-plan link or the client-level MAP 1 link); drafted by `utils/tax-diagnostic-emails.ts sendPersonalFormTeamEmail` after the bell, fail-soft (never fails the submit) | the SAME team as 286 (copied from it at seed time): To `tnmiller@vfo-services.com`; Cc Evan, Paul, Anton, Tray; no Bcc | **Draft** (copy approved by Jake 2026-10-09) — internal only, never sandbox-rerouted, every value HTML-escaped: client, email, phone, state, federal taxes (q18 verbatim, incl. the poor-fit wording), completed by, member, *Tax plan: <program> (plan N)* or *No plan yet (the client-level link from the MAP 1 email)*, and a green **Open the tax plan** / **Open the client's Tax tab** button → `/admin/client/<id>?tab=tax&program=<p>[&plan=<id>]`. Team only — nothing to the submitter (decision 37) |
| `TAX_diagnostic_deposit_link` (287) | Confirm, client pays, deposit due | CLIENT; Cc MEMBER + Tracy + Tray + Evan; Bcc Anton + Paul | Draft — button **Pay deposit** → `/tax-deposit-pay?token=` |
| `TAX_diagnostic_deposit_link\|member` (288) | Confirm, member pays, deposit due | MEMBER; Cc Tracy + Tray + Evan; Bcc Anton + Paul | Draft — same button |

Nothing is sent to the submitter at submit time (decision 37). **A card-paying lead gets `TAX_deposit_received|lead` (310) once the deposit goes through** (since 2026-10-07); the confirmation 278 with the deposit invoice + receipt is drafted by finalize only when the team picks the member. Once the payer pays, the intake's own emails and bells take over (the ACH confirmation 289–292, the new-case confirmation 275/278, `TAX_intake_deposit_verification_pending`, `FAILURE_tax_intake_deposit_ach`) — see [tax-intake.md](tax-intake.md).

## Files

- **Backend** (`vfo-edge-functions/supabase/functions/vfo-admin-api/`):
  - `actions/tax/diagnostic-{load,member-search,submit,list,confirm,dismiss,deny}.ts`, `actions/tax/holistic-form.ts` (the personal `?client=` link, 2026-10-07)
  - `utils/public-rate-limit.ts`, `utils/tax-diagnostic-emails.ts`, `utils/tax-diagnostic-bell.ts` (queue bell raise/clear, 2026-09-30), `utils/tax-lead-paid-email.ts` (`TAX_deposit_received|lead`, 2026-10-07), `utils/tax-intake-finalize.ts` (`notifyTaxCasePaid` / `notifyTaxLeadPaid`), `utils/tax-diagnostic-intake.ts` (the intake row a diagnostic becomes + closing an unpaid one, 2026-09-30), `constants/public-member-directory.ts` (`isDevOrigin`, `isDiagnosticPickable`), `utils/feature-flags.ts` (`FEATURE_TAX_DIAGNOSTIC`, `featureEnabledGlobally`)
  - touched: `actions/tax/intake-link-load.ts`, `actions/tax/intake-link-submit.ts`, `actions/tax/intake-send-link.ts` (reuse skips diagnostic rows), `router/dispatch.ts`, `constants/role-gates.ts`; the pay link lands on the choice page's `actions/tax/intake-deposit-{load,checkout}.ts` + `utils/tax-intake-deposit-checkout.ts`; pay-first also touched `utils/tax-intake-deposit-webhook.ts`, `utils/tax-intake-finalize.ts`, `actions/tax/revshare-sweep.ts`
  - migrations `20260923180000_tax_diagnostics.sql`, `20260923180100_tax_diagnostic_templates_rule.sql`, `20260923190000_tax_diagnostic_team_email_draft.sql`, `20260923200000_tax_diagnostic_team_email_cc.sql`, `20260923210000_tax_diagnostic_deposit_link_pay_only.sql`, `20260930120000_tax_diagnostic_pay_first.sql`, `20260930130000_tax_diagnostic_team_email_next_step.sql`, `20261007120000_tax_lead_paid_email.sql` (template 310 + `lead_paid_email_sent_at`)
  - `scripts/probe-tax-diagnostic.ps1` (`-Mode Off` / `-Mode On`, optional `-RateLimit`)
- **Frontend** (`vfo-react/src/`):
  - new: `pages/TaxDiagnosticPage.jsx`, `components/admin/TaxDiagnosticsPanel.jsx`
  - touched: `components/member/TaxIntakeForm.jsx` (prelude slot, q4 lock only with an intake, `lockClientIdentity` for the personal link), `pages/TaxIntakePage.jsx` (forwards a diagnostic row to `/tax-deposit-pay`), `pages/TaxDepositPayPage.jsx` (the choice page the pay link opens), `pages/AdminPortal.jsx`, `components/admin/AdminEditor.jsx`, `lib/api.js` (`tax_diagnostic_confirm` 30 s), `App.jsx`, `scripts/emit-route-pages.mjs`
