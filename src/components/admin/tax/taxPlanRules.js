// The tax plan's done-rules, phase states and hero counts — ONE copy, used by
// the plan page (TaxPlanTrackView) and by every list that summarises a plan
// (the Tax Planners -> Clients progress column). Moved VERBATIM out of
// TaxPrioritiesTab.jsx 2026-10-01; the backend mirror is utils/tax-plan-steps.ts
// (#339 / #560 — never re-derive these rules in a second place).

// Mirrors the edge repo's constants/tax-fee-process.ts (see TaxPrioritiesTab.jsx).
export const KNOWN_FEE_PROCESS_VERSIONS = ['2026-08-25']
export const isNewFeeProcess = (pl) => KNOWN_FEE_PROCESS_VERSIONS.includes(pl?.fee_process_version)

// The two "amend the fee" steps, matched by their status_options sentinels (#392).
export const AMEND_FEE_CODE = 'tax_amend_fee'
export const AMEND_FEE_TAX5_CODE = 'tax_amend_fee_tax5'
export const isAmendStepTask = (t) => t?.status_options === AMEND_FEE_CODE || t?.status_options === AMEND_FEE_TAX5_CODE
export const amendStage = (t) => (t?.status_options === AMEND_FEE_TAX5_CODE ? 'tax5' : 'tax4')

// client_tax_progress.status on the Deposit Paid step of a WAIVED intake.
export const DEPOSIT_NA_STATUS = 'N/A — No Deposit'

// The implementation revenue share is finished when the member was emailed — or
// when the engine recorded the member leg as 'N/A — No Share Due' (a $0 member
// share pays and emails no member, so the email flag never turns true; the
// backend step machine already counts it done via REV_DONE in
// utils/tax-plan-steps.ts). Plans 46 / 47 sat 'Not completed' on this (2026-10-06).
export const IMPL_REV_NO_SHARE = 'N/A — No Share Due'
export const implRevShareDone = (pl) =>
  pl?.implementation_rev_email_sent === true || pl?.implementation_rev_paid === IMPL_REV_NO_SHARE

// Stepper badge + label. Set Up gets a letter: a pre-step outside Tax 1-6.
export const phaseBadgeToken = (name) => {
  if (name === 'Set Up') return 'S'
  const m = /^Tax (\d+)/.exec(name || '')
  return m ? m[1] : ''
}
// Descriptive half of the phase name — the badge already carries the number, so
// the stepper label doesn't repeat it ("1 / Diagnostic", not "1 / Tax 1").
export const phaseShortLabel = (name) => {
  if (name === 'Set Up') return 'Set Up'
  const rest = (name || '').split(' - ').slice(1).join(' - ')
  return rest || name || ''
}

