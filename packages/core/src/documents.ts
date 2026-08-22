// ─── Document numbering + money formatting ───────────────────────────────────
// Pure helpers, no DB, no clock. Shared by the PDF templates (@clbipp/pdf), the
// customer screens, and — later — the admin app's compliance view.
//
// Certificate and invoice numbers are DERIVED, not stored. `Certificate` has no
// number column and `Invoice.number` is written from `invoiceNumber()` here, so
// there is exactly one place that decides the format and no migration was
// needed to add either.

/**
 * `CERT-{YEAR}-{pickupId}-{CATEGORY}` — the format recorded in Plan v2 §5.
 *
 * It repeats the year (the pickup id already carries one) and it is long. Kept
 * literal anyway: the format is written down in the plan, a certificate number
 * ends up quoted in compliance correspondence, and a number that drifts from
 * its own spec is worse than a number that is verbose. The year is taken from
 * the certification date, not the pickup id — a load collected in December and
 * certified in January is certified in the later year.
 */
export function certificateNumber(input: {
  pickupId: string
  category: string
  certifiedAt: Date
}): string {
  const year = input.certifiedAt.getFullYear()
  return `CERT-${year}-${input.pickupId}-${input.category.toUpperCase()}`
}

/**
 * `INV-{YEAR}-{suffix}` where suffix is the pickup id's own serial
 * (`PKP-2026-000105` → `000105`). Derived from the pickup rather than a running
 * counter on purpose: a sequence column would need a migration and a lock, and
 * one pickup has at most one invoice (`Invoice.pickupId` is `@unique`), so the
 * pickup's serial is already unique.
 *
 * Consolidated period invoices (`pickupId` null, for fleet accounts) are not
 * issued yet — when they are, they need their own branch here, not a reuse of
 * this one.
 */
export function invoiceNumber(input: { pickupId: string; issuedAt: Date }): string {
  const year = input.issuedAt.getFullYear()
  const serial = input.pickupId.split("-").pop() ?? input.pickupId
  return `INV-${year}-${serial}`
}

/**
 * Integer paise → an Indian-format rupee string (`₹1,84,500`).
 *
 * All money in this repo is integer paise; this is the single conversion point.
 * Fractional paise are rounded rather than shown — a payout advice reading
 * "₹1,84,500.00" adds nothing, and every amount we generate is whole rupees.
 */
export function formatPaise(paise: number): string {
  const rupees = Math.round(paise) / 100
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(Math.round(rupees * 1000) / 10)
}