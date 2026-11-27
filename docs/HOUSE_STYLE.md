# VFO HOUSE STYLE: which look to use where

> **Read this before building or changing any screen.** [TEAM_RULES.md](TEAM_RULES.md) §9 sends you here; §9 keeps the short rules (buttons vs tags, sub-tabs, phone layouts), and this file is the catalogue: every kind of page the portal has, the page to copy for each, and the shared pieces it is built from.
>
> Change this file like code, in a worktree, through a PR. A look the person approves for a new kind of screen is added here in the same PR. Created 2026-11-27 (Jake) from a scan of every screen; the screens that do not follow it yet are listed in Issue JLathamERT/vfo-edge-functions#661.
>
> Every rule here was confirmed by Jake on 2026-11-27.

## How to use this file

1. **Name the page type** from the table below, and say it in the plan: "This is a Section page; the model is Events."
2. **Open the model page**, in the code and on the dev server, and copy its layout, components and spacing. A screen that matches an approved one copies it exactly.
3. **Build from the shared pieces** the type lists. If the piece you need is a local copy inside the model file, import it or move it into `src/components/shared/`; never type the same style out again. Most of the drift listed in the Issue started as one copy.
4. **No type fits?** Ask the person before inventing a look. Old-system screenshots tell you the data and the steps, never the look.
5. **Touching an old screen that breaks this file?** Put right the part you touched (TEAM_RULES §9), and leave the rest to the Issue.

## The page types

| Type | What it is | Model to copy | Built from |
|---|---|---|---|
| **List** (§2) | A directory of people or clients: search, filter, sort, a row opens one | Client Overview (the look), Advisors (the code: `MembersPanel` list view) | `shared/ListTable.jsx`, `admin/ListFilterButton.jsx` |
| **Section** (§3) | A stand-alone area with sub-tabs along the top and the content below: Growth Credits, Events, FAQ Editor, Tax Diagnostics, Notifications, Portal Backlog | Events (More ▾ → Events), except its header card (§3) | `PageHeading`, `AccountingCombinedPanel` pills, cards, `ListTable` |
| **KPI, simple** (§4) | Counts of people or records by status | Advisor KPIs (Members → Advisors → KPIs) | `admin/KpiKit.jsx` |
| **KPI, detailed** (§4) | A summary table: steps, fees, teams, days, pass rates | Tax Planner KPIs → Cumulative Summary / Average Fees / Success Formula (Paxton) | `admin/tax/kpiSummary/shared.jsx` |
| **Accounting** (§5) | Money: revenue, reconciliation, recurring, outstanding links, held payouts | Accounting → Specialists → VFO Specialist Revenue | `AccountingCombinedPanel`, the table styles in `SpecialistRevenuePanel.jsx`, `cardFeeColumn.jsx` |
| **Program tracker** (§6) | One client's or member's steps through a program, phase by phase | Regular Priorities (MAP 4) and the MAP 1 track | `shared/TrackKit.jsx`, `StepDate`, `StepEmailsChip`, `PhaseNotes`, `buttonStyles.js` |
| **Profile** (§7) | One person or client: hero, then cards of fields | The admin member profile (2026-11-27 refresh) | `shared/ProfileKit.jsx` |
| **Hub** (§7) | A menu of boxes that each open a sub-view | Growth Plan hub, CIQ chooser | `shared/HubKit.jsx` |
| **Form / modal** (§7) | Adding or editing a record | Add forms (`PageHeading` + `FormGrid`); `BacklogModal` for a pop-up | `ProfileKit` form pieces, `backlog/BacklogModal.jsx` |
| **Automation & Config** (§7) | A pipeline's automation table | Automation & Config → MAP 1 | `admin/automation/StepKit.jsx` (`PanelHero`, `TableCard`) |
| **Emailed link / pay page** (§7) | A page someone opens from an email, no login | Any `/…-pay` page | `shared/TokenShell.jsx` |

---

## 1. What every page shares

### Frame

- **Padding 24px, centred** (`margin: 0 auto`). On a member, client or specialist page, `var(--vfo-gutter)` on a phone.
- **One width per kind of page** (Jake, 2026-11-27). Eleven widths were in use (980 to 1800). Use:

