import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the prisma client before importing getMarketData
vi.mock("@clbipp/database", () => ({
  prisma: {
    marketPrices: {
      findFirst: vi.fn(),
    },
  },
}))

import { prisma } from "@clbipp/database"
import { getMarketData } from "./market"

const mockRow = {
  id: "abcd1234-0000-0000-0000-000000000000",
  Li: { toNumber: () => 1200 },
  Co: { toNumber: () => 2800 },
  Ni: { toNumber: () => 1500 },
  Mn: { toNumber: () => 200  },
  Cu: { toNumber: () => 850  },
  Al: { toNumber: () => 220  },
  updatedAt: new Date("2026-01-01"), // old date — should not affect freshness
}

describe("getMarketData", () => {
  beforeEach(() => {
    vi.mocked(prisma.marketPrices.findFirst).mockResolvedValue(mockRow as any)
  })

  it("snapshot_timestamp is always fresh regardless of DB row age", async () => {
    const before = Date.now()
    const result = await getMarketData()
    const after = Date.now()

    const snapshotMs = Date.parse(result.snapshot_timestamp)
    expect(snapshotMs).toBeGreaterThanOrEqual(before)
    expect(snapshotMs).toBeLessThanOrEqual(after + 50)
  })

  it("maps all six metals from Decimal to number", async () => {
    const result = await getMarketData()
    expect(result.metal_price).toEqual({
      Li: 1200,
      Co: 2800,
      Ni: 1500,
      Mn: 200,
      Cu: 850,
      Al: 220,
    })
  })

  it("throws when no row exists", async () => {
    vi.mocked(prisma.marketPrices.findFirst).mockResolvedValue(null)
    await expect(getMarketData()).rejects.toThrow("No MarketPrices row found")
  })

  it("fx_rate_usd_inr is a positive number", async () => {
    const result = await getMarketData()
    expect(result.fx_rate_usd_inr).toBeGreaterThan(0)
  })
})