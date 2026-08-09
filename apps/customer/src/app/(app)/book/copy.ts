import type { BatteryCategory, BatteryCondition } from '@clbipp/database'

// ─── Booking wizard copy ─────────────────────────────────────────────────────
// Labels only, no React — imported by both the server page and the client
// steps. Typed as Records over the enums so adding a category or condition to
// the schema fails the build here until it has customer-facing wording.

export const CATEGORY_LABELS: Record<BatteryCategory, string> = {
  portable: 'Portable',
  automotive: 'Automotive',
  industrial: 'Industrial',
  ev: 'EV pack',
}

// The examples matter more than the label: the company flow document asks the
// customer for a CATEGORY, not a chemistry (chemistry is the field agent's
// call), so the wording has to let a non-expert self-select correctly.
export const CATEGORY_HINTS: Record<BatteryCategory, string> = {
  portable: 'Phone, laptop, power-tool and e-bike cells',
  automotive: 'Car and two-wheeler starter batteries',
  industrial: 'UPS, telecom, inverter and forklift banks',
  ev: 'Electric-vehicle traction packs',
}

export const CATEGORY_ORDER: BatteryCategory[] = ['portable', 'automotive', 'industrial', 'ev']

export const CONDITION_LABELS: Record<BatteryCondition, string> = {
  healthy: 'Healthy',
  dead: 'Dead',
  swollen: 'Swollen',
  leaking: 'Leaking',
}

export const CONDITION_HINTS: Record<BatteryCondition, string> = {
  healthy: 'Intact, no visible damage',
  dead: "Won't hold charge",
  swollen: 'Bulging or deformed case',
  leaking: 'Fluid, residue or a burnt smell',
}

// Order runs healthy → hazardous, so the safe default sits first.
export const CONDITION_ORDER: BatteryCondition[] = ['healthy', 'dead', 'swollen', 'leaking']

/**
 * Paise → "₹1,84,500". RE-EXPORTED, not reimplemented.
 *
 * This used to be a second local implementation, which the repo-wide rule
 * ("format ₹ with formatPaise from @clbipp/core, never a local /100")
 * specifically forbids. It survived Batch 8 for a real reason: `StepReview` is
 * a CLIENT component, and a value import from the `@clbipp/core` barrel pulls
 * in `booking-actions` / `payment-actions` — and therefore Prisma — at bundle
 * time.
 *
 * The subpath fixes that properly. `@clbipp/core/format` resolves to
 * `documents.ts`, which imports nothing at all, so a client component can value
 * import it safely. Same split, and the same reasoning, as @clbipp/auth's
 * `storage` vs `storage-server`.
 */
export { formatPaise } from '@clbipp/core/format'

export const STEP_TITLES = [
  'What are we collecting?',
  'Tell us how much',
  'Where and when',
  'Your indicative quote',
] as const
