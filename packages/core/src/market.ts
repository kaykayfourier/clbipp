import { prisma } from "@clbipp/database"
import type { MarketData } from "../../decision-engine/src/decisionEngine/types"

export async function getMarketData(): Promise<MarketData> {
  const row = await prisma.marketPrices.findFirst({
    orderBy: { updatedAt: "desc" },
  })

  if (!row) {
    throw new Error("No MarketPrices row found — run npm run reset-demo")
  }

  return {
    // stamped NOW at read time — this is the defect 1 fix.
    // the engine checks how old snapshot_timestamp is relative to Date.now().
    // by setting it here, the row is always 0 seconds old regardless of when it was seeded.
    snapshot_timestamp: new Date().toISOString(),

    market_snapshot_id: `MKT-${row.id.slice(0, 8).toUpperCase()}`,

    // Read from the row since admin_app_v1 (Batch 1). It used to be hardcoded
    // 83.2 here, which is exactly what the column DEFAULTS to and what the seed
    // writes — so this changed no price, and it must not: the engine only
    // echoes the rate into its audit output (`metal_price` is already ₹/kg), it
    // does no arithmetic with it. The market feed screen (C02, Batch 12) is
    // what makes this value editable.
    fx_rate_usd_inr: row.fxRateUsdInr.toNumber(),

    metal_price: {
      Li: row.Li.toNumber(),
      Co: row.Co.toNumber(),
      Ni: row.Ni.toNumber(),
      Mn: row.Mn.toNumber(),
      Cu: row.Cu.toNumber(),
      Al: row.Al.toNumber(),
    },
  }
}
// ─── Validating a manual override (/market) ─────────────────────────────────
// Typo guards. A metal price feeds every lithium recommendation, so one extra
// zero would inflate every quote until someone noticed.

export const MARKET_METALS = ["Li", "Co", "Ni", "Mn", "Cu", "Al"] as const
export type MarketMetal = (typeof MARKET_METALS)[number]

/** ₹ per kg. Far above any battery metal; catches a run-away extra zero. */
export const MAX_METAL_PRICE_PER_KG = 1_000_000
/** A new price may not move more than this many times up or down in one go. */
export const MAX_MARKET_MOVE = 10
export const FX_RATE_RANGE = { min: 1, max: 1_000 } as const

export function validateMarketOverride(
  prices: Record<MarketMetal, number>,
  fxRateUsdInr: number,
  previous: Partial<Record<MarketMetal, number>> | null,
): string | null {
  for (const metal of MARKET_METALS) {
    const price = prices[metal]
    if (!Number.isFinite(price) || price <= 0) return `${metal} price must be a positive number.`
    if (price > MAX_METAL_PRICE_PER_KG) {
      return `${metal} price must be at most ₹${MAX_METAL_PRICE_PER_KG.toLocaleString("en-IN")} per kg.`
    }
    const before = previous?.[metal]
    if (before && before > 0 && (price > before * MAX_MARKET_MOVE || price < before / MAX_MARKET_MOVE)) {
      return `${metal} moves from ${before} to ${price}, more than ${MAX_MARKET_MOVE} times. Check the number.`
    }
  }
  if (!Number.isFinite(fxRateUsdInr) || fxRateUsdInr < FX_RATE_RANGE.min || fxRateUsdInr > FX_RATE_RANGE.max) {
    return `FX rate must be between ${FX_RATE_RANGE.min} and ${FX_RATE_RANGE.max}.`
  }
  return null
}
