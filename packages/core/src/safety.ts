// ─── Pre-pickup safety checklist (W1 · Batch 2) ──────────────────────────────
// The mandatory gate between `arrived` and intake. All three HR documents call
// a pre-pickup safety check mandatory; the wireframe omitted it entirely.
//
// This module is the single definition of WHAT the checklist asks and WHEN an
// answer set passes. It lives here rather than in the screen because three
// consumers need the same answer: the agent screen that renders it, the server
// action that decides `passed`, and (later) the admin app and the Batch 7b
// chain-of-custody PDF, which have to describe a checklist they did not render.
//
// 🔴 PURE ON PURPOSE — no imports, no Prisma, no React. The agent's checklist
// form is a CLIENT component, so anything it reaches must stay importable from
// the browser. Exposed as the `@clbipp/core/safety` subpath rather than through
// the package barrel, which re-exports booking-actions / payment-actions and
// would drag Prisma into the bundle (same trap `./format` exists to avoid).
//
// ⚠ WORDING PROVENANCE. The five ALWAYS_REQUIRED items are named in the HR
// documents. The three conditional ones are OURS — reasonable battery-handling
// practice, but not quoted from a document the company gave us. They carry the
// same standing as the placeholder factors in impact.ts: defensible, unverified,
// and pending the company's confirmation. Don't quote them at HR as theirs.

/** Bumped only if the persisted `items` JSON shape changes incompatibly. */
export const SAFETY_CHECKLIST_VERSION = 1

/**
 * Stable keys for the persisted answers.
 *
 * ⚠ These are the keys of a stored JSON blob (`safety_checklists.items`), not
 * just local identifiers — the schema comment on the model already names three
 * of them. Renaming one silently orphans every row already written. Add new
 * keys; don't rename existing ones.
 */
export type SafetyItemKey =
  // ── HR-named. Always required, on every job, unconditionally. ──
  | 'terminalsInsulated'
  | 'noPuncturing'
  | 'fireSafeCrate'
  | 'noMixedChemistry'
  | 'ppeWorn'
  // ── Added when the load contains lithium-ion. ──
  | 'lithiumStateOfCharge'
  | 'lithiumDamagedCellsIsolated'
  // ── Added when any declared item is swollen or leaking. ──
  | 'damagedUnitsContained'

/** Which block an item renders under. Presentation only — never a rule. */
export type SafetyItemGroup = 'general' | 'lithium' | 'damaged'

export type SafetyItem = {
  key: SafetyItemKey
  group: SafetyItemGroup
  /** The tick-box line itself. Phrased as a statement the agent confirms. */
  label: string
  /** One line of "what this actually means on site". */
  help: string
}

/**
 * The catalogue, in render order.
 *
 * Every item is phrased as something the agent asserts is TRUE, so a tick always
 * means "safe" and an empty box always means "not done". A checklist that mixes
 * positive and negative phrasing gets mis-ticked by someone in a hurry, which is
 * the exact population this screen is for.
 */
export const SAFETY_ITEMS: readonly SafetyItem[] = [
  {
    key: 'terminalsInsulated',
    group: 'general',
    label: 'Terminals taped or capped',
    help: 'Every exposed terminal insulated before anything is stacked or moved.',
  },
  {
    key: 'noPuncturing',
    group: 'general',
    label: 'No puncturing, crushing or dismantling on site',
    help: 'Cells are moved intact. Any opening up happens at the facility, not here.',
  },
  {
    key: 'fireSafeCrate',
    group: 'general',
    label: 'Fire-safe crate in use',
    help: 'Non-conductive crate, lid available, and nothing loose in the load bed.',
  },
  {
    key: 'noMixedChemistry',
    group: 'general',
    label: 'Chemistries kept separate',
    help: 'Lead-acid and lithium never share a crate, even for a short run.',
  },
  {
    key: 'ppeWorn',
    group: 'general',
    label: 'PPE worn',
    help: 'Insulating gloves and eye protection on before handling begins.',
  },
  {
    key: 'lithiumStateOfCharge',
    group: 'lithium',
    label: 'Li-ion packs at low state of charge',
    help: 'Roughly 30% or below where it can be checked. A full pack carries more energy to release.',
  },
  {
    key: 'lithiumDamagedCellsIsolated',
    group: 'lithium',
    label: 'No swollen or vented li-ion cells packed with healthy ones',
    help: 'A compromised lithium cell goes in its own container, never in the main crate.',
  },
  {
    key: 'damagedUnitsContained',
    group: 'damaged',
    label: 'Damaged units separately contained',
    help: 'The customer declared swollen or leaking units. Bag and tray them apart from the rest.',
  },
]