| Width | For |
|---|---|
| 720px (`SETTINGS_WIDTH`, ProfileKit) | Settings pages |
| 900px | One opened record: a profile, a form |
| 1200px (`LIST_PAGE_MAX_WIDTH`, ListTable) | Lists, Section pages, KPI pages, Accounting |
| 1500px | Only a table too wide for 1200: Client Overview, Events |

### Page header

- **`PageHeading`** (`ProfileKit.jsx`): a small sky-blue uppercase eyebrow (where the page sits, such as "Accounting · Members") over a 24px heading, with an optional action on the right ("+ Add Client"). `AccountingCombinedPanel` draws the same header itself.
- **Every page draws it plain, never inside a card** (Jake, 2026-11-27), Section pages included.
- A KPI page has no `PageHeading`: `KpiHero` is its header.
- A List page may use `ListHeader` (`TrackKit.jsx`: the title plus a count chip) under the eyebrow.
- Not: an h2 with no eyebrow, a 22px or 700-weight heading, a different eyebrow colour or size.

### Colours

- The brand set is in TEAM_RULES §9. On a page or card, use the `var(--vfo-*)` tokens from `src/index.css` (`--vfo-card`, `--vfo-ink`, `--vfo-muted`, `--vfo-faint`, `--vfo-border-soft`, `--vfo-primary`, `--vfo-tint`...), so dark mode works. Fixed hex only for brand gradients and status colours.
- **Status colours** come from one place each: people `statusColor` (`shared/statusColors.js`: Active green, Lost red, Removed dark red), clients `shared/clientStatus.js`. Never pick a new red or amber for an existing status.

### Sub-tabs, mini-tabs and filters

- **Sub-tabs (the top level): `SubTabs`** (`shared/SubTabs.jsx`, the pill `AccountingCombinedPanel` draws). Active is the navy-to-blue gradient, the rest are white with a grey border. Only the open tab is mounted, and the choice is remembered when the person leaves and comes back. Never hand-roll the pill row. It is the only sub-tab pill (Jake, 2026-11-27): KPI pages' solid-blue pills and the filter pills changed to it.
- **A profile's tab bar is not a sub-tab** (Jake, 2026-11-27). The bar along the top of a profile (a member, a client, a tax planner: Profile, Vault, Programs, Showroom ▾...) is that profile's main menu: solid blue active pill on a ruled line, some tabs opening a dropdown, matching the member's own portal bar. It keeps its own look. Today it is copied in `MembersPanel`, `MSMTracking`, `TaxPlannersPanel` and `pages/ClientDetail.jsx`; it becomes one shared piece when next touched.
- **Pill labels are short** and never repeat the page title: "Revenue", not "Holistic Planning Revenue" on the Holistic Planning page.
- **Mini-tabs (a second level inside a sub-tab, or a status filter with counts):** `MiniTabs` (`shared/SubTabs.jsx`), the rectangular 8px-corner tabs, as "By specialist / By member" on VFO Specialist Revenue.
- **Filters:** on a list, `ListFilterButton` + `SortSelect`; on a money page, period `<select>`s (Year, Month) and a Refresh button. Counts can sit in a pill label ("Open (4)").

### Cards

- White card: `var(--vfo-card)`, 1px `var(--vfo-border-soft)`, 16px corners (14px for a card holding a table), `var(--vfo-shadow-card)`, padding `var(--vfo-card-pad)`.
- **A new card is `ProfileCard`** (`ProfileKit.jsx`: icon badge, title, optional sub-line and action). Today there are 38 local `sectionStyle`s and four card-title looks; don't add a fifth.
- A trim changes only the named thing (TEAM_RULES §9).

### Buttons, tags and choices

Buttons and tags never look alike, and tags are rare: the full rule is TEAM_RULES §9. Which piece for which job:

| Job | Use |
|---|---|
| The main action of a page or card; the "yes" of "Are you sure?" | `btnPrimary` |
| Cancel, Edit, No | `btnSecondary` |
| A row's own action in a list or table (Done, Clear, Re-send) | `btnOutline` (+ `BTN_SMALL`) |
| Remove, Stop, Refund, Cancel a booking | `btnDanger` |
| The small Edit / Reschedule / Cancel on a tracker step | `btnStep` |
| The one detail that matters on a row (Overdue, Stopped, Refunded, Bank payment clearing, Sandbox) | `Tag` |
| A status every row has | plain text or a column, not a tag |
| Pick one of a fixed list of statuses | `<select>` |
| Pick one of two or three answers on a form | `ChoiceButtons` (ProfileKit) |
| On / off | `Switch` (ProfileKit) |
| Tick one thing done, or pick several | a native checkbox |

