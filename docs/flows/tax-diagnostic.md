# VFO Tax Diagnostic — the public form and its queue (added 2026-09-23)

The public, no-login replacement for the Unbounce tax page. Anyone can open **`vfoportal.com/tax-diagnostic`**: a client for themselves, or a member (with or without a portal login) for their client. It asks the same 37 questions as the member-run [tax intake](tax-intake.md), plus three of its own. **A submission creates nothing.** It waits in the admin **Tax Diagnostics** tab until a person confirms which member the client belongs to, because that choice decides revenue share. Confirm then hands the case to the ordinary intake pipeline: the `/tax-deposit-pay` card-or-ACH choice page, the Stripe webhook and `finalizeTaxIntake` ([tax-intake.md](tax-intake.md)). Decisions 30–37 in [plans/direct-tax-planning/README.md](../plans/direct-tax-planning/README.md) are the plan of record.

## The release switch

`portal_feature_flags` row **`tax_diagnostic`**, seeded `enabled_for_all=false` and **switched ON for everyone on 2026-09-23 (Jake's call)** — and the frontend was published 2026-09-24 (`live-206-tax-diagnostic`), so the page is live to the public. A public page has no member, so **only `enabled_for_all` is read** (`featureEnabledGlobally`, fail-closed). While it is off:
- the three public actions answer 404;
- the page shows "This form is not available";
- the deposit link of an already-confirmed diagnostic 404s as well (the choice page's `tax_intake_deposit_load` / `_checkout` and the old `/tax-intake` link actions alike), because such an intake row rides this flag (decision 34).

The admin tab stays usable and shows an amber "public page is switched off" banner. **Switch = `update portal_feature_flags set enabled_for_all=<true|false> where key='tax_diagnostic'`, no deploy.**

## The public page

[src/pages/TaxDiagnosticPage.jsx](../../src/pages/TaxDiagnosticPage.jsx) renders `TaxIntakeForm` in public mode with a `prelude` of three questions and the numbering continued after them. It is not a token page, but it uses raw `fetch` like the token pages do.

1. **Who is completing this form?** *I am the client* / *I am a VFO member completing this for my client*. Nobody can verify this answer on a public page. It only PRE-SETS the payer at Confirm.
2. **A client** is asked **Were you referred by a VFO member?**: *Yes* / *No one / I heard about VFO elsewhere*. **A member** skips this and goes straight to **Your name (VFO member)**.
3. The follow-up depends on that answer:
   - **Yes** (or any member) → the member-name type-ahead (`tax_diagnostic_member_search`, debounced, from 3 letters, NAMES only).
   - **No one** → **How did you hear about us?** Friend / Business partner / Social media / Post / Other (Other opens a text box).

   The search only appears once the answer calls for it (Jake, 09-23 click-through). Switching "Who is completing" clears the questions below it.

The 37 intake questions follow. Q1 is derived and Q7–Q9 are hidden, exactly as elsewhere. On the diagnostic page q4 is typed freely, because there is no invitation to lock it to. The page:
- takes no payment and quotes no deposit;
- ends on "Thank you. Your VFO Tax Diagnostic has been received.";
- carries a hidden **honeypot** input (`website`);
- shows the "Fill with test values" button on the **dev server only** (`import.meta.env.DEV`), never in the production build.

## Public actions — what they can and cannot touch

All three are `PUBLIC_HANDLERS` and ride the flag.

| Action | Can | Cannot |
|---|---|---|
| `tax_diagnostic_load` | return `{ok, questions}` (already public — `/tax-intake` serves the same list) | anything else |
| `tax_diagnostic_member_search` | read `members` (`first_name`, `last_name`, `elite_status`, `member_type`, and `member_number` ONLY to drop test members) and return **display names**: de-duplicated, word-prefix matched, ≥ 3 letters, ≤ 8, 60/5 min per IP | return a number, email, type, id or match count. A query that is not letters/space/`.'-` gets `[]` |
| `tax_diagnostic_submit` | insert ONE `tax_diagnostics` row, raise the team bell, send the team email | select any row (the body carries no id — the member arrives as a NAME and is resolved server-side against the same public pool; no match → 400), set any status / payer / member field, create a client / intake / Stripe object, or **email the address typed on the form** |

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

The search has **60 per IP per 5 minutes plus 600 per 5 minutes globally**. The limiter keys on the IP the PLATFORM saw: `cf-connecting-ip`, then `x-real-ip`, then the LAST `x-forwarded-for` entry. The function logs show Supabase's Cloudflare front sets the first two, and a caller-typed X-Forwarded-For first entry would hand every request a fresh key. It stores an HMAC of the IP, never the raw address. It FAILS CLOSED (a failed count is treated as blocked). It lives in its own table, not `login_attempts`: that table's per-IP count is the login throttle, so diagnostic traffic there would lock a member out of logging in.

## The queue — `tax_diagnostics`

RLS deny-all in the same migration (`20260923180000_tax_diagnostics.sql`); anon probe `*/0`.

**`status`** (a CHECK constraint, three writers):
- `new` — written by the submit.
- `confirmed` — written by Confirm.
- `dismissed` — written by Dismiss.

**Other columns:**
- `completed_by`, `answers`, and the client name/email/phone copied out of them;
- `referrer_name` / `referrer_none` / **`suggested_member_numbers`**: every eligible member whose name matched, so two members sharing a name give the admin a choice;
- `heard_from` / `heard_from_other`, `ip_hash`, `team_email_sent_at`;
- the Confirm stamps: `confirmed_member_number`, `deposit_payer`, `confirmed_by`, `confirmed_at`, `intake_id`;
- the Dismiss stamps: `dismissed_by`, `dismissed_at`, `dismiss_reason`.

**The admin tab** — [TaxDiagnosticsPanel.jsx](../../src/components/admin/TaxDiagnosticsPanel.jsx):
- a top-level tab behind the grantable key **`tax_diagnostics`** (Admin Editor tick box; superadmin always sees it), in the FAQ/GC page frame;
- filter pills New / Confirmed / Dismissed / All, and a card per submission (open/hide pill with a chevron) with every answer as a scrolling list; a red **Dismiss** button;
- the bell deep link `/admin?tab=tax_diagnostics&diag=<id>` opens and scrolls to that card;
- a confirmed card shows the member, who pays, who confirmed, and a **Deposit step track** read from the intake row (nothing on it writes): **Payment link sent** (date, *opened* date) → **Payment made** (*Card* or *ACH Bank Transfer* + date; red *Bank payment failed — link works again* after a released ACH) → **Payment cleared** (date; orange *Pending — bank verification* / *Pending — ACH clearing* while in flight) → **Client created** with an **Open client profile** button onto `/admin/client/<id>?program=4&tab=home` (*Creating the case…* while `paid`). A waived case shows one *Waived — member has 2+ qualifying clients* step then Client created. The header reads *Deposit (sandbox)* on a sandbox row. The client name in the card header links to the same profile once the case exists.

**Admin actions** — `ADMIN_ONLY_ACTIONS` + `TAB_ACTIONS.tax_diagnostics`:
- `tax_diagnostic_list` — every row plus its suggested members and its intake row's progress, and the member picker (every Active member + the test member(s), with numbers — admin-side only).
- `tax_diagnostic_confirm` — see below.
- `tax_diagnostic_dismiss` — `new` → `dismissed`, clears the bell.

## Confirm

`actions/tax/diagnostic-confirm.ts`, body `{ id, member_number, deposit_payer }`. The UI pre-selects the member when the form named exactly one, offers the matches when a name hits several, and asks for a pick on a lead. It pre-sets the payer from `completed_by`, with a toggle (decision 36).

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

**Retry — Confirm called again on a `confirmed` diagnostic.** The card shows the button for three states, and each resumes on the SAME intake row, never a second one:
- **No `intake_id` stamped:** the intake is found by `diagnostic_id` and stamped. If there is none, the claim is undone and the team confirms afresh.
- **A `waived` intake whose finalize failed:** the resumable finalize runs again.
- **An `invited` intake with no `link_sent_at`:** the link is drafted again.

**Route B's "Send my client a link" never reuses a diagnostic row.** Its reuse query carries `.is('diagnostic_id', null)`, so a member cannot re-route a team-confirmed classic case to Direct.

**The deposit-link email in detail:** `TAX_diagnostic_deposit_link` goes to the client (Cc member, Tracy, Tray); `TAX_diagnostic_deposit_link|member` goes to the member (Cc Tracy, Tray). Both carry Bcc Anton + Paul and the green button **Pay deposit** onto **`/tax-deposit-pay?token=…`** (the label and URL live in `utils/tax-diagnostic-emails.ts`; migration `20260923210000` dropped "review the answers and" from both bodies), and are Draft.

## The pay link — the deposit choice page

**The link is PAY-ONLY** (Jake, 09-23 click-through: the answers were already given and confirmed, so there is no review step). The email's button opens the public **`/tax-deposit-pay` card-or-ACH choice page** that every intake deposit uses ([tax-intake.md § The choice page](tax-intake.md#the-choice-page--tax-deposit-pay-2026-09-23)): ACH $500.00 with no fee, or card $515.24 (`cardChargeCents(500)`). What is particular to a diagnostic row (`diagnostic_id` set):
1. **Flag:** `depositFlagOpen` reads `tax_diagnostic`, not the inviting member's `tax_intake`.
2. **Payable as `invited`:** `depositState` treats a diagnostic `invited` row as payable (its answers are stored); the checkout moves it to `pending` when it mints.
3. **Return:** success and cancel both come back to `/tax-deposit-pay?token=…` (`&paid=1[&ach=1]` / `&canceled=1`) — the payer has no portal to return to.
4. **Stripe `customer_email`:** the member's `members.email` when `payer='member'`, the client's invited address otherwise.

An older `/tax-intake?token=…` link for a diagnostic row still works: `tax_intake_link_load` returns `diagnostic:true` + `payer` (**never the answers**) and `TaxIntakePage` forwards the browser to `/tax-deposit-pay` with the same token. `tax_intake_link_submit` on such a row uses the **stored answers exactly as Confirm wrote them** and ignores the body's, then returns the choice-page URL.

A card payment creates the case at `checkout.session.completed`; an ACH payment creates it only when the transfer **settles**, and a failed or expired ACH releases the row so the same link works again (the card's step track shows it). The webhook and finalize need nothing diagnostic-specific: `payer` already drives:
- the documents (Bill To the member with the "Client:" line, or the client);
- the confirmation (275 / 278);
- the refund email (181 / 279).

## Bell and emails

| Key / template | When | To | Mode |
|---|---|---|---|
| bell `TAX_diagnostic_submitted` (area Tax, sort 273, action-required) | every submission | Tracy, Evan, Paul, Jake (login emails; the rule can override) | title `New Tax Diagnostic — <client>`, link `/admin?tab=tax_diagnostics&diag=<id>`; **cleared by its LINK** on Confirm or Dismiss, so two diagnostics for one name clear independently |
| `TAX_diagnostic_submitted` (template 286) | every submission | To `tnmiller@vfo-services.com`; Cc `eanderson@vfo-services.com`, `platham@elitert.com`, `aanderson@elitert.com`; no Bcc | **Draft** (Jake, 09-23, migrations `20260923190000` + `20260923200000`; seeded as Send to four) — internal only, never sandbox-rerouted; every value HTML-escaped |
| `TAX_diagnostic_deposit_link` (287) | Confirm, client pays, deposit due | CLIENT; Cc MEMBER + Tracy + Tray; Bcc Anton + Paul | Draft — button **Pay deposit** → `/tax-deposit-pay?token=` |
| `TAX_diagnostic_deposit_link\|member` (288) | Confirm, member pays, deposit due | MEMBER; Cc Tracy + Tray; Bcc Anton + Paul | Draft — same button |

Nothing is sent to the submitter at submit time (decision 37). Once the payer pays, the intake's own emails and bells take over (the ACH confirmation 289–292, the new-case confirmation 275/278, `TAX_intake_deposit_verification_pending`, `FAILURE_tax_intake_deposit_ach`) — see [tax-intake.md](tax-intake.md).

## Files

- **Backend** (`vfo-edge-functions/supabase/functions/vfo-admin-api/`):
  - `actions/tax/diagnostic-{load,member-search,submit,list,confirm,dismiss}.ts`
  - `utils/public-rate-limit.ts`, `utils/tax-diagnostic-emails.ts`, `constants/public-member-directory.ts`, `utils/feature-flags.ts` (`FEATURE_TAX_DIAGNOSTIC`, `featureEnabledGlobally`)
  - touched: `actions/tax/intake-link-load.ts`, `actions/tax/intake-link-submit.ts`, `actions/tax/intake-send-link.ts` (reuse skips diagnostic rows), `router/dispatch.ts`, `constants/role-gates.ts`; the pay link lands on the choice page's `actions/tax/intake-deposit-{load,checkout}.ts` + `utils/tax-intake-deposit-checkout.ts`
  - migrations `20260923180000_tax_diagnostics.sql`, `20260923180100_tax_diagnostic_templates_rule.sql`, `20260923190000_tax_diagnostic_team_email_draft.sql`, `20260923200000_tax_diagnostic_team_email_cc.sql`, `20260923210000_tax_diagnostic_deposit_link_pay_only.sql`
  - `scripts/probe-tax-diagnostic.ps1` (`-Mode Off` / `-Mode On`, optional `-RateLimit`)
- **Frontend** (`vfo-react/src/`):
  - new: `pages/TaxDiagnosticPage.jsx`, `components/admin/TaxDiagnosticsPanel.jsx`
  - touched: `components/member/TaxIntakeForm.jsx` (prelude slot, q4 lock only with an intake), `pages/TaxIntakePage.jsx` (forwards a diagnostic row to `/tax-deposit-pay`), `pages/TaxDepositPayPage.jsx` (the choice page the pay link opens), `pages/AdminPortal.jsx`, `components/admin/AdminEditor.jsx`, `lib/api.js` (`tax_diagnostic_confirm` 30 s), `App.jsx`, `scripts/emit-route-pages.mjs`