/**
 * The HR-mandated five.
 *
 * 🔴 These are required on EVERY job and nothing can remove them — not the
 * lithium toggle, not a category guess, not a future condition rule. The
 * conditional logic below only ever ADDS to this list. That direction is the
 * whole safety argument for deriving anything at all: a wrong derivation costs
 * the agent three extra taps, never a hidden fire-safety item.
 */
export const ALWAYS_REQUIRED: readonly SafetyItemKey[] = [
  'terminalsInsulated',
  'noPuncturing',
  'fireSafeCrate',
  'noMixedChemistry',
  'ppeWorn',
]

const LITHIUM_ITEMS: readonly SafetyItemKey[] = [
  'lithiumStateOfCharge',
  'lithiumDamagedCellsIsolated',
]

/**
 * Categories that may be assumed lead-acid — a DENYLIST, not an allowlist.
 *
 * `automotive` is the only category overwhelmingly lead-acid in this market;
 * `portable`, `industrial` and `ev` are all lithium-dominant or mixed.
 *
 * 🔴 The direction here is the safety argument, and it is easy to invert by
 * accident. Listing the LITHIUM-likely categories instead would mean a category
 * nobody thought of — a new enum value, a typo, a future `bess` — reads as "no
 * lithium" and silently drops the fire-safety items. Listed this way, anything
 * unrecognised falls through to lithium-present, which costs three extra taps.
 * `safety.test.ts` asserts exactly this case.
 */
const ASSUMED_NON_LITHIUM_CATEGORIES = new Set(['automotive'])

/** Declared conditions that mean "handle this apart from the rest". */
const DAMAGED_CONDITIONS = new Set(['swollen', 'leaking'])

/**
 * Best guess at whether a load contains lithium, from customer-declared data.
 *
 * ⚠ THIS IS A DEFAULT, NOT AN ANSWER. `BatteryItem.chemistry` is in the
 * agent-confirmed half of the model and is null until intake — which is the
 * screen the checklist gates — so the real chemistry genuinely does not exist
 * yet at this point in the flow. The plan's "show lithium items only when the
 * pickup has a li-ion item" names a field that cannot be read here; this
 * function is what stands in for it, and the agent's own answer overrides it.
 *
 * Biased toward TRUE: an empty item list, an unrecognised category, or anything
 * that is not purely automotive all return true. A 12V lithium auxiliary battery
 * is declared `automotive`, so even the confident case is only a guess — which
 * is precisely why the screen asks.
 */
export function lithiumLikelyFromCategories(categories: readonly string[]): boolean {
  if (categories.length === 0) return true
  return !categories.every((c) => ASSUMED_NON_LITHIUM_CATEGORIES.has(c))
}

/** True when the customer declared any swollen or leaking unit. */
export function hasDamagedUnits(conditions: readonly string[]): boolean {
  return conditions.some((c) => DAMAGED_CONDITIONS.has(c))
}

/**
 * The set of items that must be ticked for this particular job.
 *
 * Returned in catalogue order so the screen and the stored `required` array
 * always agree on sequence — an audit record that lists items in a different
 * order than the agent saw them is harder to reconcile than it looks.
 */
export function requiredItemKeys(opts: {
  lithiumPresent: boolean
  damagedUnitsPresent: boolean
}): SafetyItemKey[] {
  const keys = new Set<SafetyItemKey>(ALWAYS_REQUIRED)
  if (opts.lithiumPresent) LITHIUM_ITEMS.forEach((k) => keys.add(k))
  if (opts.damagedUnitsPresent) keys.add('damagedUnitsContained')
  return SAFETY_ITEMS.filter((item) => keys.has(item.key)).map((item) => item.key)
}

/** Raw answers as they come off the form or out of a stored row. */
export type SafetyAnswers = Partial<Record<SafetyItemKey, boolean>>

