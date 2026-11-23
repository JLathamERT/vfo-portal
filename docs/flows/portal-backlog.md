# Portal Backlog (More ▾ → Portal Backlog)

> Built 2026-11-17 from Jake's Workbench card *VFOS Portal Backlog Tracker*, with Paxton's decisions. It replaces the "VFO Portal Update Requests" Google Sheet. Tables: [tables/portal-backlog.md](../tables/portal-backlog.md). Actions: [architecture/05-api-action-catalog.md](../architecture/05-api-action-catalog.md) *Portal Backlog*. *(v: 2026-11-22)*

## What it is

Any admin files a request for a change to the portal. A superadmin (`constants/superadmin.ts`, today Jake and Paxton) approves or denies it. An approved request moves across a board until the work is done and announced, then it is archived.

- **Who sees it:** every admin. The More ▾ entry is never gated by `allowed_tabs` and has no `TAB_ACTIONS` key, so it is not on the Admin Editor's list. Members, clients, specialists and tax planners never reach it (every action is in `ADMIN_ONLY_ACTIONS`, is in no other portal's allowlist, and each handler also refuses a non-admin `callerRole`).
- **What any admin can do:** see every request, file one (+ New request), edit or withdraw their OWN request while it is pending, write the "What it does" write-up, and archive a request in Ready to announce.
- **What only a superadmin can do** (`SUPERADMIN_ONLY_ACTIONS`, re-checked in the handler): approve, deny and reopen; edit any request; move and reorder cards; Sort by priority; restore from the archive.

## The page (`src/components/admin/PortalBacklogPanel.jsx` + `backlog/`)

Styled like the Advisor KPIs page: the **Tasks / Requests** pills on top, then the navy `KpiHero` (lenses Pending review, Unassigned, To do, Working on, Done, Ready to announce, Total), then a row with the department filter, **Archive** and **+ New request**. A lens filters the board and the lists; the department filter narrows the whole page, the counts included. Total counts pending requests and those on the board — denied and announced requests are in the archive.

- **Tasks** (`BacklogBoard.jsx`): Approved but unassigned on the left, one lane per superadmin (To do / Working on / Done) stacked in the middle, the shared Ready to announce pool on the right. The lanes come from the server's `assignees`, never from React. Below 1280 px the two tall columns sit above and below the lanes; below 768 px one lane shows at a time with a lane picker. The page grows to 1800 px.
- **Requests** (`BacklogRequestsTab.jsx`): New requests (oldest first, Approve / Deny for a superadmin), then the Ready to announce pool.
- **Archive** (`BacklogArchive.jsx`): announced AND denied requests, newest first, with a search (title, description, requester), a Show filter (Announced and denied / Announced / Denied) and the department filter. Each row has an Announced or Denied pill. A superadmin gets **Restore** on an announced row (back to Ready to announce) and **Reopen** on a denied one (back to New requests).
- **Card** (`BacklogCard.jsx`, Workbench style): the title, "requester · date", the department chips and the coloured **Urgency N** / **Importance N** pills (`ScorePill.jsx`: grey 1, blue 2, amber 3, orange 4, red 5; a dash when unset). Nothing else until it is opened: "Requested for: …" on a pending card with a pick, "Done by …" in Ready to announce, "Needs its write-up" on a Done card without one.
- **Drawer** (`BacklogDrawer.jsx`): the title, the description with its pills, the **What it does (for the announcement)** write-up, the review, Move to / Assign to selects for a superadmin (the touch-screen way to move a card), the announcement, and the history timeline.
- **History:** the clean-up's rows (see *The sheet import*) read "Title replaced (imported title was cut off)", with "Was: <old title>" under it and "Title clean-up" as who did it; every other row names its admin, or "Sheet import".
- **Forms:** `NewRequestModal.jsx` (Title with a hint, "A short name for the change. Put the details in the description.", and an "n / 140" counter that turns amber from 120 characters and red at 140, where the box stops (2026-11-22, Backlog 6a); Department multi-select, Urgency and Importance 1–5, Description, and an optional, muted **Assign to** that only the requester sets while the request is pending), `DenyDialog.jsx` (a reason is required), `ArchiveDialog.jsx` (Announced on, today by default and never in the future, plus an optional note).
- **Departments:** `backlog/portalDepartments.js` (with the chip colours) and the backend's `constants/portal-departments.ts` are the same eleven names. Change both together.
- **Drag and drop** is native HTML5 (no library). A drag into another column lets the server place the card by priority; a drag up or down inside one column saves that position.
- **Loading** (2026-11-20): while `portal_backlog_load` runs, the real Tasks / Requests pills show above `PortalBacklogSkeleton` (`shared/skeletons/admin.jsx`): the navy hero with its title and placeholder counts, the toolbar, then the board (at the same 1280 / 768 px breakpoints, two lanes) or the Requests lists. The archive shows `PortalBacklogArchiveRowsSkeleton` while it loads. There is no "Loading…" text. A change to the board's layout changes its skeleton too.

