# Single client profile — plan (read-only, 2026-10-16)

**Status: PLAN ONLY — nothing built.** Written 2026-10-16 in the portal licensing L4 chat (branch `docs/single-client-profile-plan`, react only) at Jake's request. Code-verified the same day (a full link census + `ClientDetail.jsx` read). Decisions Jake still owes are listed at the end.

## 1. The problem (Jake, 2026-10-16)

*"Each client kind of has a profile for each program. I wish they had 1 profile and everything branched off that 1 profile."* The live example: on the new Client Overview **CIQ** pill, clicking a client's NAME opens their **MAP 1** profile, because MAP 1 / Holistic is what the page falls back to. He wants everyone (admins, members, planners) to see a client as one profile.

## 2. How it works today

**Data — already ONE profile.** A client is one `clients` row. Programs attach through `clients.enrollment_id` plus the many-to-many `client_enrollments` (each row → a `member_enrollments` row → its `program_id`). Live census 2026-10-16: 255 clients — **222 in one program, 10 in two, 23 in none** (Unassigned). Programs: 1 VFO Holistic Planning, 2 Partnership Fast Track, 4 VFO Tax Planning (3 / 5 are coaching programs and hold no clients). **Nothing in the database needs to change.**

**The screen — one program at a time.** `src/pages/ClientDetail.jsx` (routes `/admin/client/:id`, `/member/client/:id`, `/tax-planner/client/:id`, all via `KeyedClientDetail`) opens a client *inside* exactly one program:
- It sends `program_id` (from `?program=`) / `enrollment_id` (from navigation state) to `msm_load_client_home`, whose `resolveProgram` (`actions/msm/load-client-home.ts:40-83`) picks: the explicit enrollment → the enrollment with that program → `clients.enrollment_id` → the first `client_enrollments` row. **So with no `?program=` the page shows whatever program the client was first linked to** — usually Holistic, hence "MAP 1 is the default".
- The header shows that one `program.name`; the tab strip is built from it (`validTabsForProgram`, `:208-220`): Holistic → MAP 1 / Regular / Tax / PIP; Tax Planning → Tax; PFT → PFT; none → Profile only. **There is no program switcher on the page** — the only ways to see a client's OTHER program are the per-program chips on Member Overview, a Client Overview row, or editing `?program=` by hand.
- Every program tab is fed the one `programId`: `ClientTrackViewV2` / `PFTEngagementTrack` (`msm_load_client_track`), `PipMeetingsTab`, `RegularPrioritiesTab`, and **`TaxPrioritiesTab` filters plans to that program** (`plansForProgram`, `(p.program_id||1) === (programId||1)`) — a Tax Planning plan is hidden when the page is in Holistic, and vice versa.
- After loading, the page rewrites the URL to `?program=&tab=` with `history.replaceState(null, …)` (`:228-239`); a tab not valid for the resolved program falls back to Profile.

## 3. What goes wrong because of it (the census, 2026-10-16)

The page's identity is "client + program", but most links into it name only a tab:

| Problem | Where |
|---|---|
| **`tab=map1` links with no program** — land on Profile when the client's default program is not Holistic | 19 backend bell links + `AutomationPanel.jsx:566` |
| **`tab=pft` links with no `program=2`** — same | `pft/sweep.ts:76,122,168`, `pft/ft-response.ts:93`, `pft/discovery.ts:47` |
| **`tab=tax` links with no program** — open the default program, so a Tax Planning plan is filtered out | 7 backend (`agreements/declined.ts:86`, `pipeline/contract-check-reminder-sweep.ts:105`, `tax/implementation-receipt.ts:378`, `router/webhooks.ts:2789,2798,2834,2843`) + `TaxAutomationPanel.jsx:444`, `TaxPlannersPanel.jsx:703` |
| `tab=automation` is not a client tab — always lands on Profile | `pipeline/contract-send-agreement.ts:376` |
| Planner client list carries no `tab` / `plan` | `tax-planner/PlannerClientsList.jsx:213` |
| Member links from Tax Diagnostics carry no `program=4` | `admin/TaxDiagnosticsPanel.jsx:248,677` |
| `program=null` possible — 24 links append `&program=${plan.program_id}` unconditionally; the page then falls back to the default | backend tax links |
| `replaceState(null, …)` wipes router history state (`from`, `backTo`, `enrollment_id`) — after a reload Back loses its way | `ClientDetail.jsx:238` |
| A planner's deep link is lost on login (no `?next=`) | `ClientDetail.jsx:148` |
| Dead / ignored: `state.program_id` (never set by anyone), `?track=` (only Regular reads it), `ClientNameLink` drops `plan` | — |

Link census: backend **94** `/admin/client/` literals in 53 files + the builders `taxMemberLinks` (24 call sites), `notifyAllocatedPlanner` (~21), `insertTaxNotifications` (23), `resolve-stripe-failure.ts adminLink`, `vault/request-upload-notify.ts linkFor`, the Client Overview link objects; frontend **25** navigations in 16 files (shared `personLinks.jsx clientPagePath` / `ClientNameLink` + raw builders). Only ONE email button links to a client page (`client-portal/request-introduction.ts:104`); everything else is bells + in-app links.

## 4. The target — one profile, programs branch off it

One client page per client. Its header names the client and lists **every** program they are in. The tabs are **the profile's tabs plus each program's tabs, grouped by program**, so nothing depends on which program the page was "opened in":

