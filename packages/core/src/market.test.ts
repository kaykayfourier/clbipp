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
import { getMarketData, validateMarketOverride } from "./market"

const mockRow = {
  id: "abcd1234-0000-0000-0000-000000000000",
  Li: { toNumber: () => 1200 },
  Co: { toNumber: () => 2800 },
  Ni: { toNumber: () => 1500 },
  Mn: { toNumber: () => 200  },
  Cu: { toNumber: () => 850  },
  Al: { toNumber: () => 220  },
  // Added with admin_app_v1 (Admin Batch 1). The column is NOT NULL with a
  // database default of 83.2, so a row without it cannot exist — the mock has
  // to carry it or these tests assert against a shape production never sees.
  // Deliberately NOT 83.2 here: the old code hardcoded that number, so a mock
  // that also says 83.2 would pass whether or not the column is actually read.
  fxRateUsdInr: { toNumber: () => 84.75 },
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

  it("reads fx_rate_usd_inr from the ROW, not from a constant", async () => {
    // 🔴 This is the assertion the previous test could not make. Until
    // admin_app_v1 added market_prices.fx_rate_usd_inr, market.ts returned a
    // hardcoded 83.2 — which is also the column's default, so "is a positive
    // number" passes identically either way. 84.75 is the mock's value and
    // nothing else in the codebase says it.
    const result = await getMarketData()
    expect(result.fx_rate_usd_inr).toBe(84.75)
  })
})
describe("validateMarketOverride", () => {
  const seed = { Li: 1450, Co: 2600, Ni: 1550, Mn: 180, Cu: 780, Al: 240 }

  it("accepts an ordinary update", () => {
    expect(validateMarketOverride({ ...seed, Co: 2800 }, 83.2, seed)).toBeNull()
    expect(validateMarketOverride(seed, 83.2, null)).toBeNull()
  })

  it("refuses an extra zero, a collapse and nonsense", () => {
    expect(validateMarketOverride({ ...seed, Li: 145000 }, 83.2, seed)).toMatch(/Li moves/)
    expect(validateMarketOverride({ ...seed, Ni: 15 }, 83.2, seed)).toMatch(/Ni moves/)
    expect(validateMarketOverride({ ...seed, Cu: 0 }, 83.2, seed)).toMatch(/Cu price must be a positive/)
    expect(validateMarketOverride({ ...seed, Al: 5_000_000 }, 83.2, null)).toMatch(/at most/)
    expect(validateMarketOverride(seed, 0, seed)).toMatch(/FX rate/)
    expect(validateMarketOverride(seed, 8320, seed)).toMatch(/FX rate/)
  })
})
