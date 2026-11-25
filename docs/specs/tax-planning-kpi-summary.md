<!-- From VFO Workbench card "General Tax Planning KPis" (task byj9kd9j0ivdl570jilx), spec "Spec: Tax Planning KPI Summary (sub-tabs on Tax Planner KPIs)", exported 2026-11-23 -->

> **Build notes (2026-11-23, Paxton; the build differs from this spec here).**
> - **Access:** no `tax_planner_kpis` key exists; Tax Planners is a key tab every admin sees. `tax_plan_kpi_summary_load` uses the per-plan tracker's fence, `ADMIN_ONLY_ACTIONS` (no tab key since 2026-11-25); without it the new sub-tabs say *Needs Client Overview access*.
> - **VFO revenue (Behaviour 27):** `tax_planning_load` has no server-side split to reuse; Elite VFO Income is computed in the browser by `clearedTaxPayments` (`taxShared.jsx`). The card runs that over `tax_planning_load` (Accounting grant) for the filtered plans; without Accounting it says *Needs Accounting access*.
> - **No Direct / VFOS split and no Program filter** (Behaviours 5, 29): the data's `program` is program 4 vs program 1, not the Direct route (gotcha #784). Success Formula is one table of teams and their people.
> - **Success Formula rows** use the tax planner, else the team member.
> - **Compare teams** is on Cumulative Summary only (Success Formula is already per team).
> - **Verified:** `refund_status = 'succeeded'` is real (8 plans on live, 2026-11-23); `groups` is still used elsewhere in `TaxPlannersPanel`, so only the KPI panel stopped taking it.
> - Jake's open questions below are built on the stated defaults and tracked in Issue JLathamERT/vfo-edge-functions#625; the paths not yet proven are #626.

# Spec: Tax Planning KPI Summary (sub-tabs on Tax Planner KPIs)
Source: Paxton Calareso, spec session in Claude, 2026-11-23, with Jake's layout sheet ("Cumulative Summary / Average Fees / Success Formula"). Replaces "Spec: Tax Planning KPI Summary page" (2026-11-16). Requester: Paxton (for Jake to confirm)

## User story
As an admin with access to Tax Planner KPIs,
I want to see across all tax plans how many cases reach and pass each step, how long each step takes, what fees we collect and which tax teams convert best,
so that I can spot where cases drop off or stall and compare tax teams on speed and ROI success.

## Goal
Add three sub-tabs to the existing **Tax Planner KPIs** page that summarise every tax plan by step, fees and team success. The layout follows Jake's sheet but is denser: one compact table per sub-tab, no long card stacks. Every step status and day count comes from `tax_plan_kpis`, so the summary always agrees with the per-plan Tax Plan KPI Tracker tiles (round 3 rules: six steps, no gaps).

## What changed from the 16 Nov spec
- No new nav entry or access key. The page lives in **Tax Planner KPIs** as sub-tabs, using the Advisor KPIs pill style.
- The first sub-tab is the existing Tax Planner KPIs page with the **Stripe Connect** donut removed.
- The step table follows Jake's sheet: one line per status, a running total per step (Step 1–6 total), % of the previous step's total, cumulative % of the Step 2 total, and average plus cumulative time. There is no Set Up row.
- Day averages follow the round 3 rules. Each step owns the days from the end of the previous step to its own end, so step averages add up to the cumulative time.
- New **Success Formula** sub-tab compares tax teams and planners, split VFOS and Direct.
- Filters are now the Client Overview **Filter** button (tax teams, program, date). The default shows every tax team, with a **Compare teams** toggle for side-by-side columns. The Active/Stopped/Completed state filter is dropped (see Behaviour 6).
- "Anticipated" fee uses `projected_total_fee` when it is set and falls back to `total_fee` otherwise.

