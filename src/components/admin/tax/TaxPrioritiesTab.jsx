import { useState, useEffect, useRef, useMemo, cloneElement } from 'react'
import { callApi, loadCachedAction, getSession } from '../../../lib/api'
import { TaxPlanListSkeleton } from '../../shared/Skeleton'
import { PhaseNotesButton, PhaseNotesPanel } from '../../shared/PhaseNotes'
import { TrackHero, PhaseBadge, ListHeader } from '../../shared/TrackKit'
import { hasStrategicSplit, computeStrategicShares } from '../../../lib/strategicSplits'
import StepEmailsChip from '../../shared/StepEmailsChip'
import PricingSplitCard from './PricingSplitCard'
import { CONFIRMATION_CARD_SKIP } from '../../../lib/confirmationStatus'

// Matches the backend invoice money formatting ($X,XXX.XX).
const fmtMoney = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Keystroke filter for a plain dollar-amount input: digits and AT MOST one
// decimal point, everything else dropped. The Diron discount field used to take
// free text, so a typed "No" reached parseFloat as NaN and was silently stored
// as no-discount — the admin saw their answer accepted and it went nowhere.
// Letters can no longer be typed at all, which is the honest version of that.
// Deliberately NOT a parse: it returns the STRING so a half-typed "12." keeps
// its point while the admin is still typing.
const moneyDigitsOnly = (raw) => {
  const cleaned = String(raw ?? '').replace(/[^0-9.]/g, '')
  const [whole, ...rest] = cleaned.split('.')
  return rest.length ? `${whole}.${rest.join('')}` : whole
}

// Revised fee process (2026-08-25): the fee is driven by ONE number, the total.
// This mirrors the edge repo's constants/tax-fee-process.ts splitFeeCents /
// deriveFeeSplit byte for byte — arithmetic in whole cents so retainer +
// implementation === total and initial + final === retainer exactly. DISPLAY
// ONLY: the server re-derives every payable amount from the submitted total and
// ignores anything computed here, so the two must never drift. Change both
// together.
//
// THREE BANDS. The plain 50:50 split ENDS at THREE_PAYMENT_THRESHOLD; the
// 3-payment schedule BEGINS at THREE_PAYMENT_MIN. Between them is the BUFFER
// BAND ($30,000.01 - $30,999.99), which is 2 payments with the flat $15,000 as
// the WHOLE retainer — it exists because a 3-payment split there would leave a
// final retainer of a few dollars ($30,119 -> $59.50). A buffer-band plan is
// STORED exactly like one an amendment converted back to 2 payments (initial
// kept, final NULL), so isThreePaymentPlan reads it as 2 payments everywhere and
// the kept initial is what lets a later amendment reaching $31,000 convert it
// to 3.
const MAX_TOTAL_FEE = 60000
const THREE_PAYMENT_THRESHOLD = 30000
const THREE_PAYMENT_MIN = 31000
const INITIAL_RETAINER_FLAT = 15000
const FEE_TOTAL_RANGE_MESSAGE = `Total fee must be greater than $0 and no more than $${MAX_TOTAL_FEE.toLocaleString('en-US')}`

// clients.id allowed to quote a CUSTOM initial retainer in place of the flat
// $15,000 at the Tax 3 decision — Chris Colby (59481-002). Mirrors the edge
// repo's constants/tax-fee-process.ts CUSTOM_SPLIT_CLIENT_IDS: the server only
// honours a customInitialRetainer for a client on ITS list, so the two must
// never drift. The 50:50 retainer/implementation split of the total is
// unaffected — only the initial/final boundary inside the retainer half moves,
// which is why it is offered on 3-payment totals ONLY: below $31,000 there is no
// final retainer for the boundary to sit against, buffer band included.
// NOTE: unrelated to `splitType === 'Custom'` further down, which is the REVENUE
// split between member / tax planner / VFOS.
// 62 is the standing sandbox-forced Test Client (member 59524, gotcha #251),
// kept on the list so this path stays click-testable.
const CUSTOM_SPLIT_CLIENT_IDS = [105, 62]
const CUSTOM_INITIAL_RANGE_MESSAGE = 'Must be more than $0 and less than the retainer half'

// Mirrors the edge repo's constants/tax-fee-process.ts KNOWN_FEE_PROCESS_VERSIONS
// / isNewFeeProcess (and taxShared.jsx, which already carries the same list). A
// plan with NULL — or an unrecognised — fee_process_version is on the LEGACY
// process. Legacy plans CAN now amend a fee (amend-fee.ts accepts them and puts
// the whole movement on implementation_amount, leaving the retainer alone), so
// this test no longer decides applicability on its own — see
// isAmendNotApplicable below for the three-way rule that replaced it. What this
// still decides is the SHAPE questions: 3-payment vs 2-payment, and which fee
// schedule the cards render.
const KNOWN_FEE_PROCESS_VERSIONS = ['2026-08-25']
const isNewFeeProcess = (pl) => KNOWN_FEE_PROCESS_VERSIONS.includes(pl?.fee_process_version)

// The two revised-fee-process "amend the fee" steps, matched by their
// status_options sentinels. Stored names are 'Amend fee' (Tax 4) and
// 'Amend implementation fee' (Tax 5b) — the Tax 4 name is ALSO a backend lookup
// key (AMEND_FEE_TASK_NAME, read by the Client decision 1 gate in
// actions/tax/postreview-decision.ts), so neither name is matched here (#392).
const AMEND_FEE_CODE = 'tax_amend_fee'
const AMEND_FEE_TAX5_CODE = 'tax_amend_fee_tax5'
const isAmendStepTask = (t) => t?.status_options === AMEND_FEE_CODE || t?.status_options === AMEND_FEE_TAX5_CODE
const amendStage = (t) => (t?.status_options === AMEND_FEE_TAX5_CODE ? 'tax5' : 'tax4')

// The whole-cents core, mirroring the edge splitFeeCents(). No range check —
// deriveFeeSplit below owns that, exactly as on the server.
function splitFeeCents(cents) {
  const threePayment = cents >= THREE_PAYMENT_MIN * 100
  const bufferBand = cents > THREE_PAYMENT_THRESHOLD * 100 && !threePayment
  if (bufferBand) {
    const retainerCents = INITIAL_RETAINER_FLAT * 100
    return {
      threePayment: false,
      bufferBand: true,
      retainerCents,
      implementationCents: cents - retainerCents,
      initialCents: retainerCents,
      finalCents: null,
    }
  }
  const retainerCents = Math.round(cents / 2)
  const initialCents = threePayment ? INITIAL_RETAINER_FLAT * 100 : null
  return {
    threePayment,
    bufferBand: false,
    retainerCents,
    implementationCents: cents - retainerCents,
    initialCents,
    finalCents: initialCents === null ? null : retainerCents - initialCents,
  }
}

// customInitial (DOLLARS, optional) moves the initial/final boundary inside the
// retainer half — the total, the retainer half and the implementation fee are
// untouched by it. It is 3-PAYMENT-ONLY: a buffer-band total has no
// initial/final boundary to move, so it refuses like a plain 2-payment total.
// Mirrors the edge deriveFeeSplit's second argument, except that every case it
// THROWS on returns null here (this file's invalid convention): total out of
// range, a custom initial on a non-3-payment total, or a custom initial outside
// 0 < x < the retainer half.
function deriveFeeSplit(total, customInitial) {
  const cents = Math.round(Number(total) * 100)
  if (!Number.isFinite(cents) || cents <= 0 || cents > MAX_TOTAL_FEE * 100) return null
  const shape = splitFeeCents(cents)
  const wantsCustom = customInitial !== undefined && customInitial !== null
  if (wantsCustom) {
    if (!shape.threePayment) return null
    const retainerCents = shape.retainerCents
    const customInitialCents = Math.round(Number(customInitial) * 100)
    if (!Number.isFinite(customInitialCents) || customInitialCents <= 0 || customInitialCents >= retainerCents) return null
    return {
      total: cents / 100,
      retainer: retainerCents / 100,
      implementation: shape.implementationCents / 100,
      initialRetainer: customInitialCents / 100,
      finalRetainer: (retainerCents - customInitialCents) / 100,
      threePayment: true,
      bufferBand: false,
    }
  }
  return {
    total: cents / 100,
    retainer: shape.retainerCents / 100,
    implementation: shape.implementationCents / 100,
    initialRetainer: shape.initialCents === null ? null : shape.initialCents / 100,
    finalRetainer: shape.finalCents === null ? null : shape.finalCents / 100,
    threePayment: shape.threePayment,
    bufferBand: shape.bufferBand,
  }
}

// null for anything the server would reject (blank, non-numeric, <= 0, > max) —
// which is also the signal every caller uses to disable its submit button.
// rawCustom is the optional custom initial retainer: leave it undefined for the
// flat-$15,000 schedule (every caller but the allowlisted Tax 3 form). A blank
// or non-numeric rawCustom is INVALID (null), never a silent fall back to flat.
function feeSplitFromInput(raw, rawCustom) {
  const cleaned = String(raw ?? '').replace(/[$,\s]/g, '')
  if (cleaned === '') return null
  if (rawCustom === undefined || rawCustom === null) return deriveFeeSplit(parseFloat(cleaned))
  const cleanedCustom = String(rawCustom).replace(/[$,\s]/g, '')
  if (cleanedCustom === '') return null
  return deriveFeeSplit(parseFloat(cleaned), parseFloat(cleanedCustom))
}

// ── Fee amendment (Tax 4 / Tax 5 "Amend fee" steps) ────────────────────────
// Everything below MIRRORS the edge repo's actions/tax/amend-fee.ts. The server
// is authoritative — it re-derives every payable amount from the submitted total
// and ignores anything computed here — so this exists purely so the admin sees
// the same numbers and the same refusal the server would produce. Change both
// together; a divergence shows up as a card that previews a schedule the submit
// then rejects.
//
// toCents is byte-for-byte amend-fee.ts's toCents(): a non-numeric string lands
// on 0 and is then rejected by the range test, so both sides refuse identically.
const amendToCents = (v) => {
  const n = parseFloat(String(v ?? '0').replace(/[,$\s]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
const fmtUsdCents = (cents) => `$${fmtMoney(cents / 100)}`
// amend-fee.ts's range message, verbatim (it ends in a period; the Tax 3 form's
// FEE_TOTAL_RANGE_MESSAGE above does not, and they are shown in different cards).
const AMEND_RANGE_MESSAGE = `Total fee must be greater than $0 and no more than $${MAX_TOTAL_FEE.toLocaleString('en-US')}.`

// Is this a 3-payment (initial + final retainer) plan? Same test as the edge
// repo's isThreePaymentPlan — keyed on FINAL, because two different 2-payment
// shapes carry an initial_retainer_amount: a plan a Tax 4 amendment below
// $31,000 converted (final nulled, initial kept as the marker that lets a later
// amendment reaching $31,000 convert back), and a BUFFER-BAND plan, which is
// written that way from the outset.
const isThreePaymentPlan = (pl) => isNewFeeProcess(pl) && pl?.final_retainer_amount != null

// The plan's CURRENT payment schedule, in the shape FeeBreakdown renders.
// Deliberately reads the STORED columns rather than re-deriving from the total:
// after an amendment a 3-payment plan can sit at a total deriveFeeSplit would
// call 2-payment (or the reverse), while the stored columns still say what is
// actually being collected. Returns null when the plan has no total (nothing to
// show).
function planFeeSchedule(pl) {
  const totalCents = amendToCents(pl?.total_fee)
  if (totalCents <= 0) return null
  const threePayment = isThreePaymentPlan(pl)
  return {
    total: totalCents / 100,
    retainer: amendToCents(pl?.retainer_amount) / 100,
    implementation: amendToCents(pl?.implementation_amount) / 100,
    initialRetainer: threePayment ? amendToCents(pl?.initial_retainer_amount) / 100 : null,
    finalRetainer: threePayment ? amendToCents(pl?.final_retainer_amount) / 100 : null,
    threePayment,
  }
}

// What the server WOULD store for `rawTotal` at this stage, or the error it
// would return. Mirrors amend-fee.ts's derivation branch for branch:
//
//   tax4 + an already-paid initial retainer, new total >= $31,000 -> the 50:50
//     split is RE-DERIVED from the new total and the already-paid initial
//     retainer is subtracted out of the retainer half, so only the FINAL
//     retainer and the implementation fee move. Refused when that would drive
//     the final retainer negative (i.e. below 2x the paid initial).
//   tax4 + an already-paid initial retainer, new total < $31,000 -> the plan is
//     2 payments: the paid initial becomes the whole retainer and the rest is
//     the implementation fee. That covers both a plain <= $30,000 total and one
//     inside the $30,000-$31,000 buffer band, which store identically.
//   every other shape (tax4 + 2-payment, tax5 either) -> the retainer side is
//     settled and untouchable, so the whole movement lands on the implementation
//     fee. $0.00 EXACTLY is allowed (the retainer already paid covers the whole
//     amended fee, so nothing further is due from the client); only a total BELOW
//     the settled retainer is refused.
//   both -> $0 < total <= MAX_TOTAL_FEE.
//
// Returns { empty: true } for a blank input (the not-yet-typed state — no error,
// no preview), { error } for anything the server would refuse, else { split }.
function amendFeePreview(pl, stage, rawTotal) {
  if (String(rawTotal ?? '').trim() === '') return { empty: true }
  const newTotalCents = amendToCents(rawTotal)
  if (newTotalCents <= 0 || newTotalCents > MAX_TOTAL_FEE * 100) return { error: AMEND_RANGE_MESSAGE }

  const threePayment = isThreePaymentPlan(pl)
  const initialCents = amendToCents(pl?.initial_retainer_amount)
  const retainerCents = amendToCents(pl?.retainer_amount)

  // Keyed on the initial retainer having been the collected payment (mirrors
  // amend-fee.ts) — true for a live 3-payment plan AND a converted one, so the
  // conversion is reversible in both directions until Client decision 1 is sent.
  if (stage === 'tax4' && initialCents > 0) {
    if (newTotalCents >= THREE_PAYMENT_MIN * 100) {
      const newRetainerCents = Math.round(newTotalCents / 2)
      const newImplCents = newTotalCents - newRetainerCents
      const newFinalCents = newRetainerCents - initialCents
      if (newFinalCents <= 0) {
        return { error: `Total must be more than $${(initialCents * 2 / 100).toLocaleString('en-US')} — the initial retainer of ${fmtUsdCents(initialCents)} is already paid` }
      }
      return {
        split: {
          total: newTotalCents / 100,
          // retainer_amount is DEFINED as initial + final on a 3-payment plan, and
          // amend-fee.ts writes it that way — not as round(total/2) — so the
          // preview must show the same sum.
          retainer: (initialCents + newFinalCents) / 100,
          implementation: newImplCents / 100,
          initialRetainer: initialCents / 100,
          finalRetainer: newFinalCents / 100,
          threePayment: true,
        },
      }
    }
    // Below $31,000 — at or below $30,000, or inside the $30,000-$31,000 buffer
    // band — the plan CONVERTS to 2 payments (mirrors amend-fee.ts): the paid
    // initial retainer becomes the whole retainer, there is no final retainer any
    // more, and the reduction lands on the implementation fee.
    if (newTotalCents <= initialCents) {
      return { error: `Total must be more than the initial retainer of ${fmtUsdCents(initialCents)} already paid` }
    }
    return {
      converts: true,
      split: {
        total: newTotalCents / 100,
        retainer: initialCents / 100,
        implementation: (newTotalCents - initialCents) / 100,
        initialRetainer: null,
        finalRetainer: null,
        threePayment: false,
      },
    }
  }

  const newImplCents = newTotalCents - retainerCents
  // $0.00 exactly is allowed (mirrors amend-fee.ts): the retainer already paid
  // covers the whole amended fee and nothing further is due. Only BELOW it — a
  // negative payment against money already collected — is refused.
  if (newImplCents < 0) return { error: 'Total cannot be less than the retainer already paid' }
  return {
    split: {
      total: newTotalCents / 100,
      retainer: retainerCents / 100,
      implementation: newImplCents / 100,
      initialRetainer: threePayment ? initialCents / 100 : null,
      finalRetainer: threePayment ? amendToCents(pl?.final_retainer_amount) / 100 : null,
      threePayment,
    },
  }
}

// A completed Tax 3 form stored BEFORE this process shipped carries its own
// retainer/implementation amounts, which are not necessarily a 50/50 split of the
// total — so those rows must keep rendering the two stored amounts verbatim.
// Presence of either key is the discriminator; new submissions send the total only.
const isLegacyFeeNotes = (existing) =>
  existing?.retainerPayment !== undefined || existing?.implementationFee !== undefined

const feeRowStyle = (strong) => ({ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--vfo-ink)', marginBottom: '4px', fontWeight: strong ? 700 : 400 })

// Read-only mirror of what the server will derive. `projected` (the Undecided
// quote) shows the same full schedule — only the labels/total header differ —
// so the rows always sum to the total on screen; the client-facing email still
// quotes just the initial retainer.
function FeeBreakdown({ split, projected = false, paidFlags = null }) {
  // "(50%)" only when it is actually true — an amended or converted schedule is
  // no longer an even split, and printing the suffix there would be a false claim.
  const isHalf = Math.abs((split.retainer ?? 0) * 2 - (split.total ?? 0)) < 0.01
  const pct = isHalf ? ' (50%)' : ''
  const rows = split.threePayment
    ? [['Initial Retainer', split.initialRetainer, 'initial'], ['Final Retainer', split.finalRetainer, 'final'], [`Implementation Fee${pct}`, split.implementation, 'implementation']]
    : projected
      ? [['Initial Retainer', split.retainer, 'retainer'], [`Implementation Fee${pct}`, split.implementation, 'implementation']]
      : [[`Retainer${pct}`, split.retainer, 'retainer'], [`Implementation Fee${pct}`, split.implementation, 'implementation']]
  return (
    <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
      <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Derived payment schedule</div>
      {rows.map(([label, amount, key]) => (
        <div key={label} style={feeRowStyle(false)}>
          <span>
            {label}
            {paidFlags?.[key] && <span style={{ marginLeft: '7px', padding: '1px 7px', borderRadius: '999px', background: '#e7f5ee', color: '#1a7f5a', fontSize: '10px', fontWeight: 700 }}>Paid</span>}
          </span>
          <span>${fmtMoney(amount)}</span>
        </div>
      ))}
      <div style={{ ...feeRowStyle(true), borderTop: '1px solid var(--vfo-border-chip)', paddingTop: '6px', marginTop: '6px' }}>
        <span>{projected ? 'Projected Total' : 'Total'}</span><span>${fmtMoney(split.total)}</span>
      </div>
      {split.threePayment && (
        <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '6px' }}>
          At ${THREE_PAYMENT_MIN.toLocaleString('en-US')} and above the retainer is collected in two payments — three payments in total.
        </div>
      )}
      {split.bufferBand && (
        <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '6px' }}>
          Between ${THREE_PAYMENT_THRESHOLD.toLocaleString('en-US')} and ${THREE_PAYMENT_MIN.toLocaleString('en-US')} the retainer is the flat ${INITIAL_RETAINER_FLAT.toLocaleString('en-US')} and the remainder is the implementation fee.
        </div>
      )}
    </div>
  )
}

// Completion dates on the tax track are DISPLAY ONLY (both programs) — the date
// is whatever the save recorded and is never hand-editable, so this deliberately
// shadows the shared editable StepDate control and ignores onChange/disabled.
// Every call site keeps the same shape as the read-only spans beside it.
const stepDateLabel = (d) => {
  if (!d) return ''
  const parts = String(d).split('-')
  return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : String(d)
}
const STEP_DATE_STYLE = { fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }
function StepDate({ value }) {
  return <span style={STEP_DATE_STYLE}>{stepDateLabel(value)}</span>
}

// Tax planner display name with certifications (professional designations) appended
// as a comma suffix: "Carson Grover, EA, CPA". DISPLAY ONLY — the value saved to the
// task status / tax_allocate_planner stays the plain full name. Module scope so the
// nested track view can use it without prop threading (gotcha #193).
const plannerPlainName = (pl) => `${pl?.first_name || ''} ${pl?.last_name || ''}`.trim()
const plannerCerts = (pl) => Array.isArray(pl?.certifications) ? pl.certifications.map(c => String(c || '').trim()).filter(Boolean) : []
const plannerDisplayName = (pl) => [plannerPlainName(pl), ...plannerCerts(pl)].filter(Boolean).join(', ')

// Tax-planner portal: the ONLY steps a planner may interact with. Mirrors the
// backend tax_save_task whitelist (PLANNER_EDITABLE_TASK_NAMES) plus the
// allocation step, which also calls tax_allocate_planner (a Team Member hands the
// plan to the Tax Planner who will run it). Every other step stays fully visible
// but locked (non-clickable) for planners. Names match program_client_tasks.name
// verbatim, identical across programs 1 and 4.
//
// 'Detailed tax plan meeting confirmation email' was on this list until
// 2026-08-18 and is REMOVED: that step became a VFO-team (Tray) step, and its
// action-required bell now goes to Tray. It saved through its own automation
// endpoint rather than tax_save_task, so the real boundary is the edge repo's
// constants/role-gates.ts, which no longer lists
// automation_TAX_highlevelmeeting_confirm for planners — a planner call 403s.
// Dropping the name is the ONLY frontend change needed: the row then falls to the
// standard plannerMode wrapper at the end of renderTask like every other
// non-whitelisted step — fully visible, cursor:not-allowed, pointerEvents:'none'
// (#262/#263) — which takes the Reschedule button with it.
const PLANNER_EDITABLE_TASK_NAMES = new Set([
  'Additional information required',
  'Allocate Team Member / Tax Planner',
  'Assess tax planning opportunities (and enter presentation details)',
  'Detailed tax plan presentation',
  'Client decision 1',
  'Client decision 2',
  'Tax planner review complete',
  'VFO specialist introductions / discussions',
  'Confirm ready for implementation',
  'Implementation decision',
  'ATP works with client & specialist to confirm implementation going to plan',
  'Specialist confirms implementation completed',
  'Specialist confirms VFOS Gross Rev',
  'PC confirms receipt of VFOS Gross Rev',
  // Added 2026-09-03 — see the AmendFeeStep header comment. These two save
  // through automation_TAX_amend_fee AND a following tax_save_task, so all three
  // #262 surfaces had to move together. Names are exact-matched against
  // program_client_tasks.name; the card itself is still located by its
  // status_options sentinel (#392), so a rename must touch this set too.
  'Amend fee',
  'Amend implementation fee',
])
const isPlannerEditable = (task) => PLANNER_EDITABLE_TASK_NAMES.has(task?.name)

// The allocation step, matched exactly as its renderer does. It is the one step
// whose progress status is a PERSON'S NAME rather than a status vocabulary word,
// so the generic read-only row further down cannot colour it — it must always
// reach its own branch, on every surface.
const isAllocTask = (task) => task?.status_options === 'tax_planner_select'
  || task?.name === 'Allocate Team Member / Tax Planner'
  || task?.name === 'Allocate to Advanced Tax Planner'

// Diron Insley — his clients get a display-only invoice discount (mirrors
// backend constants/tax-discount.ts; delete both to retire the special case).
const DISCOUNT_MEMBER_NUMBER = '59073'

// "Custom" — a permanent trailing entry in the Tax 5 specialist picker that
// allocates a row with NO linked expert (expert_id stays null; the backend
// stores the typed name as "Custom - <name>", owning the prefix). The sentinel
// is a string that can never collide with an expert id, and the entry is
// deliberately exempt from the already-allocated dedupe: one plan may carry
// several custom rows. Legacy rows named "Other #N (See notes)" still render.
const OTHER_SPEC_VALUE = '__other__'

// Tax 5 "+ Add Specialist" picker roster + labels.
// Roster: ONLY specialists assigned to the Tax Planning ecosystem (membership
// lives in vfo_ecosystem_assignments, delivered as load_data's `ecosystems`).
// Label: "<tax short bio> - <name>". Bio rule — `ecosystem_content` is the NEW
// array shape ({ ecosystem, short_bio, ... }) and the same ecosystem may repeat,
// so every Tax Planning entry with a non-empty short_bio contributes, in array
// order, joined with " / "; LEGACY rows (null / old object shape) have no
// per-ecosystem bio and fall back to the flat `experts.short_bio`.
// This label rule is MIRRORED server-side in the edge repo's
// actions/tax-planners/portal-experts.ts (which precomputes `tax_bio` for the
// planner portal, where load_data is never called) — change both together.
const TAX_ECOSYSTEM_NAME = 'Tax Planning'

function taxShortBio(e) {
  const stored = e?.ecosystem_content
  if (Array.isArray(stored)) {
    const bios = stored
      .filter(it => it && it.ecosystem === TAX_ECOSYSTEM_NAME && String(it.short_bio ?? '').trim())
      .map(it => String(it.short_bio).trim())
    if (bios.length) return bios.join(' / ')
  }
  return String(e?.short_bio ?? '').trim()
}

function withPickerLabels(rows) {
  return rows
    .map(s => ({ ...s, label: s.label || s.name }))
    .sort((a, b) => String(a.label).toLowerCase().localeCompare(String(b.label).toLowerCase()))
}

function taxSpecialistOptions(specialists, ecosystems, plannerMode) {
  const list = Array.isArray(specialists) ? specialists : []
  if (plannerMode) {
    // The planner roster arrives already ecosystem-filtered with a server-side
    // `tax_bio` — no ecosystem_content is (or should be) in that payload.
    return withPickerLabels(list.map(s => ({ ...s, label: s.tax_bio ? `${s.tax_bio} - ${s.name}` : s.name })))
  }
  const taxIds = new Set((Array.isArray(ecosystems) ? ecosystems : []).filter(a => a?.name === TAX_ECOSYSTEM_NAME).map(a => a.expert_id))
  // Defensive: if the assignment rows never arrived, show the whole roster
  // rather than an empty picker.
  // Admin sessions get the RAW load_data roster — every status, Lost and Removed
  // included — so the picker strips it to Active here. Defensive: a row with no
  // status counts as Active (load_data's non-admin path already ships Active
  // only, and planner rows carry no status at all). This narrows the OPTIONS
  // only; expertBios upstream is still built off the full roster, so a
  // specialist already allocated before they went Lost keeps rendering their
  // "bio - name" on the plan.
  const active = list.filter(s => (s?.status ? String(s.status).toLowerCase() === 'active' : true))
  const scoped = taxIds.size ? active.filter(s => taxIds.has(s.id)) : active
  return withPickerLabels(scoped.map(s => { const bio = taxShortBio(s); return { ...s, label: bio ? `${bio} - ${s.name}` : s.name } }))
}

// A plan belongs to program (plan.program_id || 1): NULL/undefined is legacy
// Holistic (program 1). A program view must render ONLY its own plans —
// tax_load_plans returns every plan for the client regardless of program, so a
// plan opened under the wrong program view drives the wrong plan's chains
// (gotcha #123). NOTE: the backend auto-stamps are no longer program-4-only —
// as of 2026-08-07 tax_returns_received_at stamps BOTH programs (program 4
// unconditionally, Holistic only when tax_returns_requested_at is set), so this
// filter is the UI contract, not a workaround for a one-sided backend (#340).
const plansForProgram = (plans, programId) =>
  (plans || []).filter(p => (p.program_id || 1) === (programId || 1))

// Phase badge tokens come from the phase NAME, never its render position: the
// track's business numbering ("Tax 1".."Tax 6") doesn't line up with an index —
// VFO Tax Planning leads with an unnumbered "Set Up" phase, and the two stored
// "Tax 5" phases render as one merged card. Set Up gets a letter so it reads as
// a pre-step outside the Tax 1-6 sequence.
const TAX5A_PHASE = 'Tax 5 - Education & DD (Specialist Allocation)'
const TAX5B_PHASE = 'Tax 5 - Education & DD (Post Allocation)'
const phaseBadgeToken = (name) => {
  if (name === 'Set Up') return 'S'
  const m = /^Tax (\d+)/.exec(name || '')
  return m ? m[1] : ''
}
// Descriptive half of the phase name — the badge already carries the number, so
// the stepper label doesn't repeat it ("1 / Diagnostic", not "1 / Tax 1").
const phaseShortLabel = (name) => {
  if (name === 'Set Up') return 'Set Up'
  const rest = (name || '').split(' - ').slice(1).join(' - ')
  return rest || name || ''
}

// Every status chip on this tab shares one geometry — the small tinted pill the
// allocation step uses for "Stripe Connected". chipStyle derives the tint and
// border from a single hex; anything that is not a hex (a CSS variable, e.g. the
// statusColors fallback) falls back to the neutral 'Not started' palette.
const hexToRgb = (hex) => {
  const h = String(hex || '').replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const n = parseInt(full, 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}
const neutralChipStyle = { fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'var(--vfo-tint)', color: 'var(--vfo-muted)', fontWeight: 600, border: '1px solid var(--vfo-border-chip)' }
const chipStyle = (hex) => {
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(hex || ''))) return neutralChipStyle
  const rgb = hexToRgb(hex)
  return { fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: `rgba(${rgb},0.15)`, color: hex, fontWeight: 600, border: `1px solid rgba(${rgb},0.3)` }
}

// Shared by every prerequisite-lock surface (locked step rows, the Green/Red Light
// Proceed hint, the Tax 6 header note) so they read as one thing.
// Status chip for the $250 deposit Team share (client_tax_plans.
// deposit_team_share_status). Null status = Proceed was clicked before the
// column existed, or the write is still in flight — nothing to report yet.
const DEPOSIT_TEAM_CHIP_COLORS = {
  'Yes': '#1b9254',
  'Failed': '#e74c3c',
  'Awaiting Planner Allocation': '#e06717',
  'N/A — No Deposit': 'var(--vfo-muted)',
}
function depositTeamChip(status) {
  const s = String(status || '')
  const color = DEPOSIT_TEAM_CHIP_COLORS[s]
  if (!color) return null
  const label = s === 'Yes' ? '$250 team share paid' : s === 'Failed' ? '$250 team share failed' : s
  return <span style={chipStyle(color)} title="Tax Planning Team share of the $500 deposit">{label}</span>
}

function LockedIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ opacity: 0.75, flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6.5" stroke="#e74c3c" strokeWidth="1.6" fill="none" />
      <line x1="3.9" y1="12.1" x2="12.1" y2="3.9" stroke="#e74c3c" strokeWidth="1.6" />
    </svg>
  )
}

const lockedHintStyle = { fontSize: '11px', color: 'var(--vfo-muted)', fontWeight: 500 }

// Display-only shortening. The stored program_client_tasks.name values are lookup
// keys across both repos (planner whitelists, done-math, bell titles, email chips),
// so they are never edited — only what the row prints.
const TASK_DISPLAY_LABELS = {
  'Tax Plan Green/Red Light - Refund $500 Deposit if unable to proceed based on the information provided': 'Tax Plan Green/Red Light',
  'Assess tax planning opportunities (and enter presentation details)': 'Assess tax planning opportunities',
  'Additional information required': 'Additional information required?',
}
const TASK_SUB_LABELS = {
  'Tax Plan Green/Red Light - Refund $500 Deposit if unable to proceed based on the information provided': 'Refund the $500 deposit if unable to proceed',
}
const taskLabel = (task) => TASK_DISPLAY_LABELS[task?.name] || task?.name
const taskSubLabel = (task) => TASK_SUB_LABELS[task?.name] || null
const taskSubLabelStyle = { fontSize: '11px', color: 'var(--vfo-muted)', fontWeight: 400, marginTop: '2px' }

// Done / In progress / Not started pill — module scope so the merged Tax 5 card
// can reuse it for the card header and both of its sub-sections (gotcha #193).
function PhasePill({ state, detail = '' }) {
  const base = { fontSize: '11px', padding: '3px 10px', borderRadius: '999px', fontWeight: 600 }
  if (state === 'done') return <span style={{ ...base, background: 'rgba(27,146,84,0.15)', color: '#1b9254', border: '1px solid rgba(27,146,84,0.3)' }}>Done</span>
  if (state === 'active') return <span style={{ ...base, background: 'rgba(0,149,255,0.15)', color: '#0095ff', border: '1px solid rgba(0,149,255,0.3)' }}>In progress{detail}</span>
  return <span style={{ ...base, background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)', fontWeight: 400 }}>Not started</span>
}

// The single fee input, its inline range error and the derived preview. Styles
// come from the host form so this reads as part of whichever card renders it.
// `rangeInvalid` overrides the "no split means the total is out of range" test
// for a caller whose split can also be nulled by something OTHER than the total
// (the custom initial retainer) — without it that caller would print the total's
// range error under a perfectly good total. `children` renders between the hint
// and the derived preview, so such a caller can put its own control there.
function TotalFeeField({ label, hint, value, onChange, split, readOnly = false, projected = false, inputStyle, readOnlyInput, labelStyle, rangeInvalid = null, children = null }) {
  const invalid = rangeInvalid !== null ? rangeInvalid : (!readOnly && !split && String(value || '').trim() !== '')
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="0.00"
          readOnly={readOnly}
          style={{ ...(readOnly ? readOnlyInput : inputStyle), paddingLeft: '28px', ...(invalid ? { borderColor: '#e74c3c' } : {}) }}
        />
      </div>
      {hint && !readOnly && <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '4px' }}>{hint}</div>}
      {invalid && <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '12px', marginTop: '6px' }}>{FEE_TOTAL_RANGE_MESSAGE}</div>}
      {children}
      {split && <FeeBreakdown split={split} projected={projected} />}
    </div>
  )
}