### Dates

- **Shown:** `formatDate` / `formatDateTime` from `src/lib/dates.js` (MM/DD/YYYY). Never `new Date('YYYY-MM-DD')` (it shows the day before, west of Greenwich), never a bare `toLocaleDateString()`, never a new local `fmtDate`. One format everywhere (Jake, 2026-11-27): Accounting moves off its own "Nov 15, 2026" formatters to this one.
- **Typed:** `<input type="date">`, ISO underneath; on a tracker step, `StepDate`.

### Money

- Right-aligned, `fontVariantNumeric: 'tabular-nums'`, "—" for nothing (never "$0.00" for a fee that does not exist).
- The Card fee column and the payment words (cleared / clearing / on its way / processed, shown through `paymentStatusLabel`) are TEAM_RULES §8.

### Empty, loading and error states

- **Empty:** one centred line inside the card, `var(--vfo-faint)`, 13px, naming what is missing in this view: "No payments cleared in this period."
- **Loading:** a skeleton shaped like the page, from `shared/skeletons/` (same width, same number of pills and columns as the live page). Never "Loading..." text or a spinner card.
- **Error:** a red banner above the content.

---

## 2. List pages

Model: Client Overview's look; Advisors for the code. Top to bottom:

1. `PageHeading` (eyebrow + title, action on the right: "+ Add", Export via `ExportButton`) or `ListHeader` with the count chip.
2. One toolbar row: search (`listSearchStyle`, `type="search"`), `ListFilterButton`, `SortSelect`. It wraps on a narrow screen.
3. `ListTable`: uppercase header row, click a column to sort, rows that lift on hover, `ListName` / `ListText` cells.
4. **A client's name opens the profile; the row opens the plan** (`ClientNameLink`, #632). A person's row opens their profile.
5. `ListTable`'s empty line; the matching skeleton (`DirectoryListSkeleton`, `ClientOverviewSkeleton`) at the same width.

A list of people or clients that is not a money table, a tracker or a KPI grid is a `ListTable`. If it needs something `ListTable` can't do yet (an expanding row, an in-row control), add it to `ListTable`; don't copy the look.

## 3. Section pages

Model: Events. Also Growth Credits, FAQ Editor, Tax Diagnostics, Notifications, Portal Backlog.

1. The header: `PageHeading`, plain (§1), with the eyebrow naming the menu it lives under ("More", "Automation & Config"). Events, Growth Credits and FAQ Editor still draw it inside a white card at a smaller size; that card goes.
2. The sub-tab pills, straight under the header, through `AccountingCombinedPanel`.
3. The open tab's content: cards, or a `ListTable`, with mini-tabs inside a tab if it needs a second level.
4. A banner that applies to the whole area (a switch that is Off) sits between the header and the pills.

## 4. KPI pages: two kinds

Both live as sub-tabs of the area they measure (Members → Advisors → KPIs, Tax Planners → Tax Planner KPIs). The first sub-tab is the simple view; detailed views are later sub-tabs.

### Simple: counts by status (Advisor KPIs)

Use when the question is "how many, in which status".

1. Sub-tab pills.
2. `KpiHero`: navy gradient, the title on the left, the big count on the right, the status bar and the status chips under it (click one to focus it). Lenses come from the status colours (§1).
3. A row: `BreakdownCard` + `BreakdownRows` (the ranked leaderboard) on the left and wide, `SplitDonut stack` on the right and narrow (Legacy vs New, Top of the T). Specialist KPIs has them the other way round, which is the odd one out.
4. Skeleton: `KpiPageSkeleton`.

### Detailed: a summary table (Paxton's Tax Planner KPI sub-tabs)

Use when the question is "where do cases drop off, how long, how much, who converts best".