/**
 * The verdict.
 *
 * Deliberately reports WHICH items are missing rather than just a boolean: a
 * failed checklist that says "not passed" and nothing else leaves an agent
 * standing next to a crate with no idea what to fix.
 */
export function evaluateChecklist(
  answers: SafetyAnswers,
  required: readonly SafetyItemKey[],
): { passed: boolean; missing: SafetyItemKey[] } {
  const missing = required.filter((key) => answers[key] !== true)
  return { passed: missing.length === 0, missing }
}

/**
 * How the lithium question was answered.
 *
 * `agent` — a human standing in front of the load said so.
 * `declared-category` — nobody answered; this is the category guess above.
 *
 * Stored so a later reader can tell a judgement from a fallback. Only `agent`
 * should ever appear on a checklist submitted through the screen; the other
 * value exists for rows written by anything that doesn't ask (the seed).
 */
export type LithiumBasis = 'agent' | 'declared-category'

/** The persisted shape of `safety_checklists.items`. Stable keys. */
export type SafetyChecklistJson = {
  version: number
  lithiumPresent: boolean
  lithiumBasis: LithiumBasis
  damagedUnitsPresent: boolean
  answers: SafetyAnswers
  required: SafetyItemKey[]
  missing: SafetyItemKey[]
}

/**
 * Build the row's JSON and its verdict together, so the two can never disagree.
 *
 * `passed` is a real column AND `missing` is inside the JSON; computing them in
 * one place is what stops a row that claims `passed: true` while listing
 * outstanding items. Same reasoning as writing `pickups.status` and its
 * `status_events` row in one action.
 *
 * Unknown keys in `answers` are dropped rather than stored: the answers arrive
 * from a form, and a form is attacker-controlled. Persisting arbitrary keys into
 * a compliance record would let anyone with a session write whatever they liked
 * into an audit trail.
 */
export function buildChecklistJson(opts: {
  answers: SafetyAnswers
  lithiumPresent: boolean
  lithiumBasis: LithiumBasis
  damagedUnitsPresent: boolean
}): { json: SafetyChecklistJson; passed: boolean } {
  const required = requiredItemKeys({
    lithiumPresent: opts.lithiumPresent,
    damagedUnitsPresent: opts.damagedUnitsPresent,
  })

  const answers: SafetyAnswers = {}
  for (const item of SAFETY_ITEMS) {
    if (opts.answers[item.key] === true) answers[item.key] = true
  }

  const { passed, missing } = evaluateChecklist(answers, required)

  return {
    json: {
      version: SAFETY_CHECKLIST_VERSION,
      lithiumPresent: opts.lithiumPresent,
      lithiumBasis: opts.lithiumBasis,
      damagedUnitsPresent: opts.damagedUnitsPresent,
      answers,
      required,
      missing,
    },
    passed,
  }
}

/**
 * Read a stored row's answers back out for pre-filling the form.
 *
 * Tolerant by design — it parses `unknown` off a Json column that predates this
 * module's version field and may one day postdate it. A row it cannot understand
 * yields no ticks, which makes the agent re-confirm rather than showing them a
 * checklist that claims things nobody asserted.
 */
export function readStoredAnswers(items: unknown): SafetyAnswers {
  if (typeof items !== 'object' || items === null) return {}
  const record = items as Record<string, unknown>
  const raw = 'answers' in record ? record.answers : record
  if (typeof raw !== 'object' || raw === null) return {}

  const stored = raw as Record<string, unknown>
  const answers: SafetyAnswers = {}
  for (const item of SAFETY_ITEMS) {
    if (stored[item.key] === true) answers[item.key] = true
  }
  return answers
}

/** Stored lithium answer, for re-priming the toggle. Falls back to the guess. */
export function readStoredLithiumPresent(items: unknown, fallback: boolean): boolean {
  if (typeof items !== 'object' || items === null) return fallback
  const record = items as Record<string, unknown>
  return typeof record.lithiumPresent === 'boolean' ? record.lithiumPresent : fallback
}

/** Human-readable labels for a missing-items message. */
export function labelsFor(keys: readonly SafetyItemKey[]): string[] {
  return SAFETY_ITEMS.filter((item) => keys.includes(item.key)).map((item) => item.label)
}
