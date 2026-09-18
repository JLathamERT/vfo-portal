# UNIT 2 — PHASE 2 BRIEF — a member can be the PF (gotcha #514)

You are the implementer (Opus). Fable planned this and will review your work. Read `unit2-phase0-brief.md` "Absolute rules" first — they apply verbatim. Edge worktree `C:\vfo-edge-functions\.claude\worktrees\vfo-session-setup-7559c8`, react worktree `C:\vfo-react\.claude\worktrees\vfo-session-setup-7559c8`. Phases 0 and 1 are committed on this branch; build on the current tree.

Read first: `docs/GOTCHAS.md` #514 #448 #451 #324 #413 #455, `docs/flows/additional-contacts.md` (how `resolveTemplateRecipients` treats role tokens), `utils/pf-emails.ts`, `utils/tax-notify.ts`, `utils/email-recipients.ts` (`ctxValues`, the `ASSIGNED_PF` token).

## Problem
`clients.assigned_pf` is a free-text NAME. `utils/pf-emails.ts getPfEmail(name)` maps four admin names to correspondence emails and returns `""` for anything else; `ctxValues()` then drops the `ASSIGNED_PF` token silently. On a Direct tax case (phase 3 onward) the MEMBER is the PF, so their name in `assigned_pf` would email nobody. Bells are a separate channel (`utils/tax-notify.ts taxPfLoginEmail` → admin portal login emails, Tracy fallback) and members have NO notification bell in the member portal, so the Tracy fallback is the intended Direct behaviour for bells — do NOT touch `tax-notify.ts`'s resolution.

## Decisions (Fable/Jake, final)
- Discriminator column, not a name trick: `clients.pf_member_number text null`. On a Direct case phase 3 will write `assigned_pf` = the member's display name (so every `[PF Name]` body token, the Client Overview owner column and the PF filter keep working with zero changes) AND `pf_member_number` = the member number. This phase adds the column and the resolver; it writes nothing.
- Correspondence resolution goes through ONE new async helper; the sync `getPfEmail(name)` stays for the non-tax pipelines (MAP 1 / PFT / PIP / Regular never carry a Direct client).
- Scope of the call-site rewrite: `actions/tax/**` + `utils/tax-intake-request-email.ts` + `utils/tax-amended-invoice-chain.ts` (if it resolves the PF) + `actions/tax/revshare.ts`'s inline `getPfEmailLocal`. Nothing outside those.

## Build

### A. Migration `supabase/migrations/20260918210000_clients_pf_member_number.sql`
`alter table public.clients add column if not exists pf_member_number text;` + a `comment on column` saying: the member number when the client's PF IS its member (DIRECT tax route); NULL = an admin PF named in assigned_pf. No policy/RLS change (existing table). No index.

### B. Resolver in `utils/pf-emails.ts`
```ts
export async function resolvePfEmail(sb, client: { assigned_pf?: string | null; pf_member_number?: string | null } | null | undefined): Promise<string>
```
- `pf_member_number` set → `members.email` for that number (trimmed); empty/missing member → `""` and `console.warn`.
- else → `getPfEmail(client?.assigned_pf || "")` (existing behaviour, byte-identical).
- Never throws. Keep `getPfEmail` exported and unchanged.
- Do NOT add Ian Welham to the map in this phase (his correspondence address is unconfirmed — report that he is in the admin dropdown and the two login maps but not this map).

### C. Call-site rewrite (the #448 audit is the point of this phase)
For every `getPfEmail(` in `actions/tax/**`, `utils/tax-intake-request-email.ts`, `utils/tax-amended-invoice-chain.ts`:
1. Replace with `await resolvePfEmail(supabase, client)` (or whatever the client variable is). If the site is inside a non-async function or a sync object literal that cannot await, hoist to a `const pfEmail = await resolvePfEmail(...)` ahead of it.
2. Find the `.select(...)` that produced that `client` object. If it is an explicit column list, ADD `pf_member_number` (and `assigned_pf` if somehow absent). `select("*")` needs nothing. **Report a table: file → select site line → explicit or `*` → what you added.** A site whose client row came from a join/embed or from another function's return must be traced to the real select.
3. `actions/tax/revshare.ts` `getPfEmailLocal` (two sites ~397/~486): replace with the resolver (this widens Jake Latham / Lindsay Morris to the shared map — report it as a behaviour change; Fable will decide whether to keep the 2-name restriction). `actions/pipeline/contract-revshare.ts` is MAP 1 — leave it.
4. `actions/tax/implementation-receipt.ts` ~481: the `TAX_impl_charged_pf` bell uses `getPfEmail`'s CORRESPONDENCE address as a bell recipient, which the bell loader (session login email) can never match. Switch that one site to `taxPfRecipients(client.assigned_pf)` from `utils/tax-notify.ts` (login email or Tracy). Report it as a ride-along fix.
5. Count: report the number of sites rewritten; expect ~35–40 in ~30 files.

### D. Frontend — `src/pages/ClientDetail.jsx` ~476-484
When `client.pf_member_number` is set, render the PF as read-only text `"<assigned_pf> (Member — Direct)"` in place of the `<select>` (an admin must not reassign a Direct case's PF from here; a `<select>` whose value is not in its option list silently shows "-- Select --"). Confirm `pf_member_number` reaches the page: trace `msm_load_client_home` (and whatever else builds `client` there) — if it is an explicit list, add the column; report the finding.

### E. Verify
- `deno check --no-lock supabase/functions/vfo-admin-api/index.ts` → 0.
- Action count unchanged at 514.
- `npm run build` exit 0.
- `grep -rn "getPfEmail(" supabase/functions/vfo-admin-api/actions/tax supabase/functions/vfo-admin-api/utils/tax-*` → must be zero hits except inside `pf-emails.ts` itself. Paste the grep output.

## Report back to Fable with
files changed, the migration text, the resolver text, the #448 select-audit table, the revshare.ts behaviour-change note, the implementation-receipt ride-along, the ClientDetail payload finding, the three gate results verbatim and the grep proof.
