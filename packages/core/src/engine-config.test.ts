// Batch 11 — the publish gate, and the tier-3 pin.
//
// validateEngineConfig() is the only thing standing between a typo in a form
// and a config that prices every subsequent quote wrong, so it is tested
// against a real DEFAULT_CONFIG rather than a hand-built stub: a rule that
// rejects the shipped default is a broken rule, not a strict one.

import { describe, expect, it } from "vitest"
import { computeDamageScore, DEFAULT_CONFIG, type Config } from "@clbipp/decision-engine"

import {
  EDITABLE_CHEMISTRIES,
  MARGIN_TIER_KEYS,
  METALS,
  TIER3_REFERENCE,
  validateEngineConfig,
} from "./engine-config"

/** A deep-enough clone that mutating one table does not touch DEFAULT_CONFIG. */
function draft(): Config {
  return structuredClone(DEFAULT_CONFIG)
}

describe("validateEngineConfig", () => {
  it("accepts the shipped DEFAULT_CONFIG unchanged", () => {
    // AD8: the seeded EngineConfig is byte-identical to DEFAULT_CONFIG. If this
    // fails, /config can never publish and the drift test is lying.
    expect(validateEngineConfig(DEFAULT_CONFIG)).toEqual([])
  })

  describe("margin tiers", () => {
    it("rejects tiers that are not ordered aggressive > standard > generous", () => {
      const c = draft()
      c.margin_tiers = { aggressive: 0.1, standard: 0.2, generous: 0.3 }
      expect(validateEngineConfig(c).join(" ")).toMatch(/ordered aggressive/)
    })

    it("rejects equal tiers — the band would have no width", () => {
      const c = draft()
      c.margin_tiers = { aggressive: 0.2, standard: 0.2, generous: 0.2 }
      expect(validateEngineConfig(c).join(" ")).toMatch(/ordered aggressive/)
    })

    it.each(MARGIN_TIER_KEYS)("rejects %s outside 0..1", (key) => {
      const c = draft()
      c.margin_tiers = { ...c.margin_tiers, [key]: 1.4 }
      expect(validateEngineConfig(c).length).toBeGreaterThan(0)
    })

    it("🔴 rejects the exact payload the AD9 defect allowed", () => {
      // An agent's browser used to be able to POST this straight into
      // computeQuote via body.config. getActiveConfig() closed that route; this
      // asserts the same payload cannot get in through the front door either.
      const c = draft()
      c.margin_tiers = { aggressive: 0, standard: 0, generous: 0 }
      expect(validateEngineConfig(c).length).toBeGreaterThan(0)
    })
  })

  describe("percentages and rates", () => {
    it.each(["overhead_rate_pct", "refining_rate_pct", "yield_loss_pct"] as const)(
      "rejects %s expressed as a percent rather than a fraction",
      (key) => {
        const c = draft()
        // 8 meaning "8%" is the mistake this rule exists to catch — it would
        // charge 800% overhead and silently drive every net value negative.
        c[key] = 8
        expect(validateEngineConfig(c).join(" ")).toMatch(new RegExp(key))
      }
    )

    it("rejects a negative flat rate", () => {
      const c = draft()
      c.logistics_rate_per_km = -1
      expect(validateEngineConfig(c).join(" ")).toMatch(/logistics_rate_per_km/)
    })

    it("accepts a zero rate — free is a legitimate setting", () => {
      const c = draft()
      c.flat_repackaging_fee = 0
      c.hurdle_rate = 0
      expect(validateEngineConfig(c)).toEqual([])
    })

    it("rejects a cap of zero", () => {
      const c = draft()
      c.cycle_cap = 0
      expect(validateEngineConfig(c).join(" ")).toMatch(/cycle_cap/)
    })

    it("rejects a CostInput whose mode is not one of the two branches", () => {
      const c = draft()
      // @ts-expect-error — deliberately malformed; the action must not trust
      // that a submitted body matches the type.
      c.processing = { mode: "per_pack", rate: 40 }
      expect(validateEngineConfig(c).join(" ")).toMatch(/processing\.mode/)
    })

    it("validates the value inside whichever CostInput branch is used", () => {
      const c = draft()
      c.qa_reuse = { mode: "lump_sum", amount: -5 }
      expect(validateEngineConfig(c).join(" ")).toMatch(/qa_reuse/)
    })
  })

  describe("recovery efficiency", () => {
    it.each(METALS)("rejects %s above 1.0 — you cannot recover more than exists", (metal) => {
      const c = draft()
      c.recovery_efficiency = { ...c.recovery_efficiency, [metal]: 1.2 }
      expect(validateEngineConfig(c).join(" ")).toMatch(new RegExp(`recovery_efficiency.${metal}`))
    })
  })

  describe("chemistry composition", () => {
    it.each(EDITABLE_CHEMISTRIES)("%s: rejects a composition summing above 1.0", (chem) => {
      const c = draft()
      c.chemistry_composition = {
        ...c.chemistry_composition,
        [chem]: { Li: 0.5, Co: 0.5, Ni: 0.5 },
      }
      expect(validateEngineConfig(c).join(" ")).toMatch(
        new RegExp(`chemistry_composition.${chem} sums to`)
      )
    })

    it("allows a composition summing to exactly 1.0 despite float addition", () => {
      // 0.07 + 0.05 + 0.15 + 0.05 + 0.12 + 0.56 does not land on 1 exactly.
      // Without the epsilon this rejects a legitimate config.
      const c = draft()
      c.chemistry_composition = {
        ...c.chemistry_composition,
        NMC622: { Li: 0.07, Co: 0.05, Ni: 0.15, Mn: 0.05, Cu: 0.12, Al: 0.56 },
      }
      expect(validateEngineConfig(c)).toEqual([])
    })

    it("allows a sparse composition — LFP genuinely has no Co, Ni or Mn", () => {
      const c = draft()
      expect(validateEngineConfig(c)).toEqual([])
      expect(c.chemistry_composition.LFP.Co).toBeUndefined()
    })
  })

  it("reports every problem at once, not just the first", () => {
    // The form shows these back to the admin; stopping at the first means a
    // publish takes six round trips to fix six typos.
    const c = draft()
    c.cycle_cap = 0
    c.age_cap = -1
    c.overhead_rate_pct = 8
    expect(validateEngineConfig(c).length).toBeGreaterThanOrEqual(3)
  })
})