```
Test Client   ·  VFO Holistic Planning  ·  VFO Tax Planning
Profile ▾ | Holistic: MAP 1 · Regular · PIP · Tax | Tax Planning: Tax | CIQ
```

- **A tab knows its own program.** MAP 1 / Regular / PIP → the Holistic enrollment; PFT → the PFT enrollment; Tax → *both* tax programs' plans together (each with its program pill, as Client Overview's Tax Planning pill already shows them). `?program=` stops being the page's identity and becomes, at most, a hint.
- **Old links keep working, and the broken ones fix themselves:** `?tab=map1` with no program opens MAP 1 because MAP 1 IS Holistic; `?tab=tax&plan=<id>` opens that plan whichever program it belongs to; `?tab=pft` opens PFT. Every link in §3's table becomes correct without editing it.
- A client in no program: Profile + CIQ only (as today).
- Members, mirrored members and planners get the same shape with their existing limits (planners: Profile + Vault + Tax; mirrored: no PFT, view-only).
- **Optional:** a **CIQ** tab on the profile (the client's CIQs + the read-only One Page Plan), so the CIQ pill's NAME click and the profile agree.

## 5. Phases (each behind ONE Feature Switch, `single_client_profile`, per the licensing plan's switch rule)

0. **Link hygiene (no switch — each is a plain bug fix, worth doing even if the rest never ships):** give the 7 + 2 programless tax links their program and plan; `tab=pft` links `program=2`; `tab=map1` links `program=1`; `tab=automation` → the right tab; the planner list's `tab=tax&plan=`; Tax Diagnostics' member `program=4`; never emit `program=null`; `replaceState` keeps `window.history.state`; the planner login `?next=`. Gates: `deno check`, build, smoke 5/5.
1. **Backend, additive:** `msm_load_client_home` also returns `programs: [{ program_id, name, enrollment_id }]` for every program the client is in (same owner / admin / planner / mirror fences — `mirrorReadGate` unchanged), and the switch state for the client's member. Off = no new key.
2. **Frontend, behind the switch:** `ClientDetail.jsx` builds the grouped tab strip from `programs`; each program tab is mounted with ITS enrollment's program id; the Tax tab gets a "both programs" mode (`plansForProgram` bypassed only while the switch is on); the header lists every program; `?tab=` resolves the program from the tab (+ the plan's own `program_id` for `plan=`). PF lock, Direct mode, mirror, planner and the no-program case each keep their current rule per tab. Back-navigation keys (`pftReturnEnrolledTab`, `memberReturnEnrolledTab`, `adminTaxPlannerReturn`, Client Overview's pill key) re-tested.
3. **Rollout:** Test member only → Jake's click-through on the 10 two-program clients + one of each single program + an Unassigned client, every role → On for all.
4. **Cleanup** once On for all has run a while: retire the dead `state.program_id`, collapse `?program=` handling, update `architecture/02-frontend-shell.md`.

## 6. Size and risk

- **No data migration and no money path is touched** — this is a screen change plus one additive loader key.
- **Medium risk, all in one file family:** `ClientDetail.jsx` carries seven modes (admin / member / mirror / planner / Direct / PF-locked / no-program), and `TaxPrioritiesTab.jsx` is the largest tab. The traps: a tab mounted with the wrong program id loads the wrong track (a silent wrong screen, not an error); the Tax tab's program filter is load-bearing for which plan a bell opens; cache / snapshot keys include the program (#579).
- **Effort:** Phase 0 ≈ one short chat; Phases 1-2 ≈ one to two chats; Phase 3 is click-testing.
- **Rollback:** switch off = today's page exactly; Phase 0 fixes are independent and stay.

## 7. Decisions

**Answered by Jake, 2026-10-16:**
- **1 = grouped tabs on one strip** (not a header program dropdown).
- **4 = yes**, planners get the same single profile with their current limits.
- **5 = yes**, Phase 0 (the link fixes) ships first, on its own.
- **2 = a separate Tax tab per program.** Holistic tax (MAP 1 → Regular and/or Tax) and straight VFO Tax Planning are two separate journeys, even though their steps are alike. Under the grouped strip, Holistic's Tax Priorities shows only program-1 plans and Tax Planning's shows only program-4 plans, so `plansForProgram` stays as it is (the "both programs" mode in §5 Phase 2 is dropped). The strip, for a client in both programs: `[Profile ▾] │ HOLISTIC MAP 1 · Regular Priorities · Tax Priorities · PIP Meetings │ TAX PLANNING Tax Priorities`. One program = today's strip. No program = Profile ▾ only.
- **3 = CIQ opens INSIDE the client profile** from the Profile ▾ dropdown, in the same place it is today, instead of jumping to the member's CIQ page. It shows that client's CIQ list (the two-level CIQ page's level 2), then the CIQ. The client's owner and admins can edit as today. A mirrored member sees the read-only One Page Plan only (CIQ writes stay owner-only, #601). It is the existing `MemberCIQ` component mounted for the client's member and locked to that one client — no new CIQ handler.

**The original questions:**

1. **Tab layout:** grouped tabs on one strip (§4, recommended) — or a program switcher (a dropdown in the header that swaps the tab set — smaller change, but still "one program at a time").
2. **Tax tab:** show both tax programs' plans together with a program pill (recommended), or one Tax tab per program.
3. **A CIQ tab on the profile** (the CIQs + read-only One Page Plan) — yes / no.
4. **Planners** get the same single profile (Profile + Vault + Tax, unchanged limits) — yes / no.
5. **Phase 0 first, on its own** (the link fixes are useful regardless) — yes / no.
