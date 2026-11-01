# VFO TEAM RULES

> **Every chat reads this file IN FULL before any work** — `CLAUDE.md` in both repos sends you here, and `/start` does too. It holds every STANDING rule for everyone who works on the VFO portal. The prompts in [prompts/](prompts/) hold procedures only; the hub ([SESSION_REFERENCE.md](SESSION_REFERENCE.md)) holds live state, the security invariants, the gotchas and the DOC MAP.
>
> **"The person"** below = whoever is running this chat: match `git config user.name` against the TEAM table. Every rule applies to every person. A preference that belongs to one person only lives in that person's own Claude memory, not here.
>
> Change this file like code — in a worktree, through a PR. Created 2026-11-01 for the two-person workflow from the standing rules of `prompts/SESSION_STARTER.md` and Jake's Claude memory; `#N` = an entry in [GOTCHAS.md](GOTCHAS.md). Updated 2026-11-01 (phase 2): the superadmin list, the smoke gate's wording.

## TEAM

| Name | `git config user.name` | Portal email | Superadmin |
|---|---|---|---|
| Jake Latham | `Jake Latham` | jlatham@elitert.com | yes |
| Paxton | not set yet — add it when his computer is set up | pcalareso@vfo-services.com | yes — once his admin login exists (Admin Editor) |

- **Superadmin = on the list in `constants/superadmin.ts`** (edge repo) — one line per person. Adding someone is that line + their admin login + a `vfo-admin-api` deploy; the website reads `is_superadmin` from the server and holds no copy of the list.

- Use the person's portal email wherever a command needs one (the smoke gate, §4) — never their password: always the literal `<password>` they type over.
- Every CHANGELOG entry ends its heading with who did the work: `— by Jake`, or `— by Jake, Paxton` when several people worked the branch.
- If `git config user.name` matches no row, ask who the person is and add their row in this chat's PR.

## 1. NEVER WITHOUT THE PERSON'S EXPLICIT WORD IN THIS CHAT

