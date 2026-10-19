# Client Mirroring — a member mirrors one client to another member (portal licensing L5)

Shipped 2026-10-12 (`vfo-admin-api` v959 → v963), **dark behind the Feature Switch `mirrored_clients`**, keyed on the client's OWNING member (`clients.member_number`) and seeded Test member only (59524). Plan of record and decisions 19-34: [../plans/portal-licensing/README.md](../plans/portal-licensing/README.md) §3 L5. The UI calls it **Client Mirroring** — "connected member" already means something else in the portal (the member-to-member Connections on the Network card); code and tables keep the `connection` names.

**Switch off = exactly as before for mirroring**: no Client Mirroring card renders (its loader answers `{ enabled: false }`), no connection can be made, and a member a client was mirrored to stops seeing it at once (the row is kept, so switching back on restores it). Shipped alongside it and NOT behind any switch (decision 31): the member **Client Overview** tab (§4) and the Phase 0 security fence (§6).

## 1. Who can see what

- **Read-only** (decision 19). The mirrored member sees the owner's OWN member client screen (`/member/client/:id`, decision 34) — same tabs, same look, eyebrow **"Mirrored client"** — with every button hidden and every write refused by the server.
- **Tracks** (decision 20): MAP 1 / Holistic, Tax Priorities (with the Tax Planning Form answers, decision 30), Regular Priorities, PIP Meetings. **Not PFT** (the PFT tab is hidden and `pft_load_engagement` stays owner-only). CIQ: the questionnaire is not on the member client screen, so it is not mirrored; **since L4 (2026-10-16) the mirrored member sees the client's read-only One Page Plan** (`member_mirrored_ciq_plan_load` through `mirrorReadGate`, while `ciq_licence` is on for the owner — [ciq-licence.md](ciq-licence.md)). The mirrored client home never carries the `ciq_licence` key.
- **Also shown** (decision 26): the client's profile (name, email, phone, status, PF), Additional Contacts, the shared notes, the Client Vault — General + Sensitive, **view / download only**, never the ERT/VFOS Documentation section (the agreements quote fees).
- **No money** (decisions 22 / 32): no fee, amount, share, card/bank detail, invoice/receipt number, payment link, Stripe/BoldSign id or token, and no revenue-share or payout row. A PAYMENT step still shows done / not done. No revenue share changes and no licence is charged.
- **Many** members per client (decision 21); the same member can be mirrored again after removal.

## 2. Mirroring a client (owner or admin)

The **CLIENT MIRRORING** card sits at the bottom of the client's Profile tab — member view and admin view (`src/components/shared/ClientConnectedMembersCard.jsx`). It lists the active mirrors (chip **Existing connection** = one of the owner's `member_connections` partners, **One-off connection** = anyone else; "Mirrored MM/DD/YYYY by <name>"), the owner's Connections with a one-click **Mirror**, and **Mirror to a member** — a type-to-search (2+ characters) over every Active, unsuspended member by name, trading name or member number, the owner's Connections first. **Stop mirroring** (inline Yes / No) removes one.

Actions — all in NO gate list, each fenced in-handler on `auth.callerMemberNumber`, never a body value:

| Action | File | Who | Notes |
|---|---|---|---|
| `member_client_connection_add {client_id, member_number}` | `actions/client-connections/add.ts` | owner (`denyIfNotOwnClient`) or admin | switch on for the owner (403 off); partner must be Active + unsuspended + not the owner; duplicate active → 409; writes `source` (`partner` if in the owner's `member_connections`, else `one_off`) and `connected_by_name`; then the email + bell (§3) |
| `member_client_connection_remove {client_id, member_number}` | `remove.ts` | owner, admin, or the mirrored member removing THEMSELF (**Leave**) | not switch-gated (taking access away is always allowed); stamps `removed_at` / `removed_by_name`, never deletes |
| `member_client_connections_load {client_id}` | `load.ts` | owner / admin: every active row + the owner's not-yet-mirrored Connections; mirrored member: only their own row + the owner's name; anyone else 403 | `{ enabled:false }` while the switch is off for the owner |
| `member_connect_candidates {client_id, q}` | `candidates.ts` | owner or admin (`denyIfNotOwnClient`) | max 20, name + number only; owner and already-mirrored excluded |

Shared helpers: `utils/client-connections.ts` (names, active rows, the owner's partners, the notice).

## 3. The notice to the mirrored member

`sendConnectedNotice` — fail-soft, never rolls the connection back (`email_result` records `sent | drafted | failed`):

- **Email** — template `CLIENT_PORTAL / MEMBER_client_connected` (**Draft**; flip to Send in the Email Editor, Client Portal section, before the switch goes on for real members). To the mirrored member's `members.email`; their flagged `member_contacts` are Cc'd centrally. Subject *"[Owner Name] has mirrored [Client Name] to your portal"*, an **Open Client Overview** button to `/member?tab=client_overview`. Sandbox is keyed on the OWNER (`loadSandboxConfigForMember(sb, "TAX", owner)`), so a 59524 test is rerouted.
- **Bell** — rule `MEMBER_client_connected` (FYI, `dedupe: "unread"`), title *"Client mirrored: <client> (from <owner>)"*, link `/member/client/<id>`, to the mirrored member's **`member_logins.email`** (the only address a member session's bell reads, `actions/notifications/load.ts`) — **no login, no bell**.

## 4. The member Client Overview tab (no switch)

A top-level tab right of MSM in `src/pages/MemberPortal.jsx` (`?tab=client_overview` opens it, also after a logged-out login via `?next=`). It is the admin `ClientOverviewPanel` in `mode="member"`: same MAP 1 / Regular / Tax Planning / PFT pills (plus, 2026-10-12, a read-only **Unassigned** pill: the member's own clients in no program — never mirrored ones), search, filter and sort, **minus the Next action and Owner columns**, fixed column widths, rows open `/member/client/:id`. Backend `member_client_overview_load {section}` (`actions/clients/member-overview.ts`, members only, in no list): the client set is the caller's own clients plus — except PFT — the clients mirrored to them while the switch is on for each owner (`mirrored_from` = owner name, shown as "Mirrored from <owner>"); each overview engine runs **scoped** to those ids (the admin `client_overview_load` passes no scope and is unchanged), and the reply drops next actions, warnings, last action and every owner field.

## 5. The mirrored member's reads — `mirrorReadGate`

`utils/client-ownership.ts`:

- `memberClientAccess(sb, clientId, member)` → `owner` | `mirrored` (an active `client_member_connections` row AND the switch on for the owner) | `null`.
- `mirrorReadGate` / `mirrorReadGateForPlan` → owner / admin / any non-member: the ordinary `json`; a mirrored member: `mirrorJson(json)`; anyone else: 403. A handler swaps its owner check for the gate and answers with `gate.json` — nothing else changes. **Never on a write.**
- `denyIfNotOwnOrMirroredClient` → the same test without the mask (the two vault reads).

Reads on the gate: `msm_load_client_home` (adds `mirrored: { owner_name }` and omits `portal_access` for a mirrored viewer; since 2026-10-19 its `programs` list passes unmasked — program ids / names — and the mirrored member's strip never shows Partnership Fast Track), `client_notes_load_shared`, `msm_load_client_progress`, `member_load_pipeline`, `msm_load_priority_tracks`, `msm_load_priority_progress`, `tax_load_plans` (incl. `include_details`), `tax_load_progress`, `tax_load_specialists`, `tax_intake_load`. `member_client_vault_list` / `_download` admit a mirrored member but return `ert: []` and refuse `section='ert'`. **Every member WRITE** (`msm_update_client`, `msm_save_client_task`, the vault upload, `member_client_portal_access_send`, the connection add / search, `tax_direct_*`, CIQ, the L4 `member_ciq_licence_*` / `member_portal_billing_update_card`) keeps `denyIfNotOwnClient` / `denyIfNotOwnPlan` / `denyIfNotOwnCiq` — owner only (#601).

**The mask** (`utils/mirror-mask.ts`, #602): every key whose NAME matches a money / id / token word (amount, fee, share, contribution, total, invoice, receipt, `rec<N>`, strat, rev, payout, transfer, refund, stripe, token, intent, checkout, bank, last4, card, `_method`, customer, drive_id, boldsign, link, url, …) has its VALUE replaced: null stays null, a boolean stays, exactly 0 stays 0, anything else becomes "—". Statuses, dates and sent-flags pass (payment DONE-NESS, decision 32) — except payout / revenue-share / refund / id ones. Keys are kept so the screen still draws the right steps (`final_retainer_amount != null` = 3-payment). **Subtractive by name: a new money column needs one of those words.**

**Frontend** (`src/pages/ClientDetail.jsx`, `isMirror`): eyebrow "Mirrored client"; Direct mode off; PFT tab hidden; no Client Portal card; the Vault `readOnly` (no Add); the Client Mirroring card shows only **Leave**. The `mirror` prop hides, in `ClientTrackViewV2` (MAP 1): the PF pricing breakdown, the ACH/CARD tag, the revenue-share and member-notified rows; in `TaxPrioritiesTab`: the amend-fee schedule and revised-invoice notes, "Entered values" pricing, the revenue-share rows, the refund amount, the deposit PaymentIntent id; in `PipMeetingsTab`: the payment tag and the revenue-share row. The two `amendToCents` sites treat "—" as a non-zero fee.

## 6. Phase 0 — the security fence that shipped first (not switch-gated)

22 actions that took no auth and sat in no gate list joined `ADMIN_ONLY_ACTIONS` (#600): the Regular / PIP priority and PIP meeting writers, `msm_save_pip_purchase`, the PIP confirmation email, `msm_log_meeting`, `add_` / `update_` / `delete_member_program_note`, the eight `automation_SPECIALIST_*` and the three `automation_PFT_*` emails. Every caller is an admin screen. The loaders `msm_load_priority_tracks` / `_progress` and `pft_load_engagement` now refuse a member on another member's client.

## 7. Tests

`scripts/probe-l5-phase0-fence.ps1` (32 checks: own 200 / foreign 403 / admin 200 on the three loaders, all 22 writers 403 — preflights the fence before any write, #603) and `scripts/probe-l5-mirroring.ps1` (owner unchanged; the mirrored member gets 200 on every gated read with **no unmasked money / id / token key anywhere in any reply**, ERT hidden, PFT / a non-mirrored client / every write 403). Both need the owner (59524) and, for the second, the mirrored member's login, with Test Client 62 mirrored to them first.
