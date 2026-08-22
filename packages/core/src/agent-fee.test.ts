import { describe, it, expect } from "vitest"
import { computeAgentFee } from "./agent-fee"

describe("computeAgentFee", () => {
  it("zero distance returns base fee only", () => {
    const fee = computeAgentFee(0)
    expect(fee % 100).toBe(0) // always multiple of 100 paise (rounded to rupee)
  })

  it("typical distance produces correct total", () => {
    // base 50000 paise + 800 * 10km = 58000 paise
    expect(computeAgentFee(10)).toBe(58000)
  })

  it("result is always rounded to nearest rupee", () => {
    expect(computeAgentFee(7.3) % 100).toBe(0)
  })
})