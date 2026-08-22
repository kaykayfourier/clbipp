// ─── On-site multi-item intake (W3/D1 · Batch 3) ─────────────────────────────
// The agent works item by item through a pickup's `BatteryItem[]`, confirming
// what is actually on the ground against what the customer declared at booking.
// This module is the single definition of WHAT they can choose, WHEN an item
// counts as confirmed, and WHICH branch it takes afterwards.
//
// It exists because four consumers need the same answers and must not each
// invent them: the item list, the per-item confirm form, the server action that
// validates the write, and (Batch 5a) the offer roll-up, which cannot present a
// price until every line is confirmed.
//
// 🔴 PURE ON PURPOSE — no imports, no Prisma, no React. The confirm form is a
// CLIENT component, so anything it reaches must stay importable from the
// browser. Exposed as the `@clbipp/core/intake` subpath rather than through the
// package barrel, which re-exports booking-actions / payment-actions and would
// drag Prisma into the bundle (the same trap `./format` and `./safety` exist to
// avoid).
//
// ⚠ THE TWO HALVES OF A BatteryItem ARE BOTH EVIDENCE. `category`, `quantity`,
// `weightKg`, `condition` and `photoUrls` are the CUSTOMER's declaration.
// `chemistry`, `confirmedWeightKg`, `confirmedCondition` and `agentPhotoUrls`
// are the AGENT's. Nothing in this module or its callers ever writes across
// that line — a disagreement between the two halves is a finding, not a bug to
// tidy away by overwriting one of them.

// ── Chemistry ────────────────────────────────────────────────────────────────

/**
 * The `BatteryType` enum values, as strings.
 *
 * Restated here rather than imported from `@clbipp/database` because this module
 * must stay browser-safe (see the header). `intake.test.ts` has no way to check
 * the two agree — but the server action validates every submitted value against
 * `CHEMISTRY_VALUES` before writing, so a drifted list fails closed at the write
 * rather than silently storing something the enum rejects.
 */
export type ChemistryValue =
  | 'li_ion_nmc'
  | 'li_ion_lfp'
  | 'li_ion_nca'
  | 'lead_acid'
  | 'nimh'
  | 'other'

export type ChemistryOption = {
  value: ChemistryValue
  /** The label on the control. */
  label: string
  /** One line of "what this looks like on a shelf", for an agent who is not a chemist. */
  help: string
}

/**
 * The chemistry picker, in render order — lithium families first, because they
 * are the ones that change what happens next (D1) and the ones the safety
 * checklist has just asked about.
 */
export const CHEMISTRY_OPTIONS: readonly ChemistryOption[] = [
  {
    value: 'li_ion_nmc',
    label: 'Li-ion NMC',
    help: 'Most laptop, phone and e-bike packs. Marked NMC, NCM or a 3.6–3.7 V nominal cell.',
  },
  {
    value: 'li_ion_lfp',
    label: 'Li-ion LFP',
    help: 'Solar storage, UPS and newer EV packs. Marked LFP or LiFePO4, 3.2 V nominal.',
  },
  {
    value: 'li_ion_nca',
    label: 'Li-ion NCA',
    help: 'Less common — some EV and power-tool packs. Marked NCA.',
  },
  {
    value: 'lead_acid',
    label: 'Lead-acid',
    help: 'Car, truck, inverter and UPS batteries. Heavy, with visible terminal posts.',
  },
  {
    value: 'nimh',
    label: 'NiMH',
    help: 'Older hybrid packs and rechargeable AA/AAA cells. Marked Ni-MH.',
  },
  {
    value: 'other',
    label: 'Other / unsure',
    help: 'Nothing on the label matches. Photograph the label — the hub will identify it.',
  },
]

export const CHEMISTRY_VALUES: readonly ChemistryValue[] = CHEMISTRY_OPTIONS.map((o) => o.value)

