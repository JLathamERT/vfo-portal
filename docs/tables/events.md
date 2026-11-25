# Events tables *(NEW 2026-11-25)*

Migration `20261125210000_events.sql`. All five are RLS on + deny-all (anon probe `*/0` on the test site, 2026-11-25). Flow: [../flows/events.md](../flows/events.md).

## `events`

One row per event. `key` (unique), `name`, `starts_on`, `ends_on` (CHECK not before the start), `location`, `date_note` (*"Dates and location to be confirmed"*), `description`, `free_guests` (default 4), `active`. The current event is the first active one that is not over, Pacific date (`loadActiveEvent`). Seeded: `vfo_collective_2027`.

## `event_tickets`

The price phases. `event_id`, `key` (unique per event: `early_bird`, `regular`, `late`), `name`, `price`, `opens_at` (NULL = open from the start), `closes_at` (exclusive), `sort_order`. Seeded Pacific: $395 to 12/31/2026, $549 to 04/30/2027, $699 to 06/21/2027.

## `event_orders`

| Column | Notes |
|---|---|
| `kind` | `paid` \| `complimentary` (one per event and member, partial unique index) |
| `source` | `portal` \| `public` |
| `ticket_id`, `ticket_name`, `unit_price`, `quantity` | what was bought, as sold |
| `member_number`, `link_type` | `member` (the buyer IS that member) \| `guest_of` \| `none` \| NULL (a public order not answered yet). CHECK: a link other than `none` needs a member. No foreign key |
| `claimed_link`, `claimed_member_name` | what a public buyer said: `member` \| `invited` \| `none`, and the name they picked |
| `buyer_first_name` / `_last_name` / `_email` / `_phone` | |
| `price`, `card_fee`, `amount_total`, `payment_method` | tickets, the card gross-up, what Stripe charged, `card` \| `ach` |
| `stripe_session_id` (unique), `stripe_payment_intent_id`, `stripe_account`, `sandbox` | |
| `status` | `checkout` \| `clearing` \| `paid` \| `failed` \| `expired` \| `refunded` (every ticket); complimentary: `registered` \| `cancelled` (CHECK) |
| `paid_at`, `allocated_at`, `allocated_by` | `allocated_by` is a NAME |
| `invoice_number`, `receipt_number`, `docs_emailed_at`, `confirmation_sent_at` | the documents and the two latches |
| `refunded_amount` | follows Stripe's total |

## `event_attendees`

One row per PERSON (a paid order has exactly one per ticket). `order_id` (cascade), `kind` `buyer` \| `guest` \| `corporate`, `member_number` (the buyer who is a member, a corporate member), `first_name`, `last_name`, `email`, `phone`, `refund_id` (→ `event_refunds`, set null), `cancelled_at` (no longer coming), `checked_in_at`, `checked_in_by` (a NAME).

## `event_refunds`

One row per Refund click. `order_id` (cascade), `amount`, `stripe_refund_id` (unique), `status` `pending` (claimed, Stripe not answered) \| `succeeded` \| `failed`, `error`, `refunded_by` (a NAME), `email_sent_at`.

Also: `document_numbers.event_order_id` ([documents.md](documents.md)), `pipeline_sandbox_config` row `EVENTS` (`stripe_account='ert'`), switch `events`, four `email_templates` rows (pipeline `EVENTS`, `20261125211000_event_email_templates.sql`).
