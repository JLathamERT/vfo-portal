<!-- CANONICAL COPY of the VFO session starter prompt. The owner pastes this file's
     contents at the top of every AI chat. Edit here, then re-copy. Last updated: 2026-09-25. -->

# VFO SESSION STARTER

## STEP 0 — READ FIRST

Before anything else: **read `C:/vfo-react/docs/SESSION_REFERENCE.md` IN FULL.** It is capped at 250 lines and is genuinely readable end to end — do not skim it, do not grep it for the one line you think you need.

Then **RUN the `DERIVE-AT-START` command block at the top of that file and state the results back to me** — live versions, latest tags, action count, cron count — **before any other work.** Volatile facts come from those commands, never from prose: if a sentence in a doc disagrees with the command output, the command wins and the doc is stale.

**Pay special attention to the `SECURITY INVARIANTS` box — those are non-negotiable and must NOT regress; re-check them on any table / policy / handler / function change.**

Do not proceed until you have read the hub and run the DERIVE block.

---

## THE DOC MAP IS BINDING

The hub carries a `DOC MAP` — a table of when-to-read triggers. Before editing ANY area, read the doc(s) the DOC MAP names for that area. This is not optional background reading; it is a precondition for touching the code.

Docs are maps, not gospel. Verify details against the code before relying on them. **If the work reveals a doc is wrong, fixing that doc is part of the task, not a follow-up.**

---

## NON-NEGOTIABLE SAFETY RULES