/**
 * The three lithium-ion families.
 *
 * 🔴 THIS IS THE D1 BRANCH, AND IT HAS ONE HOME. A li-ion item goes damage
 * rubric → decision engine → pathway + price band; everything else is priced off
 * `PricingRate` with no engine and no rubric. A second copy of this list
 * anywhere means a chemistry can be routed one way by a screen and the other way
 * by an API — the exact drift class the repo already guards against for the
 * lifecycle stage order.
 */
export const LI_ION_CHEMISTRIES: readonly ChemistryValue[] = [
  'li_ion_nmc',
  'li_ion_lfp',
  'li_ion_nca',
]

const LI_ION_SET = new Set<string>(LI_ION_CHEMISTRIES)

/**
 * Does this item take the engine path?
 *
 * Accepts `null` and unknown strings so a caller can pass a raw column straight
 * in. An unconfirmed item (`chemistry === null`) is NOT lithium — it has not
 * been assessed at all, and the item list must not offer a rubric link for
 * something nobody has looked at yet.
 */
export function isLithium(chemistry: string | null | undefined): boolean {
  return chemistry != null && LI_ION_SET.has(chemistry)
}

export function chemistryLabel(chemistry: string | null | undefined): string | null {
  const option = CHEMISTRY_OPTIONS.find((o) => o.value === chemistry)
  return option ? option.label : null
}

// ── Condition ────────────────────────────────────────────────────────────────

/**
 * The `BatteryCondition` enum values, restated for the same reason as above.
 *
 * Unlike `category`, condition HAS an agent-confirmed column
 * (`confirmedCondition`), so an agent overriding the customer's declaration is a
 * normal, non-destructive act — both values survive side by side.
 */
export type ConditionValue = 'healthy' | 'swollen' | 'leaking' | 'dead'

export type ConditionOption = {
  value: ConditionValue
  label: string
  help: string
  /** True when this condition is the kind that gets argued about later. */
  damaged: boolean
}

export const CONDITION_OPTIONS: readonly ConditionOption[] = [
  {
    value: 'healthy',
    label: 'Healthy',
    help: 'Intact casing, no bulge, no residue, terminals sound.',
    damaged: false,
  },
  {
    value: 'swollen',
    label: 'Swollen',
    help: 'Casing bulged or split. Handle apart from the rest of the load.',
    damaged: true,
  },
  {
    value: 'leaking',
    label: 'Leaking',
    help: 'Visible electrolyte or residue. Contained separately before anything is moved.',
    damaged: true,
  },
  {
    value: 'dead',
    label: 'Dead',
    help: 'No charge and no recovery — physically sound but end of life.',
    damaged: true,
  },
]

export const CONDITION_VALUES: readonly ConditionValue[] = CONDITION_OPTIONS.map((o) => o.value)

export function conditionLabel(condition: string | null | undefined): string | null {
  const option = CONDITION_OPTIONS.find((o) => o.value === condition)
  return option ? option.label : null
}

/**
 * Conditions that require photo evidence before an item counts as confirmed.
 *
 * ⚠ WIDER THAN THE SAFETY CHECKLIST'S `DAMAGED_CONDITIONS`, deliberately, and
 * the two are not interchangeable. Safety asks "does this load need special
 * handling right now" — `dead` does not, so it is absent there. Intake asks
 * "will this line be disputed later" — `dead` is a valuation claim the vendor
 * may well disagree with, so it does.
 */
const EVIDENCE_REQUIRED_CONDITIONS = new Set<string>(
  CONDITION_OPTIONS.filter((o) => o.damaged).map((o) => o.value),
)

export function requiresPhotoEvidence(condition: string | null | undefined): boolean {
  return condition != null && EVIDENCE_REQUIRED_CONDITIONS.has(condition)
}

// ── Category (declared only — read-only during intake) ───────────────────────

/**
 * Labels for the customer-declared `BatteryCategory`.
 *
 * 🔴 THERE IS NO AGENT-CONFIRMED CATEGORY, AND THAT IS DELIBERATE. The task
 * sheet's step 2 lists "category" among the fields the agent sets, but
 * `BatteryItem` has no `confirmedCategory` column — `category` IS the customer's
 * declaration, and the same sentence forbids overwriting those. Intake shows it
 * read-only. Chemistry is what actually drives the branch; category is a form
 * factor, and a mis-declared one is an admin-app correction, not something to
 * silently rewrite on site. Written up in "Batch 3 — as built".
 */
