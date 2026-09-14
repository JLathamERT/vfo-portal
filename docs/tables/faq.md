# Help / FAQ table

One table behind the member portal's Help button and the admin FAQ Editor tab. Flow → [flows/member-help-faq.md](../flows/member-help-faq.md). Migration `20260914200000_faq_items.sql`.

## `faq_items`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity | pk |
| `question` | text | not null; CHECK `faq_items_question_not_blank` (`length(trim(question)) > 0`). The only mandatory content field. |
| `answer` | text | nullable. Plain text; the member panel renders it `pre-wrap`, so blank lines are paragraphs. |
| `video_url` | text | nullable. **Always the normalised Wistia iframe form** `https://fast.wistia.net/embed/iframe/<10-char id>` — `faq_manage` resolves whatever the admin pasted (media page, iframe, `?wvideo=`, or a `/s/<share-token>` link via Wistia oEmbed) before writing. Same shape as `program_training_tasks.video_url`. |
| `sort_order` | integer | not null, default 0. Member display order (`order by sort_order, id`). New rows get max+1; `mode:"reorder"` rewrites it as the index in the submitted `ids[]`. |
| `active` | boolean | not null, default true. `false` = hidden from members (admins still see it, dimmed). Status field. |
| `created_by` / `updated_by` | text | Session email of the admin who inserted / last saved the row (`reorder` also stamps `updated_by`). No FK. |
| `created_at` / `updated_at` | timestamptz | default `now()`; `updated_at` is rewritten by the handler on every save / reorder (no trigger). |

CHECK `faq_items_answer_or_video` — `answer is not null or video_url is not null`: the DB half of "at least one of answer / video"; `faq_manage` returns the 400 first, this is the backstop.

Index `faq_items_active_sort_idx (active, sort_order, id)` — the member query.

**RLS:** enabled, `"Deny all access" for all to public using (false)` in the same migration (security invariant 1). Anon probe `Content-Range: */0` verified 2026-09-14; advisor GREEN at baseline with the table absent from the list.

**Touched by:** `faq_load` (read — members `active=true` + column whitelist, admins `*`), `faq_manage` (all writes). Nothing else reads or writes it; no sweep, no bell, no email. Hard delete is allowed and unreferenced — no other table points at it.
