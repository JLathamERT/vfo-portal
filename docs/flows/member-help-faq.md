# Member Help button + FAQ Editor (added 2026-09-14, v844/v845; categories + PDF documents 2026-09-15)

A members-only Help widget fed by one admin-editable table (plus a small categories table since 2026-09-15). No email, no bell, no money, no chain — the smallest flow in the portal, documented because it is the first surface that mounts **outside** a page and the first grantable tab whose read half is member-callable.

## What a member sees

- A fixed blue **?** circle bottom-right on every `/member*` page except `/member/login` — the portal home (all tabs + Settings) and `/member/client/:clientId`. It is mounted **once**, from `App.jsx` after the `<Routes>`, by `MemberHelpMount` in [src/components/member/MemberHelpButton.jsx](../../src/components/member/MemberHelpButton.jsx), which gates itself on `useLocation().pathname` + `getSession().role === 'member'`. Admin / client / specialist / planner pages never render it.
- Clicking it opens a panel (a 400 px card above the button; a bottom sheet under 560 px) with a **search box** and ONE list of FAQs (the separate FAQs / Videos / Documents tabs were removed at Jake's request during the 2026-09-15 click-through — a question carries whatever media it has). Escape closes the full-screen document if one is open, else the panel; the button reads × while open.
- Content loads **once per page load** on the first open (`faq_load`) and is filtered **client-side**: the search box matches case-insensitively on `question` + `answer`; the rows are grouped under the admin's **categories** (in the editor's order); rows without one sit last under *Other questions*, and a heading with no matching rows is skipped so a search never shows an empty group. With no categories at all the list is flat, as before.
- Expanding a question shows the answer (plain text, `pre-wrap`), the Wistia player as a 16:9 iframe (the same iframe shape `MemberMSMTracking.jsx`'s `VideoTask` uses for training videos) and/or the **document**: a 220 px inline PDF iframe with an **⤢ Expand** button that opens the same PDF in a full-screen overlay (dark backdrop, *Open in new tab*, × / Escape to close) — the document's answer to the video player's own fullscreen control.

## What an admin sees

- **FAQ Editor** tab in the admin nav, rendered for the superadmin or any admin whose `allowed_admins.allowed_tabs` contains `faq_editor` (ticked in the Admin Editor, saved by `admin_update_tabs`). [FaqEditorPanel.jsx](../../src/components/admin/FaqEditorPanel.jsx).
- **Categories** section (top): add by name, ▲▼ reorder, inline rename, delete. The list shows how many FAQs each holds, and the delete confirm says those FAQs will be kept and become uncategorised — the FK is `ON DELETE SET NULL`, so a category can always be added or removed without touching content.
- Add / edit form: **question** (required), **category** dropdown (*Uncategorised* + every category), **answer** (plain text), **Wistia video link**, **Document (PDF)** file input, **Visible to members** checkbox. Save requires the question and at least one of answer / video / document — any mix is fine. A pasted link that carries the media id (`/medias/<id>`, `/embed/iframe/<id>`, `?wvideo=<id>`) previews before saving; a `/s/<share-token>` link shows a grey "looked up when you save" note because only the server can resolve it. A chosen PDF is uploaded **when you save** (`faq_document_upload_url` → browser PUT → `faq_manage mode:"save"` with the returned path); on edit the current document's name shows with a *Remove document* button, and choosing a new file replaces it (the old bucket object is deleted by the save).
- List: rows in member order with ▲▼ reorder (persists via `mode:"reorder"`), the category name under each question, Edit, Hide / Show (a hidden row dims and disappears from the member panel), Delete (confirm dialog; deletes the bucket object too), **VIDEO** / **DOCUMENT** chips with inline previews (video 16:9; document a 320 px iframe + an open-in-new-tab link), and a "last edited by … · date" line.

## Backend

| Action | Gate | Does |
|---|---|---|
| `faq_load` | **none — deliberate** | Members: `active = true` rows, columns `id, question, answer, video_url, document_path, document_name, category_id, sort_order` (the path is swapped for a 1-hour signed `document_url` before it leaves — members never see the path). Admins: `*` + `document_url`, every row. Both: `categories` (all, ordered). Ordered `sort_order, id`. |
| `faq_manage` | `TAB_ACTIONS.faq_editor` (operative) + `ADMIN_ONLY_ACTIONS` (belt) | FAQs: `mode:"save"` insert / update · `mode:"delete"` · `mode:"reorder"` (`ids[]` in full, `sort_order` = index). Categories: `mode:"category_save"` (insert, or rename with `id`) · `mode:"category_delete"` · `mode:"category_reorder"`. Stamps `created_by` / `updated_by` with the session email. |
| `faq_document_upload_url` | `TAB_ACTIONS.faq_editor` + `ADMIN_ONLY_ACTIONS` | Mints a signed upload url into the private `faq-documents` bucket at `<16-hex>_<sanitised name>.pdf`. Body: `filename` (`.pdf` only). The path is built server-side — the body selects no bucket or folder (#309); `faq_manage` then refuses any `document_path` that does not match that exact shape or does not exist in the bucket. |

**Why `faq_load` is in no list:** the per-tab gate in `middleware/auth.ts` applies to *every* non-superadmin caller, members included (a member has no `allowed_admins` row, so `allowedTabs` is `[]`), so putting the read under `faq_editor` would 403 exactly the members it serves; and `MEMBER_SCOPED_ACTIONS` only rewrites `body.member_number`, which the handler never reads, so listing it there would guard nothing (#455). The confinement is in-handler (`active` filter + column whitelist for non-admins). Both `role-gates.ts` sites carry a comment saying so. Clients / specialists / planners cannot reach it — their allowlists fence first.

**Why the document is served by a signed url, not a public bucket:** the bucket is private and the member body names nothing — `faq_load` derives every url from the row's own `document_path` (#310), and the only writer of that path is the admin-gated minter above. A public bucket would have been simpler; it was not chosen because help PDFs may carry internal process detail.

**Wistia link handling** ([actions/faq/wistia.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/actions/faq/wistia.ts)): `resolveWistiaUrl` accepts any `*.wistia.com` / `*.wistia.net` link. Shapes that carry the 10-character media id are parsed inline; anything else — in practice the `/s/<token>` share link, whose token is *not* the media id — is resolved through Wistia's public oEmbed endpoint (`https://fast.wistia.com/oembed.json?url=…`, 6 s timeout, no key) and the id is read out of the returned `<iframe src>`. Every shape is stored as `https://fast.wistia.net/embed/iframe/<id>`, matching `program_training_tasks.video_url`. A non-Wistia host, or a share token Wistia does not recognise, is a **400**. Loom / YouTube are deliberately not accepted (Jake: Wistia only).

Refusals (all 400 unless noted; the FE mirrors the first three so they are UI-unreachable): blank question · none of answer / video / document · unresolvable video link · a `document_path` outside the minted shape or missing from the bucket · unknown `category_id` (**404**) · unknown `mode` · `delete` with no id · `delete` / update of an unknown id (**404**) · `reorder` / `category_reorder` with an empty or duplicate `ids` list · blank or duplicate category name · `filename` not `.pdf` on the upload-url minter. [scripts/probe-faq-refusals.ps1](../../../vfo-edge-functions/scripts/probe-faq-refusals.ps1) exercises all of them (the 2026-09-15 category / document / upload-url refusals included, plus a category round trip proving a deleted category leaves its FAQ uncategorised) plus the member 403s and the member column/active filter; run it after any change to the handler.

## Data

`faq_items` + `faq_categories` — [tables/faq.md](../tables/faq.md). RLS deny-all on both; DB CHECKs mirror the product rules (non-blank question; answer or video or document; non-blank category name). Bucket `faq-documents` (private, 20 MB) holds the PDFs.

## Not in this flow (decisions)

- No per-member state (nothing records who read what). No analytics.
- No backend search — the list is dozens of rows and loads once; the filter is client-side by design.
- Categories are one level deep (no sub-categories); reorder within a category is the item order.
- PDF only for documents — a Word/Excel file would need a different viewer.
- The button is members-only; other portals would need their own mount condition in `MemberHelpMount`.