// Everything the plan page counts, from the four inputs it loads. `livePlan` is
// the freshest plan row, `plan` the one the list was opened with (the page keeps
// both); `localProgress` is keyed task.id / `${task.id}_${spec.id}`; `taxPlanners`
// is the roster (only allocatedPlanner / taxPlannerAllocated read it).
export function makeTaxPlanRules({ plan, livePlan, phases, localProgress, taxSpecialists, taxPlanners = [] }) {
  const allTasks = phases.flatMap(p => p.program_client_tasks || [])
  const decision2Task = allTasks.find(t => t.name === 'Client decision 2')
  const decision2Status = decision2Task ? localProgress[decision2Task.id]?.status : ''
  // Phase 7: Tax 5b unlocks when ANY specialist has 'Confirm ready for
  // implementation' set to 'Yes' or 'Undecided' — a 'No' does NOT unlock — OR
  // when Client decision 2 = 'Move to Implementation' (the shortcut that
  // greys/bypasses the per-specialist confirm step — without this, that path
  // leaves Tax 5b locked).
  const confirmReadyTask = phases.find(p => p.name === 'Tax 5 - Education & DD (Specialist Allocation)')?.program_client_tasks?.find(t => t.name === 'Confirm ready for implementation')
  const tax5bUnlocked = (confirmReadyTask && taxSpecialists.some(spec => {
    const st = localProgress[`${confirmReadyTask.id}_${spec.id}`]?.status
    return st === 'Yes' || st === 'Undecided'
  })) || decision2Status === 'Move to Implementation'

  // Skipping the ROI meeting (automation_TAX_skiproimeeting) is FINAL: the Tax 2
  // work and Tax 3's "ROI Presentation" never happen, and "Client tax planning
  // decision" unlocks in their place. Declared ahead of isTaskStatused because
  // that function reads it (the booking step is closed BY the skip).
  const roiSkipped = !!livePlan?.roi_meeting_skipped_at
  // TWO skip routes, both stamping roi_meeting_skipped_at — everything above and
  // below that reads "was it skipped?" is route-blind, and only the four gates
  // marked roiSkipMeetingFirst below differ:
  //   retainer first  decision -> sign -> pay -> detailed meeting  (roi_skip_mode
  //                   null on plans skipped before the column existed)
  //   meeting first   detailed meeting -> confirm it happened -> decision -> sign
  //                   -> pay, and Client decision 1 waits on the retainer too
  const roiSkipMeetingFirst = roiSkipped && livePlan?.roi_skip_mode === 'meeting_first'
  // Rapid Route (2026-09-25): the TPOM is replaced by a customized video. Two
  // steps print their Rapid names (RAPID_STEP_LABELS), "Send presentation link
  // to member before meeting" and "ROI Presentation" are hidden and excluded
  // from every count, and the decision step unlocks on the Tax 1 + Tax 2 chain.
  // Mirrors `rapid` in utils/tax-plan-steps.ts (#339). A skip always wins: the
  // server refuses to skip a Rapid plan, so the two never co-exist.
  const rapidPlan = !!(livePlan || plan)?.rapid_route && !roiSkipped
  const isRapidHidden = (t) => rapidPlan && (t?.status_options === 'tax_presentation_link' || t?.name === 'ROI Presentation')

  // A task counts as statused for display when its progress is recorded in
  // client_tax_progress — or, for the two steps that write to client_tax_plans
  // instead, when the corresponding plan column is set.
  function isTaskStatused(t) {
    if (t.status_options === 'tax_hlm_confirm') return !!livePlan?.tax4_meeting_date
    if (t.status_options === 'tax_presentation_link') return !!livePlan?.presentation_send_date
    if (t.status_options === 'tax_returns_request') return !!livePlan?.tax_returns_received_at
    // Generating the ROI deck writes no progress row — the plan stamp is the only
    // record, so the step reads as done exactly when a deck has been generated.
    if (t.status_options === 'tax_generate_presentation') return !!livePlan?.generated_presentation_at
    // Assess step: submitting the form stamps assess_form_submitted_at, which is
    // what the row renderer reads, so the step must read done from that column too
    // and not from a progress row alone.
    if (t.status_options === 'assess_form' || t.name === 'Assess tax planning opportunities (and enter presentation details)') {
      return !!localProgress[t.id]?.status || !!livePlan?.assess_form_submitted_at
    }
    // Tax Plan Red Light. 'Proceed' is a HISTORY value (that button was removed
    // 2026-09-21); 'Stopped' is the no-deposit stop route's own record, and a
    // completed refund closes the step through the plan column, writing no
    // progress status of its own (#293). Mirrors utils/tax-plan-steps.ts.
    if (t.status_options === 'tax_refund') {
      const st = localProgress[t.id]?.status
      return st === 'Proceed' || st === 'Stopped' || livePlan?.deposit_refund_status === 'succeeded'
    }
    // Allocating a tax planner completes only when a planner is actually allocated
    // (client_tax_plans.tax_planner_id), not when the progress row merely holds a
    // name. Rows migrated from before the Tax Planners table carry a free-text name
    // — in practice a departed employee — that resolves to nobody and earns nobody
    // revenue, so it must not read as done. Re-selecting a real planner writes the id
    // and overwrites the stale name, so these self-heal.
    if (t.status_options === 'tax_planner_select' || t.name === 'Allocate to Advanced Tax Planner' || t.name === 'Allocate Team Member / Tax Planner') {
      return livePlan?.tax_planner_id != null
    }
    // Additional information required: the dropdown alone isn't done while info
    // is still being requested — it needs the received stamp to complete.
    if (t.name === 'Additional information required') {
      const st = localProgress[t.id]?.status
      return !!st && (st !== 'Additional info required' || !!livePlan?.additional_info_received_at)
    }
    // Booking the ROI meeting is RESOLVED by skipping it — the answer is "there
    // will be no meeting", which is a real outcome, not an outstanding step. So it
    // counts as done everywhere done is counted (phase pills, hero totals, step
    // gates), while the other four steps the skip removes drop out of the counts
    // entirely (isSkippedAway).
    if (t.status_options === 'tax_3_decision') return !!localProgress[t.id]?.status || roiSkipped
    // The two "amend the fee" steps: normally proven by their own progress row
    // ("Completed - Kept" / "Completed - Amended"), but an actual amendment
    // stamps client_tax_plans.fee_amended_at_tax4/_tax5 and that stamp can only
    // exist because the step was answered — so it closes the step on its own if
    // the save-task that follows the amend call is ever lost. Mirrored in the
    // backend step machine (utils/tax-plan-steps.ts) — #339 keeps them in step.
    if (t.status_options === AMEND_FEE_CODE) return !!localProgress[t.id]?.status || !!livePlan?.fee_amended_at_tax4
    if (t.status_options === AMEND_FEE_TAX5_CODE) return !!localProgress[t.id]?.status || !!livePlan?.fee_amended_at_tax5
    return !!localProgress[t.id]?.status
  }

  const findStepTask = (sentinel, name) =>
    (sentinel ? allTasks.find(t => t.status_options === sentinel) : null)
    || (name ? allTasks.find(t => t.name === name) : null)
    || null
  // A step the program doesn't carry cannot be a prerequisite: Holistic (program 1)
  // has neither the deposit nor the Red Light step, and gating on an absent task
  // would lock everything downstream of it forever.
  const prereqDone = (sentinel, name) => {
    const t = findStepTask(sentinel, name)
    return !t || isTaskStatused(t)
  }

  const isTaxProgram = (livePlan?.program_id ?? plan?.program_id ?? 1) === 4
  const depositOk = !isTaxProgram || prereqDone('tax_deposit_pi', 'Deposit Paid') || !!livePlan?.deposit_payment_intent_id
  // A WAIVED intake closes Deposit Paid as "N/A — No Deposit". It decides WHICH
  // stop route the Red Light step offers — "Stop tax planning" rather than a
  // Refund — and it is the ROI-decline affordance's test. NOT "no PaymentIntent":
  // a hand-created plan awaiting an admin's paste still owes the deposit and
  // refunds. Mirrors isNoDepositPlan server-side (#339).
  // Direct (the member runs the case): the member already has the deck, so the
  // "Send presentation link to member" step does not exist on their plan.
  const directPlan = (livePlan || plan)?.tax_route === 'direct'
  const noDeposit = isTaxProgram && (() => {
    const dt = findStepTask('tax_deposit_pi', 'Deposit Paid')
    return !!dt && localProgress[dt.id]?.status === DEPOSIT_NA_STATUS
  })()
  const depositRefunded = livePlan?.deposit_refund_status === 'succeeded'
  const returnsReceived = prereqDone('tax_returns_request', 'Request Tax Returns')
  const allocDone = prereqDone('tax_planner_select', 'Allocate Team Member / Tax Planner')
  // Only a Tax Planner unlocks the review steps — a Team Member may hold the plan
  // (hand-off flow) but cannot do the review. The role lives on the roster row
  // (planner_role), never on the plan, so an allocated id that no longer resolves to
  // a roster row stays locked. An empty roster is a load state, not an answer, so it
  // does not lock on its own.
  const allocatedPlanner = taxPlanners.find(pl => String(pl.id) === String(livePlan?.tax_planner_id)) || null
  const taxPlannerAllocated = livePlan?.tax_planner_id != null
    && (taxPlanners.length === 0 || allocatedPlanner?.planner_role === 'Tax Planner')
  const addlInfoDone = prereqDone(null, 'Additional information required')
  // The review verdict is directional, so "answered" is never enough: only Proceed
  // carries the plan forward. Stop is a terminal answer that must re-lock the
  // forward path — the stop route is the Tax Plan Red Light step (Refund on a
  // deposit plan, Stop tax planning on a waived one), or the ROI-booked decline
  // button on Holistic, which has no Red Light step (#367).
  const reviewTask = findStepTask(null, 'Tax planner review complete')
  const reviewStatus = reviewTask ? localProgress[reviewTask.id]?.status : null
  const reviewProceed = !reviewTask || reviewStatus === 'Proceed with tax planning'
  const reviewStop = !!reviewTask && reviewStatus === 'Stop tax planning'
  // "Tax Plan Red Light" is the STOP route and nothing else (Jake, 2026-09-21):
  // it appears only when the reviewer said Stop, or when it already carries
  // history — a legacy 'Proceed', the new 'Stopped', or a completed refund. On a
  // Proceed it is not shown and not counted, on EVERY plan, deposit or not.
  // Mirrors `reviewStop || redLightDone` in utils/tax-plan-steps.ts (#339).
  const redLightTask = findStepTask('tax_refund', null)
  const redLightVisible = reviewStop || depositRefunded || (!!redLightTask && isTaskStatused(redLightTask))
  // True once the meeting is booked OR the skip closed the step (isTaskStatused).
  const roiBooked = prereqDone('tax_3_decision', null)
  // The risk grade the ROI deck is built from. Plan-level progress row only (no
  // specialist), and "answered" means the stored status carries a grade — a blank
  // or gradeless row is not a risk profile. One source for both the booking gate
  // and the generate-presentation card's own readiness hint.
  const riskProfileTask = allTasks.find(t => t.name === 'Client risk profile complete')
  const riskProfileDone = !!riskProfileTask && String(localProgress[riskProfileTask.id]?.status || '').includes('Risk')
  // The five steps that skip takes off the board (for ROW RENDERING — all five
  // render as inert skip rows). Sentinels first; the two whose sentinel isn't
  // guaranteed on every program row also match by name.
  const isRoiSkipSetTask = (t) => !!t && (
    ['tax_3_decision', 'assess_form', 'tax_generate_presentation', 'tax_presentation_link'].includes(t.status_options)
    || t.name === 'Assess tax planning opportunities (and enter presentation details)'
    || t.name === 'Generate and download presentation'
    || t.name === 'ROI Presentation'
  )
  // The done-math sees only FOUR of them: the booking step stays in the counts
  // because the skip answers it (isTaskStatused), which is what leaves Tax 2 at a
  // green 1/1 rather than an empty phase. Of those four, only the UNANSWERED ones
  // drop out — a step actioned before the skip still counts, because that work
  // actually happened.
  const isSkippedAway = (t) => roiSkipped && isRoiSkipSetTask(t)
    && t?.status_options !== 'tax_3_decision' && !isTaskStatused(t)

  // ── The two "amend the fee" steps ─────────────────────────────────────────
  // An amend step is APPLICABLE when any one of three things holds — the exact
  // rule utils/tax-plan-steps.ts now uses server-side, and #339 (cross-repo
  // coupling) means the two must be changed together:
  //   1. the plan is on the REVISED fee process, or
  //   2. the step is ANSWERED — the two-source test (progress row OR the
  //      fee_amended_at_tax4/_tax5 stamp) that isTaskStatused already carries
  //      for these two sentinels, or
  //   3. the amendment WINDOW is still open — the downstream decision has not
  //      been recorded (tax4: post_review_decision, tax5:
  //      implementation_decision). That is the same boundary amend-fee.ts
  //      itself enforces before it 400s, so "applicable" never outlives
  //      "answerable".
  // LEGACY plans (NULL / unrecognised fee_process_version) can now amend too:
  // amend-fee.ts accepts them and lands the whole movement on
  // implementation_amount, leaving the retainer side untouched. What the WINDOW
  // half of the rule buys is the ~22 production legacy plans already past
  // Client decision 1: making the step unconditionally applicable would leave
  // their phase pills incomplete FOREVER on a step they can never answer, so a
  // past-the-window UNANSWERED legacy plan keeps today's behaviour exactly —
  // NOT APPLICABLE, rendering as an inert row (the treatment isSkippedAway rows
  // get) and dropping out of every count, so its phase pill, hero total and
  // plan-list state are unchanged by this feature.
  // A 2-payment plan on the REVISED process gets both steps normally: only the
  // derivation differs (implementation-only rather than a re-derived 50:50).
  const newFeeProcess = isNewFeeProcess(livePlan)
  // The decision column this stage's window closes on. An empty string counts
  // as "not decided" alongside null — a blank stored value must not close the
  // window early (same null/empty test the backend gates use).
  const amendWindowOpen = (t) => {
    const decision = amendStage(t) === 'tax5' ? livePlan?.implementation_decision : livePlan?.post_review_decision
    return decision === null || decision === undefined || decision === ''
  }
  const isAmendNotApplicable = (t) =>
    isAmendStepTask(t) && !newFeeProcess && !isTaskStatused(t) && !amendWindowOpen(t)
  // Excluded from the done-math: skipped-away rows, the not-applicable amend
  // rows, and the Tax Plan Red Light step whenever it is not visible (every
  // plan whose review has not said Stop). One helper so every count site uses
  // the same rule. renderTask drops the Red Light row outright, so unlike the
  // other two it has no inert row either.
  const isStepExcluded = (t) => isSkippedAway(t) || isAmendNotApplicable(t)
    || (t?.status_options === 'tax_refund' && !redLightVisible)
    || (t?.status_options === 'tax_presentation_link' && directPlan)
    || isRapidHidden(t)

  function getPhaseState(phase) {
    let tasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto')
    if (phase.name === 'Tax 1 - Diagnostic') {
      tasks = tasks.filter(t => !['Email to obtain information required sent', 'Information received', 'Information passed to VFO-L'].includes(t.name))
    }
    // Filtered ahead of every branch below, not just the generic tail: Tax 3
    // carries "ROI Presentation", so leaving it in would keep that phase off
    // Done forever on a skipped plan.
    tasks = tasks.filter(t => !isStepExcluded(t))
    // Tax 2 needs no special case: the skip leaves exactly the booking step
    // standing, and the skip answers it, so the generic tail below reads the
    // phase as Done (1/1).

    // Phases that contain an AI-PC-Admin cascade aren't really "done" just
    // because the decision form was submitted — the cascade has to finish.
    // Gate Done on a phase-specific cascade endpoint and treat any progress
    // as Active until then.
    if (phase.name === 'Tax 3 - ROI Meeting') {
      const decline = livePlan?.tax_decision === 'No' || livePlan?.tax_final_decision === 'No'
      const fullyDone = livePlan?.retainer_invoice_email_sent === true
      // Done needs the cascade endpoint (or a decline) AND every visible task
      // statused — the cascade alone shouldn't green-check unset dropdowns.
      if ((decline || fullyDone) && tasks.every(t => isTaskStatused(t))) return 'done'
      if (decline || fullyDone || tasks.some(t => isTaskStatused(t))) return 'active'
      return 'pending'
    }
    if (phase.name === 'Tax 5 - Education & DD (Post Allocation)') {
      const impl = livePlan?.implementation_decision
      const finalDec = livePlan?.implementation_final_decision
      const decline = impl === 'Not Implementing' || (impl === 'Undecided' && finalDec === 'No')
      const fullyDone = implRevShareDone(livePlan)
      if (decline || fullyDone) return 'done'
      if (impl) return 'active'
      return 'pending'
    }
    // Tax 6 runs once per allocated specialist, so its progress lives under
    // `${task.id}_${spec.id}` — the plan-level reads below would never see it.
    if (phase.name === 'Tax 6 - Implementation') {
      const specDone = (spec) => tasks.every(t => localProgress[`${t.id}_${spec.id}`]?.status)
      const specAny = (spec) => tasks.some(t => localProgress[`${t.id}_${spec.id}`]?.status)
      if (taxSpecialists.length > 0 && tasks.length > 0 && taxSpecialists.every(specDone)) return 'done'
      if (taxSpecialists.some(specAny)) return 'active'
      return 'pending'
    }

    if (tasks.length === 0) {
      const autoTasks = phase.program_client_tasks || []
      const allAutoDone = autoTasks.length > 0 && autoTasks.every(t => localProgress[t.id]?.status)
      return allAutoDone ? 'done' : 'pending'
    }
    if (tasks.every(t => isTaskStatused(t))) return 'done'
    if (tasks.some(t => isTaskStatused(t))) return 'active'
    return 'pending'
  }

  const tax5aPhase = phases.find(p => p.name === 'Tax 5 - Education & DD (Specialist Allocation)')
  const tax5bPhase = phases.find(p => p.name === 'Tax 5 - Education & DD (Post Allocation)')
  const tax5aTasks = tax5aPhase?.program_client_tasks || []
  const phasesBeforeSpec = phases.filter(p => ['Set Up', 'Tax 1 - Diagnostic', 'Tax 2 - Deeper Dive', 'Tax 3 - ROI Meeting', 'Tax 4 - Tax Plan Review'].includes(p.name))
  const phasesAfterSpec = phases.filter(p => p.name === 'Tax 6 - Implementation')

  // Display-only summary for the hero stepper: badge token + short label +
  // state per phase, in render order (before-spec phases, the merged Tax 5,
  // after-spec). The 5a/5b states mirror the pill logic on the card below.
  const tax5aHeroState = taxSpecialists.length > 0 && taxSpecialists.every(spec => tax5aTasks.filter(t => t.status_options !== 'specialist_select').every(t => localProgress[`${t.id}_${spec.id}`]?.status))
    ? 'done'
    : taxSpecialists.length > 0 && taxSpecialists.some(spec => tax5aTasks.filter(t => t.status_options !== 'specialist_select').some(t => localProgress[`${t.id}_${spec.id}`]?.status))
      ? 'active' : 'pending'
  const tax5bState = tax5bPhase ? (tax5bUnlocked ? getPhaseState(tax5bPhase) : 'pending') : 'pending'
  // The two stored Tax 5 phases render as ONE card, so the stepper shows one
  // node: done only when both halves are done, active as soon as either moves.
  const tax5State = (tax5aHeroState === 'done' && tax5bState === 'done')
    ? 'done'
    : (tax5aHeroState !== 'pending' || tax5bState !== 'pending') ? 'active' : 'pending'
  const heroSteps = [
    ...phasesBeforeSpec.map(ph => ({ number: phaseBadgeToken(ph.name), label: phaseShortLabel(ph.name), state: getPhaseState(ph) })),
    ...((tax5aPhase || tax5bPhase) ? [{ number: '5', label: 'Education & DD', state: tax5State }] : []),
    ...phasesAfterSpec.map(ph => ({ number: phaseBadgeToken(ph.name), label: phaseShortLabel(ph.name), state: getPhaseState(ph) })),
  ]
  // Task-level hero counts, mirroring the same per-phase visibility rules the
  // card pills use (Tax 1 children only when info required, hlm/presentation
  // read from the plan row, 5a per specialist, 5b's decision read from the
  // plan row).
  const heroCountedTasks = (phase) => {
    let tasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto')
    if (phase.name === 'Tax 1 - Diagnostic') {
      tasks = tasks.filter(t => !['Email to obtain information required sent', 'Information received', 'Information passed to VFO-L'].includes(t.name))
    }
    return tasks.filter(t => !isStepExcluded(t))
  }
  const tax5aSpecTasks = tax5aTasks.filter(t => t.status_options !== 'specialist_select')
  // Same exclusion as every other count: a legacy plan's Tax 5b amend row is not
  // applicable and must not sit in the denominator.
  const tax5bCounted = tax5bPhase ? (tax5bPhase.program_client_tasks || []).filter(t => t.status_options !== 'auto' && !isStepExcluded(t)) : []
  const tax5bTaskDone = (t) => t.status_options === 'tax_implement_decision' ? !!livePlan?.implementation_decision : isTaskStatused(t)
  // Tax 6 (the only after-spec phase) is per-specialist like Tax 5a, so it is
  // dropped from the plan-level reduce and added as its own term — leaving it in
  // both would double-count it.
  const tax6SpecTasks = phasesAfterSpec.flatMap(ph => (ph.program_client_tasks || []).filter(t => t.status_options !== 'auto'))
  const heroTotalTasks = phasesBeforeSpec.reduce((s, ph) => s + heroCountedTasks(ph).length, 0)
    + taxSpecialists.length * tax5aSpecTasks.length
    + tax5bCounted.length
    + taxSpecialists.length * tax6SpecTasks.length
  const heroDoneTasks = phasesBeforeSpec.reduce((s, ph) => s + heroCountedTasks(ph).filter(t => isTaskStatused(t)).length, 0)
    + taxSpecialists.reduce((s, spec) => s + tax5aSpecTasks.filter(t => !!localProgress[`${t.id}_${spec.id}`]?.status).length, 0)
    + tax5bCounted.filter(tax5bTaskDone).length
    + taxSpecialists.reduce((s, spec) => s + tax6SpecTasks.filter(t => !!localProgress[`${t.id}_${spec.id}`]?.status).length, 0)

  return {
    addlInfoDone,
    allTasks,
    allocDone,
    allocatedPlanner,
    amendWindowOpen,
    confirmReadyTask,
    decision2Status,
    decision2Task,
    depositOk,
    depositRefunded,
    directPlan,
    findStepTask,
    getPhaseState,
    heroCountedTasks,
    heroDoneTasks,
    heroSteps,
    heroTotalTasks,
    isAmendNotApplicable,
    isRapidHidden,
    isRoiSkipSetTask,
    isSkippedAway,
    isStepExcluded,
    isTaskStatused,
    isTaxProgram,
    newFeeProcess,
    noDeposit,
    phasesAfterSpec,
    phasesBeforeSpec,
    prereqDone,
    rapidPlan,
    redLightTask,
    redLightVisible,
    returnsReceived,
    reviewProceed,
    reviewStatus,
    reviewStop,
    reviewTask,
    riskProfileDone,
    riskProfileTask,
    roiBooked,
    roiSkipMeetingFirst,
    roiSkipped,
    tax5State,
    tax5aHeroState,
    tax5aPhase,
    tax5aSpecTasks,
    tax5aTasks,
    tax5bCounted,
    tax5bPhase,
    tax5bState,
    tax5bTaskDone,
    tax5bUnlocked,
    tax6SpecTasks,
    taxPlannerAllocated,
  }
}

// The one-line progress summary for a plan list (Tax Planners -> Clients):
// "<n>/6 - <pct>%" where n counts the numbered stepper phases (Tax 1..6, the two
// stored Tax 5 halves as one node) DONE IN A ROW from the start, exactly as the
// plan page's stepper shows them; "Setup" while only Set Up is done, "Not started"
// before that. The percent is the plan page hero's own number (TrackHero).
export function taxPlanProgressSummary(rules) {
  const { heroSteps, heroDoneTasks, heroTotalTasks } = rules
  const pct = heroTotalTasks > 0 ? Math.round(heroDoneTasks / heroTotalTasks * 100) : 0
  const numbered = heroSteps.filter(s => s.number !== 'S')
  let n = 0
  while (n < numbered.length && numbered[n].state === 'done') n++
  const setupDone = heroSteps.some(s => s.number === 'S' && s.state === 'done')
  const phase = n > 0 ? `${n}/${numbered.length}` : setupDone ? 'Setup' : 'Not started'
  return { phase, pct, label: `${phase} - ${pct}%`, done: heroDoneTasks, total: heroTotalTasks }
}