1. **Toolbar** in one row: the view title (20px) with "· N cases", `ListFilterButton` (team), the period `<select>` (All time / This month / This quarter / YTD / Custom), small summary chips, then Refresh on the right.
2. **Headline figures:** stat tiles with a 3px coloured rail along the top (green / amber / red pass rate), or a navy gradient strip for two or three big numbers (Average Fees, Success Formula).
3. **The table:** a real `<table>` in a card, the sticky tinted uppercase header (`thStyle`), numbers right-aligned in tabular figures, a tinted subtotal row per group, a highlighted column for the measure that matters, rows with too few cases greyed, and a footnote row saying how it is counted.
4. Pass-rate colours: green at 70% and up, amber from 40%, red below (`RAG` in `kpiSummary/shared.jsx`).
5. A second detailed KPI page first moves `card`, `cardTitle`, `thStyle`, `num`, `footNote`, `RAG`, `StatusDot` out of `tax/kpiSummary/shared.jsx` into `admin/KpiKit.jsx`, then imports them.

## 5. Accounting pages

Model: Accounting → Specialists → VFO Specialist Revenue.

- **Every Accounting page is an `AccountingCombinedPanel`:** the eyebrow "Accounting · <group>", the title, the pills. A page with one view has no pills but the same header.
- **Pill order:** the main view (Revenue, Members, Specialists) first, then Reconciliation, Recurring, any account or setup view, **Outstanding Payment Links**, then **Held Payouts** last (with its count badge).
- **A repeated sub-tab is one shared component, never a copy.** Outstanding Payment Links is `OutstandingLinksPanel` (with its `kind`), Held Payouts is `HeldPayoutsPanel` (with its `engine`). A new program gets these by passing its kind, not by writing its own. Implementation and Membership Fees still have their own Outstanding Payment Links copies (the Issue).
- **The money table:**
  1. Above it, left: the period `<select>`s (Year, Month) and Refresh. Right: the page's main action ("+ New Payment", `btnPrimary`). Mini-tabs under them if the table has two views.
  2. The card (`tableStyle`), the header row (`headerRowStyle`), then **the totals row straight under the header** (`totalsRowStyle`, with the period as a sub-line), then the rows.
  3. Columns in the model's order: who, date, the amounts, **Card fee** (`CardFeeCell`, `CARD_FEE_COL`), status last and right-aligned.
  4. Import the styles from `SpecialistRevenuePanel.jsx` (or a shared `accountingTable` module once one exists); today six panels re-type them.
- **Statuses** go through `paymentStatusLabel`, never raw, and use the §8 words in TEAM_RULES: "Bank payment clearing" in a chip, "Clearing" as a status label, and "Paid" never stands in for cleared.
- Empty line: "No <thing> for this period."

## 6. Program trackers

Model: Regular Priorities (MAP 4), MAP 1. The same anatomy for every program: MAP 1, Regular, Tax, PIP, Partnership Fast Track, Tailored Route, the onboardings, MSM.

### The page

`TrackHero` (eyebrow, client name, progress %, bar and phase stepper; the Live / Stopped `Switch` in its action slot), then one card per phase.

### A phase card