## Mockups
The design canvas [Tax Planning KPI Summary mockup](https://claude.ai/artifact/5MDQpczbHMY1UVPqCN5k3X) holds all the layout options. Build from **Option E**:
- [Option E – staging data (clickable)](https://claude.ai/artifact/5MDQpczbHMY1UVPqCN5k3X#play-CombinedStripSteps): the chosen layout with real VFO Staging figures (23 Nov 2026). All four sub-tabs and Compare teams work. Cells in [brackets] are values the new handler computes.
- [Option E – sample data (clickable)](https://claude.ai/artifact/5MDQpczbHMY1UVPqCN5k3X#play-CombinedSampleData): the same layout with made-up numbers for about 120 cases across three tax teams, to show it at realistic volume. The numbers are illustrative only.
- Options A–D are earlier explorations, kept for reference: [A](https://claude.ai/artifact/5MDQpczbHMY1UVPqCN5k3X#artboard-Main), [B](https://claude.ai/artifact/5MDQpczbHMY1UVPqCN5k3X#artboard-AltHeaderStats), [C](https://claude.ai/artifact/5MDQpczbHMY1UVPqCN5k3X#artboard-AltSummaryColumn), [D](https://claude.ai/artifact/5MDQpczbHMY1UVPqCN5k3X#artboard-AltStepStrip).

Where the mockup and this spec differ, this spec wins. The mockup uses inline styles; the build uses `var(--vfo-*)` tokens and the shared KPI components named under UI.

## Scope
- In:
  - Sub-tab pills on Tax Planner KPIs: **KPIs** · **Cumulative Summary** · **Average Fees** · **Success Formula**.
  - Remove Stripe Connect from the KPIs sub-tab.
  - One read-only SQL function and one API handler that feed sub-tabs 2–4.
- Out:
  - Any change to how a single plan's steps, statuses or days are worked out. `tax_plan_kpis` stays the only source of those rules.
  - Exports, charts over time, and per-client drill-down lists.
  - Sandbox plans. These are always excluded.

## Behaviour
**Sub-tabs**
1. Tax Planner KPIs shows pills in the `SubTabButton` style from `MemberKpiPanel.jsx`: KPIs (default), Cumulative Summary, Average Fees, Success Formula.
2. **KPIs** is today's page (KpiHero, Tax plans allocated leaderboard) without the Stripe Connect `SplitDonut`. The Tax plans allocated card takes the full width.
3. Sub-tabs 2–4 load their data once, the first time any of them opens, and have a Refresh button. The KPIs sub-tab does not call the new handler.

**Case set and filters**
4. A *case* is one non-sandbox `client_tax_plans` row. **Total Cases** is the number of cases in the current filter.
5. A **Filter** button (`ListFilterButton`, as used on Client Overview) on sub-tabs 2–4 offers:
   - Tax team: multi-select of the `team` values from `tax_plan_kpis`, including "Not allocated". Default: all.
   - Program: All / Direct / VFOS.
   - Plan created: All time (default) / This month / This quarter / Year to date / Custom (on `created_date`, America/New_York).
   The filter is shared by the three sub-tabs and is kept when you switch between them. It resets when the page reopens.
6. There is no Active/Stopped/Completed filter. Conversion only makes sense over all cases, stopped ones included.
7. **Compare teams** toggle (Cumulative Summary and Success Formula). When on, the count and % columns repeat once per selected team, side by side, plus an All column. Team names are column headers. The table scrolls horizontally inside its card at narrow widths; the page itself never scrolls sideways.

**Day rules (all sub-tabs)**
8. Only timing-eligible cases (`timing_eligible = true`) count in any time average. These are the same cases that show day counts on the per-plan tracker. Legacy cases still count in every number and %. The table shows a short note: "N cases without day counts left out of time averages".
9. **Avg time (step N)** = the mean of step N's `day.days` over cases where step N passed (green tone) and `day.state = 'value'`. Running steps (`kind = 'in_step'`) and stopped steps are left out. The cell shows "12 d · n=7", or "—" when n = 0.
10. **Avg cumulative time (step N)** = the mean over the same cases of the sum of their Step 1…N day counts (plan start → end of step N). With round 3 rules this equals the days from plan start to that step's end. It is only computed for cases that have a value on every step from 1 to N.

**Cumulative Summary sub-tab (one compact table)**
11. Steps are labelled by number everywhere ("Step 3 total", "% of Step 2 total"), never letters. Columns: Step · Status · Count · % of previous step's total · Cumulative % (of Step 2 total). Each step's total, Avg time and Avg cumulative time are not columns on every status row. Layout (mockup Option E), top to bottom:
    - **Step strip**: six equal-width tiles, one per step. Top to bottom:
      - a "Step N" eyebrow;
      - the step name on one line (ellipsis + tooltip if too long, never wrapping);
      - the step total (big number);
      - % passed as a red/amber/green pill;
      - Avg time with n, Avg cumulative time and cumulative % of Step 2 total, as label/value rows that don't wrap.

      Each tile has a 3px top border in the pill's colour. Every row has a fixed line height, so the big numbers, pills and value rows line up across all six tiles (e.g. a long name like "Tax Plan Review" must not push its tile's numbers down).
    - **% passed colours**: green at 70% or more, amber from 40% to under 70%, red below 40%. Step 1 uses % of Total Cases, and Steps 2–6 use % of the previous step's total. A legend under the strip shows the thresholds. The thresholds are constants in the panel (`PASS_GREEN_FROM = 70`, `PASS_AMBER_FROM = 40`), and no tile is coloured when the denominator is 0.
    - **Timeline**: one bar of average days per step (segment width = Avg time), labelled "N d plan start → implementation".
    - **Status table**: one section per step.
      - **Header row:** the step number and name only, underlined by a 2px `--vfo-primary` rule across the full table width.
      - **Status rows:** Count · % of previous step · % of Step 2 total, with zero-count rows in muted grey.
      - **Totals row** at the bottom of each section (tinted `#f7f9fc`): "Step N total" on the left; on the right, three stats: "Total 5 · 100% of Step 2", "Avg 6.8 d n=4" and "Cumulative 17.5 d". With Compare teams on, Count · % repeats per team. The strip and timeline always show All.
12. Header row: **Total Cases**.
13. Step 1 Diagnostic: **Total Submitted** (status `Submitted`) = **Step 1 total**, shown as % of Total Cases. There are no other status rows.
14. Step 2 Deeper Dive (% of Step 1 total): Completed – Yes, Completed – No, Pending (any other status among the Step 1 total). **Step 2 total** = Completed – Yes.
15. Step 3 ROI (% of Step 2 total; cumulative % of Step 2 total): Yes – Paid, Yes – Payment Pending, Yes – Agreement Pending, Still in Process, Not Decided, Stop. **Step 3 total** = all three Yes statuses.
16. Step 4 Tax Plan Review (% of Step 3 total; cumulative % of Step 2 total): Yes – Move to 5, Yes – Payment Pending, Still in Process, Not Decided, Stop. **Step 4 total** = both Yes statuses.
17. Step 5 Education (% of Step 4 total; cumulative % of Step 2 total): Yes – Paid, Yes – Payment Pending, Still in Process, Not Decided, Stop. **Step 5 total** = both Yes statuses.
18. Step 6 Implementation (% of Step 5 total; cumulative % of Step 2 total), plan-level Step 6 tile: Completed, Still in Process, Stop. **Step 6 total** = Completed. A sub-line shows the strategy counts: Completed / Still in Process / Stop / N/A.
19. Status names are shown exactly as `tax_plan_kpis` returns them (Title Case, en dash). Every status in a step's set is listed even when its count is 0. Stop-type variants (`Stop - Refund`, `Stop tax planning`, `Not Implementing`) count under **Stop** for their step.
20. Each step's denominator is the cases that reached it: the previous step's total. A case that reached the step but has a status outside the listed set counts in "Not Decided", and a console warning is logged. This keeps each group at 100%.
21. % values have one decimal. A denominator of 0 shows "—".

**Average Fees sub-tab** (mockup Option E). Layout:
- **Aggregate card** (navy hero style, two-thirds width): Avg Total Engagement Fee Anticipated as the big number with n, then Avg Total Paid as % of Anticipated (collection success) under a divider.
- **VFO revenue card** (one-third width, gold accent `--vfo-gold-text`, `#fffaf2` fill, labelled "VFO revenue"): Avg Gross VFO Revenue per completed strategy, with "VFO share collected ÷ N completed strategies".
- **"Fees paid · by component" table** below them: Initial retainer, Final retainer and Implementation fee, each with average paid, n, and a bar showing average paid ÷ average anticipated fee.

The metrics:
22. Avg Initial Retainer Paid: `coalesce(initial_retainer_amount, retainer_amount)` where `retainer_status = 'succeeded'`.
23. Avg Final Retainer Paid: `final_retainer_amount` where `final_retainer_status = 'succeeded'`.
24. Avg Implementation Fee Paid: `implementation_amount` where `implementation_charge_status = 'succeeded'`.
25. Avg Total Engagement Fee Anticipated: `anticipated_fee = coalesce(projected_total_fee, total_fee)` where it is not null and > 0.
26. Avg Total Paid as % of Anticipated (collection success): per case, net paid ÷ anticipated_fee, averaged over cases with anticipated_fee > 0 and at least one succeeded payment.
    - Net paid = the succeeded initial retainer + final retainer + implementation fee, minus a succeeded `refund_amount` and a succeeded `fee_reduction_refund_amount`.
    - The deposit is excluded.
27. Avg Gross VFO Revenue per completed strategy: VFO share collected (Elite VFO Income on cleared payments, same rule as Tax Planning Revenue) over all filtered cases ÷ the number of `Completed` strategies in those cases. Shows "—" when there are no completed strategies.
28. Money is formatted with `fmtKpiMoney`. Compare teams is not offered on this sub-tab; use the Tax team filter.

**Success Formula sub-tab**
29. Two tables, **VFOS** first, then **Direct (with member)**. Each has one row per tax planner (`tax_planner_id`; "Not allocated" as its own row) and a team subtotal row per tax team, plus an All row. The tax-team filter applies; the program filter is ignored here because the split is built in.
30. Columns:
    - **Cases**.
    - **Speed, Steps 2–4**: the mean of (Step 2 + Step 3 + Step 4 days) over eligible cases where Step 4 passed and all three steps have values.
    - **Avg anticipated fee**: as in Behaviour 25.
    - **ROI % success**: Step 3 total ÷ Step 2 total (Behaviour 15). Any Yes counts, on the assumption that a Yes that doesn't sign is later changed to No.
    - **ROI success $**: Avg anticipated fee × ROI % success.
    - **Days to ROI Yes**: the avg cumulative time to the end of Step 3 (Behaviour 10) over eligible cases with a Yes at Step 3.
    - **ROI $ per day**: ROI success $ ÷ Days to ROI Yes. Higher is better.
31. **Three headline metrics, emphasised equally** (mockup Option E):
    - **Headline card** (navy hero style, full width, above the tables): three equal big numbers side by side, each with a one-line sub-caption:
      - **Average ROI % Success**: Step 3 Yes ÷ Step 2 total.
      - **Average ROI Success ($)**: avg anticipated fee × ROI %.
      - **ROI Success ÷ Days to ROI Yes**: quicker means higher.
      They cover all cases in the filter.
    - **In the tables:** the ROI % success, ROI success $ and ROI $ / day columns are all shaded the same way (`--vfo-accent-tint`, larger bold navy values).
    - **Sort:** rows are sorted by ROI success $, highest first.
32. Loading uses a skeleton in the table's shape. The error state reads "Could not load tax planning KPIs: <error>". An empty filter shows "No tax plans match these filters."
33. `warnings[]` from `tax_plan_kpis` go to the console only, as in `TaxPlanKpiPanel`.
34. Layout is tight: tables use 12–13px rows, a sticky header row and step groups separated by a thin rule, with no card per metric. Everything stays readable at 1024 px. At 390–768 px each table scrolls horizontally inside its card.

## Data
Checked on VFO Staging (`yxolcioazczlhruprmrb`), 2026-11-23:
- 13 non-sandbox plans. Round 3 is live on staging: `tax_plan_kpis` no longer returns `gaps`, and Step 1 counts from plan start.
- Step statuses seen: Step 1 Submitted 6 / Still in Process 4 / Stop 2 / Not Decided 1. Step 2 Completed – Yes 5 / Completed – No 1. Step 3 Yes – Paid 5. Step 4 Yes – Move to 5 2 / Still in Process 2 / Stop 1. Step 5 Yes – Paid 2. Step 6 Completed 1 / Still in Process 1. Every status Jake's sheet names (Yes – Payment Pending, Yes – Agreement Pending, etc.) exists in `tax_plan_kpis`.
- Teams: "Paxton Test Group 10002" (8 Direct, 1 VFOS), "Jake Test Group 10001" (1 VFOS), "Not allocated" (3 Direct).
- `projected_total_fee` is null on all 13 plans. `total_fee` is set on 6. No plan has a refund, so the `refund_status` values are unconfirmed.
- `tax_plan_kpis` and `tax_plan_kpi_day` are executable by `postgres` and `service_role` only.
- `tax_plan_kpis` doesn't yet return `tax_planner_id`.

Migration (one file):
- `tax_plan_kpis` gains additive output fields `tax_planner_id`, `tax_planner_name` and `tax_team_member_id`. No existing key changes.
- New `public.tax_plan_kpi_summary_rows()` returns setof jsonb. It runs `tax_plan_kpis(c.id)` per client with a non-sandbox plan and merges each plan's money fields: the fee amounts and statuses above, plus `anticipated_fee = coalesce(projected_total_fee, total_fee)`. It is STABLE, SECURITY INVOKER, with `search_path` pinned.
- Revoke execute on the new function from public, anon and authenticated; grant it to service_role only (matches `tax_plan_kpis`).

## API
- New handler **`tax_plan_kpi_summary_load`** in vfo-admin-api: `callApi('tax_plan_kpi_summary_load', { from, to, program, teams })`.
  - **Server check:** a valid admin session, and either superadmin or `tax_planner_kpis` in `allowed_tabs` (the same key the nav already uses). Otherwise it returns 403.
  - Input checks: ISO dates, program in {all, Direct, VFOS}, teams an array of strings. Anything else returns 400.
  - Returns:
    - `cases[]`: the per-case fields the page needs (plan id, client name, team, planner, program, created_date, timing_eligible, step statuses/tones/days, strategy statuses, money fields). No client contact details.
    - `summary`: the aggregates for All and for each team (cumulative table, fees, success formula), computed server-side so the numbers under test are the server's.
  - VFO-collected revenue (Behaviour 27) reuses the per-payment split code from `tax_planning_load`. It is not reimplemented.

## UI
- `src/components/admin/TaxPlannerKpiPanel.jsx`:
  - Add sub-tab state and pills.
  - Remove the Stripe Connect `SplitDonut` and the `groupHasStripe` / `plannerConnected` logic. The `groups` prop can go if nothing else uses it; check `TaxPlannersPanel.jsx:395`.
  - Render the new sub-tabs.
- Move `SubTabButton` out of `MemberKpiPanel.jsx` into `KpiKit.jsx` as an export, so both pages share it.
- New `src/components/admin/tax/TaxPlanningKpiSummary.jsx`: the data loader plus three views, `CumulativeSummaryTable`, `AverageFeesTable` and `SuccessFormulaTable`. Split into files if it grows past ~400 lines.
- Reuse `ListFilterButton` for the filter, and `fmtKpiMoney` / `TONES` from `TaxPlanKpiPanel.jsx` (export them or move them into a small shared module in `components/admin/tax/`; don't copy them).
- Status text uses `TONES` colours as a small dot or label, not full coloured tiles.
- Alignment: step tiles use CSS grid (`repeat(6, minmax(0, 1fr))`) with fixed-height eyebrow and name rows. Numbers in every table are right-aligned with tabular figures. On the Cumulative Summary, Count and % sit in fixed-width columns so the % values line up down each step.

## Acceptance
Run on staging as a superadmin unless noted.
- Tax Planner KPIs shows four pills styled like Advisor KPIs. KPIs is the default and has no Stripe Connect card.
- An admin without `tax_planner_kpis` doesn't see the page, and calling `tax_plan_kpi_summary_load` with their session returns 403.
- With no filters, Total Cases = 13 (= `count(*)` of non-sandbox plans) and the Step 1 total = 6 (Submitted).
- Step 2 rows: Completed – Yes 5, Completed – No 1, Pending = 0. % of Step 1 total adds up to 100%. Step 2 total = 5.
- Step 3: Yes – Paid 5 = 100% of the Step 2 total. Step 3 total = 5.
- Every step group's % column adds up to 100% of its denominator.
- The avg time for a step matches a hand-computed mean of the passed, eligible cases' tile days. For any case, the sum of its step averages' inputs equals its tile Total days up to that step.
- Legacy cases (2 on staging) change counts but not any time average, and the note shows the right N.
- Avg anticipated fee uses `total_fee` for the 6 plans that have it. Setting `projected_total_fee` on one plan makes that value win.
- The tax team filter narrows every table. Compare teams shows the Paxton Test Group, Jake Test Group and Not allocated columns side by side, and the All column equals the unfiltered table.
- Success Formula: the VFOS table has 2 cases and Direct has 11. ROI % success = Step 3 total ÷ Step 2 total per row. ROI success $ = fee × %. ROI $ per day = $ ÷ days.
- No sandbox plan is ever counted. An empty filter shows the empty message with no console errors.
- Step tiles on staging: Step 1 46.2% amber, Step 2 83.3% green, Step 3 100% green, Step 4 40.0% amber, Step 5 100% green, Step 6 50.0% amber.
- The six step tiles line up row for row at 1024 / 1280 / 1440 px: the big numbers, pills and Avg/Cum rows are at the same height in every tile, including Step 4 "Tax Plan Review".
- At 1024 px all four sub-tabs fit with no page-level horizontal scroll.

## Open questions for Jake
1. **Step 3 / 4 / 5 totals**: should every "Yes" (including Payment Pending and Agreement Pending) carry a case into the next step's total, or only Yes – Paid / Move to 5? The spec assumes any Yes, per your ROI note.
2. **Cumulative time**: should it run from plan start (as specced, matching Total days on the tiles) or from the end of Step 2, to match "Cumulative % of Step 2 total"?
3. **Avg time per step**: should it cover passed cases only (as specced), or also time-to-stop for stopped cases?
4. **Anticipated fee**: is falling back to `total_fee` right? Which process is meant to fill `projected_total_fee`?
5. **VFO revenue numerator**: should it be all filtered cases (as specced) or only cases with a completed strategy?
6. **Success Formula "speed through steps 2-3-4"**: should Step 1 be included, and should it count only cases that passed Step 4?
7. Is the "low n" threshold of 3 cases right?
8. Are the red/amber/green thresholds for % passed right (green ≥ 70%, amber 40–70%, red < 40%), or should each step have its own targets?

## Not yet verified
- **vfo-edge-functions isn't in the connected folder.** Still to confirm there:
  - the admin-auth helper;
  - how `allowed_tabs` is checked server-side;
  - where `tax_planning_load` computes Elite VFO Income.
- **`refund_status` values.** `'succeeded'` is assumed; no staging plan has a refund.
- **Other `groups` users.** It hasn't been checked whether anything else in `TaxPlannersPanel` relies on the `groups` prop that the Stripe card used.
