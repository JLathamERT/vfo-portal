# Client portal — Basic portal, portal access and introduction requests (portal licensing L2)

Shipped 2026-10-09 (`vfo-admin-api` v953 → v955), **dark behind the Feature Switch `client_basic_portal`**, keyed on the CLIENT's member and seeded Test member only (59524). Plan of record and decisions 7-12: [../plans/portal-licensing/README.md](../plans/portal-licensing/README.md) §3 L2. The tax licence that makes a client Standard (L1) is in [tax-planning.md → Client portal licence](tax-planning.md#client-portal-licence-direct-unit-4--portal-licensing-l1-2026-09-28). Code: `utils/client-basic-portal.ts`, `actions/client-portal/send-access.ts`, `actions/client-portal/request-introduction.ts`; frontend `src/components/member/MemberPortalAccessCard.jsx`, `src/pages/ClientPortal.jsx`, `src/components/member/MemberShowroom.jsx`.

**Switch off = the portal as before**: no member button, no introduction button, no tier, and every `client_*` response byte-identical. One frontend change applies to everyone regardless: the client portal's **Vault tab is hidden until the live `client_showroom_load` answer arrives** (see *The Basic gate*).

## 1. Send portal access (member)

The member's view of their client (`/member/client/:id`, Profile tab) ends with a **CLIENT PORTAL** card holding one button, present only when `msm_load_client_home` carries `portal_access` (member/admin caller AND the switch on for the client's member; planners never get it). One click, no confirm, no success message — the button just becomes **Resend portal access** (the sent date on hover). Only a refusal is shown, in red.

`member_client_portal_access_send { client_id }` (members + admins; in NO gate list, confined by `denyIfNotOwnClient` right after the role check):

1. Switch check on the client's member (403 off).
2. Sandbox: `loadSandboxConfigForMember(sb, "TAX", member)` — the TAX toggle, plus the 59524 force (#251).
3. **The login** — `ensureBasicPortalLogin` wraps L1's `ensureClientPortalLogin` (token `created_by='basic-portal'`):
   - no login → a `client_logins` row with a random passcode + a 30-day `/set-password` link → the email's **Set up my portal login** button;
   - an existing login **never set up** (every client setup token auto-minted — `portal-licence` / `basic-portal` — and none completed) → a FRESH 30-day link, so a client whose first link expired, or whose first email failed after the login was made, can still get in;
   - any other existing login → **Sign in to my portal** (no token).
   - no email → 400; the email already belongs to ANOTHER client's login (`client_logins.email` is unique) → 409. Both go back to the member, never a bell.
4. **The email** — template **311** `CLIENT_PORTAL/CLIENT_portal_access` (Draft), To the CLIENT only: a credential email, `skipMemberContacts`, no Cc/Bcc. The handler drafts it and then calls `maybeSendDraft`, so it knows truthfully whether Gmail sent it (`delivery: sent | drafted`).
5. **The licence** — after a successful email, `recordBasicLicence` writes the ONE `source='basic'` row ($0, `tier='basic'`, `starts_on` = today, `ends_on` NULL; unique per client). A resend adopts it. It never makes a client Standard. There is **no revoke** (decision 9 / decision 6).

## 2. The Basic gate (client)

`clientPortalTier(clientId)`: switch off → `null` (no tiers); otherwise **Standard** when `clientLicenceStatus` says an unrevoked Standard licence covers today (today only L1 tax rows; L3 / L4 add sources), else **Basic** — never held, expired, revoked, or the $0 Basic row only. **Decision 11 (revised 2026-10-09):** the gate needs only `client_basic_portal`; with `portal_licensing` off no client of that member can ever be Standard, accepted by Jake.

- `client_showroom_load` carries `tier` (and `intro_requests`) while the switch is on.
- **Server guard:** the five `client_vault_*` actions call `denyIfBasicClient` right after their client check → **403** *"The Client Vault is not part of your portal."* Live-probed 2026-10-09: all five 403 for Basic client 365, all pass for Standard client 62.
- **Frontend:** `ClientPortal.jsx` starts with the Vault tab OFF (`vaultAllowed=false`) and only the LIVE answer may grant it; a last-seen snapshot can only take it away (an old snapshot from before the switch would otherwise flash the tab, #596). A failed load with no snapshot leaves it off.
- Document requests are unaffected: clients upload through the emailed `/vault-upload` links, not the portal Vault tab.

## 3. Request an introduction (client)

In the client portal only (`MemberShowroom` gets `introRequest` from `ClientPortal.jsx`; the member and admin Showrooms never pass it), the specialist pop-up shows a white / VFO-blue **Request an introduction** button under the header. Once requested it is the same button, inert, with a `not-allowed` cursor, reading **Introduction requested MM/DD/YYYY**.

`client_request_introduction { expert_id }` (`CLIENT_ALLOWED_ACTIONS`):

1. Client and member from the SESSION (`auth.callerClientId` → `clients.member_number`); switch check (403).
2. The specialist must be Active and not in the member's `member_exclusions` (404) — the same set the Showroom shows.
3. Insert into `client_intro_requests` — the unique `(client_id, expert_id)` index is the duplicate guard: a second request is **409** with `requested_at`.
4. Template **312** `CLIENT_PORTAL/CLIENT_intro_request` (Draft) To the MEMBER, **Tracy Bcc'd** (`tnmiller@vfo-services.com` in the template's `bcc_list`), member contacts Cc'd as usual: *"Your client [Client Name] ([Client Email]) has asked, through their VFO client portal, for an introduction to [Specialist Name] ([Specialism]). Please make the introduction when you can."* + an **Open client** button (`/member/client/<id>`). Specialists have no company field, so the specialism is `experts.short_bio`. If the email cannot be created the request row is DELETED so the client can try again; otherwise `email_result` = `sent` / `drafted`.
5. Bell **`CLIENT_intro_requested`** (area *Client Portal*, FYI, dismissible) to Tracy `tnmiller@elitert.com`: *"Introduction requested: [Client] → [Specialist]"*, linking to `/admin/client/<id>` (decision 7).

## Emails and rollout

Both templates are **Draft** (decision 10) and live in the Email Editor's **Client Portal** section; flip them to Send before turning the switch on for real members, or every click lands in the aipc Gmail Drafts. The training / customer-experience video line is to be added to template 311 in the Email Editor once the URL exists (no code).

## Live-proven (2026-10-09, Test Member 59524, sandbox)

Send portal access on Test Client 62 (existing login → Sign in; Basic row written once, resend adopted it) and Test Person 365 (new login → Set up link, token `basic-portal` completed); 365 sees Showroom only with no Vault flash on a fresh or a return visit, 62 keeps Showroom + Vault + Home; the five Vault 403s; an introduction request (Test Person → Todd Lofgren, `drafted`, Tracy bell 3049 — marked read); the member Showroom shows no button; smoke 5/5 vs v953, v954 and v955.

**Not exercised (code-only):** a member sending for ANOTHER member's client (403), the email-taken 409, the never-set-up RESEND minting a fresh link on a real expired link, a duplicate request through the API (409 — the UI makes it inert), an excluded / inactive specialist (404), the request rollback when the email fails, the switch-off 403s, and any real (Send-mode) delivery of either template.