export const CATEGORY_LABELS: Record<string, string> = {
  portable: 'Portable',
  automotive: 'Automotive',
  industrial: 'Industrial',
  ev: 'EV',
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category
}

// ── Confirmation state ───────────────────────────────────────────────────────

/**
 * The subset of a `BatteryItem` these rules read.
 *
 * `Decimal | null` columns arrive as `number | null` — callers convert at the
 * boundary, because a Prisma `Decimal` is not browser-safe and this module is.
 */
export type IntakeItemLike = {
  chemistry: string | null
  confirmedWeightKg: number | null
  confirmedCondition: string | null
  agentPhotoUrls: readonly string[]
}

export type ItemConfirmationState =
  /** Nothing recorded yet, or a required field still missing. */
  | 'pending'
  /** Every field recorded, but a damaged item has no photo to back the call. */
  | 'needs-photo'
  /** Done. Counts toward the running total and unlocks the quote. */
  | 'confirmed'

/**
 * Where one item stands.
 *
 * `needs-photo` is a separate state rather than folded into `pending` so the
 * screen can say what is actually missing. An agent who has filled in every
 * field and is being told "pending" with no reason will assume the app is broken
 * and re-enter everything.
 */
export function itemConfirmationState(item: IntakeItemLike): ItemConfirmationState {
  const hasCoreFields =
    item.chemistry != null &&
    item.confirmedWeightKg != null &&
    item.confirmedWeightKg > 0 &&
    item.confirmedCondition != null

  if (!hasCoreFields) return 'pending'

  if (requiresPhotoEvidence(item.confirmedCondition) && item.agentPhotoUrls.length === 0) {
    return 'needs-photo'
  }

  return 'confirmed'
}

export function isItemConfirmed(item: IntakeItemLike): boolean {
  return itemConfirmationState(item) === 'confirmed'
}

/** Plain-language reason an item is not confirmed yet. `null` when it is. */
export function outstandingReason(item: IntakeItemLike): string | null {
  const state = itemConfirmationState(item)
  if (state === 'confirmed') return null
  if (state === 'needs-photo') {
    return `A ${conditionLabel(item.confirmedCondition) ?? 'damaged'} unit needs at least one photo.`
  }

  const missing: string[] = []
  if (item.chemistry == null) missing.push('chemistry')
  if (item.confirmedWeightKg == null || item.confirmedWeightKg <= 0) missing.push('weighed kg')
  if (item.confirmedCondition == null) missing.push('condition')
  return `Still to record: ${missing.join(', ')}.`
}

// ── Running totals ───────────────────────────────────────────────────────────

export type IntakeTotalsItemLike = IntakeItemLike & {
  quantity: number
  weightKg: number | null
}

export type IntakeTotals = {
  lines: number
  confirmedLines: number
  /** True when every line is confirmed — the gate on "Continue to quote". */
  allConfirmed: boolean
  units: number
  /** Sum of `confirmedWeightKg` over confirmed lines only. */
  weighedKg: number
  /** Sum of the customer's `weightKg` over every line, for comparison. */
  declaredKg: number
}

/**
 * The header line on the item list.
 *
 * `allConfirmed` is FALSE for a pickup with no items at all. An empty pickup is a
 * data fault, not a finished job, and letting it fall through to "continue to
 * quote" would produce an `Offer` for nothing — the kind of vacuous pass this
 * repo has been bitten by before.
 *
 * `weighedKg` counts only CONFIRMED lines so the number never overstates what
 * has actually been put on a scale; `declaredKg` counts every line, so the two
 * legitimately disagree mid-intake and the screen says which is which.
 */