- **Deploy to production.** Backend `supabase functions deploy …`; frontend `npm run deploy` — which IS production (vite build + gh-pages → https://vfoportal.com/). It needs the word "deploy": "yes", "continue", "looks good", "merged" and "tested" are not approval (#145). Ask every time, even if something similar was approved an hour ago.
- **Merge, push, push a tag, or run the wrap-up.** The person decides when work ships.
- **Commit.** The person tests first (§6). A button or reply option does ONLY what its label says — "Start Phase 2" never also commits (2026-10-15).
- **Create or change any email template's subject or body.** Show the full subject + body (placeholders visible, e.g. `[Client First]`, `[CLOSING]`) and wait for OK — for EVERY email in a build, not just the first.
- **Touch `boldsign-webhook`** — a fresh approval each time, and its deploy MUST carry `--no-verify-jwt` or BoldSign gets 401 (#10).
- **Touch the `pipeRow` null-check pattern** in `router/webhooks.ts` (grep `pipeRow.client_id`; the `typeof` guard is deliberate, the fix is structural).
- **Schema changes (DDL), destructive SQL** (DROP, TRUNCATE, mass DELETE outside a test client), `rm -rf`, force-push, `git reset --hard`.

## 2. NEVER, EVEN IF ASKED

- **Put a password, API key, token or passcode in a file, a commit, a URL or the chat.** Shared logins live in the team Bitwarden vault; backend secrets live in Supabase. [ACCESS.md](ACCESS.md) says where each one is — it never holds a value.
- **Convert a server-to-server chain call into a direct function call.** A chain call is one handler invoking another over HTTP (forwarding `Authorization` + `body.token`, or the service role); an in-process call drops the auth context and breaks the sweeps. Read [architecture/07-server-chains.md](architecture/07-server-chains.md) before touching any handler that calls another, the Stripe or BoldSign webhooks, or any sweep.
- **Add timeout retries to a non-idempotent write** in `src/lib/api.js`. Only reads (`^load_|_load(_|$)` + `vault_list`) retry once; the rule fixed a double-write bug.
- **Skip the `deno check` baseline** after a non-trivial backend change.
- **Edit a main checkout** (§3).
- **Use emojis** — not in UI, code, docs or chat. Use words ("PASS", "done", "Note:"), SVG icons or nothing, and strip them from any file you author. The one exception: the lock emoji in the header of every `/…-pay` page (consistency, Jake 2026-09-25).

## 3. WORKTREES, PATHS AND BRANCHES

- **Both people use the same folders:** `C:\vfo-react` (website + all docs, `github.com/JLathamERT/vfo-portal`) and `C:\vfo-edge-functions` (backend, `github.com/JLathamERT/vfo-edge-functions`).
- **Edit ONLY inside a worktree:** `C:\vfo-react\.claude\worktrees\<name>\…` or `C:\vfo-edge-functions\.claude\worktrees\<name>\…`. Never anything else under those two folders — `docs\` included, which exists in the main checkout AND every worktree (#36). Before every Edit / Write, check the path starts with one of those two prefixes; if not, stop and say which worktree you need. Reading a main checkout is fine; re-resolve the path to the worktree before editing. Grep / Glob inside the worktree.
- **Edited a main checkout by mistake?** `git checkout --` the file there, redo the edit in the worktree, then `git status` in both.
- **Never work on `main`.** Branch names: `feature/`, `fix/`, `polish/`, `refactor/`, `docs/`, `claude/`.
- **Local `main` is never the truth; `origin/main` is.** `git fetch origin && git merge --ff-only origin/main` on local main before a worktree is cut from it; a worktree behind `origin/main` is merged up before any edit, test or deploy (#337, #702). If `--ff-only` fails, stop and ask — never force.
- Read-only inspection (Read, Grep, `git log`, SELECT) is always fine.

## 4. DEPLOYING — two people, one live system

- **A deploy replaces the WHOLE backend function, or the whole website, with what is on the deploying computer.** The last deploy wins, silently. Every rule below exists so one person's deploy can never wipe the other person's work.
- **Releases — the real ship — only from up-to-date `main`, after the PR is merged**, run from the MAIN folder once `git merge --ff-only origin/main` has made it match `origin/main` (the wrap-up's Part 4 does it). A release from the main folder also leaves the live function's `entrypoint_path` with no `/.claude/worktrees/` in it — that is how anyone can see that live is main.
- **Test deploys of a branch — backend only, and only until the staging project exists.** The dev server talks to the LIVE backend, so a backend change can only be clicked through once it is deployed. A test deploy is allowed only when ALL THREE hold:
  1. `origin/main` was merged into the branch immediately before, in the same command (#702).
  2. What is live now is main or your own branch: MCP `list_edge_functions` → `vfo-admin-api` → `entrypoint_path`. A `/.claude/worktrees/<name>/` path is read like this: that worktree is on THIS computer and clean at `origin/main`'s commit → main's code is live (a release made before this rule); on this computer with other commits → your own test build; NOT on this computer → the other person's test build — STOP and ask them; never deploy over it.
  3. Live goes back to main the SAME DAY — merge + release, or re-release main as it is. A test build never stays on live overnight; a handoff that leaves one says so in OWED.

  The website never needs a test deploy — the dev server is the test.
- **One step at a time when shipping.** Ask for "deploy", then stop. After the deploy is done and verified, give the smoke command (only if the backend was deployed), then stop. After the person says it passed, give the live test steps (if any), then stop. Never hand over a later step's command or script early.
- **Fix on the spot, ship once.** A bug found while testing is fixed in the worktree right away (a product decision — UX flow, schema, a new column — is still asked first) and everything ships together at the end. Don't keep asking to deploy the frontend: keep a list of what is waiting and raise it at wrap-up or when the person asks.
- **Every approved change ends DEPLOYED, not merged:** backend → `vfo-admin-api` deploy (`--use-docker`, Docker Desktop running, `deno.lock` deleted — #574); frontend → `npm run deploy`, then prove the live site changed (§10); DB schema → migration applied through MCP AND committed as a file (#196); Storage → file uploaded; cron → re-installed. Work spanning both repos needs both deploys, or the final summary says plainly which half is not live.
- **Smoke gate** (`scripts/smoke-pipelines.ps1`, edge repo) after any `vfo-admin-api` deploy or any edit to shared routing / dispatch / webhook / auth / `utils/`. Hand it over as ONE line with the person's portal email and a literal `<password>` — never a token, never `Read-Host`:
  `& C:\vfo-edge-functions\scripts\smoke-pipelines.ps1 -Email "<the person's portal email>" -Passcode "<password>"`
  It must be run by a superadmin (TEAM table) — it stops at login otherwise — and every check must PASS. It is read-only and a wiring check only (each area and portal answers) — it proves nothing about money, emails or bells.

## 5. SAVE POINTS (TAGS)

- `backend-good-YYYY-MM-DD-v<Supabase version>` (edge repo) and `live-N-<short>` (react repo), on the merged `origin/main` commit, only AFTER the release is confirmed good. "Restore to <tag>" from the person outranks everything else.
- **`live-N` can clash** when both people ship the same day: `git fetch --tags` first, N = the highest `live-*` + 1 (`--sort=v:refname`; `sort -V` is not version-aware). If the push is refused because the tag already exists, the other person just took N — fetch again and use the next number. Never delete or move a tag someone else pushed. Backend tags cannot clash (the Supabase version is unique).
- **Rollback** — frontend: redeploy a `live-*` tag to gh-pages; backend: Supabase Dashboard version revert. A rollback undoes BOTH people's later work — agree with the other person first.
- PRs merge with **Squash and merge** — one change = one commit on `main`.

## 6. HOW WE WORK

- Preserve existing behaviour unless approved. Never silently remove logic — flag suspected dead code and ask.
- Small phases. Explain risks BEFORE changing anything; flag uncertainty; disclose any change of scope.
- **A non-trivial task:** your understanding, the affected files (verified, not guessed), the risks, a phased plan with checkpoints, how it will be tested, how it rolls back — then wait for approval. **A trivial one** (1-2 files, no auth / dispatch / money): do it and report.
- **Build the headline, not the prelude.** A plan's early phases are sequencing, not stopping points: say which phase delivers the visible feature, carry through to it, and show the result early (2026-10-17).
- **Never guess a missing value.** When details are missing (amounts, risk levels, splits, which track, which client), list every unknown and wait. Never default a value onto a real client record.
- **Ask before assuming scope** — one question, and only for a genuine fork, never for something the code can settle.
- **The person tests; Claude never declares it done.** After every phase that changes what users see or do: build, (re)start the dev server, hand over a numbered click-through script (exact URL, what to click, what to see) and wait for "passed". No commit and no deploy before that.
- **No half checks.** Exercise every branch — happy, failure, pending, idempotent re-fire — before calling anything done: the DB rows at each step, the Stripe / Gmail / BoldSign object actually exists, a re-fire skips, the failure path lands its error state. "The sweep will catch it eventually" is not a test.
- **Docs are maps, not gospel.** Read the doc the hub's DOC MAP names before touching an area, verify it against the code, and fix a doc found wrong in the same PR. Doc commits are separate from code commits.
- Default to no code comments — only for a non-obvious WHY. There are no automated tests: smoke + click-through.
- **Offer a handoff, never a wrap-up,** when a chat runs long or the next piece of work is a different shape (`/handoff`).

## 7. TALKING TO THE PERSON

- Short and scannable: tables and bullets over paragraphs.
- **While the person is testing:** a bare numbered list, one action + the expected result per step; caveats in one line at the end.
- **Setup the person does in a dashboard** (Stripe, Supabase, GitHub, sign-ins, secrets): ONE step per message, then wait for "done".
- One terminal command per block when walking through ops. A command the person runs goes in a block tagged with the shell it is written for — `powershell` for PowerShell syntax (`&`, `$env:`), never `bash`: the app's Run button uses the tag.

## 8. DATA, SQL AND MONEY

- **Run SQL yourself through the Supabase MCP** (`execute_sql`; `apply_migration` for DDL, which is asked first — §1). Never "here is the SQL, paste it in the dashboard". There is one project and it is production (`ejpsprsmhpufwogbmxjv`).
- **Before deleting a real client,** search `clients` by last name AND email. More than one row = show them all (ref, member, plan, planner, files) and ask which; say which one holds the real work. Never trust a ref alone (2026-10-12, Ameya Kabre).
- **A test client seeded into a program** needs its `clients` row AND its `client_enrollments` row — the program lists read the join table.
- **Resetting the tax test client:** DELETE its `client_tax_progress` rows, then `client_tax_specialists`, then `client_tax_plans` — never NULL fields one by one (stale booked-ROI columns fake failures). MAP 1: DELETE the `pipeline_map1` row (`UNIQUE(client_id)`) and clear its `client_progress` C-tasks. Mark only THAT client's unread bells read, never anyone else's. Then log out and back in — the `api.js` cache survives a hard refresh.
- **Every NEW payment kind makes the house pair:** a numbered invoice + receipt (`allocateDocNumber` INV- / REC-), rendered to PDF, uploaded to the client's Drive folder and attached to the confirmation email (precedent `actions/tax/invoice-receipt.ts`). A tax engagement's LATER payments are receipt-only; an amended fee gets the REVISED invoice on the original number. Never trade the pair for a Stripe link.
- **Every email subject ends " - <full name of the person the email is for>"** — the share's receiver on a revenue share, the specialist on their invoice, the client on client emails even when the member pays — filled by `withSubjectName` (`utils/subject-name.ts`); deploy the code before changing the template row (#679).

## 9. LOOK AND FEEL — THE HOUSE STYLE

- **Use the house style whenever you can.** Before building a new page, card, list, form or email page, find the closest existing one and copy its layout, components and styling; a screen that matches an already-approved one copies it exactly. Never invent a new look.
- **The look is the portal's:** navy `#002973`, blue `#125ecc`, sky `#0a85e8`, green `#1b9254`, muted `#5b6b8c`, page `#f4f7fd`, border `#e3eaf5`; white rounded cards with soft shadows; navy-to-blue gradient strips; Inter; the shared kits (`shared/TrackKit`, `admin/automation/StepKit`). Old-system screenshots tell you the data and the steps, never the look.
- **A trim changes only the named thing.** "Remove the wording" = the paragraph; the card (`sectionStyle`) and its uppercase heading (`cardTitle`) stay.
- **Phone layouts** follow the rules in [architecture/02-frontend-shell.md](architecture/02-frontend-shell.md) *Phone layouts*. The desktop stays byte-identical — check 1280 wide after every phone change (the browser pane's own "desktop" is a phone, #687). Look at EVERY screen, sub-tab, list row and opened state at 390 and 360 wide; run `phoneAudit` and read every finding; never call a screen fine because nothing overflowed. Phone testing is zero-setup for the person: hand over the `Phone preview` link the dev server prints, beside the dev URL.
- **A burst of edits to one file** (or "Could not Fast Refresh" in the vite log) → restart the dev server (`npm run dev -- --force`) before handing over: Vite can keep serving a stale module that looks exactly like a broken change.

## 10. TOOLS AND TRAPS

- **Docs are UTF-8 full of em-dashes and arrows:** edit them with the Edit tool. PowerShell 5.1's `Get-Content` / `Set-Content` / `Add-Content` / `Out-File` corrupt them; if PowerShell is unavoidable, use `[IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)` and `WriteAllText` with `New-Object Text.UTF8Encoding $false`.
- **`npm run deploy` printing "Published" proves only the gh-pages push.** Check that https://vfoportal.com/ serves the new `index-*.js` AND that the latest run at `https://api.github.com/repos/JLathamERT/vfo-portal/actions/runs?per_page=1` succeeded; tag only once live matches. A failed Pages run never retries (re-trigger with an empty commit on gh-pages — ask first).
- **Dev servers:** `scripts/dev-servers.ps1` (vfo-react) lists them; `-Stop <port>` stops one with its whole process tree — stopping `npm` alone leaves vite running, which is how they piled up. At chat start: list them, tell the person about any left over (port + start time) and give the stop command — never stop a server this chat did not start. At handoff and wrap-up: stop this chat's own port and list again to confirm it is gone.
- Tools: `deno` (else `$env:USERPROFILE\.deno\bin\deno.exe`), the `supabase` CLI, Docker Desktop, Node. Bash may be missing from PowerShell's PATH; `sort -V` is not version-aware.

## 11. NAMES AND FACTS

- `aanderson@elitert.com` is **Anton**, not Anna.
- **Tax Plan IQ** is a partner company — never a test fixture and never a program name. The two tax programs are **Holistic Tax Priorities** (program 1) and **VFO Tax Planning** (program 4).
- The client-facing facilitator role: **PF** (MAP 1, Tax, Partnership Fast Track), **MSM** (advisor + accountant onboarding), **VFOL** (specialist onboarding). Never "PF" in specialist-facing text.
- **Tier 1 / 2 / 3 = member portal ACCESS.** Emails and screens for a VFO Associate or a Financial Collaborator are named by the TYPE, never "Tier 1".
- **Two separate allowlists, never collapse them:** `TAX_VIEWERS` (`constants/tax-access.ts`) and `isErtManager` (`constants/ert-access.ts`) — widening one must not widen the other. Read the code for who is on them.
- **Fixtures — check the DB first, ids change:** Test Member **59524** (force-flipped to sandbox, hub STANDING); its Test Client is ref **59524-001** (client 62 was deleted 2026-10-29). Clients 82 (Mark Henneberger) and 86 (Doug Duncan) are out-of-group targets for tax-planner fence tests; Dave Clarenbach is client **156**, not 86. Tax-planner test logins `test@taxplanner.com` and `test@teammember.com` (Test Group) — their passwords are in Bitwarden.
