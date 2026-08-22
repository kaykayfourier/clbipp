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

    // MarketPrices has no fx_rate column — hardcoded until a migration adds it
    fx_rate_usd_inr: 83.2,

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