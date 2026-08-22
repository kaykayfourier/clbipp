const BASE_FEE_PAISE = 50000   // ₹500 base
const PER_KM_RATE_PAISE = 800  // ₹8/km

export function computeAgentFee(distanceKm: number): number {
  const raw = BASE_FEE_PAISE + PER_KM_RATE_PAISE * distanceKm
  // round to nearest rupee (100 paise)
  return Math.round(raw / 100) * 100
}