# Events (the Elite VFO Collective)

Tickets and registration for an event, built for the Elite VFO Collective 2027 (2026-11-25). Three screens: the member portal's **Events** tab, the public **`/events`** page and the admin **More ▾ → Events**. Tables: [../tables/events.md](../tables/events.md).

**The switch.** `portal_feature_flags.events` (More ▾ → Feature Switches → *Events*, Off / On only). Off = no member tab, the public page is a plain *"There are no events open right now"* (the Black Friday page's no-sale look; nothing names the event, the tab title included), and every buy / register / search action refuses. More ▾ → Events works either way, and a buyer back from paying still gets the thank-you.

## Who pays

| Who | What |
|---|---|
| Tier 3 member (`memberTierOf` = 3: every Fusion type, Accelerator, Plus, Advanced) | Registers free in the portal, with their corporate members and up to `events.free_guests` (4) free guests. A guest past those is a normal ticket; the server refuses a paid ticket while a free place is left |
| A corporate member of a Tier 3 lead | Free. They have no portal, so the lead ticks them |
| Everyone else (Tier 1 and 2 members, other corporate members, the public) | Buys a ticket |

**The price** is the one `event_tickets` row whose window holds now (`openTicket`); the others are greyed (*Opens …* / *Ended …*). Nothing the browser sends decides a price. A checkout is open for **one hour** (`expires_at`), so nobody holds a price past its window. Dates, place, wording, prices and windows are rows, so a change needs no release. Windows are Pacific midnight; `closes_at` is exclusive.

## Buying

1. **Who they are.** Portal: the member's own record, only the phone is typed (the portal holds no member phone; it is remembered from their last order). Public: first name, last name, email, phone, all required, for the buyer and every guest, plus *Are you an ERT member?* (yes / a member invited me / no) with the member-name type-ahead of the Tax Diagnostic (`utils/public-member-search.ts`, shared, one rate budget). A member's own name may be left out; the inviter's may not.
2. **`/event-pay`** (bank or card, a copy of `/growth-credits-pay`) reads the order from sessionStorage `eventOrder` → `events_create_checkout` (member) or `events_public_checkout` (public, 10 an hour per IP, #531).
3. **`startEventCheckout`** (`utils/events.ts`) writes the `event_orders` row and one `event_attendees` row per ticket, then opens the Checkout Session on the `EVENTS` pipeline's account (**ERT**). The card price is grossed up (`gcCharge`). The session and its PaymentIntent carry `metadata.pipeline = EVENTS` and `event_order_id`.
4. **The webhook** (`utils/events-webhook.ts`, called before the Growth Credits branch in `router/webhooks.ts`) stops an EVENTS session or PaymentIntent there. It acts only when the order carries THIS session id and the event's mode matches the order's (`sandbox`). Card: `paid` at once. Bank: `clearing`, then `paid` at `async_payment_succeeded`, or `failed` (a failure bell to Jake). Every step is safe to repeat (#327): statuses only move forward and each email is claimed first. `paid` answers Stripe, then chains `automation_EVENT_invoicereceipt` in the background (#788).
5. **The emails** (pipeline `EVENTS`, Send mode, Bcc the address on each template row, no bells):

| Template | When |
|---|---|
| `EVENT_ticket_invoicereceipt` | Card at once, bank when it clears: the confirmation with **`INV-VFOC-<order>-NNNN`** / **`REC-VFOC-<order>-NNNN`** (`utils/events-html.ts`), latch `docs_emailed_at`. A portal order's pair is also filed in the member's ERT/VFOS Documentation vault |
| `EVENT_ticket_ach_confirmation` | Bank payment on its way, latch `confirmation_sent_at` |
| `EVENT_registration_confirmation` | A free registration saved or changed. `[ALSO_ATTENDING]` lists the people the member bought tickets for, or nothing |
| `EVENT_refund_confirmation` | A refund, latch `event_refunds.email_sent_at` |

`MEMBER` is filled only on a member's own portal order, so their additional contacts are Cc'd on theirs and never on a public buyer's.

## Registering free

`events_register` keeps ONE `event_orders` row per event and member (`kind='complimentary'`, unique index) and re-writes its people: rows are updated, added or cancelled, never duplicated. Nobody already checked in can be taken off. Nobody left = `cancelled`.

**A member who leaves Tier 3** keeps their free places and can no longer edit them; Attendees flags them *No longer comes free* (Jake, 2026-11-25).

## More ▾ → Events (admin, every admin)

`events_admin_load`, works whatever the switch says; the heading carries the public page's link.

- **Attendees:** one row per PERSON coming, in parties (`eventRows.js partiesOf`): a member, or a buyer who is nobody's guest, then everyone they bring across all their purchases. Someone who bought for guests but is not coming is a grey heading, not counted. **Export** is the same people, one row each, refunded and cancelled by filter.
- **Purchases:** one row per payment: the money, who a public buyer is, and Refund in its own column.
  - **Allocating** (`events_allocate_order`): *Is a member* / *Is a member's guest* / *Not connected*, opened on what the buyer said and the name matches (`utils/name-match.ts`). No money or credits move, so it can be answered again. A buyer who should have come free (Tier 3, their corporate member, or a Tier 3 member's guest) is flagged *may be owed a refund*.
  - **Refund** (`events_refund_order`): pick whose tickets. The ticket price only, never the card fee. The tickets are claimed before Stripe is called; a refusal gives them back; a lost answer leaves the refund `pending` with *Check again*, which looks on the payment first (metadata `event_refund_id`) and only then asks again under the same idempotency key. A refund made in the Stripe dashboard follows through `charge.refunded` (the order's total; a full one cancels everyone), and `refund.failed` gives the tickets back.
- **Check-in:** one row per person, Check in / Undo (`events_check_in`).
- **Member preview:** the member screen on made-up details, paying or free. Nothing can be saved or bought.

Event tickets and their refunds also show in Accounting → Payments (`all_payments_load`, category *Event tickets*, person type *Event buyer* for a non-member).

## Auth

`events_public_load`, `events_member_search`, `events_public_checkout` and `automation_EVENT_invoicereceipt` (service role or an admin session) are PUBLIC. `events_member_load`, `events_create_checkout`, `events_register` are `MEMBER_SCOPED_ACTIONS` (they read and write by `member_number` alone) and NOT in `MEMBER_TIER2_ACTIONS`: Tier 1 members see Events. `events_admin_load`, `events_allocate_order`, `events_check_in`, `events_refund_order` are `ADMIN_ONLY_ACTIONS` with no tab key, so that list is their whole gate.

## Code

Edge: `utils/events.ts`, `events-emails.ts`, `events-html.ts`, `events-webhook.ts`, `public-member-search.ts`; `actions/events/*`. Website: `components/events/*`, `member/MemberEvents.jsx`, `pages/EventsPage.jsx`, `pages/EventPayPage.jsx`, `admin/EventsAdminPage.jsx` + `EventAttendeesTable` / `EventPurchasesTable` / `EventConnectionCell` / `EventRefundDialog` / `EventCheckIn` / `EventTiles` / `eventRows.js`, `lib/events.js`. The shimmering tab label is `components/events/EventsNavLabel.jsx` (still for reduced motion); a collapsed nav bar keeps it beside Menu (`CollapsibleNavBar collapsedExtra`).

**Not exercised:** Issue JLathamERT/vfo-edge-functions#648.
