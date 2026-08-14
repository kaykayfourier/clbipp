import type { BatteryCategory, BatteryCondition } from '@clbipp/database'

// ─── Wizard draft shapes ─────────────────────────────────────────────────────
// Shared by the wizard and its four step components. Deliberately separate from
// `BookingLineItem` in @clbipp/core: that is the SUBMITTED shape (numbers, or
// null for an unweighed line), this is the IN-PROGRESS shape, where a
// half-typed quantity is a string and a photo is a path plus a local preview.

/** Serialisable projection of an Address row — no Decimal, no Date. */
export type AddressOption = {
  id: string
  label: string
  line1: string
  line2: string | null
  city: string
  state: string
  pincode: string
  isDefault: boolean
}

/**
 * An uploaded booking photo. `path` is the private Storage object path that
 * gets written to `BatteryItem.photoUrls`; `previewUrl` is a local
 * `URL.createObjectURL` blob used only to render the thumbnail before submit.
 * The buckets are private, so a stored path is not directly viewable — the
 * alternative to the blob would be a signed-URL round trip per thumbnail.
 */
export type DraftPhoto = {
  path: string
  previewUrl: string
}

export type DraftItem = {
  /** Stable React key. Not sent to the server. */
  key: string
  /** Kept as strings so a partially-typed number doesn't reset the input. */
  quantity: string
  weightKg: string
  condition: BatteryCondition
  photos: DraftPhoto[]
}

export function emptyItem(): DraftItem {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    quantity: '1',
    weightKg: '',
    condition: 'healthy',
    photos: [],
  }
}

// ─── Repeat booking (Batch 10) ───────────────────────────────────────────────

/** What `/book?from=<pickupId>` carries over into a fresh draft. */
export type InitialDraft = {
  category: BatteryCategory
  items: DraftItem[]
  addressId: string | null
  /** The pickup this was copied from — the wizard says so on step 1. */
  sourcePickupId: string
}

/** The subset of a past pickup's line that can seed a new one. */
export type SourceLine = {
  quantity: number
  /** Prisma Decimal is mapped to a number (or null) by the caller. */
  weightKg: number | null
  condition: BatteryCondition
}

/**
 * Build a fresh wizard draft from a past pickup.
 *
 * Pure, so it can be tested without a database or a browser.
 *
 * ⚠ PHOTOS ARE DELIBERATELY NOT COPIED, and that is the point of this function
 * existing rather than a spread. A photo is evidence of one specific
 * consignment. Carrying last month's images onto a new booking would attach
 * pictures of batteries nobody has seen to a load nobody has assessed — the
 * agent would arrive expecting the photographed goods. Same reasoning that put
 * custody photos only on `arrived` and `collected` in Batch 7B.
 *
 * `preferredDate` and `notes` are dropped for smaller reasons: the date is in
 * the past, and the notes described a different load.
 */
export function draftFromPickup(source: {
  pickupId: string
  category: BatteryCategory
  addressId: string | null
  lines: SourceLine[]
}): InitialDraft {
  const items: DraftItem[] = source.lines.map((line, index) => ({
    // Index-based rather than time+random: this array is built once, in one
    // pass, and a deterministic key keeps the function pure (and testable).
    key: `from-${source.pickupId}-${index}`,
    quantity: String(line.quantity),
    weightKg: line.weightKg === null ? '' : String(line.weightKg),
    condition: line.condition,
    photos: [],
  }))

  return {
    category: source.category,
    // A pickup with no BatteryItem rows (the handful of legacy ones) has
    // nothing to copy, so fall back to a single blank line rather than an empty
    // basket the customer then has to notice is empty.
    items: items.length > 0 ? items : [emptyItem()],
    addressId: source.addressId,
    sourcePickupId: source.pickupId,
  }
}

/** `""` means "I can't weigh these" — a supported answer the quote engine handles. */
export function parseWeight(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function parseQuantity(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isInteger(n) && n >= 1 ? n : null
}

/**
 * Per-line validation for step 2. Returns the first problem, or null.
 * A blank weight is fine; a weight that isn't a positive number is not — that
 * distinction is the whole reason this can't be a plain `Number()` check.
 */
export function itemError(item: DraftItem): string | null {
  if (parseQuantity(item.quantity) === null) {
    return 'Enter a whole quantity of 1 or more.'
  }
  if (item.weightKg.trim() !== '' && parseWeight(item.weightKg) === null) {
    return 'Enter a weight greater than zero, or leave it blank.'
  }
  return null
}