## The rules (all enforced by the backend)

| Rule | Where |
|---|---|
| Title 1–140 characters, description 1–4000, at least one department from the list, urgency and importance whole numbers 1–5 | `validateFields` (`actions/portal-backlog/shared.ts`) + table checks |
| The requester and the date come from the session (`requested_on` is today in America/New_York) | `portal_request_create` |
| "Assign to" is only Jake, Paxton or no one; it is used once, at approval | `validateFields`, `portal_request_review` |
| Approve lands in the picked person's To do if they are still a superadmin, else in Approved but unassigned, placed by priority | `portal_request_review` |
| Deny needs a reason; a denied request leaves the board and the counts and shows in the archive | `portal_request_review`, `portal_backlog_load` / `portal_backlog_archive_load` |
| Only To do can be unassigned; a card in Ready to announce keeps its assignee | `portal_request_move` |
| A card enters Ready to announce only with a write-up, and one there cannot have it cleared | `portal_request_move`, `portal_request_writeup_save` |
| Priority = urgency + importance, highest first; ties to the older request date, then the older id | `priorityKey` (`shared.ts`), SQL `portal_backlog_resort` |
| Only a Ready to announce request is archived, with a valid date that is not in the future | `portal_request_archive` |
| A withdrawn request disappears from every view and count (the requester's own come back in `my_withdrawn`, unused by the page) | `portal_backlog_load` |

**One write path.** Every write goes through the SQL function `portal_request_apply(p_id, p_set, p_expect, p_events)`: the change and its history rows in one transaction, and `p_expect` is the state the handler decided on. If someone changed the request in between, it raises `portal_request_conflict` and the handler answers **409** ("This request changed while you were working on it. Reload and try again."), so two superadmins cannot both approve or both move a card.

## Bells (team notifications are bells only — TEAM_RULES §8)

Five `notifyByRule` rules, area **Portal Backlog**, kind `bell`, FYI, `dismissible`, pipeline `PORTAL_BACKLOG`, no `email_templates` rows. Each is sent with `forceRecipients`, so the Notification Editor can switch it off but not re-route it. The link is `/admin?tab=portal_backlog&request=<id>`: `AdminPortal.jsx` passes it to the panel, which opens the inner tab the request is on (or the archive) and its drawer.

| Rule | To | Title | Message |
|---|---|---|---|
| `BACKLOG_new_request` | every superadmin except the requester | "<requester> submitted a portal request" | the title |
| `BACKLOG_approved` | the requester | "Your portal request was approved" | the title |
| `BACKLOG_denied` | the requester | "Your portal request was denied" | the reason |
| `BACKLOG_assigned` | the new assignee, when a card enters their lane (approval with them picked, or a move from Unassigned or the other lane) | "<actor> assigned you a portal request" | the title |
| `BACKLOG_ready_to_announce` | the requester, when the card enters Ready to announce | "Your portal request is ready to announce" | the title (+ "done by …") |

Never to the person who acted, and never to someone no longer in `allowed_admins` (re-read at send time: `bellAdmin` in `shared.ts`). Archive, restore, reorder, edits and write-ups send no bell. A failed bell is logged and never undoes the change. On the test site every bell goes to the tester with the `TEST - meant for:` line.

## The sheet import

`scripts/portal-backlog-sheet-import.sql` (edge repo — it holds staff names and request text, so it stays out of this public repo). Generated once from the sheet's CSV export: 89 rows, the 25 Approved / Completed rows skipped, 50 pending, 1 denied ("Denied in sheet"), and the 12 On Hold + 1 In Progress rows in Approved but unassigned in priority order (history note "Imported – was On Hold" / "– was In Progress"). The import first titled each row with the first eight words of the request + "...". On 2026-11-22 (Workbench *Backlog 6a*) `scripts/portal-backlog-title-fix.sql` (edge repo) replaced the 55 cut-off titles with short titles Paxton approved (run on the test site and on live 2026-11-22), keyed on `sheet_row` and only where the old title was still there; it writes one History row each, sends no bell and leaves descriptions alone. The import script now carries the approved titles, so a re-run cannot bring "..." back. Requesters are matched to `allowed_admins` by name. It writes the tables directly (no bells), keyed on `sheet_row`, so a second run adds nothing. Run on the test site 2026-11-17; run on live at release, after both migrations.
