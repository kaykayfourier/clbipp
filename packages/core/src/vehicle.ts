/**
 * Vehicle registration numbers (AF2 · FD25, 2026-10-24).
 *
 * The company asked for the vehicle number to be mandatory at collection and
 * at hub drop-off. It is prefilled — the run's vehicle, else the agent's
 * profile at collection; the collection vehicle at drop-off — and any
 * difference from that prefill is written to `vehicle_corrections`.
 *
 * 🔴 EVERY comparison goes through `normaliseVehicleReg` on BOTH sides. The
 * stored form is canonical (uppercase, no spaces or dashes, district padded to
 * two digits, number to four), so "dl-1lr-4471", "DL 01 LR 4471" and the
 * profile's "Tata Ace · DL 1LR 4471" are one vehicle and none of them is a
 * correction. Without that, a retyped prefill would log a spurious difference.
 *
 * Pure: no Prisma, no I/O — safe in a client component via the subpath:
 *
 *     import { normaliseVehicleReg } from "@clbipp/core/vehicle"
 */

// State (2 letters) · district (1–2 digits) · series (0–3 letters) · number (1–4 digits).
const STANDARD = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/
// Bharat series: year (2) · BH · number (4) · letters (1–2).
const BHARAT = /^(\d{2})BH(\d{4})([A-Z]{1,2})$/

/**
 * Canonical registration, or null when the text is not one.
 * `normaliseVehicleReg("dl 1lr-4471")` → `"DL01LR4471"`.
 */
export function normaliseVehicleReg(input: string | null | undefined): string | null {
  if (!input) return null
  const compact = input.toUpperCase().replace(/[\s-]+/g, '')
  const std = STANDARD.exec(compact)
  if (std) {
    const [, state, district, series, number] = std
    return `${state}${district.padStart(2, '0')}${series}${number.padStart(4, '0')}`
  }
  if (BHARAT.test(compact)) return compact
  return null
}

/**
 * Pulls the registration out of free text such as a profile's
 * "Tata Ace · DL 1LR 4471" or a run's vehicle field. Tries the whole string,
 * then each segment from the last (the reg is conventionally written after the
 * model). Null when no segment is a registration.
 */
export function vehicleRegFromText(text: string | null | undefined): string | null {
  if (!text) return null
  const whole = normaliseVehicleReg(text)
  if (whole) return whole
  const segments = text.split(/[·|,/()]+/).map((s) => s.trim()).filter(Boolean)
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const reg = normaliseVehicleReg(segments[i])
    if (reg) return reg
  }
  return null
}

/**
 * The prefill at COLLECTION: the run's vehicle, else the agent's profile
 * vehicle. Null when neither holds a readable registration — the agent then
 * types one, and that is entry, not a correction.
 */
export function expectedVehicle({
  runVehicle,
  profileVehicle,
}: {
  runVehicle?: string | null
  profileVehicle?: string | null
}): string | null {
  return vehicleRegFromText(runVehicle) ?? vehicleRegFromText(profileVehicle)
}

export type VehicleRegResult = { ok: true; reg: string } | { ok: false; error: string }

/** What a form submits, checked. The error is the screen's copy. */
export function parseVehicleReg(input: unknown): VehicleRegResult {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) return { ok: false, error: 'Enter the vehicle number.' }
  const reg = normaliseVehicleReg(raw)
  if (!reg) return { ok: false, error: 'That is not a vehicle number. Use the format DL 1LR 4471.' }
  return { ok: true, reg }
}

/**
 * True when `entered` differs from a prefill that existed. No prefill → never a
 * correction. Both sides normalised, so a legacy un-padded value compares equal.
 */
export function isVehicleCorrection(expected: string | null | undefined, entered: string): boolean {
  const from = normaliseVehicleReg(expected)
  if (!from) return false
  return from !== normaliseVehicleReg(entered)
}

/** Display form: `DL01LR4471` → `DL 01 LR 4471`, `22BH1234AB` → `22 BH 1234 AB`. */
export function formatVehicleReg(reg: string | null | undefined): string {
  const canonical = normaliseVehicleReg(reg)
  if (!canonical) return reg ?? ''
  const bh = BHARAT.exec(canonical)
  if (bh) return `${bh[1]} BH ${bh[2]} ${bh[3]}`
  const std = STANDARD.exec(canonical)!
  return [std[1], std[2], std[3], std[4]].filter(Boolean).join(' ')
}

/**
 * The prefill at DROP-OFF: the vehicle the batch's pickups were collected in.
 * Several pickups may disagree (two vans' loads handed in together), so the
 * most common one wins; ties go to the first seen. Null when none recorded one.
 */
export function dropoffPrefill(collectionVehicles: ReadonlyArray<string | null | undefined>): string | null {
  const counts = new Map<string, number>()
  for (const v of collectionVehicles) {
    const reg = normaliseVehicleReg(v)
    if (reg) counts.set(reg, (counts.get(reg) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [reg, n] of counts) {
    if (n > bestCount) {
      best = reg
      bestCount = n
    }
  }
  return best
}