- Header row: `PhaseBadge` (number, green tick when done, blue when active), the phase name in uppercase (blue while active), then on the right the Notes button (`PhaseNotesButton`), the status, and the chevron.
- Status: **only "In progress · n/m" is a tag.** A finished phase shows its green badge; a phase not started shows nothing (Issue #640 part 3).
- `PhaseNotesPanel` opens between the header and the steps.

### A step row

From left to right, on one line:

| Part | What |
|---|---|
| Dot | 8px circle: filled with the status colour when done, an empty ring when not |
| Name | `className="vfo-stepname"` (the phone layout keys on it); muted once done |
| Owner tag | Tax steps only: VFOS / Tax Team / Client / Automated (`OwnerChip`) |
| Emails | `StepEmailsChip` straight after the name, when the step sends email |
| The control | see below |
| Edit / Reschedule | `btnStep`, after the control, once the step is answered |
| Date | at the right end, before the chevron: `StepDate` (editable) once the step is done, nothing before. Action rows move off their 55px read-only span to `StepDate`, so every date lines up |
| Chevron | ▼, opens the detail under the row |

Done steps carry **no** Done / Not started / Not completed tag: the filled dot and the date say it. A real answer (Proceed, Yes, Declined) is plain text.

### Which control

| The step... | Control |
|---|---|
| only records a status | `<select>` of the step's `status_options`, "-- Select --" first |
| sends an email or a decision | a row of small buttons in the control slot |
| needs a date (a meeting) | "Send email (with date)" swaps the button row, in the same place, for `[date] [time] [time zone] [Send] [Cancel]` |
| needs a written reason (declined, refund) | a composer card opens under the row: subject, body, Cancel and Send at the bottom right |
| needs several fields | a form opens under the row: labelled `<select>`s and one Submit |
| is a Yes / No gate | two buttons |
| asks "Reached out?" | a native checkbox under the stall line |

**Button looks inside a step** (Jake, 2026-11-27):

| Button | Look |
|---|---|
| Each choice in the row ("Send email (with date)", "Send email - date not confirmed", Yes, No) | `btnOutline` + `BTN_SMALL` |
| The stop / decline / refund choice | `btnDanger` + `BTN_SMALL` |
| Send, inside the date form or a composer | `btnPrimary` + `BTN_SMALL` |
| Cancel, Reschedule, Edit | `btnStep` |

Every tracker still draws them tinted green / red / blue, which the button rule (TEAM_RULES §9) forbids; Issue #640 part 1 sweeps them to the table above.

### Automated steps

One row "Automated steps" with its dot, then a tinted box indented 18px holding the sub-rows: a 6px dot, the label (`vfo-substepname`), the date.

### Not

A square checkbox for a step, a step without `vfo-stepname`, a date in a different place, a phase header without the Notes button or the count, a tinted or pill-shaped button.

## 7. Other page types

- **Profile:** `ProfileHero` (eyebrow, name, avatar, meta, facts, alerts, action), then `ProfileCard`s holding a `FieldGrid` of `Field`s. Back is `BackLink`, never a hand-built "← Back" button.
- **Hub:** `HubBanner` (done / not yet), `HubGrid` of `HubCard`s, `HubMenuBar` to go back.
- **Form:** `PageHeading`, `FormGrid` of `formLabel` + `formInput` (`formReadOnly` for locked fields), `ChoiceButtons`, `Switch`, `SaveBar` at the bottom. Not the older 10px 14px `inputStyle` copies.
- **Modal:** `BacklogModal` (overlay, 16px card, title with ×, footer bar, Escape closes) and its `fieldLabel` / `inputStyle`. It moves to `shared/` as the house modal; today twelve pop-ups draw their own overlay.
- **Automation & Config:** `PanelHero` (white card, gradient strip, stats) and `TableCard`.
- **Emailed link and pay pages:** `TokenShell`; the lock emoji in the header of every `/…-pay` page (TEAM_RULES §2). Phone layout rules apply (TEAM_RULES §9).

---

## 8. Screens that do not follow this yet

The full list, with file and line, is Issue JLathamERT/vfo-edge-functions#661 (from the 2026-11-27 scan). The biggest groups:

- **Sub-tab pills drawn four ways** (Part 1 of the Issue). The Accounting gradient (and copies in Growth Credits, Events, FAQ Editor, Membership Fees, Implementation), the KPI solid blue (and Portal Backlog), Tax Diagnostics' filter pills and Client Overview's program pills.
- **Page headers drawn six ways,** and eleven page widths.
- **Accounting:** Outstanding Payment Links in three implementations; five Reconciliation tabs and four Revenue tabs that re-type the table styles; no `tabular-nums` anywhere; a dozen raw statuses shown without `paymentStatusLabel`; Held Payouts dates in MM/DD/YYYY beside "Nov 15, 2026" everywhere else; a License fee total that prints "$0.00".
- **Trackers:** no shared step row (every program copies it); tinted step buttons (Issue #640); Tax overrides `StepDate` with a read-only copy, so its dates cannot be edited; Advisor / Accountant onboarding rows pass a date-change handler that is never used; Specialist onboarding rows have no date.
- **Lists:** Member Overview, Onboarding lists, Next Tax Year and the SDP ATSG list copy `ListTable` by hand (SDP ATSG's client name is not a link); the Specialists list has its own 22px header.
- **Two pill looks for status:** `ListPill` and `Tag` differ (size, weight, border); a local `Tag` in `PaymentsTable.jsx` has 5px corners.
