# Coaching meetings + renewals flow

Two parallel logs attached to a coaching enrollment: meeting events and renewal/cancellation actions. Self-contained — no integrations, no chains.

**Standard Coaching (program id=5, added 2026-07-20)** reuses this exact flow but with **no renewals** — its enrolled view shows Home + Meetings only (no Renewal tab), so only the meeting handlers (`coaching_load_meetings` / `_log_meeting` / `_update_meeting` / `_delete_meeting`) apply; `coaching_load_renewals` / `_process_renewal` are Advanced-Coaching-only. Both programs share the same `coaching_meetings` table keyed on `enrollment_id`. See gotcha #246.

## Trigger

Member or admin opens a member's "Advanced Coaching" tab. The tab is part of MemberPortal's dynamic tab list (gated by `member_program_enabled` for the Advanced Coaching program) and accessible via [MemberMSMTracking.jsx](src/components/member/MemberMSMTracking.jsx).

## Meetings

### Load meetings

**Handler:** `coaching_load_meetings({enrollment_id})` ([MemberMSMTracking.jsx:1289](src/components/member/MemberMSMTracking.jsx) → [admin-api:3417-3424](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)). Reads `coaching_meetings` filtered by `enrollment_id`.

### Log a new meeting

**Handler:** `coaching_log_meeting({enrollment_id, member_number, meeting_number, meeting_date, status, notes})` ([admin-api:3426-3435](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)). INSERTs `coaching_meetings`. Status defaults to `'scheduled'`.

### Update a meeting

**Handler:** `coaching_update_meeting({meeting_id, status, notes, meeting_date})` ([admin-api:3437-3448](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)). UPDATEs the row.

### Delete a meeting

**Handler:** `coaching_delete_meeting({meeting_id})` ([admin-api:3450-3457](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)). DELETEs.

## Renewals

### Load renewals

**Handler:** `coaching_load_renewals({enrollment_id})` ([MemberMSMTracking.jsx:1387](src/components/member/MemberMSMTracking.jsx) → [admin-api:3459-3466](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)). Reads `coaching_renewals` filtered by `enrollment_id`.

### Process a renewal

**Handler:** `coaching_process_renewal({enrollment_id, member_number, action, action_date, next_renewal_date, period_label, notes, created_by})` ([admin-api:3468-3475](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)). INSERTs `coaching_renewals`.

`action` is application-defined (e.g., `'renew'`, `'cancel'`, `'pause'` — exact values not constrained at DB level).

## Tables touched

- **Read:** `coaching_meetings`, `coaching_renewals`.
- **Written:** `coaching_meetings` (insert/update/delete), `coaching_renewals` (insert).

## Downstream chains

**None.** Append-only logs.

## Auth

`coaching_*` mutations are in `ADMIN_ONLY_ACTIONS` ([admin-api:2241-2243](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)). Member callers can only read meetings and renewals.

## Failure modes

1. **No idempotency** — `coaching_log_meeting` and `coaching_process_renewal` are pure inserts. Duplicate clicks would duplicate rows. UI guard required.
2. **`meeting_number`** — sequential numbering is application-managed. No DB constraint. Gaps and duplicates possible.

## Open questions

1. **Auto-renewal** — does anything periodically check `coaching_renewals.next_renewal_date` and trigger a reminder? No observed code does this.
2. **Coaching meeting → MAP1 pipeline link** — is a coaching enrollment ever associated with a MAP1 pipeline row? Schema-wise they're independent (coaching joins to `member_enrollments`, MAP1 joins to `clients`). No code path links them.

## Cross-references

- Coaching tables: [../tables/coaching.md](../tables/coaching.md)
- Action catalog: [../architecture/05-api-action-catalog.md](../architecture/05-api-action-catalog.md)
