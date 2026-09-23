/**
 * Prisma `Decimal | null` → `number | null` for a coordinate.
 *
 * Returns null rather than NaN for anything unparseable, so a corrupt value
 * degrades to "no coordinates" — which the ranked selector already handles as
 * "location unknown" — instead of computing a distance from a NaN and ranking
 * an agent by a number that means nothing.
 *
 * ⚠ `Address.lat` / `Address.lng` are BOTH nullable by design: manual address
 * entry must stay possible when a vendor denies location permission at booking.
 * The agent app's `toCoord` in lib/job-nav.ts does the same job for the same
 * reason; this is a separate copy rather than a shared import because the two
 * apps must not depend on each other's lib directories (AD12).
 */
export function toCoord(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