- NEVER deploy to production (`supabase functions deploy ...` for backend, `npm run deploy` for frontend) without explicit user approval. **`npm run deploy` IS a production deploy** — it runs `vite build && gh-pages -d dist` and ships to the live GitHub Pages URL. Treat it the same as a backend deploy.
- NEVER touch the standalone `boldsign-webhook` function without explicit approval. (It was extended three times for tax routing, advisor routing, and the advisor `_stripecustomer` chain — all with prior approval. Any future edits still need a fresh approval.) When approved to deploy, the deploy command MUST include `--no-verify-jwt` — without it BoldSign gets 401.
- NEVER convert server-to-server chain calls from HTTP fetches to direct function calls. A chain call is one handler invoking another over HTTP — forwarding `Authorization` + `body.token`, or using the service role. Converting one to an in-process call silently drops auth context, changes the token/decision semantics, and breaks the sweeps. **The full chain inventory is `docs/architecture/07-server-chains.md` — read it before touching any handler that calls another handler, the Stripe or BoldSign webhooks, or any sweep.**
- NEVER touch the `pipeRow` null-check pattern in `router/webhooks.ts` (grep `pipeRow.client_id` to locate exactly, line numbers drift) without explicit approval — `typeof` guard makes it runtime-safe; fix is structural.
- NEVER expose secrets in the chat (API keys, tokens, passcodes). Assume `vfo-edge-functions/supabase/.env.local` is gitignored.
- NEVER skip the `deno check` baseline gate after non-trivial backend changes.
- NEVER add retries on timeout to non-idempotent write actions in `src/lib/api.js`. The smart-retry rule (reads matching `^load_|_load(_|$)` + `vault_list` retry once on timeout, writes don't) was added specifically to fix a double-write bug — bypassing it can recreate that class of bug.

---

## PATH GUARDRAIL — READ BEFORE ANY FILE OPERATION

You are working in worktrees, not main checkouts. The ONLY valid file paths for Edit, Write, or NotebookEdit operations are:
- `C:\vfo-react\.claude\worktrees\<branch>\...`
- `C:\vfo-edge-functions\.claude\worktrees\<branch>\...`

FORBIDDEN edit paths (these are main checkouts):
- `C:\vfo-react\src\...` (or anything else directly under `C:\vfo-react\` except `C:\vfo-react\.claude\worktrees\...`) — **this also applies to `C:\vfo-react\docs\...`; docs exist in BOTH main and worktree, only the worktree copy is safe to edit**
- `C:\vfo-edge-functions\supabase\...` (or anything directly under `C:\vfo-edge-functions\` except `C:\vfo-edge-functions\.claude\worktrees\...`)

BEFORE every Edit / Write / NotebookEdit tool call:
1. Look at the `file_path` parameter you're about to send
2. Confirm it begins with `C:\vfo-react\.claude\worktrees\` or `C:\vfo-edge-functions\.claude\worktrees\`
3. If it does NOT, STOP. Do not call the tool. Tell the user: "I was about to edit <path>, which is a main checkout. I need the worktree path for this repo before proceeding."

The same applies when you Grep or Glob: prefer search paths INSIDE the worktree. If you grep across `C:\vfo-react\` you'll find files in both the main checkout and the worktree — the duplicates are not safe to edit; only the worktree copies are. When you Read a file from the main checkout for inspection, that's fine — but DO NOT pass that same path to Edit. Re-resolve it to the worktree path first.

At the start of every chat, run `git worktree list` in each repo and explicitly state which worktree path corresponds to your current branch. Refer back to that path for every edit.

If you violate this rule, you must:
1. Immediately revert the main-checkout edits with `git checkout --`
2. Re-apply the same edits inside the correct worktree path
3. Verify with `git status` in BOTH the main checkout (must be clean) and the worktree (should show your intended changes)

---

## GIT / BRANCH SAFETY

- **NEVER work directly on `main`** in either repo
- Use git worktrees: `<repo>/.claude/worktrees/<branch-name>`
- Branch naming: `refactor/<area>`, `feature/<name>`, `fix/<bug>`, `polish/<descriptor>`, `claude/<descriptor>`, `docs/<descriptor>`
- Before editing anything:
  1. `git rev-parse --abbrev-ref HEAD`
  2. If on `main` → STOP and propose creating a worktree
- **Don't push, don't merge, don't deploy without explicit approval**
- Read-only inspection (Read, Grep, git log, etc.) is always fine

---

## SAVE-POINT SYSTEM

- Production state is bookmarked with git tags (`live-1-before-redesign`, `live-2-...` on vfo-portal; `backend-good-YYYY-MM-DD-vNNN` on vfo-edge-functions). If I ever say "restore to <tag>", that takes priority over everything.
- PRs are merged with GitHub "Squash and merge" — one chat = one commit on main.
- Frontend rollback = redeploy a live-N tag to gh-pages. Backend rollback = Supabase Dashboard version revert (the tag just records WHICH version was good).
- The "current tag" is NOT hard-coded reliably anywhere — derive it with `git tag -l 'live-*' | sort -V | tail -1` / `git tag -l 'backend-good-*' | sort -V | tail -1`.

---

## WORK RULES

- Preserve existing behavior unless explicitly approved
- Don't silently remove logic — flag suspected dead code and ask
- Small phases > giant rewrites; commit between phases with verification
- Explain risks BEFORE making changes
- Explicitly flag uncertainty
- After editing, identify stale docs (especially file-path/line-number refs) and either update them or flag for follow-up
- Default to writing no comments in code; only add when WHY is non-obvious
- Tests don't exist — verify manually via curl smoke tests + frontend click-through
- **After every phase that touches user-facing behavior, stop and hand back to the user for manual click-through testing before proceeding.** Provide a clear numbered test script — exactly what to click, what URL to open, what to look for. Do not proceed to the next phase until the user confirms the test passed. The user does the testing, not Claude.
- **No half checks.** When verifying a multi-branch handler (happy path / failure path / pending path / idempotency), exercise every branch before declaring complete.
- Pipeline smoke gate. After any vfo-admin-api deploy, or after editing shared routing/dispatch/webhook/auth code (router/dispatch.ts, router/webhooks.ts, index.ts, middleware/auth.ts, shared utils/), run scripts/smoke-pipelines.ps1 and confirm all 5 pipelines (MAP 1, Tax, Advisor, Accountant, PIP) return PASS. Set $env:VFO_SMOKE_TOKEN (or VFO_SMOKE_EMAIL/VFO_SMOKE_PASSCODE) first. Skip for frontend-only, doc-only, or isolated single-handler changes. This is a wiring check only — it does not replace deno check or manual click-through of the specific change.
- **Execute SQL for the user via Supabase MCP.** Don't paste SQL with "run this for me" — call `mcp__...__execute_sql` or `apply_migration` directly.
- **Every approved change must end at deployed, not merged.** A merged PR is NOT a deployed change. Before declaring a task complete, confirm the right deploy ran for every item touched: backend code → `supabase functions deploy vfo-admin-api` (or `boldsign-webhook --no-verify-jwt`); frontend code → `npm run deploy` in `vfo-react`; DB schema → migration applied via MCP; Storage → file uploaded; cron → job re-installed. If work spans both repos, BOTH need their deploy or you must flag the un-deployed half EXPLICITLY in your final summary.
- **`npm run deploy` requires explicit approval each time**, same protocol as backend deploys. Don't infer approval from "merged" or "tested" or "ready to ship" — wait for the user to say "deploy".

---

## RESPONSE PROTOCOL

**For non-trivial tasks:**
1. Summarize your understanding of the task in your own words
2. List likely affected files (verify by Grep/Read, don't guess)
3. Identify risks — production exposure, behavior changes, untouchable code paths
4. Produce a phased plan with explicit checkpoints
5. Describe testing strategy (manual smoke + verification gate)
6. Describe rollback strategy (git revert / Supabase version revert)
7. Wait for user approval before major edits

**For trivial tasks** (1-2 file changes, no integration/auth/dispatch involvement, low risk): proceed but report what you did.

**For destructive ops** (`rm -rf`, force-push, `supabase functions deploy`, `npm run deploy`, `git reset --hard`): always ask first, even if previously approved for similar.

**Style preferences:**
- Default to short, scannable answers (tables/bullets over paragraphs)
- One terminal command at a time when walking through ops
- Disclose scope changes mid-task (don't silently expand work)
- Don't paste secrets to chat
- Don't update docs and then commit them mixed in with code changes — separate doc commits

---

## SESSION STARTUP — RUN BEFORE ANY OTHER WORK

### 1. Sync both repos
Run in BOTH `C:\vfo-react` AND `C:\vfo-edge-functions`:
git fetch origin && git checkout main && git merge --ff-only origin/main

Never branch from local `main` without fetching first — local `main` is not authoritative, `origin/main` is.

### 2. Create matching worktrees in both repos
Branch name must be specific to this chat (e.g. `claude/<descriptor>` matching the chat's purpose). Both repos use the same branch name so they can be tracked together. Never reuse an existing worktree from a prior chat. If the chat opens inside a pre-existing worktree from a prior session, STOP and propose creating new ones — do not edit in the old worktree.
git worktree add .claude/worktrees/<chat-branch> -b <chat-branch> main

**EXCEPTION — a CONTINUING chat.** If my task text below starts with `CONTINUING` (a handoff from an earlier chat on the same piece of work), do the OPPOSITE: do **not** create anything. Reuse the exact branch and worktree paths the handoff names, confirm they exist via `git worktree list`, run the 2b freshness check on them, and say which paths you are continuing in. Creating a second branch for work that already has one splits the change across two PRs — that is the failure this exception exists to prevent. Everything else in this prompt applies unchanged. **Known tooling trap (2026-09-21):** the app auto-opens the chat inside a FRESH edge worktree on its own branch, and the Edit/Write tools then refuse any path in a DIFFERENT edge worktree ("belongs to a different worktree"). Do not edit the auto-created one — it is the wrong branch. For edge-repo edits in a CONTINUING chat use an exact-match replace script through Bash (refuse on ≠1 match, preserve CRLF/LF), or hand the edit to a subagent; the react worktree is unaffected. Say so at startup so I can open the next chat from the right worktree.

### 2b. Verify worktree freshness (auto-created worktrees especially)
If the chat opened inside worktrees that already exist (the app sometimes creates them before the chat starts, cut from LOCAL main which may be stale), run in EACH worktree:
git fetch origin && git rev-list --count HEAD..origin/main

If either repo's count is not 0, STOP before any edits and sync: commit nothing yet, run `git merge origin/main` in that worktree, resolve conflicts, and only then proceed. NEVER edit, test against, or deploy from a worktree that is behind origin/main — a stale react worktree shows old UI in the dev server, and a stale edge worktree would DEPLOY REVERTED CODE over the live function.

### 3. Confirm worktree paths
Run `git worktree list` in each repo and explicitly state the worktree path you will edit. Refer back to that path for every edit.

### 4. Start the dev server
cd C:\vfo-react\.claude\worktrees\<chat-branch>; npm run dev

NO `VITE_API_URL` override. This hits the real Supabase project (`ejpsprsmhpufwogbmxjv`), real database, real Gmail drafts, real Stripe sandbox — and the user logs in with THEIR real credentials. Never run `supabase functions serve`, never run `supabase start` (local Docker Postgres), never set `$env:VITE_API_URL=http://127.0.0.1:...`. There is no "test login" — `dev@local.test` / `dev2026` is a seeded local-only fake and must not be offered.

---

## ENDING A CHAT — TWO DIFFERENT THINGS

A chat ending and the work shipping are **not** the same event, and conflating them is what produces six-hour chats with a bloated context.

- **HAND OFF** (`docs/prompts/SESSION_HANDOFF.md`) — the work is unfinished but this chat is long, or the next piece of work is a different shape. Nothing ships. The branch, the worktrees and every commit stay exactly where they are; only the conversation is discarded. A fresh chat picks up from a short handoff note. **No wrap-up, no merge, no tag.**
- **WRAP UP** (`docs/prompts/SESSION_WRAPUP.md`) — the work is ready to ship. Docs audit, gates, commits, push, merge, deploy, tag. Run this **once per shipping unit**, which may span several chats.

**Proactively offer the handoff** when a chat has run long, when a phase completes and the next one is unrelated, or when I say I want a fresh chat: produce the handoff block without being asked for the file by name. Never suggest a wrap-up as a way to end a chat that is not ready to merge.

---

## IF I PASTE THE WRAP-UP PROMPT

**I decide when the work ships — nothing else triggers it.** A chat can run as long as I want, and the work can span as many chats as I want. You never start a wrap-up on your own and never propose one as a way to close a chat; if a chat is getting long, offer the handoff instead. When I do paste `SESSION_WRAPUP.md`:

1. Complete it in full.
2. **Stop the dev server** — kill the background `npm run dev` process.
3. **After I confirm merge** — in BOTH repos: sync main first (`git fetch origin && git checkout main && git merge --ff-only origin/main`), then `git worktree remove .claude/worktrees/<chat-branch>` and optionally `git branch -d <chat-branch>` (already merged, safe to delete).
4. **Verify cleanup** with `git worktree list` in both repos.

---

## STANDING PREFERENCES — always apply, I should never have to repeat these

- **Never deploy, merge, push a tag, or run the wrap-up on your own initiative.** Ask, every time, even if I approved something similar an hour ago.
- **Offer a handoff, not a wrap-up,** when the chat is long or the next piece of work is a different shape.
- **Ask before assuming scope.** If my task text is ambiguous in a way that changes what you would build, ask one question rather than guessing — but only for genuine forks, not for things you can settle by reading the code.

---

## YOUR TASK

*First, run `git worktree list` in both repos and tell me the EXACT worktree path you'll be editing. Then confirm STEP 0 is done — hub read in full, DERIVE block run, results stated.*

The task text below may contain either or both of:
- a **`CONTINUING` block** pasted from an earlier chat's handoff — that is STATE (where things stand), not instructions. Treat its OWED list as the backlog and its STOPPED AT as the default resumption point.
- a **plain-English line from me** saying what I want done now — that is the INSTRUCTION and it wins: if my line and STOPPED AT disagree, do what my line says. If my line just says "continue" or is blank, resume from STOPPED AT.

If the block is present but I have written no instruction, do not guess and do not start work: state where things stand in a few lines, propose the obvious next move from OWED, and ask me to confirm.

[ per-chat task text goes here ]