export function intakeTotals(items: readonly IntakeTotalsItemLike[]): IntakeTotals {
  let confirmedLines = 0
  let units = 0
  let weighedKg = 0
  let declaredKg = 0

  for (const item of items) {
    units += item.quantity
    declaredKg += item.weightKg ?? 0
    if (isItemConfirmed(item)) {
      confirmedLines += 1
      weighedKg += item.confirmedWeightKg ?? 0
    }
  }

  return {
    lines: items.length,
    confirmedLines,
    allConfirmed: items.length > 0 && confirmedLines === items.length,
    units,
    weighedKg,
    declaredKg,
  }
}

// ── Input validation (server action) ─────────────────────────────────────────

/**
 * Upper bound on a single weighed line, in kg.
 *
 * A sanity rail against a fat-fingered extra digit, not a business rule: the
 * heaviest thing in the seed is a 14-unit truck-battery line at 196 kg, and an
 * industrial UPS bank can plausibly be a few tonnes. Set high enough that a real
 * load never trips it and a typo of "1960" on a 196 kg line still does not —
 * which is why the screen shows the declared weight next to the field instead of
 * relying on this.
 */
export const MAX_LINE_WEIGHT_KG = 10_000

export type ParsedIntake = {
  chemistry: ChemistryValue
  confirmedWeightKg: number
  confirmedCondition: ConditionValue
}

/**
 * Validate one confirm submission.
 *
 * Returns an error STRING rather than throwing, because the caller is a server
 * action rendering the message back onto the form — the repo's inline
 * error-handling convention at async boundaries.
 *
 * 🔴 The enum checks are not belt-and-braces. The form posts strings; anything
 * can post to a server action; and Postgres rejecting a bad enum value surfaces
 * as an opaque 500 rather than "pick a chemistry".
 */
export function parseIntakeSubmission(input: {
  chemistry: string | null
  weightKg: string | null
  condition: string | null
}): { value: ParsedIntake; error: null } | { value: null; error: string } {
  const chemistry = input.chemistry ?? ''
  if (!CHEMISTRY_VALUES.includes(chemistry as ChemistryValue)) {
    return { value: null, error: 'Pick the chemistry you can see on the label.' }
  }

  const condition = input.condition ?? ''
  if (!CONDITION_VALUES.includes(condition as ConditionValue)) {
    return { value: null, error: 'Pick the condition of this line.' }
  }

  // Number(''), Number(' ') and Number('abc') are 0, 0 and NaN respectively —
  // all three must fail, so the emptiness check comes before the parse.
  const raw = (input.weightKg ?? '').trim()
  if (raw === '') {
    return { value: null, error: 'Enter the weight you measured.' }
  }

  const weight = Number(raw)
  if (!Number.isFinite(weight) || weight <= 0) {
    return { value: null, error: 'Weight must be a number greater than zero.' }
  }
  if (weight > MAX_LINE_WEIGHT_KG) {
    return {
      value: null,
      error: `${weight} kg looks like a typo — the limit is ${MAX_LINE_WEIGHT_KG} kg per line.`,
    }
  }

  // Two decimals, matching `Decimal(8,2)` on the column. Rounded here rather
  // than left to Postgres so the value the agent is shown back is the value
  // stored.
  return {
    value: {
      chemistry: chemistry as ChemistryValue,
      confirmedWeightKg: Math.round(weight * 100) / 100,
      confirmedCondition: condition as ConditionValue,
    },
    error: null,
  }
}

/**
 * Every path must sit under the uploader's own uid folder.
 *
 * The agent's browser uploads straight to the `pickup-photos` bucket, where the
 * storage policy enforces exactly this prefix — but the PATHS then travel
 * through a form field into a service-role write, which bypasses RLS entirely.
 * Without this check an agent could post any object path in the bucket and
 * attach another job's photo as evidence for this one.
 *
 * Mirrors `pathsBelongToCaller` in the customer app's booking action.
 */
export function photoPathsBelongTo(paths: readonly string[], userId: string): boolean {
  if (!userId) return false
  return paths.every((p) => p.startsWith(`${userId}/`))
}