// The Tax 4 'Amend fee' / Tax 5b 'Amend implementation fee' step.
//
// ADMIN + TAX PLANNER since 2026-09-03 (both portal roles). It was admin-only
// until then, which left both amend steps unanswerable in the planner portal and
// — because each one GATES the decision step below it — dead-ended a planner at
// Tax 4. Widening took all three #262 surfaces at once: automation_TAX_amend_fee
// joined TAX_PLANNER_ALLOWED_ACTIONS, both task names joined the backend
// PLANNER_EDITABLE_TASK_NAMES (the step row is a SECOND tax_save_task call), and
// both joined the FE set below so this card escapes the inert plannerMode
// wrapper. The boundary is now amend-fee.ts's denyIfNotPlannerPlan group guard.
// `readOnly` is untouched and unrelated: the member/client track still shows the
// card inert.
//
// EVERY fee shape reaches this card, legacy included: on a legacy plan (and on
// a 2-payment revised plan, and on either at Tax 5b) the amendment lands wholly
// on the implementation fee — amendFeePreview's `stage === 'tax4' &&
// initialCents > 0` key is false without a paid initial retainer, so legacy
// always falls through to the implementation-only arm, and planFeeSchedule
// reads the stored columns off total_fee, which every priced legacy plan has.
//
// Two answers, both of which COMPLETE the step:
//   Keep    -> automation_TAX_amend_fee { keep: true }, which writes nothing but
//              confirms the fee as it stands, then the step row.
//   Amend   -> automation_TAX_amend_fee { new_total }, which re-derives every
//              downstream amount and scales the revenue-share legs server-side,
//              then the step row.
// The step row is saved ONLY after the call succeeds — a refused amendment must
// not leave a completed step behind. The amounts' truth is always the plan
// columns (#286): this card re-reads them from `plan` after every save, and the
// step's completion is proven by the progress row OR the fee_amended_at_* stamp.
function AmendFeeStep({ task, plan, stage, status, completedDate, readOnly, onAnswer }) {
  const [mode, setMode] = useState('')          // '' | 'amend'
  const [totalInput, setTotalInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const stamp = stage === 'tax4' ? plan?.fee_amended_at_tax4 : plan?.fee_amended_at_tax5
  // The revised invoice is NOT sent here — it rides with the next client email
  // (Client decision 1 for tax4, the implementation decision for tax5) into the
  // original invoice thread. These two stamps say where that stands.
  const revisedSentAt = plan?.amended_invoice_sent_at
  const revisedPending = !!stamp && (!revisedSentAt || new Date(revisedSentAt) < new Date(stamp))
  const revisedDone = !!stamp && !!revisedSentAt && new Date(revisedSentAt) >= new Date(stamp)
  // Mirrors isTaskStatused's rule for these two sentinels, and the backend's
  // (utils/tax-plan-steps.ts + amendFeeStepState): the progress row is the
  // normal proof, the stamp is the independent one.
  const answered = !!status || !!stamp
  const amended = !!stamp || status === 'Completed - Amended'
  const current = planFeeSchedule(plan)
  const green = '#1b9254'
  // The answer stays CHANGEABLE until the downstream decision goes out — the
  // same boundary the backend enforces (amend-fee.ts 400s once
  // post_review_decision / implementation_decision is recorded).
  const lockedDownstream = stage === 'tax4' ? !!plan?.post_review_decision : !!plan?.implementation_decision
  const editable = !readOnly && !lockedDownstream
  // Which schedule components have actually been collected — shown as a Paid
  // tag beside the row in every breakdown this card renders.
  const paidFlags = {
    initial: plan?.retainer_status === 'succeeded',
    retainer: plan?.retainer_status === 'succeeded',
    final: plan?.final_retainer_status === 'succeeded',
    implementation: plan?.implementation_charge_status === 'succeeded',
  }

  const preview = mode === 'amend' ? amendFeePreview(plan, stage, totalInput) : null
  const canSubmitAmend = !!preview?.split && !busy

  async function submit(kind) {
    if (busy) return
    setBusy(true)
    setSubmitError('')
    try {
      const body = { tax_plan_id: plan.id, stage }
      if (kind === 'keep') body.keep = true
      else body.new_total = totalInput
      const res = await callApi('automation_TAX_amend_fee', body)
      // The server re-checks every money guard (retainer settled, decision not
      // yet sent, nothing in flight) — show its refusal verbatim and leave the
      // step OPEN so it can still be answered once the blocker clears.
      if (res?.error) { setSubmitError(res.error); return }
      await onAnswer(kind === 'keep' ? 'Completed - Kept' : 'Completed - Amended')
      setMode('')
      setTotalInput('')
    } catch (err) {
      setSubmitError(err?.message || 'unknown error')
    } finally {
      setBusy(false)
    }
  }

  const rowStyle = { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', flexWrap: 'wrap' }
  const amendInputStyle = { padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', width: '180px', boxSizing: 'border-box' }

  return (
    <div style={{ borderBottom: '1px solid var(--vfo-border-soft)' }}>
      <div style={rowStyle}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: answered ? green : 'transparent', flexShrink: 0, border: `1.5px solid ${answered ? green : 'var(--vfo-border-mid)'}` }} />
        <span style={{ fontSize: '13px', color: answered ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}</span>
        {answered && !editable ? (
          <span style={chipStyle(green)}>{amended ? 'Amended' : 'Fee kept'}</span>
        ) : editable ? (
          // House convention: dropdowns make selections, buttons send emails.
          // "Keep the fee" completes the step on selection, like every other
          // dropdown step; "Amend the fee" opens the amount form below (the
          // actual amendment saves from its own button). The selection stays
          // changeable until the downstream decision email goes out; once the
          // fee has actually been amended, "keep" would be meaningless (the
          // amounts already moved), so re-amending is the offered change.
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {amended && mode !== 'amend' && (
              <button disabled={busy} onClick={() => { setSubmitError(''); setMode('amend') }} style={{ border: 'none', background: 'transparent', color: '#125ecc', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', padding: 0 }}>Change amount</button>
            )}
            {(() => {
              const selValue = mode === 'amend' ? 'amend' : (answered ? (amended ? 'amend' : 'keep') : '')
              // EXACTLY the generic step dropdown's look (the renderTaskInner
              // fallback select): same padding/radius/size, green border + text
              // once committed, plain while unanswered or mid-edit.
              const committed = answered && mode !== 'amend'
              return (
                <select
                  disabled={busy}
                  value={selValue}
                  onChange={e => {
                    const v = e.target.value
                    setSubmitError('')
                    if (v === 'keep' && !amended) {
                      // A selection here COMMITS the step (and unlocks the next
                      // one), so it confirms first — a mis-click must not
                      // complete a money step.
                      if (window.confirm(`Keep the fee at $${current ? fmtMoney(current.total) : ''}? This completes the step.`)) submit('keep')
                    }
                    else if (v === 'amend') setMode('amend')
                    else { setMode(''); setTotalInput('') }
                  }}
                  style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '12px', fontFamily: 'Inter, sans-serif', minWidth: '150px', borderColor: committed ? '#1b925466' : 'var(--vfo-border-strong)', color: committed ? '#1b9254' : 'var(--vfo-ink)', opacity: busy ? 0.6 : 1 }}
                >
                  <option value="">-- Select --</option>
                  <option value="keep" disabled={amended}>Keep the fee</option>
                  <option value="amend">Amend the fee</option>
                </select>
              )
            })()}
          </div>
        ) : null}
        <StepDate value={completedDate || ''} />
      </div>

      {/* Answered: what happened, plus the schedule that is now in force. */}
      {answered && current && mode !== 'amend' && (
        <div style={{ marginLeft: '18px', marginBottom: '10px' }}>
          <div style={{ fontSize: '12px', color: 'var(--vfo-ink)', fontWeight: 600 }}>
            {amended ? `Fee amended to $${fmtMoney(current.total)}` : `Fee kept at $${fmtMoney(current.total)}`}
          </div>
          <FeeBreakdown split={current} paidFlags={paidFlags} />
        </div>
      )}

      {/* Unanswered (or re-editing an answered step): the current schedule is
          always visible, so the decision is made against real numbers rather
          than from memory. */}
      {editable && (!answered || mode === 'amend') && (current || mode === 'amend') && (
        <div style={{ marginLeft: '18px', marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>
            {stage === 'tax4'
              ? 'Confirm the fee before Client decision 1 goes out — that email quotes these figures.'
              : 'Confirm the implementation fee before Client decision 2 — only the implementation fee can still move.'}
          </div>
          {current && <FeeBreakdown split={current} paidFlags={paidFlags} />}
          {mode === 'amend' && (
            <div style={{ marginTop: '10px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>New total fee</label>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                <input
                  value={totalInput}
                  onChange={e => { setTotalInput(e.target.value); setSubmitError('') }}
                  placeholder="0.00"
                  style={{ ...amendInputStyle, paddingLeft: '28px', ...(preview?.error ? { borderColor: '#e74c3c' } : {}) }}
                />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '4px' }}>
                {stage === 'tax4' && amendToCents(plan?.initial_retainer_amount) > 0
                  ? 'At $31,000 or more the 50:50 split is re-derived from the new total; the initial retainer is already paid, so only the final retainer and the implementation fee move. Below $31,000 the plan is two payments: the initial retainer already paid becomes the whole retainer and the rest is the implementation fee (it converts back if amended to $31,000 or more).'
                  : 'The retainer is already paid, so the whole change lands on the implementation fee.'}
              </div>
              {preview?.converts && (
                <div style={{ fontSize: '12px', color: '#e06717', fontWeight: 600, marginTop: '6px' }}>
                  Converts to 2 payments: the ${fmtMoney((amendToCents(plan?.initial_retainer_amount)) / 100)} initial retainer already paid becomes the full retainer — no final retainer will be collected, and Client decision 1 releases the revenue share immediately.
                </div>
              )}
              {preview?.split?.implementation === 0 && (
                <div style={{ fontSize: '12px', color: '#e06717', fontWeight: 600, marginTop: '6px' }}>
                  The retainer already paid covers the whole fee: no implementation fee will be collected, and nothing further is due from the client.
                </div>
              )}
              {preview?.error && <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '12px', marginTop: '6px' }}>{preview.error}</div>}
              {preview?.split && <FeeBreakdown split={preview.split} paidFlags={paidFlags} />}
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button disabled={!canSubmitAmend} onClick={() => submit('amend')} style={{ padding: '6px 16px', borderRadius: '6px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '12px', cursor: canSubmitAmend ? 'pointer' : 'not-allowed', opacity: canSubmitAmend ? 1 : 0.5 }}>
                  {busy ? 'Saving...' : 'Save amended fee'}
                </button>
                <button disabled={busy} onClick={() => { setMode(''); setTotalInput(''); setSubmitError('') }} style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Outside the schedule block on purpose: the server's refusal must be
          visible even on a plan with no stored total to draw a schedule from.
          NOT gated on !answered: a re-amend ("Change amount") on an ALREADY
          answered step can be refused too — a cancelled/in-flight charge — and
          swallowing that refusal renders the save as "nothing happened". */}
      {submitError && (
        <div style={{ marginLeft: '18px', marginBottom: '10px', color: '#e74c3c', fontWeight: 500, fontSize: '12px' }}>{submitError}</div>
      )}
      {revisedPending && (
        <div style={{ marginLeft: '18px', marginBottom: '10px', color: 'var(--vfo-muted)', fontSize: '11px' }}>
          A revised invoice (same number, original and revised fee shown) will be drafted into the original invoice email thread when the {stage === 'tax4' ? 'Client decision 1' : 'implementation decision'} email is sent.
        </div>
      )}
      {revisedDone && (
        <div style={{ marginLeft: '18px', marginBottom: '10px', color: 'var(--vfo-muted)', fontSize: '11px' }}>
          Revised invoice drafted {new Date(revisedSentAt).toLocaleDateString()}{plan.amended_invoice_threaded === false ? ' as a new email (original thread not found)' : ' in the original invoice email thread'}.
        </div>
      )}
    </div>
  )
}

function TaxDecisionForm({ task, plan, saveTask, taxSpecialistId, existingData, onSubmitted, memberCategory, memberType, programType, memberNumber }) {
  const existing = existingData || {}
  const isViewMode = !!existingData
  const isDironInsley = memberNumber === DISCOUNT_MEMBER_NUMBER
  // Strategic members get a fixed three-way split (Strategic Partner Share +
  // member + VFOS), auto-computed off the total fee. programType is 'holistic'
  // (Tax Priorities, program_id 1) or 'tax' (Tax Planning, program_id 4).
  const isStrategic = memberCategory === 'strategic_member' && hasStrategicSplit(memberType)

  const [decision, setDecision] = useState(existing.decision || '')
  const [memberPayingOnBehalf, setMemberPayingOnBehalf] = useState(existing.memberPayingOnBehalf || 'No')
  const [taxRiskMindset, setTaxRiskMindset] = useState(existing.taxRiskMindset || '')
  const [retainerPayment] = useState(existing.retainerPayment || '')
  const [implementationFee] = useState(existing.implementationFee || '')
  const [totalFeeInput, setTotalFeeInput] = useState(existing.totalFee || '')
  // Custom INITIAL retainer, allowlisted clients only — NOT the revenue
  // `splitType === 'Custom'` further down. A completed form that stored one
  // re-opens with the toggle already on, so view mode shows what was quoted.
  const [customInitialEnabled, setCustomInitialEnabled] = useState(
    existing.customInitialRetainer != null && existing.customInitialRetainer !== ''
  )
  const [customInitialInput, setCustomInitialInput] = useState(
    existing.customInitialRetainer != null ? String(existing.customInitialRetainer) : ''
  )
  const [splitType, setSplitType] = useState(existing.splitType || '')
  const [memberShare, setMemberShare] = useState(existing.memberShare || '')
  const [taxPlannerShare, setTaxPlannerShare] = useState(existing.taxPlannerShare || '')
  const [vfosShare, setVfosShare] = useState(existing.vfosShare || '')
  const [strategicPartnerShare, setStrategicPartnerShare] = useState(existing.strategicPartnerShare || '')
  const [potentialTaxSavings, setPotentialTaxSavings] = useState(existing.potentialTaxSavings || '')
  const [initialRetainer] = useState(existing.initialRetainer || '')
  const [projectedTotalInput, setProjectedTotalInput] = useState(existing.totalFee || '')
  const [presentationLink, setPresentationLink] = useState(existing.presentationLink || '')
  const [discountToggle, setDiscountToggle] = useState((existing.discountApplied != null && existing.discountApplied !== '') ? 'Yes' : 'No')
  const [discountApplied, setDiscountApplied] = useState((existing.discountApplied != null && existing.discountApplied !== '') ? String(existing.discountApplied) : '')
  const [submitting, setSubmitting] = useState(false)

  // Legacy completed forms render their two stored amounts; everything from
  // 2026-08-25 on is driven by the single total the admin types.
  const isLegacyFees = isLegacyFeeNotes(existing)
  const isLegacyUndecided = existing.initialRetainer !== undefined
  // The flat-$15,000 schedule the total alone implies. Also the only test of
  // whether the TOTAL is in range, and the gate for offering a custom split at
  // all (the custom initial only exists on a 3-payment total).
  const flatFeeSplit = feeSplitFromInput(totalFeeInput)
  const customSplitAllowed = CUSTOM_SPLIT_CLIENT_IDS.includes(plan?.client_id)
  const customInitialOffered = customSplitAllowed && !!flatFeeSplit?.threePayment
  const customInitialActive = customInitialOffered && customInitialEnabled
  const customFeeSplit = customInitialActive ? feeSplitFromInput(totalFeeInput, customInitialInput) : null
  // What the server will store: the custom schedule while one is being quoted,
  // else the flat one — null (which blocks submit) while a requested custom
  // initial is still blank or out of range.
  const feeSplit = customInitialActive ? customFeeSplit : flatFeeSplit
  // Red hint only once something has been typed, matching TotalFeeField.
  const customInitialInvalid = customInitialActive && !customFeeSplit && String(customInitialInput || '').trim() !== ''
  const projectedSplit = feeSplitFromInput(projectedTotalInput)
  // The revenue split still validates against the total, whichever shape supplied
  // it — read off the FLAT split so an in-progress custom initial never zeroes
  // the auto-computed shares (the total is identical in both splits).
  const totalFee = isLegacyFees
    ? (parseFloat(retainerPayment) || 0) + (parseFloat(implementationFee) || 0)
    : (flatFeeSplit?.total || 0)

  useEffect(() => {
    if (isViewMode) return
    if (splitType === '1/3 Member, 1/3 Tax Planner, 1/3 VFOS') {
      const share = (totalFee / 3).toFixed(2)
      const vs = (totalFee - parseFloat(share) - parseFloat(share)).toFixed(2)
      setMemberShare(share)
      setTaxPlannerShare(share)
      setVfosShare(vs)
    }
  }, [splitType, totalFee])

  // Strategic members: fixed split auto-computed off the total fee. Tax
  // Priorities uses the 'tax' rules for BOTH programs (program 1 and 4).
  useEffect(() => {
    if (isViewMode || !isStrategic) return
    if (splitType !== 'Strategic Partner') setSplitType('Strategic Partner')
    const shares = computeStrategicShares(memberType, 'tax', totalFee)
    if (shares) {
      setMemberShare(shares.member.toFixed(2))
      setTaxPlannerShare((shares.planner ?? 0).toFixed(2))
      setVfosShare(shares.vfos.toFixed(2))
      setStrategicPartnerShare(shares.strategic.toFixed(2))
    } else {
      setMemberShare(''); setTaxPlannerShare(''); setVfosShare(''); setStrategicPartnerShare('')
    }
  }, [isStrategic, memberType, totalFee, splitType])

  // Custom split: all three shares (member, tax-planner, VFOS) are freely
  // editable and must sum to the total fee (validated on submit). The preset
  // and Strategic splits stay auto-computed.
  function handleMemberShareChange(val) { setMemberShare(val) }
  function handlePlannerShareChange(val) { setTaxPlannerShare(val) }

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }
  const sectionStyle = { background: 'var(--vfo-tint)', borderRadius: '8px', padding: '16px', marginBottom: '12px', border: '1px solid var(--vfo-border-chip)' }
  const readOnlyInput = { ...inputStyle, opacity: 0.6, pointerEvents: 'none' }

  async function handleSubmit() {
    if (!decision) return
    if (decision === 'Yes' && !feeSplit) return
    if (decision === 'Undecided' && !projectedSplit) return
    if (decision === 'Yes' && String(taxRiskMindset ?? '').trim() === '') {
      alert('Please select a tax risk mindset.')
      return
    }
    // Toggle Yes with no usable amount is NOT an error — it submits as
    // no-discount (the key is simply omitted below). Blocking here used to be
    // the only thing standing between an admin and a stuck form, and the
    // backend already stores 0/blank as NULL, so the two agree.
    if (decision === 'Yes' && splitType === 'Custom') {
      const splitTotal = (parseFloat(memberShare) || 0) + (parseFloat(taxPlannerShare) || 0) + (parseFloat(vfosShare) || 0)
      if (Math.abs(splitTotal - totalFee) > 0.01) return
    }
    setSubmitting(true)
    const formData = { decision, presentationLink, memberPayingOnBehalf }
    if (decision === 'Yes') {
      formData.taxRiskMindset = taxRiskMindset
      formData.totalFee = feeSplit.total.toFixed(2)
      // Only ever present for an allowlisted client with the toggle on and a
      // valid amount — the server refuses the key for anyone else, and its
      // absence is what restores the flat $15,000 initial retainer.
      if (customInitialActive) formData.customInitialRetainer = feeSplit.initialRetainer.toFixed(2)
      formData.splitType = splitType
      formData.memberShare = memberShare
      formData.taxPlannerShare = taxPlannerShare
      formData.vfosShare = vfosShare
      if (isStrategic) formData.strategicPartnerShare = strategicPartnerShare
      // > 0 or nothing at all: an empty, zero or unparseable amount omits the
      // key entirely, which is exactly the shape a 'No' toggle sends.
      if (isDironInsley && discountToggle === 'Yes' && parseFloat(discountApplied) > 0) {
        formData.discountApplied = parseFloat(discountApplied)
      }
    } else if (decision === 'Undecided') {
      // Same money-clean as feeSplitFromInput: the server parseFloats this
      // straight, so a typed "$757,805" would reach the email as NaN ("$TBD").
      formData.potentialTaxSavings = String(potentialTaxSavings ?? '').replace(/[$,\s]/g, '')
      formData.totalFee = projectedSplit.total.toFixed(2)
    }
    try {
      await callApi('tax_save_task', {
        tax_plan_id: plan.id,
        task_id: task.id,
        status: `Completed - ${decision}`,
        completed_date: new Date().toISOString().split('T')[0],
        notes: JSON.stringify(formData),
        tax_specialist_id: taxSpecialistId || null
      })
      await callApi('automation_TAX_decision', {
        tax_plan_id: plan.id,
        decision,
        form_data: formData,
      })
      if (onSubmitted) onSubmitted(`Completed - ${decision}`, formData)
    } catch (err) {
      console.error(err)
      alert('Submit failed: ' + (err?.message || 'unknown error'))
    }
    finally { setSubmitting(false) }
  }

  const riskOptions = [
    'Yes — Risk 1 — Very Conservative Mindset',
    'Yes — Risk 2 - Moderately Conservative Mindset',
    'Yes — Risk 3 — Average Risk Mindset',
    'Yes — Risk 4 — Moderately Aggressive Mindset',
    'Yes — Risk 5 — Very Aggressive Mindset',
  ]
  const splitOptions = ['1/3 Member, 1/3 Tax Planner, 1/3 VFOS', 'Custom']
  const isCustomSplit = splitType === 'Custom'
  const isPresetSplit = splitType && !isCustomSplit
  const isLegacySplit = splitType && !isCustomSplit && splitType !== 'Strategic Partner' && !splitOptions.includes(splitType)
  const needsPlannerAllocation = decision === 'Yes' && !plan?.tax_planner_id
  // Custom split must sum to the total fee (mirrors MAP 1 PIPDecisionForm).
  const customSplitTotal = (parseFloat(memberShare) || 0) + (parseFloat(taxPlannerShare) || 0) + (parseFloat(vfosShare) || 0)
  const customSplitMismatch = decision === 'Yes' && isCustomSplit && Math.abs(customSplitTotal - totalFee) > 0.01
  const feeMissing = (decision === 'Yes' && !feeSplit) || (decision === 'Undecided' && !projectedSplit)
  // The field prints the range error itself once something invalid is typed; this
  // only covers the still-blank case, so a greyed-out button always has a reason.
  const feeBlank = feeMissing && String((decision === 'Yes' ? totalFeeInput : projectedTotalInput) || '').trim() === ''
  // A requested custom initial retainer that is blank or out of range blocks the
  // submit (feeSplit is already null there — this states it in its own right so
  // the reason is not buried in feeMissing).
  const customInitialBlocking = decision === 'Yes' && customInitialActive && !customFeeSplit
  const blockSubmit = submitting || needsPlannerAllocation || customSplitMismatch || feeMissing || customInitialBlocking

  return (
    <div style={{ marginLeft: '18px', padding: '16px', background: 'var(--vfo-tint)', borderRadius: '10px', border: '1px solid var(--vfo-tint-deep)', marginTop: '4px', marginBottom: '8px' }}>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Is the member signing and paying on behalf of the client?</label>
        {isViewMode
          ? <div style={{ ...inputStyle, opacity: 0.6 }}>{memberPayingOnBehalf}</div>
          : <select value={memberPayingOnBehalf} onChange={e => setMemberPayingOnBehalf(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
        }
        {memberPayingOnBehalf === 'Yes' && !isViewMode && (
          <div style={{ fontSize: '12px', color: '#e06717', fontWeight: 600, marginTop: '6px' }}>
            The member-paid agreement &amp; emails will be used: addressed to the member, with the client CC'd, and the member signs &amp; pays.
          </div>
        )}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Client decision</label>
        {isViewMode
          ? <div style={{ ...inputStyle, opacity: 0.6 }}>{decision}</div>
          : <select value={decision} onChange={e => setDecision(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
              <option value="">-- Select --</option>
              <option value="Yes">Yes</option>
              <option value="Undecided">Undecided</option>
              <option value="No">No</option>
            </select>
        }
      </div>

      {decision === 'Yes' && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Tax risk mindset</label>
            {isViewMode
              ? <div style={readOnlyInput}>{taxRiskMindset || '—'}</div>
              : <select value={taxRiskMindset} onChange={e => setTaxRiskMindset(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                  <option value="">-- Select --</option>
                  {riskOptions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
            }
          </div>

          <div style={sectionStyle}>
            <div style={{ fontSize: '12px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Fee details</div>
            {isLegacyFees ? (
              <>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <label style={labelStyle}>Retainer payment</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                      <input value={retainerPayment} readOnly style={{ ...readOnlyInput, paddingLeft: '28px' }} />
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <label style={labelStyle}>Implementation fee</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                      <input value={implementationFee} readOnly style={{ ...readOnlyInput, paddingLeft: '28px' }} />
                    </div>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Total fee</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                    <input value={existing.totalFee || totalFee.toFixed(2)} readOnly style={{ ...readOnlyInput, paddingLeft: '28px', background: 'rgba(27,146,84,0.08)', borderColor: 'rgba(27,146,84,0.2)' }} />
                  </div>
                </div>
              </>
            ) : (
              <TotalFeeField
                label="Total tax planning fee"
                value={totalFeeInput}
                onChange={setTotalFeeInput}
                split={feeSplit}
                readOnly={isViewMode}
                inputStyle={inputStyle}
                readOnlyInput={readOnlyInput}
                labelStyle={labelStyle}
                rangeInvalid={!isViewMode && !flatFeeSplit && String(totalFeeInput || '').trim() !== ''}
              >
                {customInitialOffered && (
                  <div style={{ marginTop: '10px' }}>
                    {isViewMode
                      ? (customInitialEnabled ? <label style={labelStyle}>Custom payment split</label> : null)
                      : (
                        <button
                          type="button"
                          onClick={() => setCustomInitialEnabled(v => !v)}
                          style={{
                            fontSize: '11px', padding: '3px 10px', borderRadius: '999px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                            ...(customInitialEnabled
                              ? { background: 'rgba(0,149,255,0.15)', color: '#0095ff', border: '1px solid rgba(0,149,255,0.3)' }
                              : { background: 'var(--vfo-tint)', color: 'var(--vfo-muted)', border: '1px solid var(--vfo-border-chip)' }),
                          }}
                        >
                          Allow custom split
                        </button>
                      )}
                    {customInitialEnabled && (
                      <div style={{ marginTop: '10px' }}>
                        <label style={labelStyle}>Custom initial retainer</label>
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                          <input
                            value={customInitialInput}
                            onChange={e => setCustomInitialInput(e.target.value)}
                            placeholder="0.00"
                            readOnly={isViewMode}
                            style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px', ...(customInitialInvalid ? { borderColor: '#e74c3c' } : {}) }}
                          />
                        </div>
                        {!isViewMode && (
                          <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '4px' }}>
                            Replaces the flat ${INITIAL_RETAINER_FLAT.toLocaleString('en-US')} initial retainer. The final retainer and the implementation fee stay derived — only the initial/final boundary moves.
                          </div>
                        )}
                        {customInitialInvalid && <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '12px', marginTop: '6px' }}>{CUSTOM_INITIAL_RANGE_MESSAGE}</div>}
                      </div>
                    )}
                  </div>
                )}
              </TotalFeeField>
            )}
          </div>

          <div style={sectionStyle}>
            <div style={{ fontSize: '12px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Revenue split</div>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Split type</label>
              {isViewMode || isStrategic
                ? <div style={readOnlyInput}>{isStrategic ? `Strategic Partner (${memberType}) — auto-calculated` : (splitType || '—')}</div>
                : <select value={splitType} onChange={e => setSplitType(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                    <option value="">-- Select --</option>
                    {splitOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    {isLegacySplit && <option value={splitType} disabled>{splitType} (legacy)</option>}
                  </select>
              }
            </div>
            {splitType && (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {(isStrategic || strategicPartnerShare) && (
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <label style={labelStyle}>Strategic Partner share</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                      <input value={strategicPartnerShare} readOnly placeholder="0.00" style={{ ...readOnlyInput, paddingLeft: '28px' }} />
                    </div>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label style={labelStyle}>Member share</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                    <input value={memberShare} onChange={e => handleMemberShareChange(e.target.value)} placeholder="0.00" readOnly={isViewMode || isPresetSplit} style={{ ...(isViewMode || isPresetSplit ? readOnlyInput : inputStyle), paddingLeft: '28px' }} />
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label style={labelStyle}>Tax Planner share</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                    <input value={taxPlannerShare} onChange={e => handlePlannerShareChange(e.target.value)} placeholder="0.00" readOnly={isViewMode || isPresetSplit} style={{ ...(isViewMode || isPresetSplit ? readOnlyInput : inputStyle), paddingLeft: '28px' }} />
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label style={labelStyle}>VFOS share</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                    <input value={vfosShare} onChange={e => setVfosShare(e.target.value)} placeholder="0.00" readOnly={isViewMode || isPresetSplit} style={{ ...(isViewMode || isPresetSplit ? readOnlyInput : inputStyle), paddingLeft: '28px' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {isDironInsley && (
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Discount applied due to previous Diron Insley planning issue?</label>
              {isViewMode
                ? <div style={{ ...inputStyle, opacity: 0.6 }}>{discountToggle}</div>
                : <select value={discountToggle} onChange={e => setDiscountToggle(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
              }
              {discountToggle === 'Yes' && (
                <div style={{ marginTop: '10px' }}>
                  <label style={labelStyle}>Discount applied ($)</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                    <input value={discountApplied} onChange={e => setDiscountApplied(moneyDigitsOnly(e.target.value))} inputMode="decimal" placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '4px' }}>Discount applied due to previous planning issue</div>
                  {/* Only a REAL discount gets a preview. At 0 or blank this
                      submits as no-discount, so a "-$0.00" line would be
                      describing an invoice line that will never exist. */}
                  {parseFloat(discountApplied) > 0 && (
                  <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Invoice preview</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--vfo-ink)', marginBottom: '4px' }}>
                      <span>Tax Planning Fee</span>
                      <span>${fmtMoney(totalFee + (parseFloat(discountApplied) || 0))}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#dc2626', fontWeight: 600, marginBottom: '4px' }}>
                      <span>Discount Applied*</span>
                      <span>-${fmtMoney(parseFloat(discountApplied) || 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: 700, borderTop: '1px solid var(--vfo-border-chip)', paddingTop: '6px', marginTop: '6px' }}>
                      <span>Net Payable</span>
                      <span>${fmtMoney(totalFee)}</span>
                    </div>
                  </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {decision === 'Undecided' && (
        <div style={sectionStyle}>
          <div style={{ fontSize: '12px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Meeting figures</div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={labelStyle}>Potential tax savings</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                <input value={potentialTaxSavings} onChange={e => setPotentialTaxSavings(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
              </div>
            </div>
            {isLegacyUndecided && (
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={labelStyle}>Initial retainer</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                  <input value={initialRetainer} readOnly style={{ ...readOnlyInput, paddingLeft: '28px' }} />
                </div>
              </div>
            )}
          </div>
          {!isLegacyUndecided && (
            <div style={{ marginTop: '12px' }}>
              <TotalFeeField
                label="Projected total tax planning fee"
                hint="The client is quoted the initial retainer only — the rest of the schedule follows once they commit."
                value={projectedTotalInput}
                onChange={setProjectedTotalInput}
                split={projectedSplit}
                readOnly={isViewMode}
                projected
                inputStyle={inputStyle}
                readOnlyInput={readOnlyInput}
                labelStyle={labelStyle}
              />
            </div>
          )}
        </div>
      )}

      {decision && (
        <>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '12px' }}>
            Extra Cc is now managed on the client profile (Additional Contacts).
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Presentation link</label>
            <input value={presentationLink} onChange={e => setPresentationLink(e.target.value)} placeholder="Paste Google Drive link to presentation..." style={isViewMode ? readOnlyInput : inputStyle} readOnly={isViewMode} />
            {!isViewMode && <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '4px' }}>Export your presentation slides as a PDF, upload to Google Drive, then set sharing to "Anyone with the link can view" and paste the link here</div>}
          </div>


          {!isViewMode && (
            <>
              {needsPlannerAllocation && (
                <div style={{ fontSize: '12px', color: '#e06717', fontWeight: 600, marginBottom: '8px' }}>You must allocate a tax planner before submitting.</div>
              )}
              {feeBlank && (
                <div style={{ fontSize: '12px', color: '#e06717', fontWeight: 600, marginBottom: '8px' }}>{decision === 'Yes' ? 'Enter the total tax planning fee before submitting.' : 'Enter the projected total tax planning fee before submitting.'}</div>
              )}
              {customSplitMismatch && (
                <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>Revenue split (${customSplitTotal.toFixed(2)}) must equal Total Fee (${totalFee.toFixed(2)})</div>
              )}
              <button onClick={handleSubmit} disabled={blockSubmit} style={{ width: '100%', padding: '12px', borderRadius: '8px', background: blockSubmit ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: blockSubmit ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                {submitting ? 'Submitting...' : 'Submit Outcome'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

// Compact pricing form for Phase 4c: admin completes pricing after the client
// picked Yes (or Yes-via-extra-meeting). Mirrors the Yes-branch fields of
// TaxDecisionForm but with no decision dropdown and a configurable submit
// handler so the same component can fire either automation_TAX_pricing or
// automation_TAX_extrameeting.
function TaxPricingForm({ submitLabel = 'Submit', onSubmit, onCancel, memberCategory, memberType, programType, memberNumber, plan }) {
  const isStrategic = memberCategory === 'strategic_member' && hasStrategicSplit(memberType)
  const isDironInsley = memberNumber === DISCOUNT_MEMBER_NUMBER
  const needsPlannerAllocation = !plan?.tax_planner_id
  const [taxRiskMindset, setTaxRiskMindset] = useState('')
  const [totalFeeInput, setTotalFeeInput] = useState('')
  const [splitType, setSplitType] = useState('')
  const [memberShare, setMemberShare] = useState('')
  const [taxPlannerShare, setTaxPlannerShare] = useState('')
  const [vfosShare, setVfosShare] = useState('')
  const [strategicPartnerShare, setStrategicPartnerShare] = useState('')
  const [discountToggle, setDiscountToggle] = useState('No')
  const [discountApplied, setDiscountApplied] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // This form only ever prices a NEW plan, so there is no legacy shape to render.
  const feeSplit = feeSplitFromInput(totalFeeInput)
  const totalFee = feeSplit?.total || 0

  useEffect(() => {
    if (splitType === '1/3 Member, 1/3 Tax Planner, 1/3 VFOS') {
      const share = (totalFee / 3).toFixed(2)
      const vs = (totalFee - parseFloat(share) - parseFloat(share)).toFixed(2)
      setMemberShare(share); setTaxPlannerShare(share); setVfosShare(vs)
    }
  }, [splitType, totalFee])

  // Strategic members: fixed split auto-computed off the total fee. Tax
  // Priorities uses the 'tax' rules for BOTH programs (program 1 and 4).
  useEffect(() => {
    if (!isStrategic) return
    if (splitType !== 'Strategic Partner') setSplitType('Strategic Partner')
    const shares = computeStrategicShares(memberType, 'tax', totalFee)
    if (shares) {
      setMemberShare(shares.member.toFixed(2))
      setTaxPlannerShare((shares.planner ?? 0).toFixed(2))
      setVfosShare(shares.vfos.toFixed(2))
      setStrategicPartnerShare(shares.strategic.toFixed(2))
    } else {
      setMemberShare(''); setTaxPlannerShare(''); setVfosShare(''); setStrategicPartnerShare('')
    }
  }, [isStrategic, memberType, totalFee, splitType])

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }
  const sectionStyle = { background: 'var(--vfo-tint)', borderRadius: '8px', padding: '14px', marginBottom: '10px', border: '1px solid var(--vfo-border-chip)' }
  const riskOptions = ['Yes — Risk 1 — Very Conservative Mindset','Yes — Risk 2 - Moderately Conservative Mindset','Yes — Risk 3 — Average Risk Mindset','Yes — Risk 4 — Moderately Aggressive Mindset','Yes — Risk 5 — Very Aggressive Mindset']
  const splitOptions = ['1/3 Member, 1/3 Tax Planner, 1/3 VFOS', 'Custom']
  const isPresetSplit = splitType && splitType !== 'Custom'
  const isLegacySplit = splitType && splitType !== 'Custom' && splitType !== 'Strategic Partner' && !splitOptions.includes(splitType)
  // Custom split must sum to the total fee (mirrors MAP 1 PIPDecisionForm).
  const customSplitTotal = (parseFloat(memberShare) || 0) + (parseFloat(taxPlannerShare) || 0) + (parseFloat(vfosShare) || 0)
  const customSplitMismatch = splitType === 'Custom' && Math.abs(customSplitTotal - totalFee) > 0.01
  const blockSubmit = submitting || needsPlannerAllocation || customSplitMismatch || !feeSplit

  // Custom split: all three shares (member, tax-planner, VFOS) are freely
  // editable and must sum to the total fee (validated on submit). The preset
  // and Strategic splits stay auto-computed.
  function handleMemberShareChange(val) { setMemberShare(val) }
  function handlePlannerShareChange(val) { setTaxPlannerShare(val) }

  async function handle() {
    // Risk mindset gets a MESSAGE, not a silent return: a blank one used to be
    // stored as NULL and shipped an empty [TAX_RISK_MINDSET] into the agreement
    // PDF, and this form is the one that chains sendagreement.
    if (String(taxRiskMindset ?? '').trim() === '') {
      alert('Please select a tax risk mindset.')
      return
    }
    if (!feeSplit || !splitType) return
    // Toggle Yes with no usable amount submits as no-discount — see the same
    // rule on the Tax 3 decision form.
    if (splitType === 'Custom') {
      const splitTotal = (parseFloat(memberShare) || 0) + (parseFloat(taxPlannerShare) || 0) + (parseFloat(vfosShare) || 0)
      if (Math.abs(splitTotal - totalFee) > 0.01) return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        taxRiskMindset,
        totalFee: feeSplit.total.toFixed(2),
        splitType,
        memberShare,
        taxPlannerShare,
        vfosShare,
        ...(isStrategic ? { strategicPartnerShare } : {}),
        ...(isDironInsley && discountToggle === 'Yes' && parseFloat(discountApplied) > 0
          ? { discountApplied: parseFloat(discountApplied) }
          : {}),
      })
    } catch (err) {
      console.error(err)
      alert('Submit failed: ' + (err?.message || 'unknown'))
    } finally { setSubmitting(false) }
  }

  return (
    <div style={{ marginLeft: '18px', marginTop: '8px', marginBottom: '8px', padding: '14px 16px', background: 'var(--vfo-tint)', borderRadius: '10px', border: '1px solid var(--vfo-tint-deep)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ fontSize: '11px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Complete pricing &amp; send agreement</div>

      <div style={{ marginBottom: '10px' }}>
        <label style={labelStyle}>Tax risk mindset</label>
        <select value={taxRiskMindset} onChange={e => setTaxRiskMindset(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
          <option value="">-- Select --</option>
          {riskOptions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: '12px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Fee details</div>
        <TotalFeeField
          label="Total tax planning fee"
          value={totalFeeInput}
          onChange={setTotalFeeInput}
          split={feeSplit}
          inputStyle={inputStyle}
          readOnlyInput={{ ...inputStyle, opacity: 0.6, pointerEvents: 'none' }}
          labelStyle={labelStyle}
        />
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: '12px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Revenue split</div>
        <div style={{ marginBottom: '10px' }}>
          <label style={labelStyle}>Split type</label>
          {isStrategic
            ? <div style={{ ...inputStyle, opacity: 0.6, pointerEvents: 'none' }}>{`Strategic Partner (${memberType}) — auto-calculated`}</div>
            : <select value={splitType} onChange={e => setSplitType(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                <option value="">-- Select --</option>
                {splitOptions.map(s => <option key={s} value={s}>{s}</option>)}
                {isLegacySplit && <option value={splitType} disabled>{splitType} (legacy)</option>}
              </select>
          }
        </div>
        {splitType && (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {isStrategic && (
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={labelStyle}>Strategic Partner share</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                  <input value={strategicPartnerShare} readOnly placeholder="0.00" style={{ ...inputStyle, paddingLeft: '28px', opacity: 0.6 }} />
                </div>
              </div>
            )}
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={labelStyle}>Member share</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                <input value={memberShare} onChange={e => handleMemberShareChange(e.target.value)} placeholder="0.00" readOnly={isPresetSplit} style={{ ...inputStyle, paddingLeft: '28px', ...(isPresetSplit ? { opacity: 0.6 } : {}) }} />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={labelStyle}>Tax Planner share</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                <input value={taxPlannerShare} onChange={e => handlePlannerShareChange(e.target.value)} placeholder="0.00" readOnly={isPresetSplit} style={{ ...inputStyle, paddingLeft: '28px', ...(isPresetSplit ? { opacity: 0.6 } : {}) }} />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={labelStyle}>VFOS share</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                <input value={vfosShare} onChange={e => setVfosShare(e.target.value)} placeholder="0.00" readOnly={isPresetSplit} style={{ ...inputStyle, paddingLeft: '28px', ...(isPresetSplit ? { opacity: 0.6 } : {}) }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {isDironInsley && (
        <div style={{ marginBottom: '10px' }}>
          <label style={labelStyle}>Discount applied due to previous Diron Insley planning issue?</label>
          <select value={discountToggle} onChange={e => setDiscountToggle(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
          {discountToggle === 'Yes' && (
            <div style={{ marginTop: '10px' }}>
              <label style={labelStyle}>Discount applied ($)</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                <input value={discountApplied} onChange={e => setDiscountApplied(moneyDigitsOnly(e.target.value))} inputMode="decimal" placeholder="0.00" style={{ ...inputStyle, paddingLeft: '28px' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '4px' }}>Discount applied due to previous planning issue</div>
              {/* Only a REAL discount gets a preview — see the same rule on the
                  Tax 3 decision form. */}
              {parseFloat(discountApplied) > 0 && (
              <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
                <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Invoice preview</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--vfo-ink)', marginBottom: '4px' }}>
                  <span>Tax Planning Fee</span>
                  <span>${fmtMoney(totalFee + (parseFloat(discountApplied) || 0))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#dc2626', fontWeight: 600, marginBottom: '4px' }}>
                  <span>Discount Applied*</span>
                  <span>-${fmtMoney(parseFloat(discountApplied) || 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: 700, borderTop: '1px solid var(--vfo-border-chip)', paddingTop: '6px', marginTop: '6px' }}>
                  <span>Net Payable</span>
                  <span>${fmtMoney(totalFee)}</span>
                </div>
              </div>
              )}
            </div>
          )}
        </div>
      )}

      {needsPlannerAllocation && (
        <div style={{ fontSize: '12px', color: '#e06717', fontWeight: 600, marginTop: '10px', textAlign: 'right' }}>You must allocate a tax planner before submitting.</div>
      )}
      {!feeSplit && String(totalFeeInput || '').trim() === '' && (
        <div style={{ fontSize: '12px', color: '#e06717', fontWeight: 600, marginTop: '10px', textAlign: 'right' }}>Enter the total tax planning fee before submitting.</div>
      )}
      {customSplitMismatch && (
        <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '13px', marginTop: '10px', textAlign: 'right' }}>Revenue split (${customSplitTotal.toFixed(2)}) must equal Total Fee (${totalFee.toFixed(2)})</div>
      )}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
        {onCancel && <button disabled={submitting} onClick={onCancel} style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Cancel</button>}
        <button disabled={blockSubmit} onClick={handle} style={{ padding: '8px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: blockSubmit ? 'not-allowed' : 'pointer', border: 'none', background: blockSubmit ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', color: '#fff' }}>{submitting ? 'Submitting…' : submitLabel}</button>
      </div>
    </div>
  )
}

// LEGACY SHAPE ONLY. The per-strategy amounts stopped being collected when the
// assess form became four flat totals (#306) — these keys, the summary table
// below and its two helpers now serve exactly one thing: rendering an old
// strategy-format row read-only. Nothing writes them any more.
const ASSESS_AMOUNT_KEYS = ['invest_y1', 'invest_y2', 'gross_y1', 'gross_y2']
const ASSESS_AMOUNT_FIELDS = [
  { key: 'invest_y1', label: 'Investment Cost — Year 1' },
  { key: 'invest_y2', label: 'Investment Cost — Year 2' },
  { key: 'gross_y1', label: 'Gross Savings — Year 1' },
  { key: 'gross_y2', label: 'Gross Savings — Year 2' },
]
const assessNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
const assessMoney = (n) => `${n < 0 ? '-' : ''}$${fmtMoney(Math.abs(n || 0))}`

function assessComputeRows(strategies) {
  return (strategies || []).map(s => {
    const iy1 = assessNum(s?.invest_y1), iy2 = assessNum(s?.invest_y2)
    const gy1 = assessNum(s?.gross_y1), gy2 = assessNum(s?.gross_y2)
    return {
      name: String(s?.name || '').trim() || 'Untitled strategy',
      invest: { y1: iy1, y2: iy2, total: iy1 + iy2 },
      gross: { y1: gy1, y2: gy2, total: gy1 + gy2 },
      net: { y1: gy1 - iy1, y2: gy2 - iy2, total: (gy1 + gy2) - (iy1 + iy2) },
    }
  })
}

function assessSectionSum(rows, key) {
  return rows.reduce((a, r) => ({ y1: a.y1 + r[key].y1, y2: a.y2 + r[key].y2, total: a.total + r[key].total }), { y1: 0, y2: 0, total: 0 })
}

function AssessSummaryTable({ rows }) {
  const sections = [
    { key: 'invest', label: 'Investment Costs' },
    { key: 'gross', label: 'Gross Tax Plan Savings' },
    { key: 'net', label: 'Net Tax Savings' },
  ]
  const cell = { padding: '5px 10px', fontSize: '12px', color: 'var(--vfo-ink)', textAlign: 'right', whiteSpace: 'nowrap' }
  const nameCell = { ...cell, textAlign: 'left', color: 'var(--vfo-muted)' }
  const head = { ...cell, fontSize: '10px', fontWeight: 600, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }
  const sumCell = { ...cell, fontWeight: 700, borderTop: '1px solid var(--vfo-border-chip)' }
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--vfo-border-chip)', borderRadius: '8px', background: 'var(--vfo-card)' }}>
      <table style={{ width: '100%', minWidth: '440px', borderCollapse: 'collapse', fontFamily: 'Inter, sans-serif' }}>
        <thead>
          <tr>
            <th style={{ ...head, textAlign: 'left' }}>Strategy</th>
            <th style={head}>Total</th>
            <th style={head}>Year 1</th>
            <th style={head}>Year 2</th>
          </tr>
        </thead>
        {sections.map(sec => {
          const sum = assessSectionSum(rows, sec.key)
          return (
            <tbody key={sec.key}>
              <tr>
                <td colSpan={4} style={{ padding: '9px 10px 4px', fontSize: '11px', fontWeight: 700, color: 'var(--vfo-ink)', textTransform: 'uppercase', letterSpacing: '0.5px', borderTop: '1px solid var(--vfo-border-chip)' }}>{sec.label}</td>
              </tr>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={nameCell}>{r.name}</td>
                  <td style={cell}>{assessMoney(r[sec.key].total)}</td>
                  <td style={cell}>{assessMoney(r[sec.key].y1)}</td>
                  <td style={cell}>{assessMoney(r[sec.key].y2)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...sumCell, textAlign: 'left' }}>Total</td>
                <td style={sumCell}>{assessMoney(sum.total)}</td>
                <td style={sumCell}>{assessMoney(sum.y1)}</td>
                <td style={sumCell}>{assessMoney(sum.y2)}</td>
              </tr>
            </tbody>
          )
        })}
      </table>
    </div>
  )
}

function AssessMoneyInput({ label, value, onChange, inputStyle, labelStyle }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '13px' }}>$</span>
        <input type="number" min="0" step="0.01" value={value} onChange={e => onChange(e.target.value)} placeholder="0.00" style={{ ...inputStyle, paddingLeft: '24px' }} />
      </div>
    </div>
  )
}

// The THREE per-year totals, in entry order. The labels are part of the FE/BE
// validation contract — the required-field messages name them verbatim on both
// sides, with the year suffixed (#306).
const ASSESS_YEAR_FIELDS = [
  { key: 'taxes_without_plan', label: 'Total Tax without the Plan' },
  { key: 'taxes_with_plan', label: 'Total Tax with the Plan' },
  { key: 'cash_outlay', label: 'Total Cash Outlay for the Strategies' },
]
// The fee is a SINGLE ENGAGEMENT-LEVEL figure, not a per-year one: entered once
// at the top of the form, stored flat, and attributed entirely to year 1 by the
// deck. Its message carries NO year suffix.
const ASSESS_FEE_LABEL = 'VFO Services Tax Planning Fee'
// Appended to every per-year label AND to every per-year validation message. The
// BE builds its strings by concatenating the identical suffix — change one side
// and you must change the other.
const ASSESS_Y1_SUFFIX = ' — Year 1'
const ASSESS_Y2_SUFFIX = ' — Year 2'
const ASSESS_NOTES_MAX = 5000

// Mirrors the deck generator's math (actions/tax/generate-presentation.ts):
// gross = without − with is DERIVED, never entered. `fee` is passed separately
// because only YEAR 1 carries it — year 2's net subtracts outlay alone. Returns
// null until BOTH tax totals of the group are real numbers, so a half-typed form
// shows '—' rather than a figure that is wrong. The outlay and fee coerce
// blank→0 while typing (submit is what enforces required), exactly as the old
// live summary did.
function assessGroupSummary(values, fee) {
  const w = parseFloat(values?.taxes_without_plan)
  const t = parseFloat(values?.taxes_with_plan)
  if (!Number.isFinite(w) || !Number.isFinite(t) || w <= 0) return null
  const gross = w - t
  return { w, gross, net: gross - assessNum(values?.cash_outlay) - assessNum(fee) }
}

function assessSummary(values, fee) {
  const s = assessGroupSummary(values, fee)
  return s ? { gross: s.gross, net: s.net, pct: Math.round((s.gross / s.w) * 100) } : null
}

// One line, two shapes. With a usable year-2 group it reads per-year AND
// combined; without one it is byte-for-byte the single-year line it always was.
// Year 1's net carries the WHOLE fee and year 2's carries none, matching the
// deck; the combined figures are the SUMS of the per-year ones and the
// percentage divides by W1+W2 — the same construction the backend uses, so the
// line can never disagree with the deck.
function AssessSummaryLine({ values, values2, fee, style }) {
  const s1 = assessGroupSummary(values, fee)
  const s2 = values2 ? assessGroupSummary(values2, 0) : null
  if (s1 && s2) {
    const gross = s1.gross + s2.gross
    const net = s1.net + s2.net
    const pct = Math.round((gross / (s1.w + s2.w)) * 100)
    return (
      <div style={style}>
        Year 1: gross {assessMoney(s1.gross)} · net {assessMoney(s1.net)} · Year 2: gross {assessMoney(s2.gross)} · net {assessMoney(s2.net)} · Combined: gross {assessMoney(gross)} · net {assessMoney(net)} · {pct}%
      </div>
    )
  }
  const s = assessSummary(values, fee)
  return (
    <div style={style}>
      Gross Tax Benefit: {s ? assessMoney(s.gross) : '—'} · Net Benefit: {s ? assessMoney(s.net) : '—'} · Tax Reduced: {s ? `${s.pct}%` : '—'}
    </div>
  )
}

function AssessTaxForm({ task, plan, saveTask, existingData, onSubmitted, onCancel, editing = false, existingCompletedDate = null }) {
  const isViewMode = !!existingData && !editing
  // THREE historical shapes live in `assess_form` and all three must render:
  // the current four totals, the 2026-07→08 strategy list, and the original
  // single-question placeholder. Only the first is ever written now.
  const isNewShape = existingData?.taxes_with_plan != null
  const isStructured = Array.isArray(existingData?.strategies)
  const legacyAnswer = (!isNewShape && !isStructured) ? (existingData?.question_1 || '') : ''
  // Editing over an older row prefills whatever it legitimately carries (fee and
  // taxes_without_plan existed in the strategy shape too); the two newer fields
  // start blank because nothing in the old row can supply them.
  const [fee, setFee] = useState(() => (existingData?.fee != null ? String(existingData.fee) : ''))
  const [totals, setTotals] = useState(() => {
    const init = {}
    ASSESS_YEAR_FIELDS.forEach(f => { init[f.key] = existingData?.[f.key] != null ? String(existingData[f.key]) : '' })
    return init
  })
  // Year 2 is stored NESTED and OPTIONAL — a row without it is a valid one-year
  // plan, not a broken one — and it carries THREE fields, never a fee. The toggle
  // starts on only when the row already carries the group.
  const existingY2 = (existingData?.year2 && typeof existingData.year2 === 'object' && !Array.isArray(existingData.year2))
    ? existingData.year2
    : null
  const [year2On, setYear2On] = useState(!!existingY2)
  const [totals2, setTotals2] = useState(() => {
    const init = {}
    ASSESS_YEAR_FIELDS.forEach(f => { init[f.key] = existingY2?.[f.key] != null ? String(existingY2[f.key]) : '' })
    return init
  })
  const [notes, setNotes] = useState(() => (typeof existingData?.notes === 'string' ? existingData.notes : ''))
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }
  const wrapStyle = { marginLeft: '18px', padding: '16px', background: 'var(--vfo-tint)', borderRadius: '10px', border: '1px solid var(--vfo-tint-deep)', marginTop: '4px', marginBottom: '8px' }
  const sectionLabelStyle = { fontSize: '11px', color: 'var(--vfo-ink)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }
  const mutedLineStyle = { fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '8px' }
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 240px))', gap: '12px' }
  // Year groups: all three inputs on ONE row, and the label boxes get a fixed
  // two-line height so an input whose label wraps to two lines does not sit
  // lower than its one-line neighbours.
  const yearGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 240px))', gap: '12px' }
  const yearLabelStyle = { ...labelStyle, minHeight: '28px' }

  const setTotal = (key, value) => setTotals(prev => ({ ...prev, [key]: value }))
  const setTotal2 = (key, value) => setTotals2(prev => ({ ...prev, [key]: value }))

  // A year-2 group with nothing in it counts as toggle-OFF even while it is on
  // screen — flipping the toggle on and then leaving it empty must never block
  // the save. The backend applies the identical test to the posted object.
  const y2HasAny = year2On && ASSESS_YEAR_FIELDS.some(f => String(totals2[f.key] ?? '').trim() !== '')

  async function handleSubmit() {
    // Kept in EXACT lockstep with actions/tax/save-assess-form.ts (gotcha #306) —
    // same rules in the same order, same wording, so the message never changes
    // depending on which side rejected it. Fee first (engagement-level, no year
    // suffix), then year 1, then year 2 (only when its group is non-blank), then
    // the notes length.
    const feeNum = parseFloat(fee)
    if (!Number.isFinite(feeNum) || feeNum < 0) {
      setSubmitError(`${ASSESS_FEE_LABEL} is required`)
      return
    }
    if (feeNum > MAX_TOTAL_FEE) {
      setSubmitError(`${ASSESS_FEE_LABEL} must be no more than $${MAX_TOTAL_FEE.toLocaleString('en-US')}`)
      return
    }
    const readGroup = (src, suffix) => {
      const nums = {}
      for (const f of ASSESS_YEAR_FIELDS) {
        const n = parseFloat(src[f.key])
        if (!Number.isFinite(n) || n < 0) {
          return { error: `${f.label}${suffix} is required` }
        }
        nums[f.key] = Math.round(n * 100) / 100
      }
      if (nums.taxes_with_plan >= nums.taxes_without_plan) {
        return { error: `Total Tax with the Plan must be less than Total Tax without the Plan${suffix}` }
      }
      return { nums }
    }

    const y1 = readGroup(totals, ASSESS_Y1_SUFFIX)
    if (y1.error) { setSubmitError(y1.error); return }
    let y2nums = null
    if (y2HasAny) {
      const y2 = readGroup(totals2, ASSESS_Y2_SUFFIX)
      if (y2.error) { setSubmitError(y2.error); return }
      y2nums = y2.nums
    }
    const trimmedNotes = notes.trim()
    if (trimmedNotes.length > ASSESS_NOTES_MAX) {
      setSubmitError(`Notes must be ${ASSESS_NOTES_MAX} characters or fewer`)
      return
    }
    const nums = y1.nums
    setSubmitError('')
    setSubmitting(true)
    try {
      await callApi('tax_save_assess_form', {
        tax_plan_id: plan.id,
        form: {
          // The fee and the year-1 keys stay FLAT and unchanged — that is what
          // lets an old deployed frontend keep posting successfully here.
          fee: Math.round(feeNum * 100) / 100,
          taxes_without_plan: nums.taxes_without_plan,
          taxes_with_plan: nums.taxes_with_plan,
          cash_outlay: nums.cash_outlay,
          ...(y2nums ? { year2: y2nums } : {}),
          ...(trimmedNotes ? { notes: trimmedNotes } : {}),
        },
      })
      await saveTask(task.id, 'Completed', existingCompletedDate || null)
      if (onSubmitted) onSubmitted()
    } catch (err) {
      console.error(err)
      setSubmitError(err?.message || 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  // View branch 1 — the original single-question placeholder shape.
  if (isViewMode && !isNewShape && !isStructured) {
    return (
      <div style={wrapStyle}>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Question 1</label>
          <div style={{ ...inputStyle, opacity: 0.6, whiteSpace: 'pre-wrap' }}>{existingData?.question_1 || '—'}</div>
        </div>
      </div>
    )
  }

  // View branch 2 — the old strategy-list shape, rendered exactly as it always
  // was. Nothing writes this shape any more; editing the step replaces it.
  if (isViewMode && !isNewShape) {
    return (
      <div style={wrapStyle}>
        <div style={{ ...gridStyle, marginBottom: '14px' }}>
          <div>
            <label style={labelStyle}>Fee</label>
            <div style={{ ...inputStyle, opacity: 0.6 }}>{assessMoney(assessNum(existingData?.fee))}</div>
          </div>
          <div>
            <label style={labelStyle}>Total Taxes – without a Tax Plan</label>
            <div style={{ ...inputStyle, opacity: 0.6 }}>{existingData?.taxes_without_plan != null ? assessMoney(assessNum(existingData.taxes_without_plan)) : '—'}</div>
          </div>
        </div>
        <div style={sectionLabelStyle}>Summary</div>
        <AssessSummaryTable rows={assessComputeRows(existingData?.strategies)} />
      </div>
    )
  }

  // View branch 3 — the current shape: the flat year-1 totals, plus the optional
  // nested year-2 group and the optional notes when the row carries them.
  if (isViewMode) {
    const readOnlyGroup = (src, suffix) => (
      <div style={yearGridStyle}>
        {ASSESS_YEAR_FIELDS.map(f => (
          <div key={f.key}>
            <label style={yearLabelStyle}>{f.label}{suffix}</label>
            <div style={{ ...inputStyle, opacity: 0.6 }}>{src?.[f.key] != null ? assessMoney(assessNum(src[f.key])) : '—'}</div>
          </div>
        ))}
      </div>
    )
    return (
      <div style={wrapStyle}>
        <div style={{ ...gridStyle, marginBottom: '14px' }}>
          <div>
            <label style={labelStyle}>{ASSESS_FEE_LABEL}</label>
            <div style={{ ...inputStyle, opacity: 0.6 }}>{existingData?.fee != null ? assessMoney(assessNum(existingData.fee)) : '—'}</div>
          </div>
        </div>
        <div style={sectionLabelStyle}>Year 1</div>
        {readOnlyGroup(existingData, ASSESS_Y1_SUFFIX)}
        {existingY2 && (
          <>
            <div style={{ ...sectionLabelStyle, marginTop: '14px' }}>Year 2</div>
            {readOnlyGroup(existingY2, ASSESS_Y2_SUFFIX)}
          </>
        )}
        <AssessSummaryLine values={existingData || {}} values2={existingY2} fee={existingData?.fee} style={mutedLineStyle} />
        {typeof existingData?.notes === 'string' && existingData.notes.trim() && (
          <div style={{ marginTop: '14px' }}>
            <label style={labelStyle}>Notes</label>
            <div style={{ ...inputStyle, opacity: 0.6, whiteSpace: 'pre-wrap' }}>{existingData.notes}</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={wrapStyle}>
      {editing && legacyAnswer && (
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Previous answer — will be replaced when you save</label>
          <div style={{ ...inputStyle, opacity: 0.6, whiteSpace: 'pre-wrap' }}>{legacyAnswer}</div>
        </div>
      )}
      {editing && isStructured && (
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Previous answer — will be replaced when you save</label>
          <div style={{ ...inputStyle, opacity: 0.6 }}>
            Old strategy-format entry ({existingData.strategies.length} {existingData.strategies.length === 1 ? 'strategy' : 'strategies'}) — saving the four totals below replaces it.
          </div>
        </div>
      )}
      {/* The fee is entered ONCE for the whole engagement — it sits above both
          year groups and its label carries no year suffix. */}
      <div style={{ ...gridStyle, marginBottom: '16px' }}>
        <AssessMoneyInput label={ASSESS_FEE_LABEL} value={fee} onChange={setFee} inputStyle={inputStyle} labelStyle={labelStyle} />
      </div>

      <div style={sectionLabelStyle}>Year 1</div>
      <div style={yearGridStyle}>
        {ASSESS_YEAR_FIELDS.map(f => (
          <AssessMoneyInput key={f.key} label={`${f.label}${ASSESS_Y1_SUFFIX}`} value={totals[f.key]} onChange={v => setTotal(f.key, v)} inputStyle={inputStyle} labelStyle={yearLabelStyle} />
        ))}
      </div>

      {/* Year 2 is OPTIONAL. Toggling it off excludes the group from the payload
          entirely (the save handler rebuilds the whole jsonb, so that is also how
          an existing year-2 group is removed); the typed values are kept in state
          so a mis-click does not destroy them. */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', cursor: 'pointer', fontSize: '13px', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>
        <input type="checkbox" checked={year2On} onChange={e => setYear2On(e.target.checked)} style={{ width: '15px', height: '15px', accentColor: '#125ecc', cursor: 'pointer' }} />
        Add Year 2
      </label>

      {year2On && (
        <div style={{ marginTop: '12px' }}>
          <div style={sectionLabelStyle}>Year 2</div>
          <div style={yearGridStyle}>
            {ASSESS_YEAR_FIELDS.map(f => (
              <AssessMoneyInput key={f.key} label={`${f.label}${ASSESS_Y2_SUFFIX}`} value={totals2[f.key]} onChange={v => setTotal2(f.key, v)} inputStyle={inputStyle} labelStyle={yearLabelStyle} />
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: '14px' }}>
        <label style={labelStyle}>Notes (optional)</label>
        <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} maxLength={ASSESS_NOTES_MAX} placeholder="Anything worth recording alongside these figures." style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
      </div>

      <AssessSummaryLine values={totals} values2={y2HasAny ? totals2 : null} fee={fee} style={{ ...mutedLineStyle, marginBottom: '16px' }} />

      {submitError && <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>{submitError}</div>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={handleSubmit} disabled={submitting} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: submitting ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
          {submitting ? 'Submitting...' : editing ? 'Save changes' : 'Submit'}
        </button>
        {onCancel && <button onClick={onCancel} disabled={submitting} style={{ padding: '12px 20px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--vfo-border-strong)', color: 'var(--vfo-muted)', fontSize: '15px', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
          Cancel
        </button>}
      </div>
    </div>
  )
}

// Read-only "Tax Planning Form" card — the 37 answers the member submitted when
// they started the case (tax_intake_requests). Shown on ALL THREE tax-plan
// surfaces (admin, tax-planner portal, member view), which is why
// tax_intake_load is confined per role in-handler rather than by an allowlist.
//
// Presentational: TaxPlanTrackView owns the single tax_intake_load call (it also
// needs the row to tell a portal-paid deposit from a hand-typed one), and the 37
// rows are only built when the card is expanded. The whole card hides when there
// is no form — every pre-2026-09-17 plan, and every case an admin started by hand.
function TaxIntakeCard({ intake, questions }) {
  const [open, setOpen] = useState(false)
  if (!intake) return null

  const submitted = intake.created_at ? String(intake.created_at).split('T')[0] : ''
  // Which of the two intake routes produced this form (unit 1b). 'client' means
  // the member emailed a tokened link and the client filled it in and paid.
  const byClient = intake.payer === 'client'
  const linkDate = intake.link_sent_at ? String(intake.link_sent_at).split('T')[0] : submitted
  const completedBy = byClient
    ? `Completed by the client via link on ${linkDate}`
    : 'Completed by the member'
  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer' }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: 'var(--vfo-heading)', textTransform: 'uppercase', letterSpacing: '1px' }}>Tax Planning Form</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{completedBy}</span>
          {submitted && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>Submitted {submitted}</span>}
          <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
        </div>
      </div>
      {open && (
        <div style={{ borderTop: '1px solid var(--vfo-border)', padding: '14px 18px' }}>
          {(questions || []).map((q, i) => {
            const val = intake.answers?.[q.id]
            return (
              <div key={q.id} style={{ display: 'flex', gap: '12px', padding: '6px 0', borderBottom: i === questions.length - 1 ? 'none' : '1px solid var(--vfo-border-soft)', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flex: '1 1 300px', lineHeight: 1.5 }}>{i + 1}. {q.label}</span>
                <span style={{ fontSize: '12px', color: val ? 'var(--vfo-ink)' : 'var(--vfo-muted)', flex: '1 1 240px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{val || '—'}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TaxPlanTrackView({ plan, phases, progress: initialProgress, specialists, expertBios = {}, onBack, readOnly = false, plannerMode = false, notes = [], onNotesChange, clientId, programName, client }) {
  // The member's submitted Tax Planning Form, if any. One read per plan view:
  // it backs both the read-only answers card and the "Paid via portal" chip on
  // the Deposit Paid step.
  const [taxIntake, setTaxIntake] = useState(null)
  const [taxIntakeQuestions, setTaxIntakeQuestions] = useState([])
  useEffect(() => {
    let live = true
    if (!clientId) return
    callApi('tax_intake_load', { client_id: clientId })
      .then(d => { if (!live) return; setTaxIntake(d?.intake || null); setTaxIntakeQuestions(d?.questions || []) })
      .catch(() => { if (live) setTaxIntake(null) })
    return () => { live = false }
  }, [clientId])
  const [localProgress, setLocalProgress] = useState(initialProgress)
  const [saving, setSaving] = useState({})
  const [expanded, setExpanded] = useState({})
  const [taxSpecialists, setTaxSpecialists] = useState([])
  const [showAddSpec, setShowAddSpec] = useState(false)
  const [newSpecId, setNewSpecId] = useState('')
  const [newCustomName, setNewCustomName] = useState('')
  const [loadingSpecs, setLoadingSpecs] = useState(true)
  const [removingSpec, setRemovingSpec] = useState({})
  const [strategyDrafts, setStrategyDrafts] = useState({})
  const [declineDrafts, setDeclineDrafts] = useState({})
  const [livePlan, setLivePlan] = useState(plan)
  const [extraMeetingPricingOpen, setExtraMeetingPricingOpen] = useState(false)
  const [submittingExtraNo, setSubmittingExtraNo] = useState(false)
  const [depositPiDrafts, setDepositPiDrafts] = useState({})
  const [refundReasonDrafts, setRefundReasonDrafts] = useState({})
  const [ackSaving, setAckSaving] = useState({})
  const [trackStatus, setTrackStatus] = useState(plan.status || 'live')
  const [togglingStatus, setTogglingStatus] = useState(false)
  const [taxPlanners, setTaxPlanners] = useState([])
  const [taxGroups, setTaxGroups] = useState([])
  // The allocation step's pending dropdown pick, per task id — nothing is written
  // until Add is pressed, so the two slots can't be filled by a stray change event.
  const [allocPick, setAllocPick] = useState({})
  // The PORTAL caller's own planner_role (tax_planner_portal_clients.self_role).
  // Only a Team Member may edit the allocation step from the portal, so this
  // starts null and FAILS CLOSED: an unidentified caller gets the read-only view.
  const [plannerSelfRole, setPlannerSelfRole] = useState(null)

  // Known-value substitutions for the email previews (see StepEmailsChip).
  // Reactive to the selected client; empty values are omitted so those tokens
  // keep rendering as bracketed chips.
  const emailCtx = (() => {
    const ctx = {}
    const full = client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : ''
    if (full) { ctx['Client Name'] = full; ctx['Client First'] = full.split(/\s+/)[0] }
    const pf = client?.assigned_pf ? String(client.assigned_pf).trim() : ''
    if (pf) ctx['PF Name'] = pf
    const member = client?.member_name ? String(client.member_name).trim() : ''
    if (member) { ctx['Member Name'] = member; ctx['Member First'] = member.split(/\s+/)[0] }
    return ctx
  })()

  async function toggleTrackStatus() {
    const newStatus = trackStatus === 'live' ? 'stopped' : 'live'
    setTogglingStatus(true)
    try {
      await callApi('msm_update_tax_status', { tax_plan_id: plan.id, status: newStatus })
      setTrackStatus(newStatus)
    } catch (err) { console.error(err) }
    finally { setTogglingStatus(false) }
  }

  async function refreshLivePlan() {
    try {
      const res = await callApi('tax_load_plans', { client_id: clientId })
      const fresh = (res.plans || []).find(p => p.id === plan.id)
      if (fresh) setLivePlan(fresh)
    } catch (err) { console.error('refreshLivePlan failed', err) }
  }

  useEffect(() => {
    if (plannerMode) {
      loadCachedAction('tax_planner_portal_clients')
        .then(res => {
          setTaxPlanners(Array.isArray(res?.group) ? res.group : [])
          setTaxGroups([])
          setPlannerSelfRole(res?.self_role || null)
        })
        .catch(() => { setTaxPlanners([]); setTaxGroups([]); setPlannerSelfRole(null) })
      return
    }
    loadCachedAction('tax_planners_load')
      .then(res => {
        setTaxPlanners(Array.isArray(res?.tax_planners) ? res.tax_planners : [])
        setTaxGroups(Array.isArray(res?.tax_planning_groups) ? res.tax_planning_groups : [])
      })
      .catch(() => { setTaxPlanners([]); setTaxGroups([]) })
  }, [plannerMode])

  // The allocation step holds TWO slots: the Tax Planner who runs the plan
  // (client_tax_plans.tax_planner_id — the only one money keys on) and an
  // optional, persistent Team Member (tax_team_member_id). The person's role
  // decides which slot they go in; the backend refuses a mismatch.
  //
  // The progress-row echo names the plan's CURRENT HOLDER: the planner once one
  // is allocated, otherwise the team member. Admins finish this step by allocating
  // a team member alone (the hand-off to a Tax Planner happens later, in the
  // planner portal), so the row has to read done at that point — and the backend
  // step machine reads that same row.
  const rosterFullName = (id) => {
    const pl = id == null ? null : taxPlanners.find(x => String(x.id) === String(id))
    return pl ? `${pl.first_name || ''} ${pl.last_name || ''}`.trim() : ''
  }

  async function allocatePlanner(task, planner) {
    const key = task.id
    const teamSlot = planner?.planner_role === 'Team Member'
    setSaving(p => ({ ...p, [key]: true }))
    try {
      await callApi('tax_allocate_planner', teamSlot
        ? { tax_plan_id: plan.id, tax_team_member_id: planner.id }
        : { tax_plan_id: plan.id, tax_planner_id: planner.id })
      // A team member added ALONGSIDE a planner leaves the echo on the planner —
      // they are still the holder.
      if (!teamSlot || !livePlan?.tax_planner_id) {
        const fullName = `${planner.first_name || ''} ${planner.last_name || ''}`.trim()
        await saveTask(task.id, fullName, localProgress[key]?.completed_date, null, { skipRefresh: true, skipBusy: true })
      }
      setAllocPick(prev => ({ ...prev, [key]: '' }))
      // Awaited: the chips read livePlan, so the row stays busy until it lands.
      await refreshLivePlan()
    } catch (err) {
      console.error(err)
      alert('Allocation failed: ' + (err?.message || 'unknown error'))
    } finally {
      setSaving(p => ({ ...p, [key]: false }))
    }
  }

  // Removing one slot's holder (backend accepts null). The echo falls back to
  // whoever is left: removing the planner hands it back to the team member if one
  // is still allocated, and only an empty plan resets it to ''.
  async function clearPlanner(task, teamSlot = false) {
    const key = task.id
    setSaving(p => ({ ...p, [key]: true }))
    try {
      await callApi('tax_allocate_planner', teamSlot
        ? { tax_plan_id: plan.id, tax_team_member_id: null }
        : { tax_plan_id: plan.id, tax_planner_id: null })
      if (teamSlot) {
        if (!livePlan?.tax_planner_id) await saveTask(task.id, '', undefined, null, { skipRefresh: true, skipBusy: true })
      } else {
        await saveTask(task.id, rosterFullName(livePlan?.tax_team_member_id), undefined, null, { skipRefresh: true, skipBusy: true })
      }
      // Awaited: the chips read livePlan, so the row stays busy until it lands.
      await refreshLivePlan()
    } catch (err) {
      console.error(err)
      alert('Clear failed: ' + (err?.message || 'unknown error'))
    } finally {
      setSaving(p => ({ ...p, [key]: false }))
    }
  }

  useEffect(() => {
    const expandState = {}
    phases.forEach(phase => {
      if (phase.name === 'Tax 5 - Education & DD (Specialist Allocation)' || phase.name === 'Tax 5 - Education & DD (Post Allocation)') return
      // Use the component's canonical phase-state predicate so plan-column steps
      // (tax_returns_request etc.) and the per-phase special cases are counted;
      // a fully-done phase defaults collapsed.
      expandState[phase.id] = getPhaseState(phase) !== 'done'
    })
    setExpanded(expandState)
    loadSpecialists()
  }, [])

  async function loadSpecialists() {
    setLoadingSpecs(true)
    try {
      const specData = await callApi('tax_load_specialists', { tax_plan_id: plan.id })
      setTaxSpecialists(specData.specialists || [])
    } catch (err) { console.error(err) }
    finally { setLoadingSpecs(false) }
  }

  async function addSpecialist() {
    if (!newSpecId) return
    // The "Custom" sentinel sends the typed name and no expert — the backend
    // creates the unlinked row as "Custom - <name>" (it owns the prefix).
    // Everything else resolves to a real expert.
    let payload
    if (newSpecId === OTHER_SPEC_VALUE) {
      const name = newCustomName.trim()
      if (!name) return
      payload = { tax_plan_id: plan.id, other: true, custom_name: name }
    } else {
      const expert = specialists.find(s => s.id === parseInt(newSpecId))
      if (!expert) return
      payload = { tax_plan_id: plan.id, expert_id: expert.id, specialist_name: expert.name }
    }
    try {
      const res = await callApi('tax_add_specialist', payload)
      if (res?.error) { alert('Add failed: ' + res.error); return }
      setNewSpecId('')
      setNewCustomName('')
      setShowAddSpec(false)
      loadSpecialists()
    } catch (err) {
      console.error(err)
      alert('Add failed: ' + (err?.message || 'unknown error'))
    }
  }

  // Saved steps for one specialist live under the composite `${task.id}_${spec.id}`
  // progress key built in saveTask — count back off that same key so the confirm
  // text matches exactly what the backend is about to delete.
  const specialistStepCount = (specId) =>
    Object.keys(localProgress).filter(k => String(k).endsWith(`_${specId}`) && !!localProgress[k]?.status).length

  // One notes thread per specialist, keyed by NAME so the Tax 5 and Tax 6 cards
  // share it and the note surfaces on the client profile like any other phase note.
  const specPhaseName = (spec) => 'Specialist - ' + spec.specialist_name
  const specNotesCount = (spec) => (notes || []).filter(n => n.phase_name === specPhaseName(spec) && n.tab_name === 'Tax Priorities').length

  // DISPLAY ONLY — the Tax 5 / Tax 6 card headers show "<tax short bio> - <name>"
  // for an allocated specialist, matching the "+ Add Specialist" picker labels.
  // The bio is resolved from `expertBios` (built off the FULL roster upstream) so
  // legacy allocations outside the Tax Planning ecosystem, and specialists no
  // longer Active in the planner roster, simply fall back to the bare stored name;
  // Custom rows (expert_id null) always keep theirs, which already reads
  // "Custom - <what was typed>". NEVER feed this string into specPhaseName (the
  // per-specialist notes threads key on the STORED specialist_name — gotchas
  // #360/#311), the remove confirm, or any save/API payload.
  const specDisplayName = (spec) => {
    const bio = spec?.expert_id != null ? expertBios[spec.expert_id] : ''
    return bio ? `${bio} - ${spec.specialist_name}` : spec.specialist_name
  }

  // Free-text Strategy on the Tax 5 card, mirrored read-only on Tax 6. Admin-only.
  const strategyInputStyle = { padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '11.5px', fontFamily: 'Inter, sans-serif', width: '200px' }
  const strategyTextStyle = { fontSize: '11px', color: 'var(--vfo-muted)', maxWidth: '220px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }

  async function saveStrategy(spec) {
    const draft = strategyDrafts[spec.id]
    if (draft === undefined) return
    const next = draft.trim().slice(0, 500)
    if (next === (spec.strategy || '')) return
    try {
      const res = await callApi('tax_update_specialist_strategy', { tax_plan_id: plan.id, specialist_id: spec.id, strategy: next })
      if (res?.error) { alert('Save failed: ' + res.error); return }
      const stored = res?.strategy ?? null
      setTaxSpecialists(p => p.map(s => s.id === spec.id ? { ...s, strategy: stored } : s))
      setStrategyDrafts(p => { const n = { ...p }; delete n[spec.id]; return n })
    } catch (err) {
      console.error(err)
      alert('Save failed: ' + (err?.message || 'unknown error'))
    }
  }

  // Remove an allocation. Admins and tax planners both get this (gated the same
  // way as Add — members never see it). The backend deletes the specialist's
  // step-progress rows before the specialist itself, so the local progress keyed
  // to them is dropped in the same pass and can't linger as stale step data.
  async function removeSpecialist(spec) {
    if (removingSpec[spec.id]) return
    const steps = specialistStepCount(spec.id)
    if (!confirm(`Remove ${spec.specialist_name} from this plan? This will also clear ${steps} saved step(s) for them. This cannot be undone.`)) return
    setRemovingSpec(p => ({ ...p, [spec.id]: true }))
    try {
      const res = await callApi('tax_remove_specialist', { tax_plan_id: plan.id, specialist_id: spec.id })
      if (res?.error) { alert('Remove failed: ' + res.error); return }
      // Drop the row locally right away — the loadSpecialists() below reconciles,
      // but its silent catch must never leave a deleted specialist on screen.
      setTaxSpecialists(p => p.filter(s => s.id !== spec.id))
      setLocalProgress(p => {
        const next = { ...p }
        Object.keys(next).forEach(k => { if (String(k).endsWith(`_${spec.id}`)) delete next[k] })
        return next
      })
      setExpanded(p => { const next = { ...p }; delete next[`spec_${spec.id}`]; delete next[`tax6_spec_${spec.id}`]; return next })
      loadSpecialists()
    } catch (err) {
      console.error(err)
      alert('Remove failed: ' + (err?.message || 'unknown error'))
    } finally {
      setRemovingSpec(p => ({ ...p, [spec.id]: false }))
    }
  }

  // Both options default off, so every caller that passes only the positional
  // args keeps today's behavior. The allocation slots pass both: they chain a
  // second call after this one, so a refresh here would run tax_load_plans twice
  // (3-5s each), and clearing the row's busy flag here would release the row
  // while their own refresh is still in flight.
  async function saveTask(taskId, status, existingDate, taxSpecialistId = null, { skipRefresh = false, skipBusy = false } = {}) {
    const today = new Date().toISOString().split('T')[0]
    const date = existingDate || (status ? today : null)
    const key = taxSpecialistId ? `${taskId}_${taxSpecialistId}` : taskId
    if (!skipBusy) setSaving(p => ({ ...p, [key]: true }))
    try {
      await callApi('tax_save_task', { tax_plan_id: plan.id, task_id: taskId, status, completed_date: date || null, tax_specialist_id: taxSpecialistId || null })
      setLocalProgress(p => ({ ...p, [key]: { ...p[key], task_id: taskId, status, completed_date: date, tax_specialist_id: taxSpecialistId } }))
      if (!skipRefresh) refreshLivePlan()
    } catch (err) { console.error(err) }
    finally { if (!skipBusy) setSaving(p => ({ ...p, [key]: false })) }
  }

  async function fireReadyForTax3(taskId, decision, opts = {}) {
    const { declineReason, date, time, tz, existingDate } = opts
    const status = decision === 'declined' ? 'No - Declined email to client' : 'Yes - Confirmation email to client'
    setDeclineDrafts(d => ({ ...d, [taskId]: { ...(d[taskId] || {}), sending: true } }))
    try {
      await callApi('automation_TAX_readyfortax3', {
        tax_plan_id: plan.id,
        decision,
        decline_reason: declineReason || null,
        meeting_date: date || null,
        meeting_time: time || null,
        meeting_tz: tz || null,
      })
      await saveTask(taskId, status, existingDate)
      // The booked-meeting pill reads the freshly written tax3_meeting_* columns.
      await refreshLivePlan()
      setDeclineDrafts(d => { const next = { ...d }; delete next[taskId]; return next })
    } catch (err) {
      console.error(err)
      alert('Failed to send email: ' + (err?.message || 'unknown error'))
      setDeclineDrafts(d => ({ ...d, [taskId]: { ...(d[taskId] || {}), sending: false } }))
    }
  }

  async function fireHlmConfirm(taskId, opts = {}) {
    const { date, time, tz } = opts
    setDeclineDrafts(d => ({ ...d, [taskId]: { ...(d[taskId] || {}), sending: true } }))
    try {
      const res = await callApi('automation_TAX_highlevelmeeting_confirm', {
        tax_plan_id: plan.id,
        meeting_date: date || null,
        meeting_time: time || null,
        meeting_tz: tz || null,
      })
      if (res?.error) {
        alert('Error: ' + res.error)
        setDeclineDrafts(d => ({ ...d, [taskId]: { ...(d[taskId] || {}), sending: false } }))
        return
      }
      await refreshLivePlan()
      setDeclineDrafts(d => { const next = { ...d }; delete next[taskId]; return next })
    } catch (err) {
      console.error(err)
      alert('Failed to send email: ' + (err?.message || 'unknown error'))
      setDeclineDrafts(d => ({ ...d, [taskId]: { ...(d[taskId] || {}), sending: false } }))
    }
  }

  async function firePresentationSchedule(taskId, opts = {}) {
    const { link, date } = opts
    setDeclineDrafts(d => ({ ...d, [taskId]: { ...(d[taskId] || {}), sending: true } }))
    try {
      const res = await callApi('automation_TAX_presentation_schedule', {
        tax_plan_id: plan.id,
        presentation_link: link || '',
        send_date: date || null,
      })
      if (res?.error) {
        alert('Error: ' + res.error)
        setDeclineDrafts(d => ({ ...d, [taskId]: { ...(d[taskId] || {}), sending: false } }))
        return
      }
      await refreshLivePlan()
      setDeclineDrafts(d => { const next = { ...d }; delete next[taskId]; return next })
    } catch (err) {
      console.error(err)
      alert('Failed to schedule email: ' + (err?.message || 'unknown error'))
      setDeclineDrafts(d => ({ ...d, [taskId]: { ...(d[taskId] || {}), sending: false } }))
    }
  }

  async function saveDate(taskId, date, taxSpecialistId = null) {
    const key = taxSpecialistId ? `${taskId}_${taxSpecialistId}` : taskId
    const p = localProgress[key] || {}
    setSaving(prev => ({ ...prev, [key]: true }))
    try {
      await callApi('tax_save_task', { tax_plan_id: plan.id, task_id: taskId, status: p.status, completed_date: date || null, tax_specialist_id: taxSpecialistId || null })
      setLocalProgress(prev => ({ ...prev, [key]: { ...prev[key], completed_date: date } }))
    } catch (err) { console.error(err) }
    finally { setSaving(prev => ({ ...prev, [key]: false })) }
  }

  const statusColors = {
    Completed: '#1b9254', Yes: '#1b9254', 'No additional info required': '#1b9254',
    'Introductions Completed': '#1b9254', 'Introductions cancelled': '#e74c3c', 'Combo Tax Plan': '#1b9254', 'ROI Plan': '#1b9254', 'Custom (See Note)': '#1b9254',
    'Continue Process': '#1b9254', 'Move to Implementation': '#1b9254', 'Refund Completed': '#1b9254',
    'Schedule Tax 3': '#1b9254', 'Paid': '#1b9254',
    'Yes - Confirmation email to client': '#1b9254', 'Yes - Confirmation email (date TBC)': '#1b9254', 'No - Declined email to client': '#e74c3c',
    'Tim Gacsy': '#1b9254', 'Steven Cox': '#1b9254',
    'Yes — Risk 1 — Very Conservative Mindset': '#1b9254', 'Yes — Risk 2 - Moderately Conservative Mindset': '#1b9254',
    'Yes — Risk 3 — Average Risk Mindset': '#1b9254', 'Yes — Risk 4 — Moderately Aggressive Mindset': '#1b9254',
    'Yes — Risk 5 — Very Aggressive Mindset': '#1b9254',
    No: '#e74c3c', 'Stop Process': '#e74c3c', 'Stopped': '#e74c3c',
    'Additional info required': '#1b9254', Undecided: '#e06717',
    'Continue DD': '#1b9254', 'Continue - Revenue Share': '#1b9254', 'Stop - Refund': '#e74c3c', 'N/A': 'var(--vfo-muted)',
    'Proceed with Implementation': '#1b9254', 'Not Implementing': '#e74c3c',
    'Pending Completion': '#e06717',
    'Proceed': '#1b9254',
    'Proceed with tax planning': '#1b9254', 'Stop tax planning': '#e74c3c',
    // The two answers the 'Amend fee' / 'Amend implementation fee' steps store.
    'Completed - Kept': '#1b9254', 'Completed - Amended': '#1b9254',
  }

  function formatDate(d) {
    if (!d) return ''
    const parts = d.split('-')
    return `${parts[1]}/${parts[2]}`
  }
  // Same MM/DD format as formatDate, but for full timestamptz values (rendered
  // in the viewer's local time, so a late-UTC stamp shows the correct local day).
  function formatStamp(ts) {
    if (!ts) return ''
    const dt = new Date(ts)
    if (isNaN(dt.getTime())) return ''
    return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`
  }
  // Substep completion dates take either shape, so a plain DATE is string-split
  // (new Date('2026-08-12') is UTC midnight and renders as the day before west of
  // Greenwich) while a timestamptz goes through Date for the viewer's local day.
  const fmtMMDD = (v) => {
    if (!v) return ''
    const s = String(v)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const p = s.split('-'); return `${p[1]}/${p[2]}` }
    const d = new Date(s)
    if (isNaN(d.getTime())) return ''
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  }

  // The chase rows under a stalled AI PC Admin substep: the 48h client reminder,
  // the 96h internal notification, and the human acknowledgement that someone
  // actually called. Each cascade codes its own row renderer, so the caller
  // passes it in as `step(label, done, at)`.
  function stallSteps(stall, step) {
    const reminderAt = livePlan?.[`${stall}_reminder_sent_at`]
    const pfNotifiedAt = livePlan?.[`${stall}_pf_notified_at`]
    return (
      <>
        {reminderAt && step('2-business-day reminder email sent to client', true, reminderAt)}
        {pfNotifiedAt && step('4-business-day mark passed — assigned PF notified to follow up', true, pfNotifiedAt)}
        {pfNotifiedAt && stallAckRow(stall)}
      </>
    )
  }

  function stallAckRow(stall) {
    if (readOnly || plannerMode) return null
    const ackAt = livePlan?.[`${stall}_pf_ack_at`] || null
    const busy = !!ackSaving[stall]
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', marginLeft: '14px', borderBottom: '1px solid var(--vfo-border-soft)' }}>
        <input type="checkbox" checked={!!ackAt} disabled={busy} onChange={e => toggleStallAck(stall, e.target.checked)} style={{ margin: 0, cursor: busy ? 'not-allowed' : 'pointer' }} />
        <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Reached out?</span>
        {ackAt && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0, marginLeft: 'auto' }}>{fmtMMDD(ackAt)}</span>}
      </div>
    )
  }

  async function toggleStallAck(stall, next) {
    const col = `${stall}_pf_ack_at`
    const prevAt = livePlan?.[col] || null
    setAckSaving(prev => ({ ...prev, [stall]: true }))
    setLivePlan(prev => ({ ...prev, [col]: next ? new Date().toISOString() : null }))
    try {
      const res = await callApi('automation_stall_ack', { pipeline: 'tax', id: livePlan.id, stall, ack: next })
      if (res?.error) throw new Error(res.error)
      setLivePlan(prev => ({ ...prev, [col]: res.ack_at }))
    } catch (err) {
      console.error(err)
      setLivePlan(prev => ({ ...prev, [col]: prevAt }))
      alert('Failed to save: ' + (err?.message || 'unknown error'))
    } finally {
      setAckSaving(prev => ({ ...prev, [stall]: false }))
    }
  }

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
    // Green/Red light call: 'Proceed' closes the step, and so does a completed
    // refund. The refund path writes no progress status of its own.
    if (t.status_options === 'tax_refund') {
      return localProgress[t.id]?.status === 'Proceed' || livePlan?.deposit_refund_status === 'succeeded'
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
  // has neither the deposit nor the Green/Red Light refund step, and gating on an
  // absent task would lock everything downstream of it forever.
  const prereqDone = (sentinel, name) => {
    const t = findStepTask(sentinel, name)
    return !t || isTaskStatused(t)
  }

  const isTaxProgram = (livePlan?.program_id ?? plan?.program_id ?? 1) === 4
  const depositOk = !isTaxProgram || prereqDone('tax_deposit_pi', 'Deposit Paid') || !!livePlan?.deposit_payment_intent_id
  const greenRedOk = !isTaxProgram || prereqDone('tax_refund', null)
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
  // forward path — the stop route is the Green/Red Refund (program 4), or the
  // ROI-booked decline button on Holistic, which has no Green/Red step (#367).
  const reviewTask = findStepTask(null, 'Tax planner review complete')
  const reviewStatus = reviewTask ? localProgress[reviewTask.id]?.status : null
  const reviewProceed = !reviewTask || reviewStatus === 'Proceed with tax planning'
  const reviewStop = !!reviewTask && reviewStatus === 'Stop tax planning'
  // True once the meeting is booked OR the skip closed the step (isTaskStatused).
  const roiBooked = prereqDone('tax_3_decision', null)
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
  // Excluded from the done-math: skipped-away rows, plus the not-applicable
  // amend rows. One helper so every count site uses the same rule.
  const isStepExcluded = (t) => isSkippedAway(t) || isAmendNotApplicable(t)

  // "Has the amend step been answered?" for the steps that wait on it. An ABSENT
  // task row reads as answered — the program_client_tasks seed lands after this
  // code deploys, and a step that does not exist must never lock the one after
  // it. Exactly the deploy-order-safe rule amendFeeStepState uses server-side
  // (exists=false -> the backend gate SKIPS).
  const amendTax4Task = allTasks.find(t => t.status_options === AMEND_FEE_CODE)
  const amendTax5Task = allTasks.find(t => t.status_options === AMEND_FEE_TAX5_CODE)
  // No newFeeProcess prefix any more: the "answer the amend step before the
  // decision email goes out" lock applies to LEGACY plans too, because the
  // backend gates (postreview-decision.ts / implement-decision.ts) dropped
  // theirs — both now read `exists && !answered` on every fee shape, and this
  // is byte-for-byte that test. A legacy plan still inside its amendment window
  // has a real, answerable step and a decision email that quotes the fee, so
  // the order matters there exactly as much as on the revised process.
  // Past-the-window legacy plans are NOT stranded by the missing applicability
  // term: the only way the window closed is that the decision step already ran,
  // and that step saves its own progress row (handlePick -> saveTask, before
  // the automation call), so renderTask's `alreadyDone` short-circuits ahead of
  // stepGate and the lock is never reached.
  const amendTax4Blocks = !!amendTax4Task && !isTaskStatused(amendTax4Task)
  const amendTax5Blocks = !!amendTax5Task && !isTaskStatused(amendTax5Task)
  // Column-proven as well as progress-proven — isTaskStatused above reads the
  // submitted-form stamp, which is the only thing that completes this step.
  const assessDone = prereqDone('assess_form', 'Assess tax planning opportunities (and enter presentation details)')
  const deckGenerated = prereqDone('tax_generate_presentation', 'Generate and download presentation')
  const sendLinkDone = prereqDone('tax_presentation_link', null)
  const roiPresentationDone = prereqDone(null, 'ROI Presentation')
  const hlmConfirmDone = prereqDone('tax_hlm_confirm', null)
  const detailedPresDone = prereqDone(null, 'Detailed tax plan presentation')
  const decision1Done = prereqDone('tax_continue_stop', 'Client decision 1')
  const implDecisionDone = prereqDone('tax_implement_decision', 'Implementation decision') || !!livePlan?.implementation_decision
  const tax3AipcDone = (livePlan?.tax_decision === 'No' || livePlan?.tax_final_decision === 'No')
    || livePlan?.retainer_invoice_email_sent === true
  let tax5bImplFinal = livePlan?.implementation_final_decision
  // Backwards compat: legacy 'Yes'/'No' values map to Proceed/Decline
  if (tax5bImplFinal === 'Yes') tax5bImplFinal = 'Proceed'
  if (tax5bImplFinal === 'No') tax5bImplFinal = 'Decline'
  const tax5bAipcDone = livePlan?.implementation_decision === 'Not Implementing'
    || ((livePlan?.implementation_decision === 'Proceed' || livePlan?.implementation_decision === 'Undecided') && tax5bImplFinal === 'Decline')
    || livePlan?.implementation_rev_email_sent === true
    // A $0 implementation fee has no charge, receipt or revenue-share email to
    // wait for, so the client's Proceed click completes the cascade on its own
    // (mirrors implement-final-decision.ts's no-fee branch).
    || (!(amendToCents(livePlan?.implementation_amount) > 0)
      && (tax5bImplFinal === 'Proceed' || tax5bImplFinal === 'Confirmed'))

  const returnsChain = depositOk && returnsReceived
  const diagnosticChain = returnsChain && addlInfoDone && reviewProceed
  // Pre-gate plans that already carry Tax 6 work stay workable: post-deploy no plan
  // can reach Tax 6 without the gate, so the escape only ever matches history.
  const tax6Tasks = phases.find(p => p.name === 'Tax 6 - Implementation')?.program_client_tasks || []
  const tax6Started = tax6Tasks.some(t => taxSpecialists.some(s => !!localProgress[`${t.id}_${s.id}`]?.status))
  const tax6Unlocked = (implDecisionDone && tax5bAipcDone) || tax6Started

  // Natural barriers: a step that cannot sensibly be actioned yet renders as an
  // inert placeholder rather than a live control. Each step names only its DIRECT
  // prerequisites — earlier gates keep earlier steps untouched, so the chain is
  // transitively safe without recursion. Returns null when a step is unrestricted.
  function stepGate(task, phase) {
    if (!task) return null
    const so = task.status_options
    const nm = task.name
    if (so === 'auto' || so === 'specialist_select' || nm === 'AI PC Admin') return null
    // Steps renderTaskInner hides outright must never surface as a lock row.
    if (['Refund initial 50%', 'Revenue share for initial 50%', 'Email to obtain information required sent', 'Information received', 'Information passed to VFO-L'].includes(nm)) return null

    if (phase?.name === 'Tax 6 - Implementation') {
      return { locked: !tax6Unlocked, hint: 'Locked until Implementation decision + AI PC Admin complete' }
    }
    if (phase?.name === TAX5B_PHASE) {
      // The whole phase waits on the Tax 5a confirmation — that is what "reaches"
      // the amend step too, so it needs no gate of its own.
      if (!tax5bUnlocked) return { locked: true, hint: 'Unlocks when "Confirm ready for implementation" is Yes or Undecided on any specialist' }
      // The implementation fee may still be amended here, and Client decision 2
      // / the implementation charge are computed from it — so the amend step is
      // the Implementation decision's new prerequisite. EVERY fee shape,
      // including legacy (whose amendment lands wholly on the implementation
      // fee), matching the backend gate in actions/tax/implement-decision.ts.
      // A legacy plan already past its window cannot be wedged by this:
      // renderTask's `alreadyDone` treats a set implementation_decision as done
      // for this very step, so stepGate is never consulted there.
      if (so === 'tax_implement_decision' && amendTax5Blocks) {
        return { locked: true, hint: 'Complete the "Amend implementation fee" step first' }
      }
      return { locked: false, hint: '' }
    }

    if (so === 'tax_returns_request' || nm === 'Request Tax Returns') {
      return { locked: !depositOk, hint: 'Enter the Stripe deposit payment (Set Up) first' }
    }
    if (so === 'tax_planner_select' || nm === 'Allocate Team Member / Tax Planner' || nm === 'Allocate to Advanced Tax Planner') {
      return { locked: !returnsChain, hint: 'Waiting for tax returns to be received' }
    }
    if (nm === 'Additional information required') {
      return {
        locked: !(returnsChain && taxPlannerAllocated),
        hint: !returnsChain && !taxPlannerAllocated
          ? 'Waiting for tax returns and a Tax Planner allocation'
          : !returnsChain
            ? 'Waiting for tax returns to be received'
            : 'Allocate a Tax Planner (not a Team Member) first',
      }
    }
    // Review runs after the info request, so it inherits the returns/deposit chain
    // through addlInfoDone rather than re-testing it.
    if (nm === 'Tax planner review complete') {
      return {
        locked: !(addlInfoDone && taxPlannerAllocated),
        hint: !addlInfoDone
          ? 'Complete "Additional information required" first'
          : 'Allocate a Tax Planner (not a Team Member) first',
      }
    }
    // Green/Red Light stays unlocked at row level — its Refund is the escape hatch for
    // a client who never provides information, so it must stay reachable when the
    // diagnostic chain can never complete. Only its Proceed button is gated, in
    // renderTaskInner.
    if (so === 'tax_refund') return null
    if (so === 'tax_3_decision') {
      // Program 4 pairs the booking with the Green/Red call (one Tray bell asks
      // for both); a plan without its green light gets no meeting booked.
      return {
        locked: !((diagnosticChain && greenRedOk) || (!isTaxProgram && reviewStop)),
        hint: diagnosticChain
          ? 'Select Proceed on the "Tax Plan Green/Red Light" step first'
          : 'Complete "Tax planner review complete" first',
      }
    }
    if (so === 'assess_form' || nm === 'Assess tax planning opportunities (and enter presentation details)') {
      return { locked: !diagnosticChain, hint: 'Complete "Tax planner review complete" first' }
    }
    // Chain-level gate only. Once the diagnostic chain holds this falls through to the
    // bespoke renderer, whose own blockedHint owns the assess/taxes-field/risk states.
    if (so === 'tax_generate_presentation' || nm === 'Generate and download presentation') {
      return { locked: !diagnosticChain, hint: 'Complete "Tax planner review complete" first' }
    }
    if (so === 'tax_presentation_link') {
      return { locked: !(roiBooked && deckGenerated), hint: 'Book the ROI meeting and generate the presentation first' }
    }
    if (nm === 'ROI Presentation') {
      const ready = depositOk && greenRedOk && returnsReceived && allocDone && addlInfoDone && reviewProceed
        && roiBooked && assessDone && deckGenerated && sendLinkDone
      return { locked: !ready, hint: 'Complete every Tax 1 and Tax 2 step first' }
    }
    if (nm === 'Client tax planning decision' && so === 'enter_details' && phase?.name === 'Tax 3 - ROI Meeting') {
      // Meeting first inverts this: the decision is owed only once the detailed
      // tax plan meeting is confirmed as held, which is what asks the PF for it.
      if (roiSkipMeetingFirst) {
        return { locked: !detailedPresDone, hint: 'Complete the "Detailed tax plan presentation" step first' }
      }
      // A skipped ROI meeting is the other way in: the presentation step it
      // waits on is one of the steps skip removes.
      return { locked: !roiPresentationDone && !roiSkipped, hint: 'Complete the "ROI Presentation" step first' }
    }
    if (so === 'tax_hlm_confirm') {
      // A decline closes the engagement, so there is no meeting to confirm. Must
      // come first: a 'No' also satisfies tax3AipcDone (the cascade ends there),
      // which would otherwise read as "cleared to send". It stays first on the
      // meeting-first route too — a plan can only be declined there after the
      // meeting, and a declined plan must never re-offer the step.
      if (livePlan?.tax_decision === 'No' || livePlan?.tax_final_decision === 'No') {
        return { locked: true, hint: 'Tax planning was declined' }
      }
      // Meeting first books this meeting BEFORE the client decides, signs or pays,
      // so there is nothing left to wait for — the skip itself is the unlock.
      if (roiSkipMeetingFirst) return null
      return { locked: !tax3AipcDone, hint: 'Waiting for the Tax 3 AI PC Admin steps to complete' }
    }
    if (nm === 'Detailed tax plan presentation') {
      // Same on both routes — this step confirms the meeting the step above booked.
      return { locked: !hlmConfirmDone, hint: 'Send the detailed tax plan meeting confirmation email first' }
    }
    // The fee may be amended after the detailed tax plan meeting and before
    // Client decision 1 goes out — on every fee shape, legacy included. Same
    // prerequisite the presentation-confirmation step hands to Client decision 1
    // today. No fee-process test here: a legacy plan the rule says is not
    // applicable never reaches stepGate at all (the "Not applicable" row in
    // renderTask returns ahead of the lock branch).
    if (so === AMEND_FEE_CODE) {
      return { locked: !detailedPresDone, hint: 'Complete the "Detailed tax plan presentation" step first' }
    }
    if (so === 'tax_continue_stop' || nm === 'Client decision 1') {
      // Meeting first adds the retainer to this step's prerequisites: the meeting
      // happened before the money, and Client decision 1 decides what happens to
      // money that has to be in first. Tested only once the two meeting steps are
      // done, so the hint always names the nearest outstanding thing.
      if (roiSkipMeetingFirst && hlmConfirmDone && detailedPresDone && !tax3AipcDone) {
        return { locked: true, hint: 'Waiting for the client to complete signing and payment' }
      }
      if (!(hlmConfirmDone && detailedPresDone)) {
        return { locked: true, hint: 'Complete the detailed tax plan presentation first' }
      }
      // ...and on a revised-process plan the amend step comes between the two:
      // this email quotes the current total (and the final retainer on a
      // 3-payment plan), so it must not go out while the fee is still open. The
      // backend enforces the same order in actions/tax/postreview-decision.ts.
      // LEGACY plans are in scope now too (they can amend onto the
      // implementation fee) — amendTax4Blocks is false only while the step row
      // has not been seeded or the step is already answered, so an un-seeded
      // program never has this gate appear out of nowhere.
      if (amendTax4Blocks) {
        return { locked: true, hint: 'Complete the "Amend fee" step first' }
      }
      return { locked: false, hint: '' }
    }
    if (nm === 'Client decision 2') {
      return {
        locked: !(hlmConfirmDone && detailedPresDone && decision1Done),
        hint: 'Complete "Client decision 1" first',
      }
    }
    if (nm === 'VFO specialist introductions / discussions' || nm === 'Confirm ready for implementation') {
      return { locked: !decision1Done, hint: 'Waiting for Client decision 1' }
    }
    return null
  }

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
      const fullyDone = livePlan?.implementation_rev_email_sent === true
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

  const inputStyle = { padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '12px', fontFamily: 'Inter, sans-serif' }

  const tax5aPhase = phases.find(p => p.name === 'Tax 5 - Education & DD (Specialist Allocation)')
  const tax5bPhase = phases.find(p => p.name === 'Tax 5 - Education & DD (Post Allocation)')
  const tax5aTasks = tax5aPhase?.program_client_tasks || []
  const phasesBeforeSpec = phases.filter(p => ['Set Up', 'Tax 1 - Diagnostic', 'Tax 2 - Deeper Dive', 'Tax 3 - ROI Meeting', 'Tax 4 - Tax Plan Review'].includes(p.name))
  const phasesAfterSpec = phases.filter(p => p.name === 'Tax 6 - Implementation')

  // Planner lock gate: in the tax-planner portal, every non-whitelisted step
  // renders its normal admin UI (readOnly stays false) but is made inert here —
  // pointer-events off on the body so no control fires, with the not-allowed
  // cursor on an outer wrapper (disabled controls don't reliably show the cursor
  // across browsers). Admin (no flags) and member (readOnly) pass straight
  // through unchanged.
  function renderTask(task, phase, taxSpecialistId = null) {
    const key = taxSpecialistId ? `${task.id}_${taxSpecialistId}` : task.id
    // Already-actioned steps always render normally, so history stays visible and
    // editable even when a prerequisite is later un-set.
    // The implementation decision writes client_tax_plans.implementation_decision;
    // legacy plans carry the column with no progress row, and must not read as locked.
    const alreadyDone = taxSpecialistId
      ? !!localProgress[key]?.status
      : isTaskStatused(task) || (task.status_options === 'tax_implement_decision' && !!livePlan?.implementation_decision)
    // A skipped step renders inert on EVERY surface — admin, member (readOnly)
    // and planner alike — so the history reads the same to everyone. Ahead of the
    // lock gate: skipped outranks locked, and skip is final so no hint applies.
    // The booking step is the exception to `alreadyDone`: the skip makes it read
    // done (that is what greens Tax 2), but done-ness sourced from the skip must
    // still render as the inert skip row, never as live Send/Decline buttons. A
    // plan carrying a real progress answer keeps its normal rendering — booked is
    // impossible alongside a skip (the backend refuses it), declined is not.
    const roiSkipRow = roiSkipped && isRoiSkipSetTask(task) && (
      task.status_options === 'tax_3_decision' ? !localProgress[task.id]?.status : !alreadyDone
    )
    if (roiSkipRow) {
      const isRoiBookingStep = task.status_options === 'tax_3_decision'
      // The route is named on the chip: the two orderings look identical on this
      // row otherwise, and which one a plan took decides what everybody downstream
      // is waiting for.
      const skipChip = isRoiBookingStep
        ? (roiSkipMeetingFirst ? 'ROI meeting skipped — meeting first' : 'ROI meeting skipped — retainer first')
        : 'Skipped'
      return (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isRoiBookingStep ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${isRoiBookingStep ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
          <span style={{ fontSize: '13px', color: 'var(--vfo-muted)', flex: '1 1 auto', minWidth: '140px' }}>{taskLabel(task)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '0 1 auto', minWidth: '150px', justifyContent: 'flex-end', textAlign: 'right' }}>
            <span style={chipStyle(isRoiBookingStep ? '#1b9254' : 'var(--vfo-muted)')}>{skipChip}</span>
          </span>
          <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{isRoiBookingStep ? formatStamp(livePlan.roi_meeting_skipped_at) : '—'}</span>
        </div>
      )
    }
    // The narrow residue of the old legacy exclusion (see isAmendNotApplicable):
    // a LEGACY plan whose amendment window has already closed — the downstream
    // decision is recorded — and which never answered the step. Legacy plans
    // still inside the window get the live card like everybody else; this row
    // exists so the ~22 production plans already past Client decision 1 are not
    // left with a permanently unanswerable step dragging their phase pill.
    // Renders inert on EVERY surface, with the same exclusion from the counts
    // the ROI-skip rows above get. Ahead of the lock gate for the same reason:
    // not-applicable outranks locked, and no prerequisite can reopen a closed
    // window.
    if (isAmendNotApplicable(task)) {
      return (
        <div key={key} title="The client decision for this stage has already been recorded, so the fee can no longer be amended." style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'transparent', flexShrink: 0, border: '1.5px solid var(--vfo-border-mid)' }} />
          <span style={{ fontSize: '13px', color: 'var(--vfo-muted)', flex: '1 1 auto', minWidth: '140px' }}>{taskLabel(task)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '0 1 auto', minWidth: '150px', justifyContent: 'flex-end', textAlign: 'right' }}>
            <span style={chipStyle('var(--vfo-muted)')}>Not applicable</span>
          </span>
          <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>—</span>
        </div>
      )
    }
    if (!readOnly && !alreadyDone) {
      const gate = stepGate(task, phase)
      if (gate?.locked) {
        return (
          <div key={key} title={gate.hint} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'transparent', flexShrink: 0, border: '1.5px solid var(--vfo-border-mid)' }} />
            <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: '1 1 auto', minWidth: '140px' }}>{taskLabel(task)}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '0 1 auto', minWidth: '150px', justifyContent: 'flex-end', textAlign: 'right' }}>
              <LockedIcon />
              <span style={lockedHintStyle}>{gate.hint}</span>
            </span>
            <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>—</span>
          </div>
        )
      }
    }
    const node = renderTaskInner(task, phase, taxSpecialistId)
    if (!node || !plannerMode || isPlannerEditable(task)) return node
    return (
      <div key={key} style={{ cursor: 'not-allowed' }}>
        <div style={{ pointerEvents: 'none' }}>{node}</div>
      </div>
    )
  }

  function renderTaskInner(task, phase, taxSpecialistId = null) {
    const key = taxSpecialistId ? `${task.id}_${taxSpecialistId}` : task.id
    const p = localProgress[key] || {}
    const isDone = !!p.status
    const statusColor = statusColors[p.status] || 'var(--vfo-muted)'

    if (isAmendStepTask(task)) {
      return (
        <AmendFeeStep
          key={key}
          task={task}
          plan={livePlan}
          stage={amendStage(task)}
          status={p.status || ''}
          completedDate={p.completed_date || ''}
          readOnly={readOnly}
          onAnswer={(st) => saveTask(task.id, st)}
        />
      )
    }

    if (task.status_options === 'assess_form' || task.name === 'Assess tax planning opportunities (and enter presentation details)') {
      const green = '#1b9254'
      const submitted = !!livePlan?.assess_form_submitted_at
      const expandKey = `assessform_${task.id}`

      if (readOnly) {
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: submitted ? green : 'transparent', flexShrink: 0, border: `1.5px solid ${submitted ? green : 'var(--vfo-border-mid)'}` }} />
            <span style={{ fontSize: '13px', color: submitted ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}</span>
            {submitted
              ? <span style={chipStyle(green)}>Submitted</span>
              : <span style={neutralChipStyle}>Not started</span>}
            <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{submitted ? formatStamp(livePlan.assess_form_submitted_at) : ''}</span>
          </div>
        )
      }

      if (submitted) {
        const isShown = expanded[expandKey]
        const editKey = `assessedit_${task.id}`
        const isEditing = !!expanded[editKey]
        return (
          <div key={key} style={{ borderBottom: '1px solid var(--vfo-border-soft)', padding: '7px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flexWrap: 'wrap' }} onClick={() => setExpanded(prev => ({ ...prev, [expandKey]: !prev[expandKey] }))}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: green, flexShrink: 0, border: `1.5px solid ${green}` }} />
              <span style={{ fontSize: '13px', color: 'var(--vfo-muted)', flex: 1 }}>{taskLabel(task)}</span>
              <span style={chipStyle(green)}>Submitted</span>
              {!isEditing && (
                <button onClick={e => { e.stopPropagation(); setExpanded(prev => ({ ...prev, [expandKey]: true, [editKey]: true })) }} style={{ padding: '4px 8px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Edit</button>
              )}
              <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{formatStamp(livePlan.assess_form_submitted_at)}</span>
              <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isShown ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
            </div>
            {isShown && (
              <AssessTaxForm
                key={isEditing ? 'edit' : 'view'}
                task={task}
                plan={livePlan}
                saveTask={saveTask}
                existingData={livePlan?.assess_form || {}}
                editing={isEditing}
                existingCompletedDate={localProgress[task.id]?.completed_date || null}
                onCancel={() => setExpanded(prev => ({ ...prev, [editKey]: false }))}
                onSubmitted={() => { setExpanded(prev => ({ ...prev, [editKey]: false })); refreshLivePlan() }}
              />
            )}
          </div>
        )
      }

      // A vault drop is a HAND-OFF, not a completion: the groups that deliver a Tax
      // Assessment PDF (backend constants/vault-assess-groups.ts) still need an
      // admin to key its numbers into this form, which is what completes the step
      // for every group alike. So this is a source-document note, not a done-state.
      const vaultDropAt = livePlan?.assess_vault_uploaded_at
      const vaultDropBy = String(livePlan?.assess_vault_uploaded_by || '').trim()

      const formOpen = expanded[expandKey]
      return (
        <div key={key} style={{ borderBottom: '1px solid var(--vfo-border-soft)', padding: '7px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'transparent', flexShrink: 0, border: '1.5px solid var(--vfo-border-mid)' }} />
            <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}</span>
            <button onClick={() => setExpanded(prev => ({ ...prev, [expandKey]: !prev[expandKey] }))} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600 }}>Enter Details</button>
            <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}></span>
          </div>
          {vaultDropAt && (
            <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '4px', marginLeft: '18px' }}>
              Tax Assessment PDF in vault — uploaded by {vaultDropBy || 'the tax planner'} on {formatStamp(vaultDropAt)}. Enter its information here.
            </div>
          )}
          {formOpen && (
            <AssessTaxForm
              task={task}
              plan={livePlan}
              saveTask={saveTask}
              onCancel={() => setExpanded(prev => ({ ...prev, [expandKey]: false }))}
              onSubmitted={() => refreshLivePlan()}
            />
          )}
        </div>
      )
    }

    if (task.status_options === 'tax_generate_presentation' || task.name === 'Generate and download presentation') {
      const green = '#1b9254'
      const deckUrl = livePlan?.generated_presentation_url || ''
      const generatedAt = livePlan?.generated_presentation_at
      const generated = !!deckUrl
      const locked = readOnly || plannerMode
      const draft = declineDrafts[task.id] || {}
      const generating = !!draft.generating
      const genError = draft.genError || ''
      const setDraft = (patch) => setDeclineDrafts(d => ({ ...d, [task.id]: { ...(d[task.id] || {}), ...patch } }))

      // Readiness mirrors the backend's own guards so the button never fires a
      // call that can only come back as an error string. Same data source as the
      // Assess step above (livePlan.assess_form + its submitted stamp).
      const assess = livePlan?.assess_form
      const assessStamped = !!livePlan?.assess_form_submitted_at
      // The generator is strict new-shape-only: an old strategy-format row (or
      // one missing any of the four totals) has to be re-entered, so the gate
      // tests the shape rather than just the stamp.
      const assessTotal = (v) => v != null && v !== '' && Number.isFinite(Number(v))
      const assessNewShape = !!assess && assessTotal(assess.fee) && assessTotal(assess.taxes_without_plan) &&
        assessTotal(assess.taxes_with_plan) && assessTotal(assess.cash_outlay)
      // Year 2 carries THREE totals, never a fee.
      const assessSubmitted = assessStamped && assessNewShape
      // Year 2 is optional, but a PRESENT group with a hole in it 400s the
      // generator — the gate mirrors that so the button never fires a call that
      // can only come back as an error string.
      const assessY2 = assess?.year2
      const assessY2Broken = !!assessY2 && typeof assessY2 === 'object' && !Array.isArray(assessY2) &&
        !(assessTotal(assessY2.taxes_without_plan) &&
          assessTotal(assessY2.taxes_with_plan) && assessTotal(assessY2.cash_outlay))
      const riskTask = allTasks.find(t => t.name === 'Client risk profile complete')
      const riskSet = !!riskTask && String(localProgress[riskTask.id]?.status || '').includes('Risk')
      const blockedHint = !assessStamped
        ? 'Submit the tax planning opportunities form first'
        : !assessSubmitted
          ? 'Re-save the Assess form — it uses the old strategy format'
          : assessY2Broken
            ? 'Re-save the Assess form — the Year 2 totals are incomplete'
            : !riskSet
              ? 'Set the Client risk profile step first'
              : ''
      const ready = !blockedHint

      const genBlue = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: generating ? 'not-allowed' : 'pointer', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600 }
      const genGreen = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: green, fontWeight: 600 }
      const genPlain = { padding: '4px 8px', borderRadius: '5px', fontSize: '11px', cursor: generating ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }

      // The Download button is a plain window.open, so this call is the only
      // signal the backend gets that the PF actually took the deck — it retires
      // their action-required "Download the ROI presentation for <client>" bell.
      // Strictly fire-and-forget: the window.open runs FIRST and synchronously
      // (so the popup blocker still sees a user gesture) and every failure here
      // is swallowed, because a bell must never cost the PF their download.
      // Generation deliberately does not do this — building the deck is not the
      // same as taking it, and is often done by someone else entirely.
      function markPresentationDownloaded() {
        try {
          const p = callApi('tax_presentation_downloaded', { tax_plan_id: livePlan.id })
          if (p && typeof p.catch === 'function') p.catch(() => {})
        } catch { /* ignore — the download already happened */ }
      }

      // Builds the deck server-side and uploads it to Google Drive — 30-60s is
      // normal (api.js gives this action a 90s budget and never auto-retries it).
      async function generatePresentation() {
        setDraft({ generating: true, genError: '' })
        try {
          const res = await callApi('tax_generate_presentation', { tax_plan_id: livePlan.id })
          if (res?.error) { setDraft({ generating: false, genError: res.error }); return }
          await refreshLivePlan()
          setDeclineDrafts(d => { const n = { ...d }; delete n[task.id]; return n })
        } catch (err) {
          console.error(err)
          setDraft({ generating: false, genError: err?.message || 'Generation failed' })
        }
      }

      return (
        <div key={key} style={{ borderBottom: '1px solid var(--vfo-border-soft)', padding: '7px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: generated ? green : 'transparent', flexShrink: 0, border: `1.5px solid ${generated ? green : 'var(--vfo-border-mid)'}` }} />
            <span style={{ fontSize: '13px', color: generated ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: '1 1 auto', minWidth: '140px' }}>{taskLabel(task)}</span>
            {generated ? (
              <>
                <span style={chipStyle(green)}>Generated — {formatStamp(generatedAt)}</span>
                {!locked && (
                  <>
                    <button onClick={() => { window.open(deckUrl, '_blank', 'noopener'); markPresentationDownloaded() }} style={genGreen} title="Opens the generated deck in Google Slides.">Download</button>
                    <button disabled={generating} onClick={generatePresentation} style={genPlain} title="Builds a fresh deck from the current figures and replaces the link above.">{generating ? 'Generating…' : 'Regenerate'}</button>
                  </>
                )}
              </>
            ) : readOnly ? null : !ready ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '0 1 auto', minWidth: '150px', justifyContent: 'flex-end', textAlign: 'right' }}>
                <LockedIcon />
                <span style={lockedHintStyle}>{blockedHint}</span>
              </span>
            ) : plannerMode ? null : (
              <button disabled={generating} onClick={generatePresentation} style={genBlue} title="Builds the client ROI deck in Google Slides from the Assess form figures. Takes up to a minute.">{generating ? 'Generating…' : 'Generate presentation'}</button>
            )}
            <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{generatedAt ? formatStamp(generatedAt) : ''}</span>
          </div>
          {genError && !locked && (
            <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '12px', marginTop: '6px', marginLeft: '18px' }}>{genError}</div>
          )}
        </div>
      )
    }

    if (task.name === 'Client tax planning decision' && task.status_options === 'enter_details') {
      const enterPhase = phases.find(p => p.name === 'Tax 3 - ROI Meeting')
      const isInTax3 = enterPhase?.program_client_tasks?.some(pt => pt.id === task.id)
      if (isInTax3) {
        if (readOnly && isDone) {
          const decisionLabel = p.status.replace('Completed - ', '')
          const decisionColor = decisionLabel === 'Yes' ? '#1b9254' : decisionLabel === 'No' ? '#e74c3c' : '#e06717'
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: decisionColor, flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: 'var(--vfo-muted)', flex: 1 }}>{taskLabel(task)}</span>
              <span style={chipStyle(decisionColor)}>{decisionLabel}</span>
              <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{p.completed_date ? formatDate(p.completed_date) : ''}</span>
            </div>
          )
        }
        if (readOnly && !isDone) {
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'transparent', flexShrink: 0, border: '1.5px solid var(--vfo-border-mid)' }} />
              <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}</span>
              <span style={neutralChipStyle}>Not started</span>
              <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}></span>
            </div>
          )
        }
        const decisionLabel = isDone ? p.status.replace('Completed - ', '') : ''
        const decisionColor = decisionLabel === 'Yes' ? '#1b9254' : decisionLabel === 'No' ? '#e74c3c' : decisionLabel === 'Undecided' ? '#e06717' : 'var(--vfo-muted)'
        let formData = null
        if (isDone) { try { formData = JSON.parse(p.notes || '{}') } catch(e) { formData = {} } }
        const formExpandKey = `taxform_${task.id}`
        const isFormShown = isDone ? expanded[formExpandKey] : true
        return (
          <div key={key} style={{ borderBottom: '1px solid var(--vfo-border-soft)', padding: '7px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: isDone ? 'pointer' : 'default', flexWrap: 'wrap' }} onClick={() => isDone && setExpanded(prev => ({ ...prev, [formExpandKey]: !prev[formExpandKey] }))}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? decisionColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? decisionColor : 'var(--vfo-border-mid)'}` }} />
              <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}<span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="TAX" title={task.name} templates={[{ name: 'TAX_agreementsent|Yes', when: 'If Yes — congratulations + agreement signing link' }, { name: 'TAX_decision_undecided', when: 'If Undecided — options email to the client' }, { name: 'TAX_decision_decline', when: 'If Decline' }, { name: 'TAX_decision_reminder', when: 'Automatic reminder if the Undecided email gets no response (2 business days)' }]} context={emailCtx} /></span></span>
              {isDone && <span style={chipStyle(decisionColor)}>{decisionLabel}</span>}
              {isDone && !readOnly ? <StepDate value={p.completed_date || ''} onChange={d => saveTask(task.id, p.status, d, taxSpecialistId)} disabled={saving[key]} /> : <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{isDone && p.completed_date ? formatDate(p.completed_date) : ''}</span>}
              {isDone && <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isFormShown ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>}
            </div>
            {isFormShown && (
              <TaxDecisionForm
                task={task}
                plan={livePlan}
                saveTask={saveTask}
                taxSpecialistId={taxSpecialistId}
                existingData={formData}
                memberCategory={client?.member_category}
                memberType={client?.member_type}
                programType={plan.program_id === 4 ? 'tax' : 'holistic'}
                memberNumber={client?.member_number}
                onSubmitted={(status, data) => {
                  setLocalProgress(prev => ({ ...prev, [key]: { ...prev[key], task_id: task.id, status, completed_date: new Date().toISOString().split('T')[0], notes: JSON.stringify(data) } }))
                  refreshLivePlan()
                }}
              />
            )}
          </div>
        )
      }
    }

    if (task.name === 'AI PC Admin' && phase?.name === 'Tax 3 - ROI Meeting') {
      const enterDetailsTask = allTasks.find(t => t.name === 'Client tax planning decision')
      const enterDetailsStatus = enterDetailsTask ? (localProgress[enterDetailsTask.id]?.status || '') : ''
      if (!enterDetailsStatus || !enterDetailsStatus.startsWith('Completed')) return (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'transparent', flexShrink: 0, border: '1.5px solid var(--vfo-border-mid)' }} />
          <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}</span>
          <span style={neutralChipStyle}>Waiting for details</span>
          <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}></span>
        </div>
      )
      // Cascade is done when invoice/receipt sent (Yes path) OR decline state
      const aipcDone = tax3AipcDone
      const decision = enterDetailsStatus.replace('Completed - ', '')
      let aiState = {}
      try { aiState = JSON.parse(localProgress[key]?.notes || '{}') } catch(e) { aiState = {} }
      const autoStep = (label, done, chip = null, at = null) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: done ? '#1b9254' : 'transparent', flexShrink: 0, border: `1px solid ${done ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
          <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}{chip && <span style={{ marginLeft: '8px' }}>{chip}</span>}</span>
          {done && <span style={{ ...chipStyle('#1b9254'), marginLeft: 'auto' }}>Done</span>}
          {done && at && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{fmtMMDD(at)}</span>}
        </div>
      )
      const stallRows = (stall) => stallSteps(stall, (label, done, at) => autoStep(label, done, null, at))
      const sharedSteps = [
        { label: 'Engagement agreement created and sent for signing', done: !!livePlan?.boldsign_doc_id, at: livePlan?.agreement_sent_at, stall: 'signed' },
        { label: 'Engagement agreement signed',                       done: livePlan?.client_signed === 'Yes' },
        { label: 'Engagement agreement signed by CEO',                done: livePlan?.ceo_signed === 'Yes', chip: (readOnly || plannerMode) ? null : <StepEmailsChip pipeline="TAX" title="Engagement agreement signed by CEO" templates={[{ name: 'TAX_ceocountersign|Yes', when: 'Automatic — asks the CEO to countersign' }, { name: 'TAX_signing_reminder', when: 'Automatic reminder if unsigned (2 business days)' }]} context={emailCtx} /> },
        { label: 'Payment link sent (ACH or Card choice)',            done: !!livePlan?.checkout_token, at: livePlan?.payment_email_sent_at, stall: 'payment', chip: (readOnly || plannerMode) ? null : <StepEmailsChip pipeline="TAX" title="Payment link sent (ACH or Card choice)" templates={[{ name: 'TAX_paymentemail|Yes', when: 'Automatic — retainer payment link' }, { name: 'TAX_payment_reminder', when: 'Automatic reminder if unpaid (2 business days)' }]} context={emailCtx} /> },
        { label: 'Payment collected',                                 done: livePlan?.retainer_confirmation_status === 'Sent' || livePlan?.retainer_confirmation_status === CONFIRMATION_CARD_SKIP, at: livePlan?.retainer_date, chip: (readOnly || plannerMode) ? null : <StepEmailsChip pipeline="TAX" title="Payment collected" templates={[{ name: 'TAX_confirmationemail|card', when: 'No longer sent automatically — card gets the invoice/receipt instead' }, { name: 'TAX_confirmationemail|ach', when: 'If paid by bank transfer (ACH) — the only method that gets a confirmation' }, { name: 'TAX_confirmationemail|check', when: 'If paid by check' }, { name: 'TAX_paidbycheck|check', when: 'When admin records a check is on the way' }]} context={emailCtx} /> },
        { label: 'Invoice and receipt created and emailed to client', done: livePlan?.retainer_invoice_email_sent === true, at: livePlan?.retainer_invoice_email_sent_at, chip: (readOnly || plannerMode) ? null : <StepEmailsChip pipeline="TAX" title="Invoice and receipt created and emailed to client" templates={[{ name: 'TAX_invoicereceipt_email|retainer', when: 'Retainer invoice + receipt' }]} context={emailCtx} /> },
      ]
      const signingEmailSent = livePlan?.agreement_sent === 'Yes'
      // Reflect client's final decision when Undecided path resolved
      const finalDecResolved = livePlan?.tax_final_decision
      const effectiveDecision = decision === 'Undecided' && finalDecResolved ? finalDecResolved : decision
      const decisionColor = effectiveDecision === 'Yes' ? '#1b9254' : effectiveDecision === 'No' ? '#e74c3c' : effectiveDecision === 'ExtraMeeting' ? '#0095ff' : '#e06717'
      const decisionLabel = effectiveDecision === 'Yes' ? (decision === 'Undecided' ? 'Undecided → Yes' : 'Yes — proceeding') : effectiveDecision === 'No' ? (decision === 'Undecided' ? 'Undecided → No' : 'No — declined') : effectiveDecision === 'ExtraMeeting' ? 'Undecided → Extra meeting' : 'Undecided — awaiting client'
      const clientResponse = aiState.client_response || ''
      const pfResponse = aiState.pf_response || ''

      function saveAiState(newState, status) {
        callApi('tax_save_task', { tax_plan_id: plan.id, task_id: task.id, status, notes: JSON.stringify(newState) })
        setLocalProgress(prev => ({ ...prev, [key]: { ...prev[key], task_id: task.id, status, notes: JSON.stringify(newState) } }))
      }

      const pricingFoldKey = `pricing_${task.id}`
      const pricingExpanded = !!expanded[pricingFoldKey]
      const pricingStep = (done) => {
        if (!done) return autoStep('Pricing submitted by admin', false)
        return (
          <div style={{ borderBottom: '1px solid var(--vfo-border-soft)' }}>
            <div onClick={() => setExpanded(p => ({ ...p, [pricingFoldKey]: !pricingExpanded }))} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', cursor: 'pointer' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1b9254', flexShrink: 0, border: '1px solid #1b9254' }} />
              <span style={{ fontSize: '12px', color: 'var(--vfo-ink)', fontWeight: 600 }}>Pricing submitted by admin</span>
              <span style={{ ...chipStyle('#1b9254'), marginLeft: 'auto' }}>Done</span>
              <span style={{ color: 'var(--vfo-muted)', fontSize: '9px', transform: pricingExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
            </div>
            {pricingExpanded && (
              <div style={{ padding: '8px 12px 10px 16px', background: 'rgba(0,149,255,0.06)', border: '1px solid rgba(0,149,255,0.15)', borderRadius: '6px', margin: '4px 0 8px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#0095ff', marginBottom: '6px' }}>Entered values</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '12px' }}>
                  <span style={{ color: 'var(--vfo-muted)' }}>Retainer:</span><span style={{ color: 'var(--vfo-ink)' }}>${Number(livePlan?.retainer_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  <span style={{ color: 'var(--vfo-muted)' }}>Implementation:</span><span style={{ color: 'var(--vfo-ink)' }}>${Number(livePlan?.implementation_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  <span style={{ color: 'var(--vfo-muted)' }}>Total fee:</span><span style={{ color: 'var(--vfo-ink)' }}>${Number(livePlan?.total_fee || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  {livePlan?.split_type && (<><span style={{ color: 'var(--vfo-muted)' }}>Split:</span><span style={{ color: 'var(--vfo-ink)' }}>{livePlan.split_type}</span></>)}
                  {livePlan?.member_share && (<><span style={{ color: 'var(--vfo-muted)' }}>Member share:</span><span style={{ color: 'var(--vfo-ink)' }}>${Number(livePlan.member_share).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></>)}
                  {livePlan?.tax_planner_share && (<><span style={{ color: 'var(--vfo-muted)' }}>Tax Planner share:</span><span style={{ color: 'var(--vfo-ink)' }}>${Number(livePlan.tax_planner_share).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></>)}
                  {livePlan?.vfos_share && (<><span style={{ color: 'var(--vfo-muted)' }}>VFOS share:</span><span style={{ color: 'var(--vfo-ink)' }}>${Number(livePlan.vfos_share).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></>)}
                  {livePlan?.risk_mindset && (<><span style={{ color: 'var(--vfo-muted)' }}>Risk mindset:</span><span style={{ color: 'var(--vfo-ink)' }}>{livePlan.risk_mindset}</span></>)}
                  {livePlan?.presentation_link && (<><span style={{ color: 'var(--vfo-muted)' }}>Presentation:</span><span style={{ color: 'var(--vfo-ink)', wordBreak: 'break-all' }}>{livePlan.presentation_link}</span></>)}
                </div>
              </div>
            )}
          </div>
        )
      }

      return (
        <div key={key} style={{ padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: aipcDone ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${aipcDone ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
            <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}</span>
          </div>
          <div style={{ marginLeft: '18px', padding: '8px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
            {decision === 'No' && autoStep('Decline email sent to client', true)}
            {decision === 'Yes' && (
              <>
                {autoStep('Signing link and next steps email sent', signingEmailSent, null, livePlan?.agreement_sent_at)}
                {sharedSteps.map((s, i) => <div key={i}>{autoStep(s.label, s.done, s.chip, s.at)}{s.stall && stallRows(s.stall)}</div>)}
              </>
            )}
            {decision === 'Undecided' && (() => {
              const finalDec = livePlan?.tax_final_decision
              const hasPricing = !!livePlan?.retainer_amount
              const viaExtra = !!livePlan?.tax_via_extra_meeting
              return (
                <>
                  {autoStep('Decision email sent with agreement PDF', livePlan?.tax_decision_email_sent === 'Yes', null, livePlan?.tax_decision_email_sent_at)}
                  {stallRows('tax_decision')}
                  {!finalDec && autoStep('Waiting for client to respond via email', false)}

                  {finalDec === 'Yes' && !viaExtra && (
                    <>
                      {autoStep('Client confirmed — Yes', true)}
                      {!hasPricing && !readOnly && (
                        <TaxPricingForm
                          submitLabel="Submit Pricing & Send Agreement"
                          plan={livePlan}
                          memberCategory={client?.member_category}
                          memberType={client?.member_type}
                          programType={plan.program_id === 4 ? 'tax' : 'holistic'}
                          memberNumber={client?.member_number}
                          onSubmit={async (data) => {
                            await callApi('automation_TAX_pricing', { tax_plan_id: plan.id, form_data: data })
                            refreshLivePlan()
                          }}
                        />
                      )}
                      {hasPricing && pricingStep(true)}
                      {autoStep('Signing link and next steps email sent', signingEmailSent, null, livePlan?.agreement_sent_at)}
                      {sharedSteps.map((s, i) => <div key={i}>{autoStep(s.label, s.done, s.chip, s.at)}{s.stall && stallRows(s.stall)}</div>)}
                    </>
                  )}

                  {finalDec === 'No' && (
                    <>
                      {autoStep(viaExtra ? 'PF confirmed — No after extra meeting' : 'Client confirmed — Stop', true)}
                      {autoStep('Decline email sent to client', true)}
                    </>
                  )}

                  {finalDec === 'ExtraMeeting' && (
                    <>
                      {autoStep('Client requested extra meeting', true)}
                      {autoStep('Extra meeting held', viaExtra)}
                      {!viaExtra && !extraMeetingPricingOpen && !readOnly && (
                        <div style={{ padding: '10px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                          <div style={{ fontSize: '12px', color: 'var(--vfo-ink)', marginBottom: '8px' }}>PF outcome after extra meeting:</div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button disabled={submittingExtraNo} onClick={() => setExtraMeetingPricingOpen(true)} style={{ padding: '6px 14px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600 }}>Yes — proceed with pricing</button>
                            <button disabled={submittingExtraNo} onClick={async () => {
                              setSubmittingExtraNo(true)
                              try {
                                await callApi('automation_TAX_extrameeting', { tax_plan_id: plan.id, outcome: 'No' })
                                refreshLivePlan()
                              } catch (err) {
                                alert('Submit failed: ' + (err?.message || 'unknown'))
                              } finally { setSubmittingExtraNo(false) }
                            }} style={{ padding: '6px 14px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.12)', color: '#e74c3c', fontWeight: 600 }}>{submittingExtraNo ? 'Sending…' : 'No — decline'}</button>
                          </div>
                        </div>
                      )}
                      {!viaExtra && extraMeetingPricingOpen && (
                        <TaxPricingForm
                          submitLabel="Submit Pricing & Send Agreement"
                          plan={livePlan}
                          memberCategory={client?.member_category}
                          memberType={client?.member_type}
                          programType={plan.program_id === 4 ? 'tax' : 'holistic'}
                          memberNumber={client?.member_number}
                          onCancel={() => setExtraMeetingPricingOpen(false)}
                          onSubmit={async (data) => {
                            await callApi('automation_TAX_extrameeting', { tax_plan_id: plan.id, outcome: 'Yes', form_data: data })
                            setExtraMeetingPricingOpen(false)
                            refreshLivePlan()
                          }}
                        />
                      )}
                      {viaExtra && hasPricing && (
                        <>
                          {autoStep('PF confirmed — Yes with pricing', true)}
                          {pricingStep(true)}
                          {autoStep('Signing link and next steps email sent', signingEmailSent, null, livePlan?.agreement_sent_at)}
                          {sharedSteps.map((s, i) => <div key={i}>{autoStep(s.label, s.done, s.chip, s.at)}{s.stall && stallRows(s.stall)}</div>)}
                        </>
                      )}
                    </>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )
    }

    if (task.name === 'Refund initial 50%' || task.name === 'Revenue share for initial 50%') return null

    if (task.status_options === 'tax_presentation_link') {
      const sentAt = livePlan?.presentation_email_sent_at
      const sendDate = livePlan?.presentation_send_date || ''
      const savedLink = livePlan?.member_presentation_link || ''
      const draft = declineDrafts[task.id] || {}
      const formOpen = !!draft.pOpen
      const sending = !!draft.sending
      const setDraft = (patch) => setDeclineDrafts(d => ({ ...d, [task.id]: { ...(d[task.id] || {}), ...patch } }))
      const tdInput = { padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '11px' }
      const tdGreen = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: sending ? 'not-allowed' : 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600 }
      const tdCancel = { padding: '4px 8px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }
      const done = !!sentAt
      const scheduled = !done && !!sendDate
      const dotColor = done ? '#1b9254' : scheduled ? '#0095ff' : 'transparent'
      const dotBorder = done ? '#1b9254' : scheduled ? '#0095ff' : 'var(--vfo-border-mid)'
      return (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor, flexShrink: 0, border: `1.5px solid ${dotBorder}` }} />
          <span style={{ fontSize: '13px', color: (done || scheduled) ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}{!(readOnly || plannerMode) && <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="TAX" title={task.name} templates={[{ name: 'TAX_presentation_link', when: 'Automatic — ROI meeting email drafted on the scheduled date' }]} context={emailCtx} /></span>}</span>
          {done ? (
            <span style={chipStyle('#1b9254')}>Email drafted for {formatDate(sendDate)}</span>
          ) : readOnly ? (
            scheduled ? <span style={chipStyle('#0095ff')}>Scheduled — {formatDate(sendDate)}</span> : null
          ) : formOpen ? (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="url" value={draft.link || ''} onChange={e => setDraft({ link: e.target.value })} placeholder="Paste the presentation link..." style={{ ...tdInput, minWidth: '220px' }} />
              <input type="date" value={draft.date || ''} onChange={e => setDraft({ date: e.target.value })} style={tdInput} />
              <button disabled={sending || !draft.link || !draft.date} onClick={() => firePresentationSchedule(task.id, { link: draft.link, date: draft.date })} style={{ ...tdGreen, opacity: (sending || !draft.link || !draft.date) ? 0.6 : 1 }}>{sending ? 'Saving...' : 'Send email on selected date'}</button>
              <button disabled={sending} onClick={() => setDeclineDrafts(d => { const next = { ...d }; delete next[task.id]; return next })} style={tdCancel}>Cancel</button>
            </div>
          ) : scheduled ? (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={chipStyle('#0095ff')}>Scheduled — {formatDate(sendDate)}</span>
              <button disabled={sending} onClick={() => setDraft({ pOpen: true, link: savedLink, date: sendDate })} style={tdCancel}>Edit</button>
            </div>
          ) : (
            <button disabled={sending} onClick={() => setDraft({ pOpen: true, link: '', date: '' })} style={tdGreen} title="Paste the presentation link and choose the date to send it. A cron job drafts the email to the member (Cc the assigned PF) early that morning.">Schedule email</button>
          )}
          {/* presentation_send_date is the SCHEDULED send day and can be in the
              FUTURE, so it never belongs in the completion column. Scheduling IS
              the human's work on this step — the later sweep send is the system's
              — so the date pins to presentation_scheduled_at and does not move when
              the email goes out. DELIBERATELY the inverse of overview-tax.ts, which
              prefers the sent stamp. sentAt is the fallback only for the plans
              scheduled before presentation_scheduled_at existed. */}
          <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{formatStamp(livePlan?.presentation_scheduled_at || sentAt)}</span>
        </div>
      )
    }

    if (task.status_options === 'tax_returns_request') {
      const requestedAt = livePlan?.tax_returns_requested_at
      const receivedAt = livePlan?.tax_returns_received_at
      const draft = declineDrafts[task.id] || {}
      const sending = !!draft.sending
      const done = !!receivedAt
      const dotColor = done ? '#1b9254' : requestedAt ? '#0095ff' : 'transparent'
      const dotBorder = done ? '#1b9254' : requestedAt ? '#0095ff' : 'var(--vfo-border-mid)'
      const tdGreen = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: sending ? 'not-allowed' : 'pointer', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600 }
      const tdSecondary = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: sending ? 'not-allowed' : 'pointer', border: '1px solid rgba(0,149,255,0.25)', background: 'rgba(0,149,255,0.06)', color: '#0095ff', fontWeight: 600 }
      async function sendRequest() {
        setDeclineDrafts(d => ({ ...d, [task.id]: { ...(d[task.id] || {}), sending: true } }))
        try {
          const res = await callApi('automation_TAX_request_returns', { tax_plan_id: plan.id })
          if (res?.error) { alert('Error: ' + res.error); setDeclineDrafts(d => ({ ...d, [task.id]: { ...(d[task.id] || {}), sending: false } })); return }
          await refreshLivePlan()
          setDeclineDrafts(d => { const n = { ...d }; delete n[task.id]; return n })
        } catch (err) {
          alert('Failed to send email: ' + (err?.message || 'unknown error'))
          setDeclineDrafts(d => ({ ...d, [task.id]: { ...(d[task.id] || {}), sending: false } }))
        }
      }
      async function markAlreadyHave() {
        setDeclineDrafts(d => ({ ...d, [task.id]: { ...(d[task.id] || {}), sending: true } }))
        try {
          const res = await callApi('automation_TAX_returns_already_have', { tax_plan_id: plan.id })
          if (res?.error) { alert('Error: ' + res.error); setDeclineDrafts(d => ({ ...d, [task.id]: { ...(d[task.id] || {}), sending: false } })); return }
          await refreshLivePlan()
          setDeclineDrafts(d => { const n = { ...d }; delete n[task.id]; return n })
        } catch (err) {
          alert('Failed to mark tax returns as received: ' + (err?.message || 'unknown error'))
          setDeclineDrafts(d => ({ ...d, [task.id]: { ...(d[task.id] || {}), sending: false } }))
        }
      }
      const aiStep = (label, isGreen, at = null) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isGreen ? '#1b9254' : 'transparent', flexShrink: 0, border: `1px solid ${isGreen ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
          <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}</span>
          {isGreen && <span style={{ ...chipStyle('#1b9254'), marginLeft: 'auto' }}>Done</span>}
          {isGreen && at && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{fmtMMDD(at)}</span>}
        </div>
      )
      return (
        <div key={key}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor, flexShrink: 0, border: `1.5px solid ${dotBorder}` }} />
            <span style={{ fontSize: '13px', color: (done || requestedAt) ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}{!(readOnly || plannerMode) && <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="TAX" title={task.name} templates={[{ name: (plan.program_id || 1) === 1 ? 'TAX_request_returns|holistic' : 'TAX_request_returns', when: 'Asks the client to upload tax returns via a secure link' }]} context={emailCtx} /></span>}</span>
            {done ? (
              <span style={chipStyle('#1b9254')}>{requestedAt ? `Returns received — ${formatStamp(receivedAt)}` : 'Returns on file'}</span>
            ) : readOnly ? (
              requestedAt ? <span style={chipStyle('#0095ff')}>Email sent — {formatStamp(requestedAt)}</span> : null
            ) : (
              <>
                <button disabled={sending} onClick={sendRequest} style={tdGreen} title="Drafts a Gmail to the client with a secure link to upload their tax returns.">{sending ? 'Sending…' : (requestedAt ? 'Resend request email' : 'Send email to request tax returns')}</button>
                <button disabled={sending} onClick={markAlreadyHave} style={tdSecondary} title="Marks the tax returns as received without emailing the client.">Already have tax returns</button>
              </>
            )}
            {/* The step completes on RECEIPT, so received wins over requested;
                requested is the in-flight (blue) fallback. Same precedence as
                overview-tax.ts. */}
            <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{formatStamp(receivedAt || requestedAt)}</span>
          </div>
          {requestedAt && (
            <div style={{ padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: done ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${done ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
                <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: 1, fontWeight: '600' }}>AI PC Admin</span>
              </div>
              <div style={{ marginLeft: '18px', padding: '8px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
                {aiStep('Request email sent to client', !!requestedAt, requestedAt)}
                {aiStep('Tax returns received', !!receivedAt, receivedAt)}
              </div>
            </div>
          )}
        </div>
      )
    }

    if (task.status_options === 'tax_hlm_confirm') {
      const savedDate = livePlan?.tax4_meeting_date || ''
      const draft = declineDrafts[task.id] || {}
      const formOpen = !!draft.dateOpen
      const sending = !!draft.sending
      const setDraft = (patch) => setDeclineDrafts(d => ({ ...d, [task.id]: { ...(d[task.id] || {}), ...patch } }))
      const tdInput = { padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '11px' }
      const tdGreen = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: sending ? 'not-allowed' : 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600 }
      const tdCancel = { padding: '4px 8px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }
      const confirmedLabel = savedDate
        ? `${savedDate}${livePlan?.tax4_meeting_time ? ' ' + livePlan.tax4_meeting_time : ''}${livePlan?.tax4_meeting_timezone ? ' ' + livePlan.tax4_meeting_timezone : ''}`
        : ''
      // Reschedule reopens this same form pre-filled. The confirm action overwrites
      // all four columns and re-arms the day-after decision reminder, so re-sending
      // with a new date is the whole move — no separate endpoint.
      const openDateForm = () => setDraft({
        dateOpen: true,
        date: savedDate,
        time: String(livePlan?.tax4_meeting_time || '').slice(0, 5),
        tz: livePlan?.tax4_meeting_timezone || 'ET',
      })
      return (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: savedDate ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${savedDate ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
          <span style={{ fontSize: '13px', color: savedDate ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}{!(readOnly || plannerMode) && <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="TAX" title={task.name} templates={[{ name: 'TAX_highlevelmeeting_confirm|Yes', when: 'High-level meeting confirmation' }]} context={emailCtx} /></span>}</span>
          {savedDate && !formOpen ? (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={chipStyle('#1b9254')}>Confirmation sent — {confirmedLabel}</span>
              {!readOnly && <button disabled={sending} onClick={openDateForm} style={tdCancel} title="Pick a new date/time and re-send the same confirmation email.">Reschedule</button>}
            </div>
          ) : readOnly ? null : formOpen ? (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={draft.date || ''} onChange={e => setDraft({ date: e.target.value })} style={tdInput} />
              <input type="time" value={draft.time || ''} onChange={e => setDraft({ time: e.target.value })} style={tdInput} />
              <select value={draft.tz || 'ET'} onChange={e => setDraft({ tz: e.target.value })} style={{ ...tdInput, background: 'var(--vfo-card)' }}>
                <option value="ET">Eastern (ET)</option>
                <option value="CT">Central (CT)</option>
                <option value="MT">Mountain (MT)</option>
                <option value="PT">Pacific (PT)</option>
                <option value="AKT">Alaska (AKT)</option>
                <option value="HT">Hawaii (HT)</option>
              </select>
              <button disabled={sending || !draft.date} onClick={() => fireHlmConfirm(task.id, { date: draft.date, time: draft.time, tz: draft.tz || 'ET' })} style={{ ...tdGreen, opacity: (sending || !draft.date) ? 0.6 : 1 }}>{sending ? 'Sending...' : 'Send'}</button>
              <button disabled={sending} onClick={() => setDeclineDrafts(d => { const next = { ...d }; delete next[task.id]; return next })} style={tdCancel}>Cancel</button>
            </div>
          ) : (
            <button disabled={sending} onClick={openDateForm} style={tdGreen} title={`Enter the detailed tax plan meeting date/time/timezone and send the confirmation email. The day after this date, the allocated Tax Planner gets an action-required reminder to complete ${roiSkipMeetingFirst ? 'the "Detailed tax plan presentation" step (Client decision 1 comes later, once the client has signed and paid).' : 'the "Detailed tax plan presentation" and "Client decision 1" steps.'}`}>Send email (with date)</button>
          )}
          {/* Completion column = when the confirmation email went out, NOT the
              meeting it books (tax4_meeting_date is in the FUTURE). Mirrors
              overview-tax.ts's `at` for this step. Legacy plans dated through the
              retired automation_TAX_save_meeting_date carry no stamp — blank, as
              the backend already shows. */}
          <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{formatStamp(livePlan?.tax4_meeting_confirm_email_sent_at)}</span>
        </div>
      )
    }

    if (task.status_options === 'tax_implement_decision') {
      const implDecision = livePlan?.implementation_decision
      const decisionColor = implDecision === 'Proceed' ? '#1b9254' : implDecision === 'Not Implementing' ? '#e74c3c' : implDecision === 'Undecided' ? '#1b9254' : 'var(--vfo-muted)'
      const decisionLabel = implDecision === 'Undecided' ? 'Email sent - awaiting client decision' : implDecision === 'Proceed' ? 'Proceed with Implementation' : implDecision || ''

      async function handleSend() {
        if (!confirm("Send the client the implementation decision email?\n\nThey'll get two buttons:\n  Yes - Proceed: the implementation fee is charged immediately to their saved payment method.\n  No - Do not proceed: the engagement closes, no charge.\n\nIf they don't respond, a reminder is sent after 2 business days and you're notified after 4 business days.")) return
        await saveTask(task.id, 'Undecided', new Date().toISOString().slice(0, 10))
        const res = await callApi('automation_TAX_implementdecision', { tax_plan_id: plan.id, decision: 'Undecided' })
        if (res?.error) alert(`Error: ${res.error}`)
        else if (res?.amended_invoice && res.amended_invoice.ok === false) alert(`The decision email was drafted, but the revised invoice was NOT: ${res.amended_invoice.error || 'unknown error'}`)
        await refreshLivePlan()
      }

      return (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: implDecision ? decisionColor : 'transparent', flexShrink: 0, border: `1.5px solid ${implDecision ? decisionColor : 'var(--vfo-border-mid)'}` }} />
          <span style={{ fontSize: '13px', color: implDecision ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}{!(readOnly || plannerMode) && <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="TAX" title={task.name} templates={[{ name: 'TAX_implementdecision|Undecided', when: 'Sent when you click "Send implementation decision email" — Proceed / Do not proceed buttons' }, { name: 'TAX_implementdecision|Not Implementing', when: 'Sent if the client clicks "No - Do not proceed"' }, { name: 'TAX_implementdecision|Reminder', when: 'Automatic reminder if no response (2 business days)' }]} context={emailCtx} /></span>}</span>
          {implDecision ? (
            <span style={chipStyle(decisionColor)}>{decisionLabel}</span>
          ) : (
            !readOnly && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button onClick={handleSend} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600 }}>Send implementation decision email</button>
              </div>
            )
          )}
          {implDecision && p.status && !readOnly ? <StepDate value={p.completed_date || ''} onChange={d => saveTask(task.id, p.status, d, taxSpecialistId)} disabled={saving[key]} /> : <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{implDecision && p.completed_date ? formatDate(p.completed_date) : ''}</span>}
        </div>
      )
    }

    if (task.name === 'AI PC Admin' && phase?.name === 'Tax 5 - Education & DD (Post Allocation)') {
      const implDecision = livePlan?.implementation_decision
      let implFinal = livePlan?.implementation_final_decision
      // Backwards compat: legacy 'Yes'/'No' values map to Proceed/Decline
      if (implFinal === 'Yes') implFinal = 'Proceed'
      if (implFinal === 'No') implFinal = 'Decline'
      const reminderSentAt = livePlan?.implementation_reminder_sent_at
      const emailSentFor = livePlan?.implementation_decision_email_sent
      const emailSentAt = livePlan?.implementation_decision_email_sent_at
      const chargeStatus = livePlan?.implementation_charge_status
      const recStatus = livePlan?.implementation_receipt_status
      const revEmailSent = livePlan?.implementation_rev_email_sent
      // An amendment may leave implementation_amount at $0 (the retainer already
      // covers the whole fee). Mirrors the backend's `implAmt > 0` gate in
      // utils/tax-plan-steps.ts and implement-final-decision.ts's no-fee branch:
      // no charge, no receipt, no revenue share — so show one done row, not three
      // rows stuck on "Not completed" forever.
      const implFeeDue = amendToCents(livePlan?.implementation_amount) > 0

      // No decision yet → waiting for admin
      if (!implDecision) {
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'transparent', flexShrink: 0, border: '1.5px solid var(--vfo-border-mid)' }} />
            <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}</span>
            <span style={neutralChipStyle}>Waiting for decision</span>
          </div>
        )
      }

      // Cascade done state for the bullet/pill
      const aipcDone = tax5bAipcDone

      const autoStep = (label, done, chip = null, at = null) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: done ? '#1b9254' : 'transparent', flexShrink: 0, border: `1px solid ${done ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
          <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}{chip && <span style={{ marginLeft: '8px' }}>{chip}</span>}</span>
          {done && <span style={{ ...chipStyle('#1b9254'), marginLeft: 'auto' }}>Done</span>}
          {!done && <span style={{ ...neutralChipStyle, marginLeft: 'auto' }}>Not completed</span>}
          {done && at && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{fmtMMDD(at)}</span>}
        </div>
      )
      const stallRows = (stall) => stallSteps(stall, (label, done, at) => autoStep(label, done, null, at))

      const chargeCascade = !implFeeDue ? (
        <>
          {autoStep('No implementation fee due — retainer covers the full fee', true, null, livePlan?.implementation_final_decision_at)}
        </>
      ) : (
        <>
          {autoStep('Implementation fee charged to saved payment method', chargeStatus === 'succeeded', (readOnly || plannerMode) ? null : <StepEmailsChip pipeline="TAX" title="Implementation fee auto-charged using saved payment method" templates={[{ name: 'TAX_implementdecision|Proceeding', when: 'Automatic — drafted when the client clicks Proceed on the implementation decision email' }, { name: 'TAX_invoicereceipt_email|implementation', when: 'Automatic — implementation invoice + receipt' }, { name: 'TAX_implementation_charge_failed', when: 'Automatic — if the implementation charge fails' }]} context={emailCtx} />, livePlan?.implementation_charge_date)}
          {autoStep('Implementation fee receipt created and emailed to client', recStatus === 'Sent', null, livePlan?.implementation_receipt_email_sent_at)}
          {autoStep('Implementation fee revenue share verified, member paid, member emailed', revEmailSent === true, (readOnly || plannerMode) ? null : <StepEmailsChip pipeline="TAX" title="Implementation fee revenue share verified, member paid, member emailed" templates={[{ name: 'TAX_member_revshare|retainer', when: 'Automatic — member revenue-share notice (retainer)' }, { name: 'TAX_member_revshare|implementation', when: 'Automatic — member revenue-share notice (implementation)' }, { name: 'TAX_planner_revshare|retainer', when: 'Automatic — tax planner revenue-share notice (retainer)' }, { name: 'TAX_planner_revshare|implementation', when: 'Automatic — tax planner revenue-share notice (implementation)' }]} context={emailCtx} />, livePlan?.implementation_rev_email_sent_at || livePlan?.implementation_rev_completed_at)}
        </>
      )

      return (
        <div key={key} style={{ padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: aipcDone ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${aipcDone ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
            <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}</span>
          </div>
          <div style={{ marginLeft: '18px', padding: '8px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
            {implDecision === 'Not Implementing' && autoStep('Decline email sent to client', emailSentFor === 'Not Implementing')}

            {implDecision === 'Proceed' && (
              <>
                {autoStep('Email sent to client with "Proceed now" + "Decline implementation" buttons', !!emailSentAt, null, emailSentAt)}
                {stallRows('implementation')}
                {!implFinal && !reminderSentAt && autoStep('Waiting for client to confirm (no auto-charge)', false)}
                {implFinal === 'Decline' && (
                  <>
                    {autoStep('Client clicked Decline', true, null, livePlan?.implementation_final_decision_at)}
                    {autoStep('Decline email sent to client', true)}
                  </>
                )}
                {implFinal === 'Auto-Locked' && (
                  <>
                    {autoStep('Auto-locked (legacy 24h flow)', true)}
                    {chargeCascade}
                  </>
                )}
                {implFinal === 'Confirmed' && (
                  <>
                    {autoStep('Client confirmed Proceed (clicked "Proceed now")', true, null, livePlan?.implementation_final_decision_at)}
                    {chargeCascade}
                  </>
                )}
                {implFinal === 'Proceed' && chargeCascade}
              </>
            )}

            {implDecision === 'Undecided' && (
              <>
                {autoStep('Email sent to client with two decision buttons', !!emailSentAt, null, emailSentAt)}
                {stallRows('implementation')}
                {!implFinal && !reminderSentAt && autoStep('Waiting for client decision', false)}
                {implFinal === 'Proceed' && (
                  <>
                    {autoStep('Client clicked Yes (proceed)', true, null, livePlan?.implementation_final_decision_at)}
                    {chargeCascade}
                  </>
                )}
                {implFinal === 'Decline' && (
                  <>
                    {autoStep('Client clicked No (do not proceed)', true, null, livePlan?.implementation_final_decision_at)}
                    {autoStep('Decline email sent to client', true)}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )
    }
    if (['Email to obtain information required sent', 'Information received', 'Information passed to VFO-L'].includes(task.name)) return null

    if (task.status_options === 'auto') {
      // AI PC Admin should auto-derive its done state from the cascade for
      // its containing phase, since admins never manually mark it Completed.
      let autoIsDone = isDone
      if (task.name === 'AI PC Admin' && phase?.name === 'Tax 3 - ROI Meeting') {
        const decline = livePlan?.tax_decision === 'No' || livePlan?.tax_final_decision === 'No'
        const fullyDone = livePlan?.retainer_invoice_email_sent === true
        autoIsDone = decline || fullyDone
      }
      if (task.name === 'AI PC Admin' && phase?.name === 'Tax 5 - Education & DD (Post Allocation)') {
        const impl = livePlan?.implementation_decision
        const finalDec = livePlan?.implementation_final_decision
        const decline = impl === 'Not Implementing' || (impl === 'Undecided' && finalDec === 'No')
        const fullyDone = livePlan?.implementation_rev_email_sent === true
        autoIsDone = decline || fullyDone
      }
      return (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: autoIsDone ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${autoIsDone ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
          <span style={{ fontSize: '13px', color: 'var(--vfo-muted)', flex: 1 }}>{taskLabel(task)}</span>
          <span style={autoIsDone ? chipStyle('#1b9254') : neutralChipStyle}>{autoIsDone ? 'Completed' : 'Not completed'}</span>
          {autoIsDone && p.status && !readOnly ? <StepDate value={p.completed_date || ''} onChange={d => saveTask(task.id, p.status, d, taxSpecialistId)} disabled={saving[key]} /> : <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{autoIsDone && p.completed_date ? formatDate(p.completed_date) : ''}</span>}
        </div>
      )
    }

    if (task.status_options === 'tax_refund') {
      const decision = p.status || ''
      const hasPi = !!livePlan?.deposit_payment_intent_id
      const refunded = livePlan?.deposit_refund_status === 'succeeded'
      const locked = readOnly || plannerMode
      // Always listed, on every surface (Jake, 2026-09-18 — it used to hide from
      // the member view until a refund landed). The member view shows the
      // outcome only; the buttons below are gated on !readOnly.
      const done = decision === 'Proceed' || refunded
      const draft = refundReasonDrafts[task.id] || {}
      const refundOpen = !!draft.open
      const sending = !!draft.sending
      const reason = draft.reason || ''
      const canSend = hasPi && !!reason.trim() && !sending
      // Proceed carries the plan forward, so it needs the diagnostic chain (or a Stop
      // verdict). Refund below is deliberately NOT gated — see stepGate.
      const canProceed = diagnosticChain && !sending
      const proceedLockHint = 'Proceed locked — complete "Tax planner review complete"'
      const showControls = !readOnly && !refunded && !decision && !refundOpen
      // Without a PaymentIntent BOTH buttons are dead, so the deposit is the honest
      // blocker to name — the Proceed chain only becomes the story once it exists.
      const refundLockHint = !hasPi
        ? 'Enter the Stripe deposit payment (Set Up) first'
        : !canProceed ? proceedLockHint : ''
      const trGreen = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: sending ? 'not-allowed' : 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600 }
      const trRed = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: sending ? 'not-allowed' : 'pointer', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.12)', color: '#e74c3c', fontWeight: 600 }
      const closeRefundDraft = () => setRefundReasonDrafts(d => { const next = { ...d }; delete next[task.id]; return next })
      async function sendDepositRefund() {
        const trimmed = reason.trim()
        if (!confirm('Refund the deposit via Stripe and draft the decline email?\n\nThis refunds the saved PaymentIntent in full and drafts an email to the client including your reason(s). Cannot be undone.')) return
        setRefundReasonDrafts(d => ({ ...d, [task.id]: { ...(d[task.id] || {}), sending: true } }))
        const res = await callApi('automation_TAX_depositrefund', { tax_plan_id: plan.id, reason: trimmed })
        if (res?.error) {
          alert(`Refund failed: ${res.error}`)
          setRefundReasonDrafts(d => ({ ...d, [task.id]: { ...(d[task.id] || {}), sending: false } }))
          return
        }
        await refreshLivePlan()
        const pd = await callApi('tax_load_progress', { tax_plan_id: plan.id })
        const map = {}
        ;(pd.progress || []).forEach(pr => {
          const k = pr.tax_specialist_id ? `${pr.task_id}_${pr.tax_specialist_id}` : pr.task_id
          map[k] = pr
        })
        setLocalProgress(map)
        closeRefundDraft()
      }
      return (
        <div key={key} style={{ borderBottom: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', flexWrap: 'wrap' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: done ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${done ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
            <span style={{ fontSize: '13px', color: done ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: '1 1 auto', minWidth: '140px' }}>
              {taskLabel(task)}{!locked && <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="TAX" title={task.name} templates={[{ name: 'TAX_deposit_refund', when: 'Refund — deposit refunded with decline reason(s)' }]} context={{ ...emailCtx, 'Refund Reason': reason.trim() || 'your reason(s) — typed on this step' }} /></span>}
              {taskSubLabel(task) && <div style={taskSubLabelStyle}>{taskSubLabel(task)}</div>}
            </span>
            {showControls && !sending && refundLockHint && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '0 1 auto', minWidth: '150px', justifyContent: 'flex-end', textAlign: 'right' }}>
                <LockedIcon />
                <span style={lockedHintStyle}>{refundLockHint}</span>
              </span>
            )}
            {refunded
              ? <span style={chipStyle('#e74c3c')}>Refunded ${livePlan?.deposit_refund_amount}</span>
              : decision
                ? <span style={chipStyle(statusColor)}>{decision}</span>
                : readOnly
                  ? <span style={neutralChipStyle}>Not started</span>
                  : null
            }
            {/* The $250 Tax Planning Team leg of the deposit, which Proceed
                triggers. Admin-only: it is VFO's own money movement, the same
                reason PricingSplitCard is hidden from readOnly/plannerMode. */}
            {!locked && decision === 'Proceed' && depositTeamChip(livePlan?.deposit_team_share_status)}
            {refunded && livePlan?.deposit_refund_date ? <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{formatDate(livePlan.deposit_refund_date)}</span> : (done && p.status && !readOnly) ? <StepDate value={p.completed_date || ''} onChange={d => saveTask(task.id, p.status, d, taxSpecialistId)} disabled={saving[key]} /> : <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{done && p.completed_date ? formatDate(p.completed_date) : ''}</span>}
          </div>
          {/* Buttons sit on their own line under the step name, indented past the
              dot — inline they squeezed the name into a four-line wrap. */}
          {showControls && hasPi && (
            <div style={{ paddingLeft: '18px', paddingBottom: '7px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {canProceed && <button disabled={sending} onClick={() => saveTask(task.id, 'Proceed', p.completed_date, taxSpecialistId)} style={trGreen}>Proceed</button>}
              <button disabled={sending} onClick={() => setRefundReasonDrafts(d => ({ ...d, [task.id]: { open: true, reason: '', sending: false } }))} style={trRed}>Refund</button>
            </div>
          )}
          {refundOpen && !done && !locked && (
            <div style={{ marginLeft: '18px', marginBottom: '8px', padding: '14px 16px', background: 'var(--vfo-tint)', borderRadius: '10px', border: '1px solid var(--vfo-tint-deep)', fontFamily: 'Inter, sans-serif' }}>
              <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                Subject: VFO Services - Tax Planning Deposit Refunded - {client?.first_name ? `${client.first_name} ${client.last_name || ''}`.trim() : '[Client Name]'}
              </div>
              <div style={{ fontSize: '13px', color: '#44557a', lineHeight: '1.6' }}>
                <p style={{ margin: '0 0 12px' }}>Hi {client?.first_name || '[Client First]'},</p>
                <textarea
                  value={reason}
                  onChange={e => setRefundReasonDrafts(d => ({ ...d, [task.id]: { ...(d[task.id] || {}), reason: e.target.value } }))}
                  placeholder="Type the reason we are not moving forward here - written as if speaking directly to the client."
                  disabled={sending}
                  style={{ width: '100%', minHeight: '90px', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.06)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif', fontSize: '13px', lineHeight: '1.55', boxSizing: 'border-box', resize: 'vertical', marginBottom: '12px' }}
                />
                <p style={{ margin: '0 0 12px' }}>We have refunded your $500 tax planning deposit — you should see the funds back in your account within the next few days.</p>
                <p style={{ margin: '0 0 12px' }}>If you have any questions, just let us know.</p>
                <p style={{ margin: '0 0 12px' }}>Thank you for your time.</p>
                <p style={{ margin: 0 }}>Best regards,</p>
              </div>
              {!hasPi && <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--vfo-muted)' }}>Enter the Deposit PaymentIntent ID on the Deposit Paid step first</div>}
              <div style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button disabled={sending} onClick={closeRefundDraft} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: sending ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Cancel</button>
                <button disabled={!canSend} onClick={sendDepositRefund} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: canSend ? 'pointer' : 'not-allowed', border: '1px solid rgba(231,76,60,0.4)', background: canSend ? 'rgba(231,76,60,0.18)' : 'rgba(231,76,60,0.06)', color: '#e74c3c', fontWeight: '600' }} title={!hasPi ? 'Enter the Deposit PaymentIntent ID on the Deposit Paid step first' : (!reason.trim() ? 'Enter the reason(s) first' : '')}>{sending ? 'Sending...' : 'Send Refund'}</button>
              </div>
            </div>
          )}
        </div>
      )
    }

    // Generic read-only row: the member view's catch-all, ahead of every branch
    // below it. The allocation step is EXEMPT — its progress status is the
    // holder's NAME, which is not in statusColors, so this row painted its dot
    // and chip muted grey on a completed step. It has its own read-only render
    // (allocReadOnly) that reads the two slot columns instead; let it through.
    if (readOnly && !isAllocTask(task)) return (
      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'var(--vfo-border-mid)'}` }} />
        <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}</span>
        {isDone
          ? <span style={chipStyle(statusColor)}>{p.status}</span>
          : <span style={neutralChipStyle}>Not started</span>
        }
        <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{isDone && p.completed_date ? formatDate(p.completed_date) : ''}</span>
      </div>
    )


    if (task.status_options === 'enter_details') return (
      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
        <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}</span>
        {isDone
          ? <span style={chipStyle('#1b9254')}>Completed</span>
          : <button onClick={() => saveTask(task.id, 'Completed', p.completed_date, taxSpecialistId)} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600 }}>Enter details</button>
        }
        {isDone && !readOnly ? <StepDate value={p.completed_date || ''} onChange={d => saveTask(task.id, p.status, d, taxSpecialistId)} disabled={saving[key]} /> : <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{p.completed_date ? formatDate(p.completed_date) : ''}</span>}
      </div>
    )

    if (task.status_options === 'tax_deposit_pi') {
      const savedPi = livePlan?.deposit_payment_intent_id || ''
      const paidViaPortal = !!taxIntake?.tax_plan_id && String(taxIntake.tax_plan_id) === String(livePlan?.id ?? plan?.id ?? '')
      const draftVal = depositPiDrafts[task.id]
      const inputVal = draftVal !== undefined ? draftVal : savedPi
      async function saveDepositPi() {
        if (!inputVal || !inputVal.trim()) { alert('Enter a Stripe PaymentIntent ID (pi_...) or payment URL'); return }
        const res = await callApi('tax_save_deposit_pi', { tax_plan_id: plan.id, payment_intent_id: inputVal.trim(), task_id: task.id })
        if (res?.error) { alert(`Error: ${res.error}`); return }
        await refreshLivePlan()
        const pd = await callApi('tax_load_progress', { tax_plan_id: plan.id })
        const map = {}
        ;(pd.progress || []).forEach(pr => {
          const k = pr.tax_specialist_id ? `${pr.task_id}_${pr.tax_specialist_id}` : pr.task_id
          map[k] = pr
        })
        setLocalProgress(map)
        setDepositPiDrafts(p => { const c = { ...p }; delete c[task.id]; return c })
      }
      return (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone && savedPi ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone && savedPi ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
          <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}</span>
          {readOnly ? (
            savedPi && <span style={{ ...chipStyle('#1b9254'), fontFamily: 'monospace' }}>{savedPi}</span>
          ) : (
            <>
              <input
                type="text"
                value={inputVal}
                placeholder="pi_..."
                onChange={(e) => setDepositPiDrafts(p => ({ ...p, [task.id]: e.target.value }))}
                style={{ ...inputStyle, fontFamily: 'monospace', minWidth: '240px' }}
                title="Paste the Stripe PaymentIntent ID (pi_...) or a payment URL from the Stripe dashboard"
              />
              <button onClick={saveDepositPi} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600 }}>Save</button>
            </>
          )}
          {/* Stamped by the member's own portal intake rather than typed in by
              an admin — the tell is an intake row that carries this plan. */}
          {savedPi && paidViaPortal && <span style={chipStyle('#1b9254')}>Paid via portal</span>}
          {isDone && !readOnly ? <StepDate value={p.completed_date || ''} onChange={d => saveTask(task.id, p.status, d, taxSpecialistId)} disabled={saving[key]} /> : <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{isDone && p.completed_date ? formatDate(p.completed_date) : ''}</span>}
        </div>
      )
    }

    if (task.status_options === 'tax_3_decision') {
      // The confirmation email names the allocated Team Member / Tax Planner, so
      // the confirm send is blocked until one is allocated (decline stays open).
      const plannerAllocated = !!(livePlan?.tax_planner_id ?? plan?.tax_planner_id)
      // Declining here is the Holistic-only stop route (it is what retires the
      // program-1 "Tax Planner review complete" Stop bell). VFO Tax Planning
      // (program 4) stops via the Green/Red Light step's $500 deposit refund
      // instead, so it gets no decline affordance.
      const canDecline = (plan.program_id || 1) === 1
      const draft = declineDrafts[task.id] || {}
      const declineOpen = !!draft.open
      const sending = !!draft.sending
      // Once the meeting is booked the pill reports the booked slot rather than
      // the generic status. Legacy rows (sent before the date columns existed)
      // have no tax3_meeting_date and keep showing the saved status.
      const bookedLabel = (() => {
        const d = livePlan?.tax3_meeting_date
        if (!d) return ''
        const [yy, mm, dd] = String(d).split('-')
        let out = `Meeting booked for ${Number(mm)}/${Number(dd)}/${yy}`
        const raw = livePlan?.tax3_meeting_time
        if (raw) {
          const [hStr, minStr] = String(raw).split(':')
          const h24 = parseInt(hStr, 10)
          if (!Number.isNaN(h24)) {
            const ampm = h24 >= 12 ? 'PM' : 'AM'
            out += ` at ${h24 % 12 || 12}:${minStr || '00'} ${ampm}`
          }
        }
        const tz = livePlan?.tax3_meeting_timezone
        if (tz) out += ` ${tz}`
        return out
      })()
      const tdInput = { padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '11px' }
      const tdGreen = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: sending ? 'not-allowed' : 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600 }
      const tdRed = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: sending ? 'not-allowed' : 'pointer', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.12)', color: '#e74c3c', fontWeight: 600 }
      const tdCancel = { padding: '4px 8px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }
      // Lighter than tdGreen: the two skip routes are alternatives to Send, not
      // the expected action, and they read as a pair.
      const tdSkip = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: sending ? 'not-allowed' : 'pointer', border: '1px solid rgba(27,146,84,0.25)', background: 'rgba(27,146,84,0.06)', color: '#1b9254', fontWeight: 600 }
      const dateOpen = !!draft.dateOpen
      const setDraft = (patch) => setDeclineDrafts(d => ({ ...d, [task.id]: { ...(d[task.id] || {}), ...patch } }))
      // A booked meeting can be moved: reopen this same form pre-filled and re-send
      // the confirmation. Legacy rows booked before the date columns existed have
      // nothing to pre-fill, so they reschedule from an empty form.
      const isBooked = !!bookedLabel || p.status === 'Yes - Confirmation email to client'
      const openDateForm = () => setDraft({
        dateOpen: true,
        date: livePlan?.tax3_meeting_date || '',
        time: String(livePlan?.tax3_meeting_time || '').slice(0, 5),
        tz: livePlan?.tax3_meeting_timezone || 'ET',
      })
      const rescheduleBtn = !readOnly && <button disabled={sending} onClick={openDateForm} style={tdCancel} title="Pick a new date/time and re-send the same confirmation email.">Reschedule</button>
      // Both skip routes go through one action; `mode` is the only difference.
      // The backend validates it, re-checks the planner allocation and refuses a
      // second skip on the other route, so every refusal surfaces as its own
      // message rather than being pre-guessed here.
      const fireSkipRoi = async (mode, confirmText) => {
        if (!window.confirm(confirmText)) return
        const res = await callApi('automation_TAX_skiproimeeting', { tax_plan_id: plan.id, mode })
        if (res?.error) { alert(`Error: ${res.error}`); return }
        await refreshLivePlan()
      }
      return (
        <div key={key} style={{ borderBottom: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', flexWrap: 'wrap' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'var(--vfo-border-mid)'}` }} />
            <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}{!(readOnly || plannerMode) && <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="TAX" title={task.name} templates={[{ name: 'TAX_readyfortax3|Yes', when: 'If the meeting is booked' }, { name: 'TAX_readyfortax3|No', when: 'If declined' }]} context={emailCtx} /></span>}</span>
            {dateOpen && !readOnly
              ? <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="date" value={draft.date || ''} onChange={e => setDraft({ date: e.target.value })} style={tdInput} />
                  <input type="time" value={draft.time || ''} onChange={e => setDraft({ time: e.target.value })} style={tdInput} />
                  <select value={draft.tz || 'ET'} onChange={e => setDraft({ tz: e.target.value })} style={{ ...tdInput, background: 'var(--vfo-card)' }}>
                    <option value="ET">Eastern (ET)</option>
                    <option value="CT">Central (CT)</option>
                    <option value="MT">Mountain (MT)</option>
                    <option value="PT">Pacific (PT)</option>
                    <option value="AKT">Alaska (AKT)</option>
                    <option value="HT">Hawaii (HT)</option>
                  </select>
                  <button disabled={sending || !draft.date} onClick={() => fireReadyForTax3(task.id, 'confirm_date', { date: draft.date, time: draft.time, tz: draft.tz || 'ET', existingDate: p.completed_date })} style={{ ...tdGreen, opacity: (sending || !draft.date) ? 0.6 : 1 }}>{sending ? 'Sending...' : 'Send'}</button>
                  <button disabled={sending} onClick={() => setDeclineDrafts(d => { const next = { ...d }; delete next[task.id]; return next })} style={tdCancel}>Cancel</button>
                </div>
              : bookedLabel
                ? <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={chipStyle('#1b9254')}>{bookedLabel}</span>
                    {rescheduleBtn}
                  </div>
                : isDone
                  ? <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={chipStyle(statusColor)}>{p.status}</span>
                      {isBooked && rescheduleBtn}
                    </div>
                  : readOnly
                    ? <span style={neutralChipStyle}>Not started</span>
                    : !declineOpen && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button disabled={sending} onClick={() => { if (!plannerAllocated) { alert('Allocate a Team Member / Tax Planner (Tax 1) before sending the confirmation email.'); return } openDateForm() }} style={tdGreen}>Send email (with date)</button>
                        {canDecline && <button disabled={sending} onClick={() => setDeclineDrafts(d => ({ ...d, [task.id]: { open: true, reason: '', sending: false } }))} style={tdRed}>No - Declined email to client</button>}
                        {/* Both programs, both routes. Irreversible, so the confirm
                            stays: a skipped plan can never book the ROI meeting
                            afterwards, and the ROUTE is equally one-way — the two
                            unlock different steps and raise different bells, so the
                            backend refuses a later click on the other button. */}
                        <button disabled={sending} onClick={() => fireSkipRoi('retainer_first', 'Skip the ROI meeting, retainer first?\n\nThis is final. The client completes the tax planning decision, signs and pays BEFORE the detailed tax plan meeting is booked.')} style={tdSkip} title="No ROI meeting. The client decides, signs and pays first; the detailed tax plan meeting is booked after that.">Skip ROI — retainer first</button>
                        <button disabled={sending} onClick={() => fireSkipRoi('meeting_first', 'Skip the ROI meeting, meeting first?\n\nThis is final. The detailed tax plan meeting is booked and held BEFORE the client decides, signs and pays.')} style={tdSkip} title="No ROI meeting. The detailed tax plan meeting is booked and held first; the decision, signing and payment follow it.">Skip ROI — meeting first</button>
                      </div>
                    )
            }
            {isDone && !readOnly ? <StepDate value={p.completed_date || ''} onChange={d => saveTask(task.id, p.status, d, taxSpecialistId)} disabled={saving[key]} /> : <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{isDone && p.completed_date ? formatDate(p.completed_date) : ''}</span>}
          </div>
          {declineOpen && !isDone && (
            <div style={{ marginLeft: '18px', marginBottom: '8px', padding: '14px 16px', background: 'var(--vfo-tint)', borderRadius: '10px', border: '1px solid var(--vfo-tint-deep)', fontFamily: 'Inter, sans-serif' }}>
              <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                Subject: Tax Planning Priority Assessment — {client?.first_name ? `${client.first_name} ${client.last_name || ''}`.trim() : '[Client Name]'}
              </div>
              <div style={{ fontSize: '13px', color: '#44557a', lineHeight: '1.6' }}>
                <p style={{ margin: '0 0 12px' }}>Dear {client?.first_name || '[Client First]'},</p>
                <p style={{ margin: '0 0 12px' }}>Thank you for providing the information for assessing your Tax Planning Priority. Unfortunately, at this time, we are not going to be able to move forward.</p>
                <textarea
                  value={draft.reason || ''}
                  onChange={e => setDeclineDrafts(d => ({ ...d, [task.id]: { ...(d[task.id] || {}), reason: e.target.value } }))}
                  placeholder="Type the decline reason here — written as if speaking directly to the client."
                  disabled={sending}
                  style={{ width: '100%', minHeight: '90px', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.06)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif', fontSize: '13px', lineHeight: '1.55', boxSizing: 'border-box', resize: 'vertical', marginBottom: '12px' }}
                />
                <p style={{ margin: 0 }}>Regards,</p>
              </div>
              <div style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button disabled={sending} onClick={() => setDeclineDrafts(d => { const next = { ...d }; delete next[task.id]; return next })} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: sending ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Cancel</button>
                <button disabled={sending || !(draft.reason || '').trim()} onClick={() => fireReadyForTax3(task.id, 'declined', { declineReason: draft.reason, existingDate: p.completed_date })} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: (sending || !(draft.reason || '').trim()) ? 'not-allowed' : 'pointer', border: '1px solid rgba(231,76,60,0.4)', background: (sending || !(draft.reason || '').trim()) ? 'rgba(231,76,60,0.06)' : 'rgba(231,76,60,0.18)', color: '#e74c3c', fontWeight: '600' }}>{sending ? 'Sending...' : 'Send Decline Email'}</button>
              </div>
            </div>
          )}
        </div>
      )
    }

    if (task.status_options === 'tax_continue_stop') {
      const adminDecision = livePlan?.post_review_decision
      const emailSentAt = livePlan?.post_review_decision_email_sent_at
      const clientDecision = livePlan?.post_review_client_decision
      const reminderSentAt = livePlan?.post_review_reminder_sent_at
      const refundStatus = livePlan?.refund_status
      const revPaid = livePlan?.retainer_rev_paid
      // Revenue share is N/A (still green) when member share is $0 — mirrors MAP 1.
      // Tax stores a $0 member share as NULL (decision.ts: parseFloat(...) || null),
      // so treat null/empty as zero-share too.
      const isZeroShare = (v) => parseFloat(String(v ?? '').replace(/[$,]/g, '')) === 0
      const zeroShare = livePlan?.member_share == null || isZeroShare(livePlan?.member_share)

      const decisionColor = adminDecision === 'Continue - Revenue Share' ? '#1b9254'
        : adminDecision === 'Stop - Refund' ? '#e74c3c'
        : adminDecision === 'Undecided' ? '#e06717'
        : 'var(--vfo-muted)'

      // Display label only — the SAVED value stays 'Continue - Revenue Share'
      // on every shape (it keys the template lookup, statusColors, and the
      // backend's idempotency); on a 3-payment plan the green click also pulls
      // the final retainer, so the button says so.
      const decision1ThreePay = isThreePaymentPlan(livePlan)
      const continueLabel = decision1ThreePay ? 'Continue - Final Retainer + Revenue Share' : 'Continue - Revenue Share'

      async function handlePick(value) {
        if (!value) return
        if (value === 'Continue - Revenue Share' && !confirm(decision1ThreePay
          ? "Mark client as Continue?\n\nThis sends them an email with a green Confirm button and a red Refund button. When they click Confirm, their FINAL RETAINER is collected from the payment method on file, and the retainer revenue share fires once that payment settles. After 2 business days with no click they get a reminder email, after 4 business days the PF is notified to reach out."
          : "Mark client as Continue?\n\nThis sends them an email with a green Confirm button and a red Refund button. The revenue share fires ONLY when they click Confirm. After 2 business days with no click they get a reminder email, after 4 business days the PF is notified to reach out.")) return
        if (value === 'Stop - Refund' && !confirm("Stop - Refund? This will IMMEDIATELY fire a Stripe refund of the retainer and draft a refund confirmation email to the client.")) return
        if (value === 'Undecided' && !confirm("Mark client as Undecided?\n\nThey'll get an email with two buttons (Proceed / Refund). After 2 business days with no click we send a reminder, after 4 business days we notify you to call the client.")) return
        // The step row + the decision email + (maybe) the revised invoice take
        // several seconds; hold the clicked button in a Sending state and
        // disable the other two until the plan re-reads. saveTask runs with
        // skipBusy so it cannot clear this flag halfway through.
        setSaving(p => ({ ...p, [key]: value }))
        try {
          await saveTask(task.id, value, new Date().toISOString().slice(0, 10), null, { skipRefresh: true, skipBusy: true })
          let res
          try {
            res = await callApi('automation_TAX_postreviewdecision', { tax_plan_id: plan.id, decision: value })
          } catch (err) {
            alert(`Post-review request failed: ${err.message || err}`)
            return
          }
          if (res?.error) alert(`Error: ${res.error}`)
          else if (res?.refund_result?.error) alert(`Refund failed: ${res.refund_result.error}`)
          else if (res?.amended_invoice && res.amended_invoice.ok === false) alert(`The decision email was drafted, but the revised invoice was NOT: ${res.amended_invoice.error || 'unknown error'}`)
          await refreshLivePlan()
        } finally {
          setSaving(p => ({ ...p, [key]: false }))
        }
      }
      const picking = saving[key]   // false | the value being sent
      const pickBtn = (value, label, rgb, color) => (
        <button disabled={!!picking} onClick={() => handlePick(value)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: picking ? 'not-allowed' : 'pointer', border: `1px solid rgba(${rgb},0.4)`, background: `rgba(${rgb},${picking === value ? 0.22 : 0.12})`, color, fontWeight: 600, opacity: picking && picking !== value ? 0.5 : 1 }}>
          {picking === value ? 'Sending…' : label}
        </button>
      )

      const autoStep = (label, done, opts = {}) => {
        const na = !!opts.na
        return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: (done || na) ? '#1b9254' : 'transparent', flexShrink: 0, border: `1px solid ${(done || na) ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
          <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}{opts.chip && <span style={{ marginLeft: '8px' }}>{cloneElement(opts.chip, { title: label })}</span>}</span>
          {(done || na) && <span style={{ ...chipStyle('#1b9254'), marginLeft: 'auto' }}>{na ? 'N/A' : 'Done'}</span>}
          {!(done || na) && <span style={{ ...neutralChipStyle, marginLeft: 'auto' }}>{opts.pendingLabel || 'Not completed'}</span>}
          {done && opts.at && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{fmtMMDD(opts.at)}</span>}
        </div>
        )
      }
      const stallRows = (stall) => stallSteps(stall, (label, done, at) => autoStep(label, done, { at }))
      const revshareChip = (readOnly || plannerMode) ? null : <StepEmailsChip pipeline="TAX" templates={[{ name: 'TAX_member_revshare|retainer', when: 'Automatic — member revenue-share notice (retainer)' }, { name: 'TAX_member_revshare|implementation', when: 'Automatic — member revenue-share notice (implementation)' }, { name: 'TAX_planner_revshare|retainer', when: 'Automatic — tax planner revenue-share notice (retainer)' }, { name: 'TAX_planner_revshare|implementation', when: 'Automatic — tax planner revenue-share notice (implementation)' }]} context={emailCtx} />
      const refundChip = (readOnly || plannerMode) ? null : <StepEmailsChip pipeline="TAX" templates={[{ name: 'TAX_refund_email|Yes', when: 'Automatic — retainer refund confirmation' }]} context={emailCtx} />

      return (
        <div key={key} style={{ borderBottom: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', flexWrap: 'wrap' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: adminDecision ? decisionColor : 'transparent', flexShrink: 0, border: `1.5px solid ${adminDecision ? decisionColor : 'var(--vfo-border-mid)'}` }} />
            <span style={{ fontSize: '13px', color: adminDecision ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}{!(readOnly || plannerMode) && <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="TAX" title={task.name} templates={[{ name: 'TAX_postreview|Continue', when: 'If Continue — green Confirm / red Refund buttons (client must click Confirm)' }, { name: 'TAX_postreview|Undecided', when: 'If Undecided — Proceed / Refund buttons' }, { name: 'TAX_postreview|Reminder', when: 'Automatic reminder if no response (2 business days)' }]} context={emailCtx} /></span>}</span>
            {adminDecision ? (
              <span style={chipStyle(decisionColor)}>{adminDecision}</span>
            ) : (
              !readOnly && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {pickBtn('Continue - Revenue Share', continueLabel, '27,146,84', '#1b9254')}
                  {pickBtn('Undecided', 'Undecided', '251,137,90', '#e06717')}
                  {pickBtn('Stop - Refund', 'Stop - Refund', '231,76,60', '#e74c3c')}
                </div>
              )
            )}
            {adminDecision && p.status && !readOnly ? <StepDate value={p.completed_date || ''} onChange={d => saveTask(task.id, p.status, d, taxSpecialistId)} disabled={saving[key]} /> : <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{adminDecision && p.completed_date ? formatDate(p.completed_date) : ''}</span>}
          </div>
          {adminDecision && (
            <div style={{ marginLeft: '18px', padding: '8px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)', marginBottom: '8px' }}>
              {adminDecision === 'Stop - Refund' && (
                <>
                  {autoStep('Refund processed and confirmation email drafted', refundStatus === 'succeeded', { chip: refundChip })}
                </>
              )}
              {adminDecision === 'Continue - Revenue Share' && (
                <>
                  {autoStep('Email sent to client with Confirm + Refund buttons', !!emailSentAt, { at: emailSentAt })}
                  {stallRows('post_review')}
                  {!clientDecision && autoStep('Waiting for client to confirm (click required)', false)}
                  {clientDecision === 'Refund' && (
                    <>
                      {autoStep('Client clicked Refund', true, { at: livePlan?.post_review_client_decision_at })}
                      {autoStep('Refund issued', refundStatus === 'succeeded', { chip: refundChip })}
                    </>
                  )}
                  {clientDecision === 'Auto-Locked' && (
                    <>
                      {autoStep('Auto-locked (legacy 24h flow)', true)}
                      {autoStep('Revenue share verified, member paid, member emailed', revPaid === 'Yes', { na: zeroShare, chip: revshareChip, at: livePlan?.retainer_rev_email_sent_at || livePlan?.retainer_rev_completed_at })}
                    </>
                  )}
                  {clientDecision === 'Confirmed' && (
                    <>
                      {autoStep('Client confirmed Continue (clicked "Continue now")', true, { at: livePlan?.post_review_client_decision_at })}
                      {autoStep('Revenue share verified, member paid, member emailed', revPaid === 'Yes', { na: zeroShare, chip: revshareChip, at: livePlan?.retainer_rev_email_sent_at || livePlan?.retainer_rev_completed_at })}
                    </>
                  )}
                </>
              )}
              {adminDecision === 'Undecided' && (
                <>
                  {autoStep('Email sent to client with two decision buttons', !!emailSentAt, { at: emailSentAt })}
                  {stallRows('post_review')}
                  {!clientDecision && !reminderSentAt && autoStep('Waiting for client (2 business days before reminder)', false)}
                  {clientDecision === 'Proceed' && (
                    <>
                      {autoStep('Client clicked Proceed', true, { at: livePlan?.post_review_client_decision_at })}
                      {autoStep('Revenue share verified, member paid, member emailed', revPaid === 'Yes', { na: zeroShare, chip: revshareChip, at: livePlan?.retainer_rev_email_sent_at || livePlan?.retainer_rev_completed_at })}
                    </>
                  )}
                  {clientDecision === 'Refund' && (
                    <>
                      {autoStep('Client clicked Refund', true, { at: livePlan?.post_review_client_decision_at })}
                      {autoStep('Refund issued', refundStatus === 'succeeded', { chip: refundChip })}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )
    }

    if (isAllocTask(task)) {
      const green = '#1b9254'
      // TWO slots, filled independently: the Tax Planner who runs the plan and an
      // optional, persistent Team Member. Only the planner slot is "done".
      const allocatedId = livePlan?.tax_planner_id
      const teamMemberId = livePlan?.tax_team_member_id
      const activePlanners = taxPlanners.filter(pl => (pl.status ? String(pl.status).toLowerCase() === 'active' : true))
      // The selected planner: match by id (plan.tax_planner_id) first, falling
      // back to the stored name for legacy rows without an id. Team Members are
      // excluded from that fallback — the progress row still carries the name of
      // a team member who held the old single slot, and they are shown by the
      // team-member chip below, never as the tax planner.
      const selectedPlanner = (allocatedId != null ? taxPlanners.find(pl => String(pl.id) === String(allocatedId)) : null)
        || activePlanners.find(pl => pl.planner_role !== 'Team Member'
          && `${pl.first_name || ''} ${pl.last_name || ''}`.trim() === (p.status || ''))
      const selectedTeamMember = teamMemberId != null
        ? (taxPlanners.find(pl => String(pl.id) === String(teamMemberId)) || null)
        : null
      // Display name carries the certifications suffix; the stored value (p.status)
      // is the plain full name and is never rewritten from here.
      const allocatedName = selectedPlanner ? plannerDisplayName(selectedPlanner) : (p.status || livePlan?.tax_planner_name || '')
      const teamMemberName = selectedTeamMember ? plannerDisplayName(selectedTeamMember) : ''
      // Allocated means a real id in EITHER slot on the plan. Allocating the team
      // member is this step's whole job for an admin — the hand-off to a Tax
      // Planner happens afterwards, in the planner portal — so a team member alone
      // closes it. A legacy progress row holding only a name (a departed employee)
      // used to satisfy this and show green while the dropdown sat on "-- Select --",
      // which is why the name never counts on its own. Downstream steps still
      // require a real Tax Planner: that is taxPlannerAllocated's job, unchanged.
      const isAllocated = !!(allocatedId || teamMemberId)
      // The planner pill is the PLANNER slot's own chip — never the team member's,
      // whose name the progress row now echoes when they are the only holder.
      const plannerShown = !!(allocatedId || selectedPlanner)
      const greenPill = chipStyle(green)
      // Colors reuse the portal's tinted-pill idiom: green #1b9254 (positive),
      // red #e74c3c (No Stripe), amber #b45309 (Team Member).
      const teamMemberChip = chipStyle('#b45309')
      // Stripe status now comes from the planner's Tax Planning Group (member_type),
      // not the planner row. Connected only when the group has a Stripe account.
      const plannerGroup = selectedPlanner ? taxGroups.find(g => g.name === selectedPlanner.member_type) : null
      const groupConnected = !!(plannerGroup && (plannerGroup.stripe_account_id || '').trim())
      const plannerChips = (selectedPlanner && !plannerMode) ? [
        groupConnected
          ? { label: 'Stripe Connected', style: chipStyle('#1b9254') }
          : { label: 'No Stripe', style: chipStyle('#e74c3c') },
      ] : []

      // Who may WRITE the allocation. In the portal that is the Team Member alone —
      // allocating the Tax Planner is their job, and an allocated planner has no
      // business re-cutting the allocation that put them there — so a Tax Planner
      // caller gets this one step read-only while the rest of their portal stays
      // editable. self_role is the backend's answer (tax_planner_portal_clients);
      // anything else, including a roster that has not loaded yet, reads read-only.
      const allocReadOnly = readOnly || (plannerMode && plannerSelfRole !== 'Team Member')

      if (allocReadOnly) {
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isAllocated ? green : 'transparent', flexShrink: 0, border: `1.5px solid ${isAllocated ? green : 'var(--vfo-border-mid)'}` }} />
            <span style={{ fontSize: '13px', color: 'var(--vfo-muted)', flex: 1 }}>{taskLabel(task)}</span>
            {/* The member view has no roster, so the team member's name rides on
                the plan payload (tax_load_plans.team_member_name). */}
            {(selectedTeamMember || (teamMemberId != null && livePlan?.team_member_name)) && (
              <span style={teamMemberChip}>{teamMemberName || livePlan.team_member_name} — Team Member</span>
            )}
            {plannerShown
              ? <span style={greenPill}>{allocatedName || 'Allocated'}</span>
              : !selectedTeamMember && (
                // The member view cannot load the planner roster (tax_planners_load
                // is ADMIN_ONLY), so neither slot resolves to a person here. The
                // slot columns still prove the allocation and the progress row
                // still carries the holder's name — never "Not started" when a
                // slot is filled.
                isAllocated
                  ? <span style={greenPill}>{p.status || 'Allocated'}</span>
                  : <span style={neutralChipStyle}>Not started</span>
              )}
            <StepDate value={isAllocated ? (p.completed_date || '') : ''} />
          </div>
        )
      }

      // A person is addable only while THEIR slot is empty — one Tax Planner and
      // one Team Member, no more. The process decides what an ADMIN sees: their
      // job on this step is the team member, and the hand-off to a Tax Planner is
      // the team member's own job in the planner portal, so planners appear in the
      // admin dropdown only once a team member exists (admins can then place one
      // themselves if they need to). A portal caller has already reached that
      // point, so both roles are offered there from the start.
      const addable = activePlanners.filter(pl => {
        if (pl.planner_role === 'Team Member') return teamMemberId == null
        if (allocatedId) return false
        return plannerMode || teamMemberId != null
      })
      const pick = allocPick[key] || ''
      const removeBtn = (onClick, label) => (
        <button
          type="button"
          onClick={onClick}
          disabled={saving[key]}
          title={label}
          style={{ background: 'none', border: 'none', cursor: saving[key] ? 'default' : 'pointer', color: 'var(--vfo-muted)', fontSize: '13px', lineHeight: 1, padding: '0 2px' }}>&times;</button>
      )
      return (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isAllocated ? green : 'transparent', flexShrink: 0, border: `1.5px solid ${isAllocated ? green : 'var(--vfo-border-mid)'}` }} />
          <span style={{ fontSize: '13px', color: isAllocated ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}</span>
          {selectedTeamMember && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={teamMemberChip}>{teamMemberName} — Team Member</span>
              {removeBtn(() => clearPlanner(task, true), 'Remove team member')}
            </span>
          )}
          {plannerShown && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              {/* The remove belongs to the NAME, so it sits with it — the Stripe
                  chip is a status annotation and follows both. */}
              <span style={greenPill}>{allocatedName || 'Allocated'}</span>
              {removeBtn(() => clearPlanner(task), 'Remove tax planner')}
              {plannerChips.map(c => <span key={c.label} style={c.style}>{c.label}</span>)}
            </span>
          )}
          {activePlanners.length === 0 ? (
            <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>No tax planners yet — add one under Tax Planners.</span>
          ) : addable.length > 0 && (
            <>
              <select
                value={pick}
                onChange={e => setAllocPick(prev => ({ ...prev, [key]: e.target.value }))}
                disabled={saving[key]}
                style={{ ...inputStyle, background: 'var(--vfo-card)', minWidth: '150px', borderColor: isAllocated ? `${green}66` : 'var(--vfo-border-strong)', color: isAllocated ? green : 'var(--vfo-ink)' }}>
                <option value="">-- Select --</option>
                {addable.map(pl => <option key={pl.id} value={String(pl.id)}>{plannerDisplayName(pl)}{pl.planner_role === 'Team Member' ? ' — Team Member' : ''}</option>)}
              </select>
              <button
                type="button"
                onClick={() => { const pl = addable.find(x => String(x.id) === pick); if (pl) allocatePlanner(task, pl) }}
                disabled={saving[key] || !pick}
                style={{ ...inputStyle, background: 'var(--vfo-card)', cursor: (saving[key] || !pick) ? 'default' : 'pointer', opacity: (saving[key] || !pick) ? 0.5 : 1, padding: '5px 12px' }}>Add</button>
            </>
          )}
          {/* The whole chain (allocate, save, reload) runs behind saving[key], so
              this covers the seconds where the chips have not moved yet. */}
          {saving[key] && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>Saving...</span>}
          <StepDate value={isAllocated ? (p.completed_date || '') : ''} />
        </div>
      )
    }

    if (task.status_options === 'specialist_select') return null

    if (task.name === 'Additional information required') {
      const infoRequired = p.status === 'Additional info required'
      const requestedAt = livePlan?.additional_info_requested_at
      const receivedAt = livePlan?.additional_info_received_at
      const done = !!receivedAt
      // Written replies from the /tax-upload page (oldest first, as appended
      // server-side). Either a written reply or an upload stamps receivedAt.
      const responses = Array.isArray(livePlan?.additional_info_responses) ? livePlan.additional_info_responses : []
      const respKey = `addinfo_resp_${task.id}`
      // What was ASKED, appended once per send by request-additional-info.ts.
      // Requests sent before that column existed are NULL and cannot be
      // recovered, so those rows simply carry no view chip.
      const requests = Array.isArray(livePlan?.additional_info_requests) ? livePlan.additional_info_requests : []
      const reqKey = `addinfo_req_${task.id}`
      const clientFull = client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : ''
      const clientFirst = clientFull ? clientFull.split(/\s+/)[0] : ''
      const draft = declineDrafts[task.id] || {}
      const composeOpen = !!draft.composeOpen
      const sending = !!draft.sending
      const text = draft.text || ''
      const setDraft = (patch) => setDeclineDrafts(d => ({ ...d, [task.id]: { ...(d[task.id] || {}), ...patch } }))
      const clearDraft = () => setDeclineDrafts(d => { const n = { ...d }; delete n[task.id]; return n })
      const tdGreen = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: sending ? 'not-allowed' : 'pointer', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600 }
      const subDotColor = done ? '#1b9254' : requestedAt ? '#0095ff' : 'transparent'
      const subDotBorder = done ? '#1b9254' : requestedAt ? '#0095ff' : 'var(--vfo-border-mid)'
      async function sendRequest() {
        setDraft({ sending: true })
        try {
          const res = await callApi('automation_TAX_request_additional_info', { tax_plan_id: plan.id, requested_info: text })
          if (res?.error) { alert('Error: ' + res.error); setDraft({ sending: false }); return }
          clearDraft()
          await refreshLivePlan()
        } catch (err) {
          alert('Failed to send email: ' + (err?.message || 'unknown error'))
          setDraft({ sending: false })
        }
      }
      const aiStep = (label, isGreen, at = null) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isGreen ? '#1b9254' : 'transparent', flexShrink: 0, border: `1px solid ${isGreen ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
          <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}</span>
          {isGreen && <span style={{ ...chipStyle('#1b9254'), marginLeft: 'auto' }}>Done</span>}
          {isGreen && at && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{fmtMMDD(at)}</span>}
        </div>
      )
      // A transcript panel — the asks, or the client's written replies. One
      // shape for both so the question and the answer read as a pair; newest
      // first, matching the standalone Client explanation panel it replaced.
      const entryPanel = (entries) => (
        <div style={{ marginLeft: '14px', marginBottom: '8px', padding: '12px 14px', background: 'var(--vfo-card)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
          {entries.slice().reverse().map((r, i) => (
            <div key={i} style={{ marginBottom: i === entries.length - 1 ? 0 : '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginBottom: '4px' }}>{formatStamp(r?.at)}</div>
              <div style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', whiteSpace: 'pre-wrap' }}>{r?.text || '—'}</div>
            </div>
          ))}
        </div>
      )
      // Expandable variant of aiStep: `expand` = { key, noun, panel }. The BUTTON
      // is the whole affordance — no caret, and the row itself is not clickable,
      // so there is exactly one way to open it. Kept separate from aiStep above
      // so the two plain sub-steps stay byte-identical to the Request Tax
      // Returns block.
      const aiViewBtn = { padding: '3px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, fontFamily: 'Inter, sans-serif' }
      const aiStepExpandable = (label, isGreen, at, expand) => {
        const open = !!expanded[expand.key]
        return (
          <div style={{ borderBottom: '1px solid var(--vfo-border-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isGreen ? '#1b9254' : 'transparent', flexShrink: 0, border: `1px solid ${isGreen ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
              <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setExpanded(prev => ({ ...prev, [expand.key]: !prev[expand.key] }))}
                  style={aiViewBtn}>{open ? 'Hide' : 'View'} {expand.noun}</button>
                {isGreen && <span style={chipStyle('#1b9254')}>Done</span>}
                {isGreen && at && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{fmtMMDD(at)}</span>}
              </span>
            </div>
            {open && expand.panel}
          </div>
        )
      }
      return (
        <div key={key}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'var(--vfo-border-mid)'}` }} />
            <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}</span>
            <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date, taxSpecialistId)} disabled={saving[key]} style={{ ...inputStyle, background: 'var(--vfo-card)', minWidth: '150px', borderColor: isDone ? `${statusColor}66` : 'var(--vfo-border-strong)', color: isDone ? statusColor : 'var(--vfo-ink)' }}>
              <option value="">-- Select --</option>
              {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <StepDate value={p.completed_date || ''} onChange={d => saveTask(task.id, p.status, d, taxSpecialistId)} disabled={saving[key]} />
          </div>
          {infoRequired && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: subDotColor, flexShrink: 0, border: `1.5px solid ${subDotBorder}` }} />
                <span style={{ fontSize: '13px', color: (done || requestedAt) ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>Request additional information{!(readOnly || plannerMode) && <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="TAX" title={task.name} templates={[{ name: 'TAX_request_additional_info', when: 'Asks the client to upload the requested additional information via a secure link' }]} context={emailCtx} /></span>}</span>
                {readOnly ? (
                  done
                    ? <span style={chipStyle('#1b9254')}>Information received — {formatStamp(receivedAt)}</span>
                    : requestedAt ? <span style={chipStyle('#0095ff')}>Email sent — {formatStamp(requestedAt)}</span> : null
                ) : (
                  <button disabled={sending} onClick={() => setDraft({ composeOpen: !composeOpen })} style={tdGreen} title="Drafts a Gmail to the client requesting additional information with a secure upload link.">{requestedAt ? 'Resend request email' : 'Send email to request additional information'}</button>
                )}
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{requestedAt ? formatStamp(requestedAt) : ''}</span>
              </div>
              {composeOpen && !readOnly && (
                <div style={{ marginLeft: '18px', marginBottom: '8px', padding: '14px 16px', background: 'var(--vfo-tint)', borderRadius: '10px', border: '1px solid var(--vfo-tint-deep)', fontFamily: 'Inter, sans-serif' }}>
                  <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                    Subject: Additional information required - {clientFull || '[Client Name]'}
                  </div>
                  <div style={{ fontSize: '13px', color: '#44557a', lineHeight: '1.6' }}>
                    <p style={{ margin: '0 0 12px' }}>Dear {clientFirst},</p>
                    <p style={{ margin: '0 0 12px' }}>As part of your tax planning engagement, we are requesting the following additional information:</p>
                    <textarea
                      value={text}
                      onChange={e => setDraft({ text: e.target.value })}
                      placeholder="List the additional information you need from the client."
                      disabled={sending}
                      style={{ width: '100%', minHeight: '90px', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.06)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif', fontSize: '13px', lineHeight: '1.55', boxSizing: 'border-box', resize: 'vertical', marginBottom: '12px' }}
                    />
                    <p style={{ margin: '0 0 12px' }}>Please use the secure button below to provide the additional information:</p>
                    <div style={{ margin: '0 0 12px' }}>
                      <span style={{ display: 'inline-block', padding: '10px 18px', borderRadius: '6px', background: '#0095ff', color: '#fff', fontSize: '13px', fontWeight: 600, pointerEvents: 'none' }}>Upload Additional Information</span>
                    </div>
                    <p style={{ margin: '0 0 12px' }}>If you have any questions, please reply all to this email and we'd be happy to help!</p>
                    <p style={{ margin: 0 }}>Thank you,</p>
                  </div>
                  <div style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button disabled={sending} onClick={clearDraft} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: sending ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Cancel</button>
                    <button disabled={sending || !text.trim()} onClick={sendRequest} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: (sending || !text.trim()) ? 'not-allowed' : 'pointer', border: '1px solid rgba(0,149,255,0.4)', background: (sending || !text.trim()) ? 'rgba(0,149,255,0.06)' : 'rgba(0,149,255,0.18)', color: '#0095ff', fontWeight: '600' }}>{sending ? 'Sending…' : 'Send'}</button>
                  </div>
                </div>
              )}
              {/* Client explanation lives INSIDE this block, not as a sibling
                  step: the ask, the receipt and the reply are one exchange and
                  read as one. The guard therefore also opens on responses so a
                  reply can never be orphaned by a missing requested-at stamp. */}
              {(requestedAt || responses.length > 0) && (
                <div style={{ padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: done ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${done ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
                    <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: 1, fontWeight: '600' }}>AI PC Admin</span>
                  </div>
                  <div style={{ marginLeft: '18px', padding: '8px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
                    {requests.length > 0
                      ? aiStepExpandable('Request email sent to client', !!requestedAt, requestedAt, { key: reqKey, noun: 'request', panel: entryPanel(requests) })
                      : aiStep('Request email sent to client', !!requestedAt, requestedAt)}
                    {aiStep('Additional information received', !!receivedAt, receivedAt)}
                    {responses.length > 0
                      && aiStepExpandable('Client explanation', true, responses[responses.length - 1]?.at, { key: respKey, noun: 'reply', panel: entryPanel(responses) })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )
    }

    const isSpecIntroTask = task.name === 'VFO specialist introductions / discussions'
    const isConfirmReadyImplTask = task.name === 'Confirm ready for implementation'
    let isGreyedOut = false
    let greyNote = ''
    if ((isSpecIntroTask || isConfirmReadyImplTask) && decision2Status === 'Move to Implementation') {
      isGreyedOut = true
      greyNote = 'Due Diligence Skipped - Moved to Implementation'
    }

    return (
      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap', opacity: isGreyedOut ? 0.3 : 1, pointerEvents: isGreyedOut ? 'none' : undefined }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'var(--vfo-border-mid)'}` }} />
        <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{taskLabel(task)}{greyNote && <span style={{ fontSize: '11px', color: '#e06717', fontWeight: 600, marginLeft: '8px' }}>({greyNote})</span>}</span>
        <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date, taxSpecialistId)} disabled={saving[key]} style={{ ...inputStyle, background: 'var(--vfo-card)', minWidth: '150px', borderColor: isDone ? `${statusColor}66` : 'var(--vfo-border-strong)', color: isDone ? statusColor : 'var(--vfo-ink)' }}>
          <option value="">-- Select --</option>
          {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <StepDate value={p.completed_date || ''} onChange={d => saveTask(task.id, p.status, d, taxSpecialistId)} disabled={saving[key]} />
      </div>
    )
  }

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
  const tax5aNoteCount = (notes || []).filter(n => n.phase_name === TAX5A_PHASE && n.tab_name === 'Tax Priorities').length
  const tax5bNoteCount = (notes || []).filter(n => n.phase_name === TAX5B_PHASE && n.tab_name === 'Tax Priorities').length
  const tax5Expanded = expanded['tax5'] !== undefined ? expanded['tax5'] : (tax5State !== 'done')

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0095ff', fontWeight: 500, fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>← Back to Tax Plans</button>
      <TrackHero
        eyebrow={programName}
        title="Tax Plan"
        meta={`Started ${plan.created_at?.split('T')[0] || ''}`}
        completed={heroDoneTasks}
        total={heroTotalTasks}
        steps={heroSteps}
        action={!readOnly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: '600' }}>{trackStatus === 'live' ? 'Live' : 'Stopped'}</span>
            <div onClick={() => { if (!togglingStatus) toggleTrackStatus() }}
              style={{ width: '44px', height: '24px', borderRadius: '12px', background: trackStatus === 'live' ? '#1b9254' : '#e74c3c', cursor: 'pointer', position: 'relative', opacity: togglingStatus ? 0.5 : 1 }}>
              <div style={{ position: 'absolute', top: '2px', left: trackStatus === 'live' ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--vfo-card)', transition: 'left 0.2s' }} />
            </div>
          </div>
        )}
      />

      {/* ADMIN (VFOS/ERT) SURFACE ONLY — this exposes VFO's own cut, so it is not
          rendered at all in the member view (readOnly) or the tax-planner portal
          (plannerMode), rather than being shown to them read-only. Every admin may
          READ it; only the superadmin gets the Edit button, and tax_update_split
          re-checks that server-side. Rendered regardless of tax_decision, because the
          Tax 3 cascade that used to be the only home for the fee amounts and the split
          is gated on it — and migrated clients never have one. */}
      {!readOnly && !plannerMode && (
        <PricingSplitCard
          plan={livePlan}
          plannerName={(() => {
            const pl = taxPlanners.find(x => String(x.id) === String(livePlan?.tax_planner_id))
            return pl ? plannerPlainName(pl) : ''
          })()}
          isSuperadmin={!!getSession()?.is_superadmin}
          onSaved={refreshLivePlan}
        />
      )}

      <TaxIntakeCard intake={taxIntake} questions={taxIntakeQuestions} />

      {phasesBeforeSpec.map((phase, phaseIdx) => {
        const state = getPhaseState(phase)
        const isExpanded = expanded[phase.id] !== undefined ? expanded[phase.id] : (state === 'active')
        const tasks = phase.program_client_tasks || []
        let nonAutoTasks = tasks.filter(t => t.status_options !== 'auto')
        if (phase.name === 'Tax 1 - Diagnostic') {
          nonAutoTasks = nonAutoTasks.filter(t => !['Email to obtain information required sent', 'Information received', 'Information passed to VFO-L'].includes(t.name))
        }
        nonAutoTasks = nonAutoTasks.filter(t => !isStepExcluded(t))
        // Same rule as the hero count and the phase pills — isTaskStatused owns every
        // "this step doesn't live in client_tax_progress" special case in one place.
        const doneTasks = nonAutoTasks.filter(isTaskStatused).length
        const borderColor = state === 'done' ? 'rgba(27,146,84,0.3)' : state === 'active' ? 'rgba(0,149,255,0.4)' : 'var(--vfo-border)'
        const dotColor = state === 'done' ? '#1b9254' : state === 'active' ? '#0095ff' : 'transparent'
        const titleColor = state === 'active' ? 'var(--vfo-primary)' : 'var(--vfo-heading)'
        return (
          <div key={phase.id} style={{ background: 'var(--vfo-card)', border: `1px solid ${borderColor}`, borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
              <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !isExpanded }))} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}>
                <PhaseBadge number={phaseBadgeToken(phase.name)} state={state} />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: titleColor, textTransform: 'uppercase', letterSpacing: '1px' }}>{phase.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {!readOnly && <PhaseNotesButton count={(notes || []).filter(n => n.phase_name === phase.name && n.tab_name === 'Tax Priorities').length} isOpen={expanded[`notes_${phase.id}`]} onClick={() => setExpanded(p => ({ ...p, [`notes_${phase.id}`]: !p[`notes_${phase.id}`] }))} />}
                {state === 'done' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Done</span>}
                {state === 'active' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>In progress{doneTasks < nonAutoTasks.length ? ` · ${doneTasks}/${nonAutoTasks.length}` : ''}</span>}
                {state === 'pending' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>}
                <span onClick={() => setExpanded(p => ({ ...p, [phase.id]: !isExpanded }))} style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', cursor: 'pointer' }}>▼</span>
              </div>
            </div>
            {!readOnly && expanded[`notes_${phase.id}`] && <PhaseNotesPanel clientId={clientId} phaseName={phase.name} tabName="Tax Priorities" programName={programName} notes={notes} onNotesChange={onNotesChange} />}
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
                {tasks.map(task => renderTask(task, phase))}
              </div>
            )}
          </div>
        )
      })}

      {(tax5aPhase || tax5bPhase) && (() => {
        // The two stored "Tax 5" phases (Specialist Allocation / Post Allocation)
        // render as ONE numbered card, so the badge matches the title on both
        // programs. Each half keeps its own status pill, notes thread and lock
        // state as a sub-section inside.
        const t5Border = tax5State === 'done' ? 'rgba(27,146,84,0.3)' : tax5State === 'active' ? 'rgba(0,149,255,0.4)' : 'var(--vfo-border)'
        const subHeader = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', paddingBottom: '8px', marginBottom: '10px', borderBottom: '1px solid var(--vfo-border-soft)' }
        const subTitle = { fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: 800, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px' }
        const toggle5 = () => setExpanded(p => ({ ...p, tax5: !tax5Expanded }))
        return (
        <div style={{ background: 'var(--vfo-card)', border: `1px solid ${t5Border}`, borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
            <div onClick={toggle5} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}>
              <PhaseBadge number="5" state={tax5State} />
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: tax5State === 'active' ? 'var(--vfo-primary)' : 'var(--vfo-heading)', textTransform: 'uppercase', letterSpacing: '1px' }}>Tax 5 - Education &amp; DD</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {!readOnly && <PhaseNotesButton count={tax5aNoteCount + tax5bNoteCount} isOpen={expanded['notes_tax5']} onClick={() => setExpanded(p => ({ ...p, ['notes_tax5']: !p['notes_tax5'] }))} />}
              <PhasePill state={tax5State} />
              <span onClick={toggle5} style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: tax5Expanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', cursor: 'pointer' }}>▼</span>
            </div>
          </div>
          {/* One notes thread for the whole merged card: written under the
              Specialist Allocation phase, read across both stored phases so any
              note previously filed under Post Allocation still shows. */}
          {!readOnly && expanded['notes_tax5'] && <PhaseNotesPanel clientId={clientId} phaseName={TAX5A_PHASE} phaseNames={[TAX5A_PHASE, TAX5B_PHASE]} tabName="Tax Priorities" programName={programName} notes={notes} onNotesChange={onNotesChange} />}
          {tax5Expanded && (
          <div style={{ borderTop: `1px solid ${t5Border}`, padding: '12px 18px' }}>
          {tax5aPhase && (
          <div style={{ marginBottom: tax5bPhase ? '20px' : 0 }}>
            <div style={subHeader}>
              <span style={subTitle}>Specialist Allocation</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <PhasePill state={tax5aHeroState} />
                {!readOnly && (
                  <button onClick={() => setShowAddSpec(!showAddSpec)} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff' }}>+ Add Specialist</button>
                )}
              </div>
            </div>
            {showAddSpec && (
              <div style={{ padding: '12px', background: 'var(--vfo-tint)', borderRadius: '8px', marginBottom: '12px' }}>
                <select value={newSpecId} onChange={e => setNewSpecId(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)', width: '100%', marginBottom: '8px', padding: '8px 12px' }}>
                  <option value="">-- Select Specialist --</option>
                  {/* `specialists` is the Tax-Planning-ecosystem roster carrying
                      the display `label` ("<tax short bio> - <name>"); see
                      taxSpecialistOptions. Option value stays the expert id. */}
                  {specialists.filter(s => !taxSpecialists.some(ts => ts.expert_id === s.id)).map(s => <option key={s.id} value={s.id}>{s.label || s.name}</option>)}
                  {/* Permanent trailing entry, after every real specialist and
                      outside the dedupe filter — `specialists` is already the
                      effective list (admin roster or planner roster), so this
                      shows on both surfaces and stays repeatable. */}
                  <option value={OTHER_SPEC_VALUE}>Custom</option>
                </select>
                {newSpecId === OTHER_SPEC_VALUE && (
                  <input value={newCustomName} onChange={e => setNewCustomName(e.target.value)} maxLength={80} placeholder={'Strategy - Name — saved as "Custom - Strategy - Name"'} style={{ ...inputStyle, background: 'var(--vfo-card)', width: '100%', marginBottom: '8px', padding: '8px 12px', boxSizing: 'border-box' }} />
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(() => { const blocked = newSpecId === OTHER_SPEC_VALUE && !newCustomName.trim(); return (
                    <button onClick={addSpecialist} disabled={blocked} style={{ padding: '6px 16px', borderRadius: '6px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '12px', cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.5 : 1 }}>Add</button>
                  ) })()}
                  <button onClick={() => { setShowAddSpec(false); setNewCustomName('') }} style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}
            {taxSpecialists.length === 0 && !showAddSpec && (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--vfo-muted)', fontSize: '13px' }}>No specialists allocated yet.</div>
            )}
            {taxSpecialists.map(spec => {
              const allocateTask = tax5aTasks.find(t => t.status_options === 'specialist_select')
              const specTasks = tax5aTasks.filter(t => t.status_options !== 'specialist_select')
              const specExpKey = `spec_${spec.id}`
              const allSpecDone = specTasks.every(t => localProgress[`${t.id}_${spec.id}`]?.status)
              const isSpecExpanded = expanded[specExpKey] !== undefined ? expanded[specExpKey] : !allSpecDone
              // Header pill reflects this specialist's 'Confirm ready for
              // implementation' answer (client_tax_specialists.status is never
              // written, so the legacy stopped branch is kept but inert).
              const confirmSt = confirmReadyTask ? localProgress[`${confirmReadyTask.id}_${spec.id}`]?.status : ''
              const specPill = spec.status === 'stopped' ? { label: 'Stopped', hex: '#e74c3c', rgb: '231,76,60' }
                : confirmSt === 'Yes' ? { label: 'Ready', hex: '#1b9254', rgb: '27,146,84' }
                : confirmSt === 'Undecided' ? { label: 'Undecided', hex: '#e06717', rgb: '224,103,23' }
                : confirmSt === 'No' ? { label: 'Not Proceeding', hex: '#e74c3c', rgb: '231,76,60' }
                : null
              return (
                <div key={spec.id} style={{ background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '8px', marginBottom: '8px', overflow: 'hidden' }}>
                  <div onClick={() => setExpanded(p => ({ ...p, [specExpKey]: !isSpecExpanded }))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--vfo-ink)' }}>{specDisplayName(spec)}</span>
                      {!readOnly && !plannerMode ? (
                        <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex' }}>
                          <input
                            value={strategyDrafts[spec.id] !== undefined ? strategyDrafts[spec.id] : (spec.strategy || '')}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setStrategyDrafts(p => ({ ...p, [spec.id]: e.target.value }))}
                            onBlur={() => saveStrategy(spec)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                            maxLength={500}
                            placeholder="Enter Strategy"
                            style={strategyInputStyle}
                          />
                        </span>
                      ) : (spec.strategy ? <span style={strategyTextStyle}>{spec.strategy}</span> : null)}
                      <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: specPill ? `rgba(${specPill.rgb},0.15)` : 'var(--vfo-tint)', color: specPill ? specPill.hex : 'var(--vfo-muted)', border: `1px solid ${specPill ? `rgba(${specPill.rgb},0.3)` : 'var(--vfo-border-chip)'}` }}>{specPill ? specPill.label : 'Pending Decision'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {!readOnly && <PhaseNotesButton count={specNotesCount(spec)} isOpen={expanded[`notes_spec_${spec.id}`]} onClick={() => setExpanded(p => ({ ...p, [`notes_spec_${spec.id}`]: !p[`notes_spec_${spec.id}`] }))} />}
                      {!readOnly && (
                        <span onClick={e => { e.stopPropagation(); removeSpecialist(spec) }} style={{ fontSize: '11px', fontWeight: 500, color: '#e74c3c', cursor: removingSpec[spec.id] ? 'not-allowed' : 'pointer', opacity: removingSpec[spec.id] ? 0.6 : 1 }}>
                          {removingSpec[spec.id] ? 'Removing...' : 'Remove'}
                        </span>
                      )}
                      <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isSpecExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
                    </div>
                  </div>
                  {!readOnly && expanded[`notes_spec_${spec.id}`] && <PhaseNotesPanel clientId={clientId} phaseName={specPhaseName(spec)} tabName="Tax Priorities" programName={programName} notes={notes} onNotesChange={onNotesChange} />}
                  {isSpecExpanded && (
                    <div style={{ borderTop: '1px solid var(--vfo-border-soft)', padding: '8px 14px' }}>
                      {allocateTask && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1b9254', flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', color: 'var(--vfo-muted)', flex: 1 }}>Allocate to VFO Specialist</span>
                          <span style={chipStyle('#1b9254')}>Done</span>
                        </div>
                      )}
                      {specTasks.map(task => renderTask(task, tax5aPhase, spec.id))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          )}
          {tax5bPhase && (
          <div>
            <div style={subHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={subTitle}>Post Allocation</span>
              </div>
              <PhasePill state={tax5bState} />
            </div>
            {(tax5bPhase.program_client_tasks || []).map(task => renderTask(task, tax5bPhase))}
          </div>
          )}
          </div>
          )}
        </div>
        )
      })()}

      {phasesAfterSpec.map((phase, phaseIdx) => {
        const state = getPhaseState(phase)
        const isExpanded = expanded[phase.id] !== undefined ? expanded[phase.id] : (state === 'active')
        const tasks = phase.program_client_tasks || []
        const nonAutoTasks = tasks.filter(t => t.status_options !== 'auto')
        // Every task here is answered once per allocated specialist, so the pill
        // counts specialists x tasks, not tasks.
        const totalTasks = taxSpecialists.length * nonAutoTasks.length
        const doneTasks = taxSpecialists.reduce((s, spec) => s + nonAutoTasks.filter(t => !!localProgress[`${t.id}_${spec.id}`]?.status).length, 0)
        const borderColor = state === 'done' ? 'rgba(27,146,84,0.3)' : state === 'active' ? 'rgba(0,149,255,0.4)' : 'var(--vfo-border)'
        const dotColor = state === 'done' ? '#1b9254' : state === 'active' ? '#0095ff' : 'transparent'
        const titleColor = state === 'active' ? 'var(--vfo-primary)' : 'var(--vfo-heading)'
        return (
          <div key={phase.id} style={{ background: 'var(--vfo-card)', border: `1px solid ${borderColor}`, borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
              <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !isExpanded }))} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1, flexWrap: 'wrap' }}>
                <PhaseBadge number={phaseBadgeToken(phase.name)} state={state} />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: titleColor, textTransform: 'uppercase', letterSpacing: '1px' }}>{phase.name}</span>
                {!readOnly && !tax6Unlocked && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', ...lockedHintStyle }}>
                    <LockedIcon />
                    Locked until the Implementation decision and its AI PC Admin steps are complete
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {state === 'done' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Done</span>}
                {state === 'active' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>In progress{doneTasks < totalTasks ? ` · ${doneTasks}/${totalTasks}` : ''}</span>}
                {!readOnly && <PhaseNotesButton count={(notes || []).filter(n => n.phase_name === phase.name && n.tab_name === 'Tax Priorities').length} isOpen={expanded[`notes_${phase.id}`]} onClick={() => setExpanded(p => ({ ...p, [`notes_${phase.id}`]: !p[`notes_${phase.id}`] }))} />}
                {state === 'pending' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>}
                <span onClick={() => setExpanded(p => ({ ...p, [phase.id]: !isExpanded }))} style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', cursor: 'pointer' }}>▼</span>
              </div>
            </div>
            {!readOnly && expanded[`notes_${phase.id}`] && <PhaseNotesPanel clientId={clientId} phaseName={phase.name} tabName="Tax Priorities" programName={programName} notes={notes} onNotesChange={onNotesChange} />}
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
                {taxSpecialists.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--vfo-muted)', fontSize: '13px' }}>No specialists allocated yet.</div>
                )}
                {taxSpecialists.map(spec => {
                  const specExpKey = `tax6_spec_${spec.id}`
                  const specDoneCount = nonAutoTasks.filter(t => !!localProgress[`${t.id}_${spec.id}`]?.status).length
                  const specTaskCount = nonAutoTasks.length
                  const allSpecDone = specTaskCount > 0 && specDoneCount === specTaskCount
                  const specStopped = nonAutoTasks.some(t => localProgress[`${t.id}_${spec.id}`]?.status === 'Stopped')
                  const isSpecExpanded = expanded[specExpKey] !== undefined ? expanded[specExpKey] : !allSpecDone
                  return (
                    <div key={spec.id} style={{ background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '8px', marginBottom: '8px', overflow: 'hidden' }}>
                      <div onClick={() => setExpanded(p => ({ ...p, [specExpKey]: !isSpecExpanded }))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--vfo-ink)' }}>{specDisplayName(spec)}</span>
                          {spec.strategy && <span style={strategyTextStyle}>{spec.strategy}</span>}
                          {specStopped && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(231,76,60,0.15)', color: '#e74c3c', fontWeight: 600, border: '1px solid rgba(231,76,60,0.3)' }}>Stopped</span>}
                          {!specStopped && allSpecDone && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Done</span>}
                          {!specStopped && !allSpecDone && specDoneCount > 0 && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>In progress · {specDoneCount}/{specTaskCount}</span>}
                          {!specStopped && specDoneCount === 0 && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {!readOnly && <PhaseNotesButton count={specNotesCount(spec)} isOpen={expanded[`notes_tax6_spec_${spec.id}`]} onClick={() => setExpanded(p => ({ ...p, [`notes_tax6_spec_${spec.id}`]: !p[`notes_tax6_spec_${spec.id}`] }))} />}
                          <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isSpecExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
                        </div>
                      </div>
                      {!readOnly && expanded[`notes_tax6_spec_${spec.id}`] && <PhaseNotesPanel clientId={clientId} phaseName={specPhaseName(spec)} tabName="Tax Priorities" programName={programName} notes={notes} onNotesChange={onNotesChange} />}
                      {isSpecExpanded && (
                        <div style={{ borderTop: '1px solid var(--vfo-border-soft)', padding: '8px 14px' }}>
                          {tasks.map(task => renderTask(task, phase, spec.id))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TaxPrioritiesTab({ clientId, programId, programName, client, specialists, ecosystems = [], readOnly = false, notes = [], onNotesChange, initialPlanId = null, plannerMode = false }) {
  const [taxPlans, setTaxPlans] = useState([])
  const [phases, setPhases] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [allProgress, setAllProgress] = useState({})
  const [plannerExperts, setPlannerExperts] = useState([])
  const autoSelectedRef = useRef(false)
  // Planners never receive load_data, so the Tax 5 "+ Add Specialist" picker
  // gets its Active-specialist roster from the planner-scoped action instead
  // (already Tax-Planning-only, with a server-computed tax_bio). Admin mode
  // filters/labels the load_data roster here — see taxSpecialistOptions.
  const effectiveSpecialists = useMemo(
    () => taxSpecialistOptions(plannerMode ? plannerExperts : specialists, ecosystems, plannerMode),
    [plannerMode, plannerExperts, specialists, ecosystems],
  )

  // expert_id -> tax short bio, off the FULL roster (NOT effectiveSpecialists,
  // which is ecosystem-filtered): an allocation made before the ecosystem existed
  // still resolves. Same bio rule as the picker labels — admin reads the raw
  // load_data roster through taxShortBio, planner mode reads the server-computed
  // tax_bio. Feeds specDisplayName in TaxPlanTrackView; DISPLAY ONLY.
  const expertBios = useMemo(() => {
    const roster = plannerMode ? plannerExperts : specialists
    const map = {}
    ;(Array.isArray(roster) ? roster : []).forEach(s => {
      const bio = plannerMode ? String(s?.tax_bio ?? '').trim() : taxShortBio(s)
      if (s?.id != null && bio) map[s.id] = bio
    })
    return map
  }, [plannerMode, plannerExperts, specialists])

  useEffect(() => { loadData() }, [clientId])

  useEffect(() => {
    if (!plannerMode) return
    loadCachedAction('tax_planner_portal_experts')
      .then(res => setPlannerExperts(Array.isArray(res?.experts) ? res.experts : []))
      .catch(() => setPlannerExperts([]))
  }, [plannerMode])

  // Deep-link from Client Overview: open the requested plan once, after the
  // list has loaded. The user can still navigate back to the list afterwards.
  useEffect(() => {
    if (autoSelectedRef.current || loading || !initialPlanId) return
    const match = taxPlans.find(p => p.id === initialPlanId)
    if (match) { autoSelectedRef.current = true; setSelectedPlan(match) }
  }, [loading, initialPlanId, taxPlans])

  async function loadData() {
    setLoading(true)
    try {
      const [plansData, phasesData, map1Progress] = await Promise.all([
        callApi('tax_load_plans', { client_id: clientId }),
        loadCachedAction('msm_load_client_track', { program_id: programId, track_type: 'tax' }),
        callApi('msm_load_client_progress', { client_id: clientId }),
      ])
      // Scope to the current program view before anything downstream sees the
      // list: plan cards, livePlan selection, TrackHero counts, MSM status, the
      // per-plan track view, the Start button, and deep-link resolution all read
      // from taxPlans, so the filter belongs at this single entry point.
      const scopedPlans = plansForProgram(plansData.plans, programId)
      setTaxPlans(scopedPlans)
      const loadedPhases = phasesData.phases || []
      loadedPhases.forEach(p => p.program_client_tasks?.sort((a, b) => a.task_order - b.task_order))
      setPhases(loadedPhases)
      const enabled = programName === 'VFO Tax Planning' || (map1Progress.progress || []).some(p => p.status === 'Tax priorities tab enabled')
      setTaxEnabled(enabled)
      const progressMap = {}
      await Promise.all(scopedPlans.map(async plan => {
        const pd = await callApi('tax_load_progress', { tax_plan_id: plan.id })
        progressMap[plan.id] = {}
        ;(pd.progress || []).forEach(p => {
          const key = p.tax_specialist_id ? `${p.task_id}_${p.tax_specialist_id}` : p.task_id
          progressMap[plan.id][key] = p
        })
      }))
      setAllProgress(progressMap)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function startPlan() {
    try {
      await callApi('tax_start_plan', { client_id: clientId, program_id: programId })
      loadData()
    } catch (err) { console.error(err) }
  }

  function getPlanState(plan) {
    const prog = allProgress[plan.id] || {}
    // An amend step that is NOT APPLICABLE to this plan must not keep it out of
    // "completed" — it is a step the plan can never answer. Same three-way rule
    // TaxPlanTrackView's isAmendNotApplicable uses, and the same one the backend
    // step machine uses (utils/tax-plan-steps.ts — #339 keeps all three in
    // step): applicable when the plan is on the revised fee process, OR the step
    // is ANSWERED, OR the amendment WINDOW is still open (this stage's client
    // decision not yet recorded).
    // This scope carries everything the rule needs, so it is a full mirror, not
    // an approximation: `prog` is the plan's whole client_tax_progress map
    // (loadData fills it per plan) and `plan` comes from tax_load_plans, which
    // selects *, so the stamps and both decision columns are on it.
    // (Only the Tax 4 step can actually reach this filter — the list drops both
    // Tax 5 phases — but the rule is written stage-blind so it stays correct if
    // that ever changes.)
    const amendNotApplicable = (t) => {
      if (!isAmendStepTask(t) || isNewFeeProcess(plan)) return false
      const tax5 = amendStage(t) === 'tax5'
      // Two-source "answered", exactly as isTaskStatused reads it: the progress
      // row is the normal proof, the fee_amended_at_* stamp the independent one.
      const answered = !!prog[t.id]?.status || !!(tax5 ? plan?.fee_amended_at_tax5 : plan?.fee_amended_at_tax4)
      const decision = tax5 ? plan?.implementation_decision : plan?.post_review_decision
      const windowOpen = decision === null || decision === undefined || decision === ''
      return !answered && !windowOpen
    }
    const allTasks = phases.filter(p => p.name !== 'Tax 5 - Education & DD (Specialist Allocation)' && p.name !== 'Tax 5 - Education & DD (Post Allocation)').flatMap(p => p.program_client_tasks || []).filter(t => t.status_options !== 'auto' && !amendNotApplicable(t))
    if (allTasks.length === 0) return 'not started'
    if (allTasks.every(t => prog[t.id]?.status)) return 'completed'
    if (allTasks.some(t => prog[t.id]?.status)) return 'in progress'
    return 'not started'
  }

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '16px' }
  const stateColors = { 'not started': 'var(--vfo-muted)', 'in progress': '#0095ff', 'completed': '#1b9254' }

  if (loading) return <TaxPlanListSkeleton />

  if (selectedPlan) {
    return (
      <TaxPlanTrackView
        plan={selectedPlan}
        phases={phases}
        progress={allProgress[selectedPlan.id] || {}}
        specialists={effectiveSpecialists}
        expertBios={expertBios}
        onBack={() => { setSelectedPlan(null); loadData() }}
        readOnly={readOnly}
        plannerMode={plannerMode}
        notes={notes}
        onNotesChange={onNotesChange}
        clientId={clientId}
        client={client}
        programName={programName === 'VFO Tax Planning' ? 'VFO Tax Planning' : 'VFO Holistic Planning'}
      />
    )
  }

  return (
    <div>
      {!taxEnabled && (
        <div style={{ ...sectionStyle, borderColor: 'rgba(231,76,60,0.3)', textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '15px', color: 'var(--vfo-muted)' }}>Tax Priorities is not yet enabled for this client.</div>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '8px' }}>Set C26 to "Tax priorities tab enabled" in MAP 1 first.</div>
        </div>
      )}
      {taxEnabled && (
        <>
          <ListHeader
            title="Tax Plans"
            count={taxPlans.length}
            action={!readOnly && !plannerMode && <button onClick={startPlan} style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>+ Start Tax Plan</button>}
          />

          {taxPlans.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)' }}>No tax plans started yet.</div>
          )}
          {taxPlans.map(plan => {
            const state = getPlanState(plan)
            const stateColor = stateColors[state]
            return (
              <div key={plan.id} onClick={() => setSelectedPlan(plan)}
                style={{ ...sectionStyle, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--vfo-card)'}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--vfo-ink)', marginBottom: '4px' }}>{plan.program_id === 4 ? 'VFO Tax Planning' : 'VFO Holistic Planning · Tax Priorities'}</div>
                  <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{plan.created_at?.split('T')[0]}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '4px', background: plan.status === 'stopped' ? 'rgba(231,76,60,0.15)' : 'rgba(27,146,84,0.15)', color: plan.status === 'stopped' ? '#e74c3c' : '#1b9254', border: `1px solid ${plan.status === 'stopped' ? 'rgba(231,76,60,0.3)' : 'rgba(27,146,84,0.3)'}` }}>{plan.status === 'stopped' ? 'Stopped' : 'Live'}</span>
                  {plan.status !== 'stopped' && <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '4px', background: `${stateColor}22`, color: stateColor, border: `1px solid ${stateColor}44`, textTransform: 'capitalize' }}>{state}</span>}
                  <span style={{ color: '#0095ff', fontWeight: 500, fontSize: '13px' }}>View →</span>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

export default TaxPrioritiesTab