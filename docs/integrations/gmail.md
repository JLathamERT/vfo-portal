# Gmail integration

A single Google OAuth client (`GMAIL_CLIENT_ID` + `GMAIL_CLIENT_SECRET` + `GMAIL_REFRESH_TOKEN`) authorizes access to **Gmail, Google Sheets, and Google Drive** APIs. Every automation that produces an email creates a **Gmail draft** (not a sent message) — a human still has to open the draft and click Send.

## Env vars

| Var | Purpose |
|---|---|
| `GMAIL_CLIENT_ID` | Google OAuth client ID |
| `GMAIL_CLIENT_SECRET` | Google OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | Long-lived refresh token (offline access). Single token covers Gmail + Sheets + Drive scopes. |

The Gmail account behind the refresh token is **not visible from the codebase** — flagged. Drafts appear in whichever Gmail account holds the OAuth grant. Most automation code routes drafts via `From: VFO Services <aipc@vfo-services.com>` ([admin-api:4916](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts) — only the `automation_CONTRACT_sendagreement` action sets the From header; other handlers omit it, defaulting to the OAuth account's primary address).

## Token refresh pattern

Used identically in **9 different handlers** in admin-api. The pattern is:

```ts
const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: GMAIL_CLIENT_ID!,
    client_secret: GMAIL_CLIENT_SECRET!,
    refresh_token: GMAIL_REFRESH_TOKEN!,
    grant_type: "refresh_token",
  }),
});
const accessToken = (await tokenRes.json()).access_token;
```

> **Inefficiency observation (not a correction):** every handler that sends an email refreshes the token from scratch — there is no caching, even within a single chained automation. A typical contract+payment+receipt flow refreshes the token 5+ times in serial. Tokens are valid for an hour but always discarded.

## API endpoints used

### Gmail

| Endpoint | Method | When | Where (admin-api) |
|---|---|---|---|
| `https://gmail.googleapis.com/gmail/v1/users/me/drafts` | POST | Create a Gmail draft | lines 690, 848, 1039, 1609, 1638, 1788, 2161, 4055, 4303, 4543, 4929 |
| `https://gmail.googleapis.com/gmail/v1/users/me/drafts/r-8771745882155742140?format=full` | GET | **Debug fetch** of a hardcoded draft ID | line 2170 |

> **Dev artifact:** [admin-api line 2170](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts) reads back a draft with a hardcoded ID `r-8771745882155742140` immediately after creation, just to log the multipart structure. This appears to be leftover debug code — it always fetches the same (now-stale) draft. Flagged in [03-edge-functions.md](../architecture/03-edge-functions.md).

### Sheets and Drive

See [google-sheets.md](google-sheets.md) and [google-drive.md](google-drive.md). Both use the same access token from the same refresh.

## Draft message construction

All drafts are built as **RFC 2822 raw messages**, base64url-encoded into the `message.raw` field. Two patterns:

### Single-part HTML (most automation emails)

```ts
const headers = [
  `To: ${toEmail}`,
  ccEmails.length ? `Cc: ${ccEmails.join(", ")}` : "",
  bccEmails.length ? `Bcc: ${bccEmails.join(", ")}` : "",
  `Subject: ${emailSubject}`,
  "MIME-Version: 1.0",
  "Content-Type: text/html; charset=UTF-8",
].filter(Boolean).join("\r\n");

const rawEmail = `${headers}\r\n\r\n${emailBody}`;
const encodedEmail = btoa(unescape(encodeURIComponent(rawEmail)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
```

### Shared draft helper + RFC 2047 subject encoding (`utils/gmail-draft.ts`)

The newer handlers (Specialist Onboarding chain, the Phase D card-update email, the New Model Sale team email) build drafts via the shared [`utils/gmail-draft.ts`](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/gmail-draft.ts) helpers — `getGmailAccessToken()` (the token-refresh pattern above) + `draftGmail({to, subject, htmlBody, cc, bcc, attachments})` (builds the RFC 2822 raw message, single-part or multipart-with-PDF, and POSTs `drafts.create`).

`draftGmail` runs the **subject** through an **RFC 2047 encoded-word** helper, `encodeHeaderWord()` ([gmail-draft.ts:21-25](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/gmail-draft.ts)):

```ts
function encodeHeaderWord(s: string): string {
  if (/^[\x00-\x7F]*$/.test(s)) return s;            // pure-ASCII → unchanged
  const b64 = btoa(unescape(encodeURIComponent(s))); // UTF-8 bytes → base64
  return `=?UTF-8?B?${b64}?=`;                        // RFC 2047 encoded-word
}
```

Email headers are ASCII-only, so a non-ASCII subject (e.g. an em dash "—") would otherwise arrive as mojibake (`â€"`) in the client. ASCII subjects pass through byte-identical; only non-ASCII ones get wrapped. **Only the subject is encoded** — the HTML *body* already declares `Content-Type: text/html; charset=UTF-8` and carries UTF-8 directly. The older inline single-part pattern above does **not** apply this (it predates the helper); subjects there are assumed ASCII.

### Multipart with PDF attachments (`automation_CONTRACT_invoicereceipt`)

[Lines 2122-2159](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts):

```
Content-Type: multipart/mixed; boundary="vfo_boundary_<timestamp>"
--<boundary>
Content-Type: text/html; charset=UTF-8
<emailBody>
--<boundary>
Content-Type: application/pdf; name="<invoice>.pdf"
Content-Disposition: attachment; filename="<invoice>.pdf"
Content-Transfer-Encoding: base64
<base64 PDF>
--<boundary>
Content-Type: application/pdf; name="<receipt>.pdf"
Content-Disposition: attachment; filename="<receipt>.pdf"
Content-Transfer-Encoding: base64
<base64 PDF>
--<boundary>--
```

PDFs are fetched from Google Drive (via `?alt=media`) and inlined as base64 in the same multipart message — they're not just Drive links.

## Recipients pattern

Every automation email follows the same routing:

```
toEmail   = isSandbox ? sandboxEmail : <real recipient (typically client.email)>
ccEmails  = isSandbox ? [] : dedupeEmails([<member email, PF email, ...additionalContactCc>, ...tplCc])
bccEmails = dedupeEmails(tplBcc)   // from the template's bcc_list; [] in sandbox
```

In sandbox mode, ALL emails go to a single `pipeline_sandbox_config.sandbox_email` with no CC/BCC.

**Recipients are template-driven too (2026-07-03).** `email_templates.to_list` / `cc_list` / `bcc_list` hold a mix of raw emails and UPPERCASE role tokens (`CLIENT`, `MEMBER`, `ASSIGNED_PF`, `SPECIALIST`, `ADVISOR`, `ACCOUNTANT`, `TAX_PLANNER` (added 2026-07-22 — the plan's allocated tax planner, resolved from `tax_planner_id` via `taxPlannerEmail`; chip label "Tax Planner" via `ROLE_LABELS`; a tax handler MUST pass `TAX_PLANNER` in its `resolveTemplateRecipients` ctx or the chip silently no-ops — gotcha #266; sandbox suppresses all Cc so it is only observable live), `TEAM_MEMBER`, `TEAM` = every `allowed_admins` row, `RECIPIENT` = the handler's built-in target), edited as chips in the Email Templates tab. Every templated handler resolves them per-send via `utils/email-recipients.ts resolveTemplateRecipients(supabase, tmpl, ctx, isSandbox, sandboxEmail)` — the handler supplies `ctx` (which email each token means for THIS send); tokens with no ctx value are skipped; an empty resolved To falls back to `ctx.RECIPIENT`, so an email can never go unaddressed; sandbox still reroutes everything to the sandbox address with no Cc/Bcc. The old hardcoded counterparty Cc arrays (member/PF/tracy@vfo-services.com) were REMOVED from handlers — that routing now lives in the seeded template config (migration `email_templates_recipient_seeds`). Per-client Cc is appended through the same call's `extraCc` parameter — see the Additional Contacts paragraph below. The legacy `templateRecipients()` remains only for unwired hardcoded emails.

**Recipient resolution has a PER-CLIENT leg as of 2026-08-20 (v767–v771) — `resolveTemplateRecipients`'s 6th `extraCc` parameter.** Handlers pass `loadAdditionalContacts(supabase, clientId).ccList` — the `client_contacts` rows an admin flagged `cc_on_emails` — so a second person on the client's side is Cc'd on **every** client-facing email for that client, from the profile rather than from a form. **53 call sites in 45 files** at ship; the loader never throws, and because the Cc goes through the same `extraCc` parameter it inherits sandbox suppression, To-collision filtering and `dedupeEmails`. A companion `withGreetingNames` folds greeting-flagged contacts' first names into the **`[Client First]` body token only** (*"Dear Dane and Veronica,"*) — never `[Client Name]`, never a subject. **Login-setup and password-reset emails are permanently excluded** (a credential link is not something a Cc contact is entitled to), and so are the planner-facing assess-reminder tiers.

> **THE RULE SINCE 2026-08-27 (v798): an additional-contact Cc rides ONLY on an email actually addressed TO the client — and so does the `CLIENT` role token itself.** The moment the To flips to the member, the client's whole side of the recipient list drops out. Two shapes carry this. (a) **Member-pays-on-behalf**: **26 `resolveTemplateRecipients` sites across 25 files** (17 tax actions + 8 pipeline actions) pass `CLIENT: memberPays ? undefined : clientEmail` **and** an empty `extraCc` when the member pays, so the client is on neither To nor Cc. (b) **`tax/presentation-sweep.ts`**, which is addressed to the member by design: it now loads the contacts only when `member.email` is missing and the To falls back to the client. Both **REPLACE the 2026-08-20 decision** that kept them wired on the reasoning that the client remains the *subject* of the email — being the subject is no longer enough, being the To is. **The member-pays template rows still list `CLIENT` in `cc_list` and that was deliberately not edited: the entry is inert because the handler no longer resolves the token (#324), and it must not be read as proof the client is Cc'd.** Note the whole rule is unobservable in sandbox, which suppresses every Cc.

Full mechanism, exclusions and the retired `extra_cc` predecessor → **[flows/additional-contacts.md](../flows/additional-contacts.md)**.

**⚠️ THE RESOLUTION CONTRACT, STATED PLAINLY — a role token does NOTHING without the handler (gotcha #324).** "Tokens with no ctx value are skipped" above is the single most consequential sentence on this page, and it is skipped **silently**: `resolveList` does `if (isRecipientRoleToken(entry)) { const email = ctx[entry]; if (email) out.push(…); continue; }` — no throw, no `console.error`, no counter. **A template can therefore look perfectly configured in the Email Templates tab and Cc absolutely nobody.** That is not hypothetical: both `CLIENT_PAYMENT_CONTINUATION` templates (**id 172 `setup_link`**, **id 209 `setup_link_reminder`**) listed `ASSIGNED_PF` + `MEMBER` in `cc_list` from the day they were created while **neither** handler passed those keys, so every payment-continuation email ever sent went To the client with an **empty Cc** — fixed 2026-08-03 in v696. Because **sandbox suppresses all Cc**, this class of bug is invisible in sandbox by construction and only ever observable on a live send.

**It recurred at PIPELINE scale, and that is the reason to audit rather than spot-check (2026-08-20, v766 — gotcha #424).** **Nine of the ten `PARTNERSHIP_FAST_TRACK` templates** (ids 104–110, 196, 197 — every meeting-confirm, meeting-declined, decision and reminder row) listed `MEMBER` in `cc_list` from the day they were seeded, and **no PFT handler had ever passed a `MEMBER` key**, so the connected member was never Cc'd on a single PFT email for the pipeline's entire life. Fixed by `memberEmailForClient` in `actions/pft/_shared.ts` (`clients.member_number` → `members.email`, errors degrade to `null`) plus `MEMBER:` at the four ctx sites — `decision-email.ts`, `meeting-email.ts`, and `sweep.ts`'s `sendDiscoveryReminder` + `sendFtReminder`. The tenth, `PFT_decision_undecided` (id 193), carries no `MEMBER` token and was correctly left alone. **The lesson beyond #324: when every template in a pipeline agrees, that is evidence of a shared code path, not evidence it is correct** — so when you touch one template, run `select template_name, to_list, cc_list from email_templates where pipeline='X'` against a grep of `actions/<pipeline>/` for each distinct token, in one pass.

Two rules follow:

- **To know who actually receives a templated email, read the HANDLER's ctx — not the template row.** The tab shows intent; the ctx map is the implementation. `grep -n "resolveTemplateRecipients" -A6` over the handler is the fastest check, and it must be repeated for **every** handler that sends that `template_name`.
- **Adding a role-token chip to an existing template is only half the change.** The other half is the ctx in each sending handler. The canonical fix shape is `MEMBER: member?.email` + `ASSIGNED_PF: getPfEmail(client.assigned_pf || "")`, which usually also means widening the handler's `clients` `.select()` to include `member_number, assigned_pf` and adding a guarded members lookup.

**`ASSIGNED_PF` has a second silent drop behind it.** [`utils/pf-emails.ts`](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/pf-emails.ts) is a **hardcoded four-name map** — `Evan Anderson` → `eanderson@vfo-services.com`, `Bridger Silvester` → `bsilvester@vfo-services.com`, `Lindsay Morris` → `lmorris@vfo-services.com`, `Jake Latham` → `jlatham@elitert.com` — matched on the exact display string and returning `""` on a miss. `""` is falsy, so it fails the very same `if (email)` guard: **a client whose `assigned_pf` is any other name, or blank, gets no PF Cc and nothing says so.** Adding a PF to the assignment dropdown without adding them to that map ships a half-working Cc on every pipeline at once.

**Blanket internal Cc: Tracy + Tray on four pipelines — and the address DIFFERS BY PIPELINE ON PURPOSE (2026-07-31 seeded, addresses corrected 2026-08-03; DML only — no code changed. Gotcha #326).** Every `email_templates` row in pipelines **`MAP 1` (34), `TAX` (59 — that pipeline serves BOTH Tax Planning program 4 and Tax Priorities/Holistic program 1), `PIP` (5)** and **`PARTNERSHIP_FAST_TRACK` (10)** — **108 templates, verified 108/108** — carries **`tnmiller@vfo-services.com`** (Tracy Miller) **and** **`tvaldes@vfo-services.com`** (Tray Valdés-Dennis) in `cc_list`, with **zero** leftover `@elitert.com` Tracy/Tray Cc in those four pipelines.

The 2026-07-31 pass originally seeded `@elitert.com` for both and counted 107 templates. Both facts have moved: an order-preserving in-place jsonb swap corrected the addresses on 2026-08-03 (TAX **id 148** `TAX_highlevelmeeting_confirm|Yes`, which carried a pre-existing `tnmiller@elitert.com` from before that pass, was swapped too), and the count is now 108 because TAX **id 211** `TAX_implementdecision|Proceeding` was seeded in between.

**The split that remains is DELIBERATE — the same person has two addresses depending on the pipeline, and unifying them is a regression, not a cleanup.** **45** templates OUTSIDE those four pipelines keep `@elitert.com`: `SPECIALIST_ONBOARDING` 27, `VFO_SPECIALIST_REVENUE` 9, `MEMBER_MEMBERSHIP_FEES` 8, `SPECIALIST_LICENSE_CONTINUATION` 1. (Those counts are net of four rows — 167 / 182 / 190 / 191 — that moved to the `@vfo-services.com` addresses because they belong to the auto-send nine below.) **Portal logins, `notification_rules` recipients and code constants** (`constants/tax-access.ts` `TAX_VIEWERS`, the various `*_EMAIL` aliases) **still use `@elitert.com` and were NOT touched — this was email Cc only** (#291: an address lives in four independent layers).

The original entries were appended skip-if-present, so a template that already named one was not duplicated. Nothing in the delivery path needed changing: `resolveTemplateRecipients` passes raw addresses through unchanged, `dedupeEmails` folds case-insensitive duplicates, a Cc already present in To is dropped, and sandbox sends suppress all Cc — so the only observable effect is live. **Adding a NEW template to any of those four pipelines does NOT inherit this** — the Cc lives in the row, so seed it explicitly or the new email goes out without them. In the same pass the typo address **`tracy@vfo-services.com`** (an address that does not exist — Tracy's real addresses are `tnmiller@vfo-services.com` on those four pipelines and `tnmiller@elitert.com` elsewhere) was removed from `cc_list` on ids **10 + 115** (`CONTRACT_invoicereceipt_email|first`) and **25 + 137** (`TAX_invoicereceipt_email|retainer`); **zero occurrences of it remain anywhere** in to/cc/bcc/body.

**Draft vs Send is template-driven (2026-07-03).** Every templated email is created as a Gmail **draft first**, then — only if that template's `email_templates.send_mode` is `true` (the Draft/Send toggle in the Email Templates tab) — immediately dispatched via Gmail `drafts.send` by [`utils/email-delivery.ts`](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/email-delivery.ts). Inline-MIME handlers call `gmailDraftFetch(supabase, accessToken, encodedRaw, pipeline, templateName)` (fetch-compatible: returns a `Response` carrying the draft-create status/body); `draftGmail()` callers pass `sendMode: { supabase, pipeline, templateName }`. A failed `drafts.send` leaves the draft in Drafts (nothing is lost); a missing template row = draft-only. `send_mode` defaults to `false` everywhere, so behavior is unchanged until a toggle is flipped. Sandbox rerouting happens upstream of delivery, so send mode is safe to test in sandbox. New emails MUST route through this layer — see gotcha #181.

**The auto-send roster: exactly ELEVEN templates, and everything else in the table is Draft (2026-08-03, gotcha #325; id 215 added 2026-08-10 — gotcha #351; id 216 added 2026-08-10 — gotchas #355/#356).** Until this date the toggle was effectively unused, so "sending an email" meant "creating a Gmail draft a human then reviews and sends". That is no longer universally true. **The census has since grown twice and this table is NO LONGER the whole roster — it is the original eleven link-emails:** 11 → **17** on 2026-09-04 (the six advisor/accountant meeting-reminder rows) and 17 → **31** on 2026-09-08 (fourteen more: per onboarding pipeline the four stall reminders and the three deposit emails), so **all twenty rows of the two onboarding pipelines now auto-send** — see [flows/advisor-accountant-onboarding.md](../flows/advisor-accountant-onboarding.md) and gotcha #325, and run the query rather than trusting any count written here (#402). **These eleven were the first to leave without anyone looking at them:**

| id | pipeline | template_name |
|----|----------|---------------|
| **158** | `LOGIN_SETUP` | `MANUAL_login_setup` |
| **159** | `MEMBER_PAYOUT` | `member_connect_setup` |
| **167** | `VFO_SPECIALIST_REVENUE` | `SPECREV_connect_setup` |
| **182** | `SPECIALIST_PAYOUT` | `specialist_connect_setup` |
| **183** | `STRATEGIC` | `strategic_group_connect_setup` |
| **190** | `MEMBER_MEMBERSHIP_FEES` | `MEMBERSHIP_setup_link` |
| **191** | `MEMBER_MEMBERSHIP_FEES` | `MEMBERSHIP_transfer_setup_link` |
| **200** | `TAX` | `tax_planning_group_connect_setup` |
| **210** | `VAULT` | `VAULT_request_documentation` |
| **215** | `MEMBER_MEMBERSHIP_FEES` | `MEMBERSHIP_transfer_setup_link|annual` |
| **216** | `LOGIN_SETUP` | `password_reset` |

The selection is deliberate: every one is a **"here is your link, go do the thing"** email — portal password setup, Stripe Connect payout setup, membership setup, a documentation request, a self-service passcode reset. **Nothing carrying money, a decision, an agreement or a receipt was flipped**, including the two `CLIENT_PAYMENT_CONTINUATION` setup-link templates (ids 172/209), which stay in Draft on purpose.

**Two of the eleven are SHARED rows, and that is the trap — a `template_name` is not one-to-one with a use case.** **id 158 `MANUAL_login_setup` serves FOUR login types** (member, specialist, client and tax planner all draft that single row from `send_login_setup_email`), so it auto-sends portal login links for all four; it is also one of only two rows with **no Cc at all** (216 is the other), which is correct for a login link. **id 210 `VAULT_request_documentation` serves THREE entity types** (client / member / specialist — see gotcha #310), and its `cc_list` leads with the `MEMBER` role token, which resolves only for the branches whose handler supplies it (#324). **As of 2026-08-20 its `client` branch also carries the client's Additional Contact Cc list — and because this row is `send_mode=true`, the first real vault request to a client with a Cc contact REAL-SENDS to that contact with nobody reviewing the draft.**

**id 216 `password_reset` is auto-send for a different reason, and its flag is load-bearing.** Its sender is the **PUBLIC, unauthenticated** `request_password_reset` (2026-08-10, v716) — nobody triggered it from an admin screen and nobody is watching the Drafts folder, and the handler deliberately reports success to the caller whatever happens (gotcha **#355**). Flipping this row to Draft therefore breaks self-service password reset for four portals **silently**, presenting only as "the email never arrived". Same for the `(pipeline, template_name)` pair used in the `sendMode` argument: get it wrong and the mail is built perfectly and never sent (**#356**).

**Recipient shape, uniform across the eleven:** **Bcc = `jlatham@elitert.com` and nothing else** — `aanderson@elitert.com` + `platham@elitert.com` were removed **from the original nine only** (ids 215 and 216 were seeded already matching the shape), and **181 other templates still carry them** — and **Cc = `tnmiller@vfo-services.com` + `tvaldes@vfo-services.com`** on all but 158 and 216. Where 190 / 191 / 182 / 167 already named Tracy or Tray at `@elitert.com`, those entries were **replaced in place, not duplicated**.

**Operationally:** `send_mode` is a per-row DB flag with no code guard behind it — the Draft/Send pill is the entire control surface, and a section's bulk **"All send"** button will happily flip rows you did not intend. **Editing the subject, body or recipients of one of these eleven reaches a real person on the next trigger with nobody in between.** When an auto-send "didn't arrive", check the Drafts folder first: a failed `drafts.send` leaves the draft sitting there and says nothing — **and so does a `sendMode` argument naming a `(pipeline, template_name)` pair that does not match the row the handler loaded**, which is the same symptom from a different cause (gotcha **#356**; the reset email hit exactly this, `'LOGIN'` vs `'LOGIN_SETUP'`, before it shipped).

**Standing recipient rule (2026-09-15, data-only, migration `20260915100000_invoice_receipt_bcc_gorriaran.sql`): every email that carries an invoice and/or receipt PDF Bcc's `dgorriaran@elitert.com`** — added to `bcc_list` on all 20 `*invoice*` / `*receipt*` templates (MAP 1 ×4, TAX ×6, PIP, Membership ×4, Advisor, Accountant, Specialist bg + licence, SpecRev), beside `aanderson@` + `platham@` which already rode the same family. Because the rule lives in DATA, **a new invoice/receipt template must add the address itself** — nothing in code enforces it. Sandbox drops every Cc/Bcc, so only a real draft shows it.

**Internal CC/BCC is template-driven (Email Templates Phase 2, 2026-06-01).** Across all 5 pipelines, every send-handler sources its internal CC/BCC from `email_templates.cc_list` / `bcc_list` (jsonb) via `utils/email-recipients.ts` — `templateRecipients(tmpl, isSandbox)` (returns `{cc:[],bcc:[]}` in sandbox) + `dedupeEmails()` (trims/dedupes, **drops non-email junk** — kills the `extra_cc="[]"` "Invalid Cc header" bug). The **counterparty** CC (member/PF) stays in the handler; the template's `cc_list` is **additive**. _(The `tracy@vfo-services.com` address this paragraph originally named was un-hardcoded from the handlers on 2026-07-03 and its last four `cc_list` occurrences were deleted on 2026-07-31 — it was a typo for `tnmiller@elitert.com` and never existed. Do not reintroduce it.)_ The internal `aanderson@elitert.com` + `platham@elitert.com` BCC, previously hardcoded per handler, now comes entirely from each template's `bcc_list`. _(That pair has since spread well beyond the original 28 seeds: as of 2026-08-03 **181 templates** carry one or both in `bcc_list`. The nine auto-send templates of #325 were deliberately stripped down to **`jlatham@elitert.com` only**; whether to apply the same strip to the remaining 181 was raised with the user and **left undecided** — treat the 181 as intentional-until-told-otherwise.)_ The `ceoEmail = "aanderson@elitert.com"` in `*/ceo-countersign.ts` + `*/send-agreement.ts` is a BoldSign **signer** address, unrelated. Templates are editable from the admin Email Templates tab; a handler's `.select()` must include `cc_list, bcc_list` or the BCC silently drops. The `automation_CONTRACT_sendagreement` flow appends the client's **Additional Contact** Cc list (2026-08-20 — this REPLACED, not merged with, its old `pipeline_map1.extra_cc` read; that column is now dormant — [flows/additional-contacts.md](../flows/additional-contacts.md)). The inline member-confirmation emails in `*/revshare.ts` keep their hardcoded BCC (no `email_templates` row). See GOTCHAS.md gotcha #53.

### Internal "New Model Sale" team email (2026-06-15)

One automation email breaks the counterparty-CC pattern: when an advisor/accountant is created (the final onboarding step), [`utils/new-model-sale-email.ts`](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/new-model-sale-email.ts) `sendNewModelSaleEmail()` drafts an **internal** notification sourced from the `TEAM` / `new_model_sale` template. Routing differs from every other email:

- **To** = the template's `to_list` (jsonb) column — a configurable list of internal addresses, editable from the Email Templates tab. Drafts go directly **TO each** address; **no Cc, no Bcc**.
- In **sandbox** (the onboarding pipeline's `pipeline_sandbox_config`) it drafts to the sandbox address only (falling back to `jlatham@elitert.com`), so test runs never email the real team.
- **Send-once:** atomically claims `<table>.new_model_sale_email_sent_at` before drafting (idempotent create-member retry can't double-draft); the stamp is rolled back if the draft fails. Never throws — a failure here must not block member creation.
- Builds via `draftGmail` / `getGmailAccessToken` (same `utils/gmail-draft.ts` helpers as other handlers); placeholders include `[MEMBER_NAME]`, `[MEMBER_FIRST_NAME]`, `[MEMBER_NUMBER]`, `[MEMBER_EMAIL]`, `[AGREEMENT_NAME]`, `[SELECTED_PLANS]`, `[PAYMENT_PLAN]`, `[INVOICE_NUMBER]`, `[TRANSITION_DATE]`, `[MSM_NAME]` (first name of the MSM pick), `[CLOSER]`, `[SETTER]`, `[INTRODUCED_BY]`, `[MEMBER_INTRODUCTION]`, conditional `[COMPANY_BULLET]` / `[WEBSITE_BULLET]` (rendered only when the optional Company/Website fields were filled), and `[SKOOL_BULLET]` — the Skool-invitation line, **built in code and differing by pipeline** (accountant → "FAC and the VFO Community"; advisor → "the Catalyst Community"). `[AGREEMENT_NAME]` for accountants is partnership-branched **(Direct)** / **(Advisor)**. Because the Skool line and MSM/member-first-name substitutions live in `new-model-sale-email.ts`, the `TEAM/new_model_sale` template body carries a bare `[SKOOL_BULLET]` placeholder — a draft rendered by a backend build that predates these substitutions would show the literal token.

## Email-template substitution

All automation emails use HTML templates from the [`email_templates`](../tables/documents.md) table, keyed on `(pipeline, template_name)`. Templates known to exist:

| `template_name` | Used by |
|---|---|
| `PIP1_reconfirmation\|Yes` / `\|No` | `automation_PIP1_reconfirmationemail`, `automation_PCADMIN_extrameeting` (No) |
| `PCADMIN_followup\|Undecided` / `\|No` | `automation_PIPFU_decision` |
| `CONTRACT_agreementsent\|Yes` | `automation_CONTRACT_sendagreement` |
| `CONTRACT_ceocountersign\|Yes` | `automation_CONTRACT_ceocountersign` |
| `CONTRACT_paymentemail\|Yes` | `automation_CONTRACT_paymentemail` |
| `CONTRACT_confirmationemail\|card` / `\|ach` / `\|check` | `automation_CONTRACT_confirmationemail`. **The `\|card` variant is no longer sent automatically** (2026-07-26): a card payment 1 is receipt-only, so only `\|ach` and `\|check` are drafted by the automation. The row is kept for reference + manual resend. The same rule retires the automatic use of `TAX_confirmationemail\|card`, `ADVISOR_payment_confirmation\|card`, `ACCOUNTANT_payment_confirmation\|card`, `SPECIALIST_bg_confirmation\|card`, `SPECIALIST_lic_confirmation\|card` and `MEMBERSHIP_confirmation\|card`; `PIP_confirmation` and `SPECREV_payment_confirmation` are single-variant templates that are now ACH-only. See [stripe.md](stripe.md#purchase-email-policy--system-wide-2026-07-26-v663). |
| `CONTRACT_invoicereceipt_email\|first` / `\|subsequent` | `automation_CONTRACT_invoicereceipt` |
| `CONTRACT_paidbycheck\|check` | `automation_CONTRACT_paidbycheck` (inline Gmail draft when admin clicks "Pay via check"). Body has a `[QUARTERLY_NOTE]` placeholder that the handler substitutes per payment plan (Quarterly: reminder-note sentence; OneTime: empty). |
| `CONTRACT_installment_charge_failed` | `utils/map1-installment-failure.ts`, shared by `automation_CONTRACT_chargescheduled_sweep`, the webhook's late-ACH failure branch and (2026-09-04) `accounting_redraft_installment_link`. **`send_mode=false`** — it lands in Drafts and a human must send it, which is why the sweep's bell reports `"sent" | "drafted" | false` rather than asserting the client was emailed (#468a). **It may only use `[Client First]`, `[Client Name]`, `[X]` and `[PAY_BUTTON]`** — those are the four handles in that util's `subst()`. `[PF Name]` is NOT substituted here and would print literally (#324). |
| `CONTRACT_checkreminder\|check` | `automation_CONTRACT_checkreminder_sweep` (daily 04:00 UTC cron). `[Due Date]` substituted via `utils/format-date.ts::formatLongDate()`. |

The `pipeline` field is `"MAP 1"` for all of the above. No other pipelines exist yet.

The `automation_CONTRACT_revshare` handler does **not** use `email_templates` — it builds its email HTML inline ([admin-api:1580, 1583](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)) and similarly inlines the Tracy intro email at [line 1624](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts).

### Voice: every client-facing template speaks as WE, not I *(2026-09-04, v808)*

The shared signature appended to every draft is `VFO Services - Proactive Coordinator Team` (`VFO_SIGNATURE` in `utils/gmail-draft.ts`), so the body must not speak in the first-person singular. On 2026-09-04 an audit of all 230 `email_templates` rows found **82 first-person-singular occurrences across 41 rows** — *"I understand that"*, *"I attach a copy"*, *"I hope that"*, *"I am writing"*, *"reach out to me"* — every one of them contradicting the sign-off directly below it. All were converted to plural by data migration (`20260904120000_email_templates_first_person_plural.sql`); no code changed, because these strings are read straight out of the column at send time.

**Three rules for anyone editing or adding a template body, all learned by getting them wrong first (#468c):**

1. **The sender is not the only voice in the template.** Three matches were deliberately left singular because they are BUTTON LABELS in the RECIPIENT's voice: *"I Have Further Questions"* (ids 78, 80) and *"Reset my passcode"* (id 216). Pluralising those makes the reader speak for a group they are not part of. A find-and-replace over a copy column has to answer *"who is talking?"* per occurrence.
2. **"I" is capitalised in every position; "we" is not.** A global swap silently capitalises mid-sentence wherever the original followed a comma — *"Nevertheless, I hope that…"* became *"Nevertheless, **We** hope…"* eleven times on the first pass. The check that catches it is total rather than sampled: group every occurrence by its preceding ~24 characters and read the groups.
3. **Carry the verb.** Match `I am writing` → `We are writing`, never the pronoun alone.

### Standard placeholders

Across templates:
- `[Client Name]`, `[Client First]`, `[Member Name]`, `[PF Name]`, `[Meeting Attendees]`, `[Service Level]`
- `[Payment Amount]`, `[X]`, `[Y]` (e.g. "Payment 1 of 4"), `[Total Fee]`
- `[Receipt Number]`
- `[ENGAGEMENT]`, `[SIGNING_LINK]`, `[PAYMENT_LINK]` (HTML anchor tags substituted in)
- `[PRIORITIES]`, `[PARKED_PRIORITIES]`, `[MEMBERSHIP_OPTIONS]`, `[BUTTONS]` (HTML lists/buttons)
- `[CARD_FEE_TEXT]`, `[PROCESSING_TIME]`, `[CONTRIBUTION_NOTE]`, `[SERVICE_LEVEL_TEXT]`, `[SPECIALIST_INTRO]`, `[TAX_UPLOAD]`, `[UNDECIDED_REASON]`, `[Follow Up Meeting Date]`

**`[TAX_UPLOAD]` is now the tax-form block ONLY, and `[PORTAL_SETUP]` no longer exists (2026-08-26, v789).** `contract-invoice-receipt.ts` used to render the static Tax Form button *plus* a portal intro sentence and a blue `#00488d` "Set up your secure portal login" button after it; the portal half is gone, and the matching `[PORTAL_SETUP]` token was stripped from the two `TAX_invoicereceipt` bodies by live SQL with its render path deleted from `actions/tax/invoice-receipt.ts` — so **no first-payment email in any pipeline carries a portal-setup button any more**, and `clients.client_setup_token` has no writer (see [../architecture/04-auth-and-sessions.md](../architecture/04-auth-and-sessions.md)). **The substitution is a `<br>`-swallowing PAIR and both halves must stay**: the body reads `…[PRIORITIES][TAX_UPLOAD]<br>If you have…`, so `replace(/\[TAX_UPLOAD\]<br>/g, …)` runs FIRST and eats the template's trailing `<br>` when the block is empty (otherwise a non-tax client gets a stray double blank line under the priorities list), with a bare-token `replace` after it as the catch-all for any other body shape. Editing either template body around that token without keeping the `<br>` adjacency re-opens the spacing bug.

An HTML signature is appended to most bodies. It is **not** stored in templates — bodies end on their own sign-off line (*"Thank you,"* / *"Kind regards,"*) and the footer is concatenated in code.

**One shared constant, since 2026-08-20: `VFO_SIGNATURE` in `utils/gmail-draft.ts`.** It renders a single line — `<p style="color:#00488d;…border-top:1px solid #00488d;…"><strong style="font-size:18px;letter-spacing:0.5px;">VFO Services - Proactive Coordinator Team</strong></p>` — and **every** `actions/` call site imports it (`import { VFO_SIGNATURE } from "../../utils/gmail-draft.ts"`). The previous shape, in which each handler declared its own `const signature = '<p …'` literal, is gone: the two-paragraph **AI-PC / Proactive Coordinator / VFO SERVICES** block and the short 4-file variant of it no longer exist anywhere in admin-api. `grep -rn "const signature = '<p" supabase/functions/vfo-admin-api` must return **nothing** — a hit means a handler has re-forked the footer, which is exactly the divergence the constant exists to prevent.

Changing the footer for the whole system is therefore a one-line edit to the constant plus a redeploy — no template edits, no per-handler sweep.

## Drafts vs. sent

Every email is a **draft**, never a sent message. A human (presumably someone with the OAuth account) opens Gmail, reviews the draft, and clicks Send. There is no `users.me/messages/send` call anywhere in the codebase.

## Frontend touch-points

None. The frontend never talks to Gmail.

## Cross-references

- Email templates table: [../tables/documents.md](../tables/documents.md)
- Sandbox config: [../tables/pipeline.md#pipeline_sandbox_config](../tables/pipeline.md)
- Action catalog (lists every handler that sends a draft): [../architecture/05-api-action-catalog.md](../architecture/05-api-action-catalog.md)
