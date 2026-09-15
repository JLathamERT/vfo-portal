# Help / FAQ tables

Two tables behind the member portal's Help button and the admin FAQ Editor tab. Flow → [flows/member-help-faq.md](../flows/member-help-faq.md). Migrations `20260914200000_faq_items.sql` (the item table) and `20260915150000_faq_categories_documents.sql` (categories, the document columns, the bucket).

## `faq_items`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity | pk |
| `question` | text | not null; CHECK `faq_items_question_not_blank` (`length(trim(question)) > 0`). The only mandatory content field. |
| `answer` | text | nullable. Plain text; the member panel renders it `pre-wrap`, so blank lines are paragraphs. |
| `video_url` | text | nullable. **Always the normalised Wistia iframe form** `https://fast.wistia.net/embed/iframe/<10-char id>` — `faq_manage` resolves whatever the admin pasted (media page, iframe, `?wvideo=`, or a `/s/<share-token>` link via Wistia oEmbed) before writing. Same shape as `program_training_tasks.video_url`. |
| `document_path` | text | **2026-09-15.** nullable. Object path in the private Storage bucket `faq-documents`, always `<16-hex>_<sanitised name>.pdf` — minted by `faq_document_upload_url`, and `faq_manage` refuses any other shape or a path with no object behind it. Never sent to members: `faq_load` swaps it for a 1-hour signed `document_url`. Replacing or removing it (or deleting the row) deletes the old object. |
| `document_name` | text | **2026-09-15.** nullable, ≤ 200 chars. The admin's original filename, for display. |
| `category_id` | bigint | **2026-09-15.** nullable, fk → `faq_categories.id` **ON DELETE SET NULL** — deleting a category never deletes a FAQ. NULL = uncategorised (renders under *Other questions*, last). |
| `sort_order` | integer | not null, default 0. Member display order (`order by sort_order, id`), applied within each category group. New rows get max+1; `mode:"reorder"` rewrites it as the index in the submitted `ids[]`. |
| `active` | boolean | not null, default true. `false` = hidden from members (admins still see it, dimmed). Status field. |
| `created_by` / `updated_by` | text | Session email of the admin who inserted / last saved the row (`reorder` also stamps `updated_by`). No FK. |
| `created_at` / `updated_at` | timestamptz | default `now()`; `updated_at` is rewritten by the handler on every save / reorder (no trigger). |

CHECK `faq_items_answer_video_or_document` — `answer is not null or video_url is not null or document_path is not null` (replaced `faq_items_answer_or_video` on 2026-09-15): the DB half of "at least one of answer / video / document"; `faq_manage` returns the 400 first, this is the backstop.

Indexes `faq_items_active_sort_idx (active, sort_order, id)` — the member query; `faq_items_category_idx (category_id)`.

**RLS:** enabled, `"Deny all access" for all to public using (false)` in the same migration (security invariant 1). Anon probe `Content-Range: */0` verified 2026-09-14; advisor GREEN at baseline with the table absent from the list.

## `faq_categories`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity | pk |
| `name` | text | not null; CHECK `faq_categories_name_not_blank`; unique index `faq_categories_name_lower_idx` on `lower(trim(name))` (the handler returns the 400 first). ≤ 80 chars by handler rule. |
| `sort_order` | integer | not null, default 0. Heading order in the member panel and the editor's dropdown; `mode:"category_reorder"` rewrites it. New rows get max+1. |
| `created_by` | text | Session email. No `updated_*` — a rename is not audited. |
| `created_at` | timestamptz | default `now()`. |

**RLS:** enabled, deny-all in the same migration. Anon probe `Content-Range: */0` verified 2026-09-15; advisor GREEN at the exact baseline with the table absent from the list (the STRONG check — a new table).

## Bucket `faq-documents`

Private, `file_size_limit` 20 MB, created in the same migration. Written only through `faq_document_upload_url`'s signed upload urls; read only through `faq_load`'s signed read urls. No public URL exists for any object in it.

**Touched by:** `faq_load` (read — members `active=true` + column whitelist, admins `*`; both tables + the bucket), `faq_manage` (all writes to both tables; object deletes), `faq_document_upload_url` (object writes). Nothing else reads or writes them; no sweep, no bell, no email. Hard delete is allowed on both tables — nothing else points at them.
