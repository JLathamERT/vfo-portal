# Additional Contact Cc + greeting

**How a second person on a client's — or a MEMBER's — side gets onto their emails, and, for a client contact, optionally into the salutation.**

There are **TWO tables and two mechanisms**, and they are wired at different layers:

| | Client contacts | Member contacts |
|---|---|---|
| Table | `client_contacts` | `member_contacts` (2026-09-16) |
| Keyed on | `clients.id` | `members.member_number` |
| Switches | `cc_on_emails` + `use_in_greeting` | `cc_on_emails` only — **no greeting toggle, by decision** |
| Phone column | no | **yes** (optional, display-only) |
| Who manages | admin, or a member on their own client | **admin only, by decision** |
| Wired at | **each handler**, via `loadAdditionalContacts` → the `extraCc` parameter (53 call sites) | **centrally**, inside `resolveTemplateRecipients` — no handler knows the table exists |
| Trigger | the email is addressed **TO the client** | the **member's own email lands in To or Cc** of any templated send |

Client contacts shipped 2026-08-20 (v767–v771) and **replace** the per-form "extra Cc" mechanism entirely; `pipeline_map1.extra_cc` and `client_tax_plans.extra_cc` are now dormant columns (see *The predecessor* at the bottom). Member contacts shipped 2026-09-16 (v854).

---

## The idea in one line

**An extra Cc is a property of a PERSON, not of a form submission.** Flag a `client_contacts` (or `member_contacts`) row once, on the profile, and that person is Cc'd on every email that addresses the person they belong to, from then on — whichever pipeline, whichever handler, whichever form.

---

## Data model

Two boolean columns on the existing `client_contacts` table (migration `20260820190148_client_contacts_cc_toggles`), both `NOT NULL DEFAULT false` so every pre-existing row is behaviourally unchanged:

| Column | Meaning |
|---|---|
| `cc_on_emails` | Cc this contact on all client emails |
| `use_in_greeting` | Also name this contact in the email greeting. **Only meaningful when `cc_on_emails` is true.** |

Full column list → [tables/clients.md](../tables/clients.md).

**Two invariants, enforced in the handler on the FINAL state** (stored row merged with the incoming patch, never on the incoming fields alone — so a two-step edit cannot sneak past them):

1. `cc_on_emails` requires a non-empty `email` on the row.
2. `use_in_greeting` requires `cc_on_emails`.

Blanking the email out from under a live Cc is refused with its own message (*"Remove the Cc toggle first or keep an email on file."*).

---

## Who can set what

| Action | File | Who | Notes |
|---|---|---|---|
| `msm_add_client_contact` | `actions/msm/add-client-contact.ts` | admin, or a member on their own client | **Email is REQUIRED** and regex-validated. Toggle fields are **not accepted** — a contact is always created Cc-off. |
| `msm_update_client_contact` | `actions/msm/update-client-contact.ts` | name/email: same as above · **toggles: admin only** | New 2026-08-20. |
| `msm_delete_client_contact` | `actions/msm/delete-client-contact.ts` | admin, or a member on their own client | Unchanged. |

