# VFO Portal Licensing — the whole-system plan

Written 2026-09-28 (Jake, in the Feature Switches chat). **This file is the plan of record for the portal licensing system as a whole.** The FIRST unit, the tax licence, is also DIRECT to Tax Planning unit 4 and its detailed pre-work lives in [../direct-tax-planning/README.md](../direct-tax-planning/README.md) §9; everything after it is planned here. The hub carries only live state.

**Sources.** Paul's licensing spreadsheet, cell dump: [../direct-tax-planning/licensing-structure-sheet-dump.txt](../direct-tax-planning/licensing-structure-sheet-dump.txt) (tabs: Portal License, VFO ASSOCIATE, FINANCIAL COLLABORATOR, CATALYST V FUSION, ACCREDITED). Paul's deck "PL - Q4 Update: VFO Portal" (Jake's Downloads, not in the repo), slides 41-82: the Q4 theme is **members driving the portal with their clients**, aimed "largely in place by mid-October 2026", and "all 5 areas will involve some form of Member / Client licence". Where this file and those sources disagree, ask Jake — the sources are drafts, this file records his decisions.

---

## 1. The switch rule — non-negotiable

**Every unit in this plan ships DARK behind its own Feature Switch, and Jake turns it on when he chooses.** (Jake, 2026-09-28: "I want all these features to have the on/off switches so I can switch them on when I want.")

- **One switch per UNIT**, not per feature (Jake's choice): a unit's features turn on together, so there are no half-on states to test.
- A switch is a `portal_feature_flags` row read through `utils/feature-flags.ts featureEnabledForMember` (fail-closed: a missing row or failed read = OFF). It is seeded **Test member only** (`enabled_for_all=false`, `member_numbers='{59524}'`) in the unit's migration, so the build can be tested on the real portal while nobody else sees it.
- Add the key to `FEATURE_SWITCHES` in `utils/feature-flags.ts` (or `feature_switches_save` refuses it) and give it a card in `src/components/admin/FeatureSwitchesPanel.jsx` (`SWITCH_COPY`) saying **what switching it on adds** and **what stays while it is off** — in plain words Jake reads before flipping. Change the card in the same commit as the feature.
- **Off must mean exactly today's behaviour**: every new code path is gated, every old path is kept, and anything the Off side reads (files, rows, templates) must exist BEFORE the deploy (#555).
- A switch is keyed on the member the feature belongs to (the client's member, the paying member); a public page with no member gets an Off / On switch only.
- The tab lives at More ▾ → Feature Switches (superadmin only; `feature_switches_load` / `feature_switches_save`). Built 2026-09-28, v914 / `live-213-feature-switches`.

---

## 2. Concepts every unit shares

### 2.1 Client portal tiers
| Tier | What the client sees | Today |
|---|---|---|
| **Basic** | VFO Showroom only (+ the "request an introduction" button, unit L2) | **Built in L2 (2026-10-09), behind `client_basic_portal`:** no active Standard licence = Showroom (+ Settings) only, the Vault actions 403. Switch off = the old portal (Showroom + Vault + Settings for every client, no tiers) |
| **Standard** | Showroom + Client Vault + case progress **in summary** (the One Page Plan from CIQ, priorities' progress, tax/holistic case stages, history of completed items) | No case view exists in the client portal yet |

What case progress looks like, and when it is built, is an open question (L1 question 5); until it exists "Standard" = Showroom + Vault.

### 2.2 Licence prices (Paul's deck, slides 43-48)
- **$0** — the feature is included as standard. Still recorded as a licence with amount `0`: "building $0 in now allows us to amend the charge in future".
- **$25 / month** — can be switched on and off like a subscription; charged only for the months it is on.
- **$300 / year** — lasts exactly 12 months, to the anniversary of the payment date; can be renewed.
- Unless the member chooses to pass it on, **the client never sees the cost** — they just see their member providing a better service.
- **The member is only ever charged for ONE licence per client at a time, and never more than $25/month or $300/year** — the portal applies the priority rules below.

### 2.3 Priority and extension rules
- **Whichever licence comes first has priority.** A $25/month licence is month to month and is **superseded by a later annual ($300) licence**.
- A $300 licence (Tax or Holistic) lasts 12 months from its payment. **When a second annual purchase lands while one is running, the licence is EXTENDED to the new purchase's own 12-month end, and only the extra days are charged**: Paul's example — Tax paid October 2026 (licence to October 2027), Holistic paid January 2027 → extend to January 2028, disbursement `$300 × extra days / 365`, rounded to the dollar (≈ $75, "a precise calculation based on days"). Proposed formula: `new_end = max(current_end, purchase_date + 12 months)`; `extra_days = new_end − current_end`; `amount = round(300 × extra_days / days in the 12 months starting at purchase_date)`.
- No refund of earlier $25/month CIQ months when an annual licence starts (it starts at purchase).
- What happens when an annual licence ENDS is open (L1 question 6; sheet: "after that point the member/client can use the Standard Portal and the CIQ licences (where applied) will cease" — ambiguous).

### 2.4 One licence record
**One table, one row per licence period, per client** (`client_portal_licenses`, built in L1): the client, the paying member, the SOURCE (`tax`, later `holistic`, `ciq`), the tier, the amount disbursed or charged, start and end dates, the plan/payment it came from, and a revoked stamp + reason. RLS deny-all + an anon probe + the advisor STRONG check in the same migration (SECURITY INVARIANTS). Every later unit ADDS a source to this record; none rebuilds it. **There are NO manual (by-hand) grant / extend / revoke controls** — licences are created, extended and revoked automatically only (decision 6).

### 2.5 Disbursement = money taken before the revenue share
An annual licence is a **disbursement**: the $300 comes off the fee before it is split, so every party bears its share of it in the revenue-share ratio (tax classic 1/3 each; tax Direct 45/45/10; Holistic via VFOS 50/50; Holistic member-direct 100% member). It stays in the VFO Services balance — no transfer (the sheet says "paid to VFO Portal bank account" — a future account change, open question). It is shown on the revenue-share confirmation emails and every split surface (#465 / #468b: enumerate the payees from the payout engine, not the columns).

---

## 3. The units, in order (client-first — Jake, 2026-09-28)

| # | Unit | Price | Switch (proposed key) | Status |
|---|---|---|---|---|
| **L1** | **Tax licence** (= DIRECT unit 4) | $300/yr disbursement | `portal_licensing` (EXISTS — it also carries the new tax agreement) | **SHIPPED 2026-09-28** (backend v921, dark behind the switch, Test member only; flow [flows/tax-planning.md](../../flows/tax-planning.md#client-portal-licence-direct-unit-4--portal-licensing-l1-2026-09-28)); still owed: the $300 TRANSFER to a VFO Portal Stripe account (display only today) |
| L2 | Basic client portal: member sends the portal link + Showroom introduction button | $0 | `client_basic_portal` | **SHIPPED 2026-10-09** (backend v953 → v955, dark behind the switch, Test member only; decisions 7-16; flow [flows/client-portal.md](../../flows/client-portal.md)) |
| L3 | Holistic licence | $300/yr disbursement | `holistic_licence` | planned — ON HOLD behind L5 (decision 17); open question whether VFOS-led Holistic carries the licence at all (decision 18) |
| L4 | CIQ licence (Basic vs Standard for a CIQ client; member self-drive) | $0 or $25/month | `ciq_licence` | planned |
| **L5** | **Mirrored joint clients** (connected advisor ↔ accountant, and one-off cases) | $0 (Q4 deck) | `mirrored_clients` | **NEXT** (Jake, 2026-10-09 — decision 17) |
| L6 | VFO Associate + Financial Collaborator portals | $0 / $25/month + their existing fees via the portal | `associate_fc_portal` | planned — Jake: NOT being worked on yet |
| L7 | Portal suspension rules by member tier | — | `portal_suspension` | planned |
| — | Catalyst v Fusion structure, member-direct Holistic / PFT ("DIY"), Accredited benefits | — | — | LATER — Jake: not being worked on yet |

Every unit is its own shipping unit (own branch, own chat or chats, own wrap-up), built dark behind its switch. The order is the build order, not a release order — Jake can flip switches in any order he likes, except where a unit depends on another (L4 depends on L1's record; L2's case view depends on the Standard tier). **Build order since 2026-10-09 (decision 17): L5 next, then L3 / L4 / L6 / L7 as Jake chooses.**

**Second source (2026-10-09): Paul's TEAM deck "Q4 Update: VFO Portal"** (40 slides, Jake's Downloads, not in the repo — read as extracted text + slide images). It confirms §2 (prices, priority, the FIFO $75 example), L1 (the $300 comes out of the revenue share: $100 member on 33/33/33, $135 member on 45/45/10 Direct; 12 months + a 15% discount on future tax planning fees; Direct needs 2+ completed VFOS-led tax cases with paid fees), L2 (Basic portal + introductions + the training / customer-experience video), L4 (CIQ Option 1 = Basic, "replicates the old PPP"; Option 2 = $25/month Standard: Vault, CIQ, One Page Plan, case history) and L7 (unchanged). What it ADDS is folded into L3, L5 and L6 below, marked "(Q4 deck)".

---

### L1 — Tax licence (DIRECT unit 4)

**Details: [../direct-tax-planning/README.md](../direct-tax-planning/README.md) §9** (the code audit and the nine open questions). In one paragraph: every tax client whose retainer is paid **after `portal_licensing` is switched on** (decision 55) gets a 12-month Standard client portal licence; $300 comes off the retainer before the split (1/3 each classic, 45/45/10 Direct — Paul's slide 60) and stays in the VFO Services balance; a client login is created automatically on payment and the login + free-membership paragraph goes in the retainer invoice/receipt email (card, ACH, check); the client sees the expiry date when they log in; a tax refund revokes it; CIQ is allowed on that client; the planner-review and additional-info reminder chases are built. Builds the shared licence record (§2.4) and the extension rule (§2.3) so L3 and L4 plug in. Paul's deck: "Tax Planning will be the first licence introduced in Q4 — if the client does tax planning, all the features on the portal will be free of any further licence charge for 12 months (encourage members to do tax planning)."

### L2 — Basic client portal: the member sends the link, the client asks for introductions

**What (sheet "Portal License" rows 8-17; deck slides 49-52):**
- Members load their target clients into the portal (they already can). **Adding a client does NOT create a licence.**
- **A "Send portal access" button on the member's client** — the member decides exactly when; it creates the client's login and emails the link with a training + "customer experience" video (URL not yet available). The client gets the **Basic** portal: VFO Showroom.
- **A "Request an introduction" button on each specialist in the client's Showroom** — the request is emailed to the **member**, whose job it is to make the introduction; **Tracy Miller gets a notification** (bell, or Bcc — open).
- Licence: **$0** (recorded, so a price can be added later).

**Builds on:** L1's automatic client login (the same login creation, triggered by the member instead of a payment). **The four open questions are ANSWERED (decisions 7-12, 2026-10-09).**

#### L2 build plan (written 2026-10-09, read-only, before any code — branch `claude/vfo-session-setup-0fbec1`, both repos)

> **AS BUILT (2026-10-09) — the flow of record is [../../flows/client-portal.md](../../flows/client-portal.md).** Where the plan below differs, the flow wins: the member's button is ONE click with no confirm and no success message, at the bottom of the Profile tab in a CLIENT PORTAL card (decision 13); a never-set-up existing login gets a fresh set-up link on resend (#597); the Vault tab is OFF until the live load allows it (decision 16, #596); the intro button is white / VFO-blue under the pop-up header and the requested state is the same button, inert (decision 13); the intro email names the specialism, not a company, and puts the client's email inline (decisions 14-15).

Switch `client_basic_portal`, keyed on the CLIENT's member, seeded Test member only. Off = exactly today. Every member type gets the button (decision 8) — the switch is the only rollout control.

1. **Migration (one file, committed):** the `portal_feature_flags` row (`{59524}`); `client_portal_licenses.source` CHECK gains `'basic'` + a unique partial index `(client_id) where source='basic'` (one Basic row per client: `tier='basic'`, `amount 0`, `starts_on` = the send day, `ends_on` NULL — the existing `ends_on > starts_on` CHECK passes on NULL); **NEW table `client_intro_requests`** (client, member, expert, requested_at) deny-all in the same migration + anon probe + STRONG advisor; templates `CLIENT_portal_access` + `CLIENT_intro_request`, both **Draft** (decision 10); rule `CLIENT_intro_requested` (Tracy `tnmiller@elitert.com`, FYI, dismissible).
2. **Send portal access:** action `member_client_portal_access_send {client_id}` — `denyIfNotOwnClient` first, member or admin caller, switch on for the client's member; reuses `ensureClientPortalLogin` (`utils/client-portal-login.ts`; `existing` → the "sign in" line, never a new token); writes the Basic row once; emails the CLIENT only (credential email: `skipMemberContacts`, no Cc/Bcc); `no_email` / `conflict` come back to the member as a message, not a Jake bell. `msm_load_client_home` gains a `portal_access` key ONLY while the switch is on (off = byte-identical). FE: member view of `ClientDetail.jsx` — button + confirm, then "Portal access sent MM/DD/YYYY" + Resend; while the template is Draft the screen says it is queued for the VFO team. No revoke (decision 9).
3. **The Basic gate:** one helper `clientPortalTier` — `standard` = an unrevoked TAX licence live today, else `basic`. **Applied whenever `client_basic_portal` is on for the member** (decision 11, revised). `client_showroom_load` gains `tier`; the five `client_vault_*` actions 403 a Basic client (the hidden tab is cosmetic, the handler is the guard); `ClientPortal.jsx` hides the Vault tab. `clientLicenceStatus` must IGNORE `source='basic'` rows (its maths assumes a non-null `ends_on` — a Basic row would otherwise read "has ended" on Home).
4. **Request an introduction:** client action `client_request_introduction {expert_id}` in `CLIENT_ALLOWED_ACTIONS`; member from the session's client row, never the body; expert must be Active; one request per client + specialist (409; the card then reads "Requested MM/DD/YYYY", carried in `client_showroom_load`); email to the MEMBER, Tracy Bcc `tnmiller@vfo-services.com`, + the Tracy bell (decision 7). Button in `ShowroomModal` behind a prop only `ClientPortal.jsx` passes — member/admin Showrooms unchanged.
5. **Switch card** in `FeatureSwitchesPanel.jsx` `SWITCH_COPY` (same commit as the feature), docs, hub + CHANGELOG at ship.

Gates: `deno check` 0 · action count 567 → 569 · build exit 0 · advisor STRONG + anon `*/0` · smoke 5/5 (`role-gates.ts` changes) · Jake's click-through after phases 2, 3, 4. Deploy `--use-docker` (#574) only on Jake's "deploy".

**Approved copy (decision 12):**
- `CLIENT_portal_access` (To the client): *Subject:* "[Member Name] has set up your VFO client portal". *Body:* "Hi [Client First], [Member Name] has given you access to the VFO client portal. In it you can browse the VFO Showroom — the specialists [Member First] works with — and ask [Member First] for an introduction to any of them with one click. [LOGIN_BLOCK] If you have any questions, just reply to this email or contact [Member First] directly." The training / customer-experience video line is added in the Email Editor when the URL exists (no code).
- `CLIENT_intro_request` (To the member, Bcc Tracy): *Subject:* "[Client Name] has asked for an introduction to [Specialist Name]". *Body:* "Hi [Member First], Your client [Client Name] has asked, through their VFO client portal, for an introduction to [Specialist Name] of [Specialist Company]. Please make the introduction when you can. Client email: [Client Email]" + an Open client button.
- Bell: "Introduction requested: [Client Name] → [Specialist Name]", linking to the client.

### L3 — Holistic licence ($300/year)

**What (sheet rows 42-93; deck slides 57-58):**
- **Holistic via VFOS:** when the client pays a Holistic fee (Lite or above — standard $2,600), they get **immediate Standard portal access for 12 months**: Showroom (introductions via the member, Tracy notified), Client Vault, Holistic case progress (and tax where applicable) — the One Page Plan and progress on each priority, in summary. **$300 is a disbursement**: $2,600 − $300 = $2,300, split $1,150 member / $1,150 VFOS.
- On payment the client gets an automatic portal link with instructions ("very similar to the email for Direct Tax Planning") — so the MAP 1 / Holistic invoice/receipt email gains the same login paragraph as L1's tax email.
- **If no fee is paid, the case is not accessible on the portal** unless the member chooses to continue on $25/month (L4).
- **Holistic member-direct (Fusion only)** — see "Later" below; when it exists: $300 licence as a disbursement, card charges also a disbursement, 100% of the rest to the member.
- **Extension:** a client who already holds a Tax licence gets the extra-days extension only (§2.3).

**Touches:** the MAP 1 / Holistic payment + revenue-share engine (`contract-revshare.ts`, `pipeline_map1` legs, the MAP 1 invoice/receipt email, the Payments/Accounting split surfaces — #394: MAP 1's model is member full / strategic gross-prorated / VFOS residual, NOT tax's pro-rata, so the disbursement maths must be designed for it, not copied from L1). **Open questions:** **FIRST — does a VFOS-led Holistic client get the $300 licence at all?** (decision 18: Jake not sure yet). The spreadsheet says yes (the $2,600 example above), but the Q4 deck's only Holistic licence slide is the **Fusion member-led** route — the member keeps 100% instead of 50%, minus a $300 licence, and the client's portal is **branded to the member** — which is the "LATER" DIY work; the deck mentions Holistic otherwise only in the general "Tax Planning or Holistic Planning $300" rule and the FIFO example. If only member-led, L3 depends on DIY Holistic. Then: is the $300 taken from the first installment or spread across a quarterly plan? Which Holistic tiers count ("Lite or above")? Refund / cancellation → revoke?

### L4 — CIQ licence (Basic vs Standard for a CIQ client)

**What (sheet rows 20-39; deck slides 53-56; Catalyst tab rows 22-26):**
- **Legacy members** (had CIQ 2.0 free via PPP) — a CHOICE per client: just do CIQ 3.0 on the portal, client on **Basic** (Showroom only), **$0**; OR upgrade the client to **Standard** (Vault + CIQ One Page Plan + case history) for **$25/month**.
- **New members** — start with VFO FT via the 90 Day Plan; the VFOS team drives CIQ through the Holistic process and takes the standard revenue share. Where a member asks to run their own CIQ, **the MSM toggles a button that lets the member drive — this starts the licence**: the same Basic $0 / Standard $25/month choice. The benefit to the member: no revenue share with VFOS; the cost: the monthly licence. CIQ 3.0 is only switched on once the MSM is satisfied the training is complete.
- **Switching off:** the member can switch the $25/month licence off (how — open); it stops CIQ at the end of the current calendar month and the client's Standard access is halted (back to Basic).
- A client already holding an annual (Tax/Holistic) licence is not charged the $25 (§2.2: one licence at a time).

**Today:** CIQ is gated per MEMBER only (`members.ciq_enabled`, every member on); there is no per-client licence. **Open questions:** who pays the $25 and how (the member's saved payment method? a Stripe subscription per client or one per member with quantity?); does the MSM toggle replace or sit beside `members.ciq_enabled`; what exactly "stops CIQ" means for a client mid-plan; do legacy vs new members need a stored flag?

### L5 — Mirrored joint clients

**What (sheet VFO ASSOCIATE rows 22-24; deck slides 66-68; Catalyst tab N36):**
- Where an advisor and an accountant are connected in the portal, **the connected member sees "mirrored" tracking of JOINT clients only** — never every client of either (Paul: that would be "highly inappropriate").
- A **"Connected client" button** on a client: defaults to the member's normal connected partner; for a **one-off case** or an unusual connection, choose any member from a drop-down.
- A general change for ALL connected members (advisors, accountants, VFO-A, FC).
- **(Q4 deck, "Connected Members — Joint Case Mirroring")** — **$0 licence**, "mirroring is a CHOICE, not automatic" (client confidentiality). **Option 1, Normal Member Connections (advisor / accountant):** whoever "owns" the specific client clicks on the VFO Portal and connects their partner automatically; the partner then sees "mirrored" case tracking on THEIR portal. **Option 2, "One-Off" Member Connections:** the same, but the member picks who to connect from a drop-down — any combination of member to member (advisor ↔ advisor, accountant ↔ accountant), not just advisor / accountant. VFO Associates and Financial Collaborators (Basic portal) can be mirrored too.

**Open questions:** read-only mirror or can the connected member act? Which tracks are mirrored (MAP 1, tax, CIQ)? Can a client have more than one connected member? Does it touch revenue share (commissions already exist for advisor/accountant connections)?

### L6 — VFO Associate and Financial Collaborator portals (NOT being worked on yet — Jake)

**What (sheet VFO ASSOCIATE + FINANCIAL COLLABORATOR tabs; deck slides 62-64, 69-73):**
- **VFO Associate (accountant):** membership $25/month when connected to an advisor member (the connected member pays), $145/month direct — charged **through the portal** once onboarded (today by contract, month to month; the contract needs reviewing for portal access). They get the **Basic member portal**: VFO Showroom with the specialist-introduction button (Tracy notified), mirrored joint clients (L5), and loading their own clients + sending them the Basic client portal (L2). No CIQ, no Vault, no training.
- **Financial Collaborator:** $99/month direct, the same three things as an Associate.
- **Upgrades** for both: Standard portal **+$25/month** (adds CIQ and Member Vault, video training only); "Request an upgrade meeting" (introduction to Vanessa); become a **VFO Fast Track Accountant** ($2,000 implementation connected / $4,000 direct) or a **Catalyst Advisor** ($4,000). A video showing everything in the licence structure.
- **VFO FT Accountant:** $0 licence to the member — the accountant pays their own membership and gets the Standard portal (Catalyst tab: connecting a VFO FT accountant discounts the accountant $4k a year and the Standard connection is free to the member).
- **Clean-up:** the live VFO-A and FC members showing in the portal must be cleaned up first.
- **(Q4 deck) prices, which differ from the bullets above where they disagree — confirm with Jake when L6 starts:**
  - **Associate Accountant, Direct:** Basic = $145/month (clients get the Showroom; connected members can mirror joint cases); Standard = +$25 → **$170/month** (CIQ with video training, clients get CIQ + One Page Plan + case history, Member Vault).
  - **Connected Associate Accountant:** Basic = **$0 membership** (discounted by $145/month) but the **ACCOUNTANT pays a $25/month portal licence** (the connected advisor CAN choose to pay it instead — the bullet above says the connected member pays); Standard = +$25 → **$50/month** (CIQ with video training or help from the connected member, Member Vault). The deck says this ends VFO Associate being free for connected members.
  - **Financial Collaborator:** Basic = $99/month; Standard = +$25 → **$124/month**.
  - The upgrade request is to a **6-month** VFO Fast Track Accountant Implementation (Associate) or Catalyst Implementation (FC), with direct access to the sales team.
  - (LATER, member-led PFT) a $0 licence to run PFT; an accountant joining VFO Fast Track gets a $4,000 annual membership discount (the member's gift) and a free Standard portal.

### L7 — Portal suspension rules (deck slides 79-82)

| Member tier | Missed payment |
|---|---|
| VFO Associate / Financial Collaborator | **Immediate** portal suspension; a respectful email to the paying member giving 7 days to rectify; the team notified by the portal at once; lifted immediately on payment |
| Catalyst Advisor / VFO Fast Track Accountant | **7 days** before suspension; respectful email; the team notified at once; lifted immediately on payment |
| Fusion Advisor / Advanced Accountant / any Accredited member | Suspension delayed **14 days**, arrears highlighted on the portal during the notice period, a 14-day email; **not automatic** — it goes to the executive, who updates the portal; the team notified when they do |

**Today:** membership arrears is its own state (`members.membership_arrears`, 2026-09-15) with a pay-now link and a Friday digest; `members.suspended` / `paused` gate payouts (#433). L7 would add the tiered timing and what "portal suspension" actually blocks. **Open questions:** what a suspended member can still see; how the tier is read (member type? a new column?).

### LATER — not planned yet (Jake: "we aren't working on VFO Associate, Financial Collaborator, Accredited and Catalyst vs Fusion rework yet")

- **Catalyst v Fusion structure** (deck slides 8-40): Catalyst (Sarah Freitas as MSM; Standard Catalyst portal) vs Fusion (Ian Welham as MSM; $18k one-off or $1,542/month; advanced coaching; the Upgraded Fusion portal). The "tailored" GCM options phase out by the end of 2026.
- **Member-direct ("DIY") Holistic Planning — Fusion only**, switched on per member by IW when he considers them trained: branded Holistic presentation, CIQ 3.0 + One Page Plan, the member's own fee and meeting structure, a branded engagement agreement, payment via the portal, $300 licence + card charges as disbursements, 100% of the rest to the member.
- **Member-direct Partnership Fast Track — Fusion only**: branded accountant presentations, the VFO FT vs Associate choice, accountant membership fees collected via the portal.
- **Accredited members**: $50,000 in a calendar year + VFO Certified; permanent once earned ("Pending Accredited" if not yet certified); rebates, recognition, group calls, an annual Accredited Retreat, and an enhanced / tailored enterprise portal licence (TBA).

Each of these, when it is picked up, becomes a unit here with its own switch.

---

## 4. Decisions log

| # | Decision | Date |
|---|---|---|
| 1 | The tax licence is first (L1 = DIRECT unit 4). | 09-28 |
| 2 | Every unit ships dark behind its own Feature Switch; Jake flips them when he wants. | 09-28 |
| 3 | One switch per UNIT, not per feature. | 09-28 |
| 4 | Build order after tax: client-first — L2 Basic portal + introductions, L3 Holistic, L4 CIQ, L5 mirrored clients, L6 VFO-A / FC, L7 suspension; Catalyst/Fusion, DIY and Accredited later. | 09-28 |
| 5 | The tax licence's switch is the existing `portal_licensing` (it also carries the new tax agreement — DIRECT decision 53). | 09-28 |
| 6 | **NO manual licence controls** (no by-hand grant / extend / revoke): licences are automatic only. An earlier version of this row said the opposite — Jake, 2026-09-28 (unit 4 chat): a misunderstanding by the previous chat, removed. | 09-28 |
| 7 | L2: an introduction request emails the MEMBER with Tracy **Bcc'd** AND raises a **bell** to Tracy. | 10-09 |
| 8 | L2: "Send portal access" is for **every member type**; the `client_basic_portal` switch (Off / Test member only / On for all) is the only rollout control. | 10-09 |
| 9 | L2: the member **cannot revoke** Basic access (consistent with decision 6). | 10-09 |
| 10 | L2: **Basic = Showroom only** (+ the introduction button); the Vault needs an active Standard licence. Both new emails are seeded **Draft** and flipped to Send in the Email Editor before the switch goes on. | 10-09 |
| 11 | L2: **Basic = Showroom only whenever `client_basic_portal` is on** for the client's member — the Vault needs an active Standard (today: tax) licence. *Revised the same day:* the first version applied the gate only when `portal_licensing` was also on; Jake chose the simpler rule after the census showed no real client holds a login (only 59524's two test clients) and document requests use the `/vault-upload` links, not the portal Vault. Accepted: with `portal_licensing` off, no client of that member can reach the Vault until L3 / L4 add more Standard sources. | 10-09 |
| 12 | L2: the two email bodies and the Tracy bell wording are approved as written in the L2 build plan (template 312 then changed by decisions 14-15). | 10-09 |
| 13 | L2 UI (Jake, during the click-through): "Send portal access" is one click — no confirm, no success or "queued" message (members never hear about Drafts); only a refusal shows. The member's control sits in a CLIENT PORTAL card (house card + heading) at the bottom of the Profile tab. The client's intro button is white with VFO-blue text under the pop-up header; once requested it is the same button, inert, with a not-allowed cursor. The Showroom pop-up header becomes name + background badge, short bio, ecosystems as small dot-separated text, a larger headshot (every Showroom). | 10-09 |
| 14 | L2: specialists have no company field, so the intro-request email names the specialist with their specialism (`experts.short_bio`). | 10-09 |
| 15 | L2: the intro-request email reads "Your client [Client Name] ([Client Email]) has asked…" — no separate client-email line; the Open client button stays. | 10-09 |
| 16 | L2: the client portal's Vault tab is OFF by default and appears only on the live server answer — a Basic client must never see it, even for a moment. | 10-09 |
| 17 | **Build order changed: L5 (mirrored joint clients) is NEXT**, ahead of L3 Holistic (Jake). | 10-09 |
| 18 | L3 open: whether a VFOS-led Holistic client gets the $300 licence, or only the Fusion member-led route (the Q4 deck shows only the latter) — Jake not sure yet; ask before L3 starts. | 10-09 |
