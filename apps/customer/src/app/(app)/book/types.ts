import type { BatteryCondition } from '@clbipp/database'

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