Both write actions sit in **`MEMBER_SCOPED_ACTIONS` only** — no `ADMIN_ONLY_ACTIONS` entry — and re-check ownership in-handler via `denyIfNotOwnClient` (#142).

> ⚠️ **The admin test is `auth.callerRole === "admin"`, deliberately NOT the `!== "member"` idiom** that `msm_update_client` uses for status/assigned_pf. A **tax planner authenticates as `callerRole "tax_planner"`** (`middleware/auth.ts`), so the loose form would have handed planners the two toggles. For a non-admin caller the toggle fields are **silently ignored**, not rejected.

**Email validation is duplicated on purpose in three places** — `add-client-contact.ts`, `update-client-contact.ts` and `ClientDetail.jsx` — all using the same shape as `dedupeEmails` in `utils/email-recipients.ts`. An additional contact is a future Cc recipient, so anything that would not survive that filter must never be stored in the first place.

**Pre-existing rows with a blank email keep working** but can never be flipped on. The frontend leaves that toggle **clickable and explains itself** (*"This contact has no email address on file — add one to enable Cc."*) rather than sitting silently disabled.

---

## Send-time resolution

`utils/additional-contact.ts`:

```ts
loadAdditionalContacts(supabase, clientId) -> { ccList: string[], greetingFirsts: string[] }
```

- Selects `client_contacts` where `client_id = ?` **and `cc_on_emails = true`**.
- `ccList` = every such row's non-empty email.
- `greetingFirsts` = the first names of the subset that ALSO has `use_in_greeting` and a non-empty first name.
- **Never throws and never propagates a DB error** — every failure path returns `{ ccList: [], greetingFirsts: [] }`. A missing Cc must not take an email down with it.

`ccList` is passed as the **6th `extraCc` parameter of `resolveTemplateRecipients`** — a parameter that already existed. That is the whole point of the shape: **sandbox suppression, To-collision filtering, dedupe and validation are inherited, not re-implemented.** In sandbox the entire send reroutes to the sandbox address with no Cc at all, so an Additional Contact Cc is **only ever observable on a live send** (the same blind spot as #324).

**Current wiring (derive it, don't trust this count):**

```powershell
cd C:\vfo-edge-functions\supabase\functions\vfo-admin-api
Select-String -Path (Get-ChildItem -Recurse -Filter *.ts | % FullName) -Pattern 'loadAdditionalContacts\(supabase' -AllMatches
Select-String -Path (Get-ChildItem -Recurse -Filter *.ts | % FullName) -Pattern 'withGreetingNames\('            -AllMatches
```

At ship (2026-08-20, v771): **45 files import the helper · 53 `loadAdditionalContacts` sites · 42 `withGreetingNames` sites**, spanning MAP 1 / contract, TAX, PIP, PFT, Regular (MAP 4), migration, vault and card-update.

---

## The greeting

`withGreetingNames(first, greetingFirsts)` joins the client's own first name with the greeting-flagged contacts' first names using `" and "`:

```
withGreetingNames("Dane", ["Veronica"])  ->  "Dane and Veronica"     ->  "Dear Dane and Veronica,"
withGreetingNames("Dane", [])            ->  "Dane"                  ->  unchanged
```

**It is applied to the `[Client First]` token in email BODIES only.**

- **Never `[Client Name]`** — that token is the client's full legal-ish name and is used in agreement and invoice contexts.
- **Never in a subject line.** `tax/request-returns.ts` and `tax/request-additional-info.ts` carry an **explicit subject-guard** re-substituting the plain first name, because a compound name in a subject reads as a mistake. **No live template subject currently holds `[Client First]`** (`select id, pipeline, template_name from email_templates where subject ilike '%[Client First]%'` → 0 rows, 2026-08-20), so those guards are a **latent-trap disarm**, not an active code path.

> ⚠️ **Two sites are NOT guarded, and they are the ones a `grep` for the guard will not find.** `utils/map1-installment-failure.ts` and `actions/tax/deposit-refund.ts` build the subject and the body through **one shared `subst()` closure**, so the greeting substitution lands on both by construction — there is no separate subject line to add a guard to. They are harmless **today only because their template subjects do not contain the token.** **Before adding `[Client First]` to ANY template subject, check the sending handler**: if it shares one substituter between `subject` and `body`, that subject will render *"Dane and Veronica"*. Derive the list rather than trusting this one — the shape to look for is `const subject = subst(...)` beside `const body = subst(...)` in a file that also imports `withGreetingNames`.

---

## Exclusions — deliberate, do not "complete the pattern"

| Not wired | Why |
|---|---|
| `login-setup/send-email.ts`, `login-setup/request-reset.ts` | **A password-reset or login-setup link is a CREDENTIAL.** An additional contact is not entitled to one. These were wired during phase 4 and **reverted before deploy** on the user's decision. Permanently out of scope. **Since 2026-09-16 the same five credential handlers also pass `{ skipMemberContacts: true }`** — the member twin resolves centrally, so opting out is now an explicit flag rather than the absence of a call. |
| `tax/revshare-sweep.ts` assess-reminder tiers | Those emails go **to the planner**, not the client. A client's Cc has no business on a planner-facing chase. |
| Member / specialist branches of `vault/request-docs.ts` | The mechanism is client-keyed. Only the `entityType === "client"` branch loads contacts — and for that branch `entity_key` **is** `clients.id` (see `resolveVaultPerson`). |
| `tax/presentation-sweep.ts` when the presentation email goes **to the member** | **Gated 2026-08-27** — it used to pass the Cc unconditionally. The Cc now rides **only on the fallback branch**, where the member has no email on file and the To falls back to the client's own address. A member-addressed presentation email carries no additional-contact Cc. |
| Every **member-pays-on-behalf** branch | **Reversed 2026-08-27.** When the member pays, the client's whole side of the recipient list goes quiet: the ctx **omits `CLIENT`** and no additional-contact Cc is passed. The client receives nothing. |

⚠️ **`vault/request-docs.ts` is one of the eleven `send_mode=true` templates (#325).** It **real-sends**, so the first genuine vault documentation request to a client who has a Cc contact reaches that contact with nobody reviewing the draft first.

⚠️ **The member-pays template rows still list `CLIENT` in their `cc_list`, and that was NOT edited.** The entry is **inert** on a member-pays send because the handler no longer resolves the token. Do not "fix" the rows to match the behaviour, and do not read them as proof the client is Cc'd (#324 — the handler is the routing).

**The rule since 2026-08-27:** an additional-contact Cc rides **only on an email actually addressed TO the client.** The moment the To flips to the member, the client's side of the recipient list drops out — the `CLIENT` Cc token and the additional contacts alike. This **replaces** the 2026-08-20 decision recorded here, which kept both `tax/presentation-sweep.ts` and the member-pays branches wired on the reasoning that the client stays the *subject* of the email even when the member is the recipient. Being the subject is no longer enough; being the To is.

---

## Frontend

[`src/pages/ClientDetail.jsx`](../../src/pages/ClientDetail.jsx):

- **The card lives on the PROFILE tab (`home` → `ClientHome`), as its own `ClientAdditionalContacts` component — moved there 2026-09-16** from Edit Profile (`details` → `ClientDetails`), which now holds the Primary Contact form alone. It renders **below the Client Status / Assigned PF row and above All Notes**, and is **always visible even when the client has no contacts** — the old placement hid the whole mechanism behind a tab nobody opened.
- **Admin only.** `ClientHome` renders the card when `!readOnly`; members and planners instead get the read-only list inside the **Contact Info** card (now gated on `readOnly`, so an admin no longer sees the list twice).
- An **explanatory notice line** sits under the card title: *"People on this client's side. With **Cc on all client emails** switched on, a contact is Cc'd on every portal email addressed to this client; **Include in the greeting** also names them in the salutation."*
- Add form with a **required, validated** Email field (Save stays disabled until first/last/email are all valid); per-row inline **Edit** for name + email; the two checkboxes.
- **Toggles STAGE, they do not fire per click.** A row only enters the staged map once its ticks differ from what is stored, and the entry is dropped the moment they match again (either by clicking back, or by a successful save). A per-row **Save** button commits both flags in **one** `msm_update_client_contact` call, then flashes a green *"Saved"* for 4s. On failure the staged state is left alone so the row keeps its Save button and the user can fix and retry.
- **Turning Cc off drops the greeting with it** in the same staged patch — a greeting is meaningless for someone who is not on the email.
- Every backend 400 (both invariants) surfaces in a **per-row error line**, so the handler's messages are the user-facing copy.
- **Members / planners (`readOnly`)** — two read-only pills beside each contact's name inside Contact Info: *"Cc'd on client emails"* and *"Included in greeting"*. No controls.

---

## THE MEMBER TWIN — `member_contacts` (2026-09-16)

**Who it is for:** advisors, accountants and strategic members — every one of them is a `members` row, and each has people on their own team (an assistant, an office manager, a partner) who should see the portal email the member gets. Migration `20260916120000_member_contacts.sql`.

### Table

`public.member_contacts` — `id` · `member_number` (FK `members` **ON DELETE CASCADE**) · `first_name` · `last_name` · `email` · `phone` · `cc_on_emails bool NOT NULL DEFAULT false` · `created_at`. Index on `member_number`.

**RLS deny-all shipped in the SAME migration** (#141), anon probe returned `Content-Range: */0`, security advisor GREEN at the exact baseline. Columns → [tables/members.md](../tables/members.md).

Two deliberate divergences from `client_contacts`: there is **no `use_in_greeting`** (one switch only, by decision) and there **is a `phone` column** (asked for; display-only — nothing sends to it).

### Actions — admin-only, by decision

| Action | File | Gate |
|---|---|---|
| `member_contact_add` | `actions/members/contact-add.ts` | `ADMIN_ONLY_ACTIONS`, **no `TAB_ACTIONS` key** |
| `member_contact_update` | `actions/members/contact-update.ts` | `ADMIN_ONLY_ACTIONS` |
| `member_contact_delete` | `actions/members/contact-delete.ts` | `ADMIN_ONLY_ACTIONS` |

**There is no member self-service path** — unlike client contacts, which a member may manage on their own client. That is a decision, not an oversight; do not "complete the pattern" by widening the gate (#490).

`contact-add.ts`: first/last/email all **required**, email regex-validated with the same shape as `dedupeEmails`, member existence checked, and the row is **always created Cc-off** (the switch is a separate write). `contact-update.ts` enforces the one invariant — **`cc_on_emails` requires a non-empty email** — on the **FINAL state** (stored row merged with the patch), so a two-step edit cannot sneak past it, with the same *"Remove the Cc toggle first…"* message the client side uses.

The list rides on **`member_profile_load.contacts`** (a fourth parallel query in that handler); there is no separate loader action.

### Send-time resolution — CENTRAL, not per-handler

This is the structural difference from client contacts. `utils/email-recipients.ts resolveTemplateRecipients` now:

1. computes the REAL To / Cc / Bcc first (`resolveRealRecipients`), then
2. calls `loadMemberContactCc(supabase, [...to, ...cc, ...extraCc])`, which selects every `member_contacts` row with `cc_on_emails = true` joined to `members.email` and returns the contact emails of any member whose own address is in that list, then
3. folds those into Cc (deduped, validated, To-collision filtered like anything else).

Consequences worth stating out loud:

- **It holds for EVERY templated email in the portal** — a Stripe Connect setup, a rev-share notice, a membership invoice, a client email the member merely happens to be Cc'd on. No handler was changed to make this work and no handler can forget it.
- **Bcc is deliberately NOT a trigger.** A member who was Bcc'd was hidden on purpose; adding their contact to a visible Cc would out them.
- **The member email compare is case-insensitive, done in JS** — 36 `members` rows carry mixed-case emails, and the join is on the flagged set only, which is small.
- **It never throws.** Any error or exception returns `[]`; a missing Cc must not take an email down with it.

### Credential exclusion — `options.skipMemberContacts`

`resolveTemplateRecipients` gained a 7th `options` parameter. `{ skipMemberContacts: true }` is set on **exactly five** handlers, all of which mail a link that logs in as the member:

`login-setup/send-email.ts` · `login-setup/request-reset.ts` · `advisor/login-setup-email.ts` · `accountant/login-setup-email.ts` · `onboarding/login-setup-email.ts`

Same exclusion, same reason, as the client contacts' permanent carve-out below: **a password-reset or login-setup link is a CREDENTIAL and an additional contact is not entitled to one.** Derive the set rather than trusting this list — `grep -rn "skipMemberContacts" supabase/functions/vfo-admin-api`.

### The sandbox recipient log (v855)

Because sandbox reroutes the whole send, a recipient change is **invisible in sandbox by construction** (#324) — which is how a Cc feature ships with no way to test it. `resolveTemplateRecipients` therefore resolves the REAL recipients *before* the sandbox short-circuit and logs

```
sandbox: would have sent to=[…] cc=[…] bcc=[…]
```

Non-sandbox output is byte-identical; the only change in live behaviour is the member-contact Cc itself. **Read `function_logs` for `sandbox: would have sent` to verify any recipient change without sending.**

### Frontend

`src/components/admin/MembersPanel.jsx` — new `MemberAdditionalContacts` card on the **admin Member Profile → DETAILS tab**, placed **below Bio and above Notes**. Add form (first/last/email required and validated, phone optional), per-row inline edit, delete, and a **checkbox that fires per click** — unlike the client card's staged Save, because there is only one switch to stage. A silent `member_profile_load` re-read after every write keeps the list in step without flashing the skeleton.

Notice line under the title: *"People on this member's team. With **Cc on all emails** switched on, a contact is Cc'd on every portal email this member receives or is Cc'd on."*

### Proven / not proven

Live-proven on Test Member 59524: a contact added, edited, removed and toggled; a **REAL (non-sandbox) Stripe Connect setup draft** carried the contact in Cc; and a sandbox log line proved the contact rides when the member is merely **Cc'd on a client email**. Not yet exercised: the first REAL member-contact Cc on a non-Connect send, and all five `skipMemberContacts` arms.

---

## The predecessor — why `extra_cc` is dormant, not deleted

The old mechanism was a free-text chip list on the **MAP 1 PIP Follow-Up decision form** and the **Tax decision form**, stored as a comma-separated string in `pipeline_map1.extra_cc` / `client_tax_plans.extra_cc` and read by `utils/extra-cc.ts extraCcList()`.

**It quietly did not work.** `pipfu-decision.ts` wrote the column and **its own Undecided/No email never read it back**; portal-wide, only **5 of ~114 sender files** ever read `extra_cc` at all. The UI promised *"these email addresses will be CC'd on all client emails"* and delivered on that in under 5% of sends — with no error, no log line and nothing to notice but an eventual human absence (the same observability shape as #424).

What changed in phases 3 and 6:

- Every legacy `extra_cc` **read** was **REPLACED by `loadAdditionalContacts`, not merged with it** — merging would have double-Cc'd every backfilled address.
- Every `extra_cc` **write** was removed (`pipfu-decision.ts`, `tax/decision.ts`).
- **`utils/extra-cc.ts` was DELETED** (zero importers).
- Both decision forms lost their Cc chip UI and payload field, leaving the muted line *"Extra Cc is now managed on the client profile (Additional Contacts)."*
- **The columns remain, dormant** — nothing reads them, nothing writes them — so the historical values stay auditable. For the same reason `AutomationPanel` / `TaxAutomationPanel` keep their **read-only "Extra CC" display rows**: they show what a past submission recorded. That is history, **not routing** (#324 — read the handler).

Verify the dormancy claim rather than believing it: a grep for `extra_cc` over `supabase/functions/` should return **comments only**.

**Backfill.** Every legacy address was carried into `client_contacts` with **Cc ON, greeting OFF** (greeting is opt-in per person; nobody had consented to it) by migrations `20260820193959` + `20260820200601`. **Exactly one address was deliberately dropped — `cmoses@tes85.com` (client 149, Fredric Moses)** — on the user's instruction. It is the only exclusion; do not "restore" it in a future tidy-up.

---

## Cross-references

- [integrations/gmail.md](../integrations/gmail.md) — the recipients pattern, `resolveTemplateRecipients`, role tokens, array ctx values, `skipMemberContacts`, Draft vs Send.
- [flows/notifications.md](notifications.md) — in-app bells (a different mechanism; **both** kinds of Additional Contact affect **email** only, never a bell recipient).
- [tables/clients.md](../tables/clients.md) — `client_contacts` columns · [tables/members.md](../tables/members.md) — `member_contacts` columns.
- Gotchas **#324 / #413** (to know who receives an email, read the handler) · **#424** (a whole pipeline can agree and still be wrong) · **#325 / #356** (Draft vs Send — the vault caveat above) · **#142 / #257** (ownership guards behind the two client write actions) · **#505** (the sandbox reroute hides recipients by construction — log the real resolution before rerouting).
