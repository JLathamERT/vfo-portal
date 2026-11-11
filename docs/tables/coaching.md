# Coaching tables

Coaching is a per-enrollment program where the member receives ongoing meetings with a coach. Renewals are logged as discrete events.

## `coaching_meetings`

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `enrollment_id` | integer | fk → `member_enrollments.id` (CASCADE) |
| `member_number` | text | fk → `members.member_number` (CASCADE) |
| `meeting_number` | integer | Ordinal number within the enrollment. |
| `meeting_date` | date | not null |
| `status` | text | default `'scheduled'`. Status field. |
| `notes` | text | |
| `created_at` | timestamptz | default `now()` |

**Touched by:** `coaching_load_meetings`, `coaching_log_meeting`, `coaching_update_meeting`, `coaching_delete_meeting`. Frontend: [MemberMSMTracking.jsx:1308](src/components/member/MemberMSMTracking.jsx).

---

## `coaching_renewals`

Renewal/cancellation events on a coaching enrollment.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `enrollment_id` | integer | fk → `member_enrollments.id` (CASCADE) |
| `member_number` | text | fk → `members.member_number` (CASCADE) |
| `action` | text | not null. Action taken (e.g., `'renew'`, `'cancel'`). |
| `action_date` | date | not null |
| `next_renewal_date` | date | |
| `period_label` | text | |
| `notes` | text | |
| `created_by` | text | |
| `created_at` | timestamptz | default `now()` |

**Touched by:** `coaching_load_renewals`, `coaching_process_renewal`. Frontend: [MemberMSMTracking.jsx:1406](src/components/member/MemberMSMTracking.jsx).
