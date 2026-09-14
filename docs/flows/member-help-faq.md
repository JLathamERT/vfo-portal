# Member Help button + FAQ Editor (added 2026-09-14, v844/v845)

A members-only Help widget fed by one admin-editable table. No email, no bell, no money, no chain — the smallest flow in the portal, documented because it is the first surface that mounts **outside** a page and the first grantable tab whose read half is member-callable.

## What a member sees

- A fixed blue **?** circle bottom-right on every `/member*` page except `/member/login` — the portal home (all tabs + Settings) and `/member/client/:clientId`. It is mounted **once**, from `App.jsx` after the `<Routes>`, by `MemberHelpMount` in [src/components/member/MemberHelpButton.jsx](../../src/components/member/MemberHelpButton.jsx), which gates itself on `useLocation().pathname` + `getSession().role === 'member'`. Admin / client / specialist / planner pages never render it.
- Clicking it opens a panel (a 400 px card above the button; a bottom sheet under 560 px) with a **search box**, an **FAQs** accordion and a **Videos** list. Escape or the × closes it; the button reads × while open.
- Content loads **once per page load** on the first open (`faq_load`) and is filtered **client-side**: the search box matches case-insensitively on `question` + `answer`; the Videos tab is the same list filtered to rows with a `video_url`. Expanding a question shows the answer (plain text, `pre-wrap`) and, when present, the Wistia player as a 16:9 iframe — the same iframe shape `MemberMSMTracking.jsx`'s `VideoTask` uses for training videos.

## What an admin sees

- **FAQ Editor** tab in the admin nav, rendered for the superadmin or any admin whose `allowed_admins.allowed_tabs` contains `faq_editor` (ticked in the Admin Editor, saved by `admin_update_tabs`). [FaqEditorPanel.jsx](../../src/components/admin/FaqEditorPanel.jsx).
- Add / edit form: **question** (required), **answer** (plain text), **Wistia video link**, **Visible to members** checkbox. Save requires the question and at least one of answer / video — both is fine. A pasted link that carries the media id (`/medias/<id>`, `/embed/iframe/<id>`, `?wvideo=<id>`) previews before saving; a `/s/<share-token>` link shows a grey "looked up when you save" note because only the server can resolve it.
- List: rows in member order with ▲▼ reorder (persists via `mode:"reorder"`), Edit, Hide / Show (a hidden row dims and disappears from the member panel), Delete (confirm dialog), a **VIDEO** chip + inline preview, and a "last edited by … · date" line.

## Backend

| Action | Gate | Does |
|---|---|---|
| `faq_load` | **none — deliberate** | Members: `active = true` rows, columns `id, question, answer, video_url, sort_order`. Admins: `*`, every row. Ordered `sort_order, id`. |
| `faq_manage` | `TAB_ACTIONS.faq_editor` (operative) + `ADMIN_ONLY_ACTIONS` (belt) | `mode:"save"` insert / update · `mode:"delete"` · `mode:"reorder"` (`ids[]` in full, `sort_order` = index). Stamps `created_by` / `updated_by` with the session email. |

**Why `faq_load` is in no list:** the per-tab gate in `middleware/auth.ts` applies to *every* non-superadmin caller, members included (a member has no `allowed_admins` row, so `allowedTabs` is `[]`), so putting the read under `faq_editor` would 403 exactly the members it serves; and `MEMBER_SCOPED_ACTIONS` only rewrites `body.member_number`, which the handler never reads, so listing it there would guard nothing (#455). The confinement is in-handler (`active` filter + column whitelist for non-admins). Both `role-gates.ts` sites carry a comment saying so. Clients / specialists / planners cannot reach it — their allowlists fence first.

**Wistia link handling** ([actions/faq/wistia.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/actions/faq/wistia.ts)): `resolveWistiaUrl` accepts any `*.wistia.com` / `*.wistia.net` link. Shapes that carry the 10-character media id are parsed inline; anything else — in practice the `/s/<token>` share link, whose token is *not* the media id — is resolved through Wistia's public oEmbed endpoint (`https://fast.wistia.com/oembed.json?url=…`, 6 s timeout, no key) and the id is read out of the returned `<iframe src>`. Every shape is stored as `https://fast.wistia.net/embed/iframe/<id>`, matching `program_training_tasks.video_url`. A non-Wistia host, or a share token Wistia does not recognise, is a **400**. Loom / YouTube are deliberately not accepted (Jake: Wistia only).

Refusals (all 400 unless noted; the FE mirrors the first three so they are UI-unreachable): blank question · neither answer nor video · unresolvable video link · unknown `mode` · `delete` with no id · `delete` / update of an unknown id (**404**) · `reorder` with an empty or duplicate `ids` list. [scripts/probe-faq-refusals.ps1](../../../vfo-edge-functions/scripts/probe-faq-refusals.ps1) exercises all of them plus the member 403 and the member column/active filter; run it after any change to the handler.

## Data

`faq_items` — [tables/faq.md](../tables/faq.md). RLS deny-all; DB CHECKs mirror the two product rules (non-blank question; answer or video).

## Not in this flow (decisions)

- No per-member state (nothing records who read what). No analytics.
- No backend search — the list is dozens of rows and loads once; the filter is client-side by design.
- No categories / tags — reorder is the only grouping tool. Add a `category` column if the list outgrows a single scroll.
- The button is members-only; other portals would need their own mount condition in `MemberHelpMount`.