describe("tier 3 — the literals a screen cannot move (AD8)", () => {
  it("🔴 damage weights sum to 1.00, asserted by EXERCISING the engine", () => {
    // The task sheet calls this a tier-3 assertion "against the literals in
    // damage.ts". Restating 0.4 + 0.35 + 0.25 here would assert a constant
    // against itself and pass forever. Scoring a maximal battery instead is the
    // only form that fails if someone edits the engine: if the weights sum to
    // 1, three 3s must score exactly 3.
    expect(computeDamageScore({ visual: 3, leakage: 3, thermal: 3 })).toBeCloseTo(3, 10)
    expect(computeDamageScore({ visual: 0, leakage: 0, thermal: 0 })).toBe(0)
  })

  it("TIER3_REFERENCE mirrors the engine's real weights", () => {
    // /config renders TIER3_REFERENCE read-only. This is what stops the screen
    // telling an admin a number the engine no longer uses.
    const { visual, leakage, thermal } = TIER3_REFERENCE.damageWeights
    expect(computeDamageScore({ visual: 1, leakage: 0, thermal: 0 })).toBeCloseTo(visual, 10)
    expect(computeDamageScore({ visual: 0, leakage: 1, thermal: 0 })).toBeCloseTo(leakage, 10)
    expect(computeDamageScore({ visual: 0, leakage: 0, thermal: 1 })).toBeCloseTo(thermal, 10)
  })
})
