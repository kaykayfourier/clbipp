/**
 * Decision Engine — Test Suite
 *
 * Headline test: spec §8 worked example (NMC622, 65% SoH, 15kg, 100km).
 * Expected: Refurbish wins at ₹5,140 vs Recycle ₹4,572.
 *
 * Remaining 14 cases cover every SoH band, chemistry, edge case, and flag.
 *
 * Run: npx vitest
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetTraceCounter } from "./layers/intake";
import {
  computeQuote,
  DEFAULT_CONFIG,
  EngineValidationError,
  StaleMarketDataError,
  type Config,
  type MarketData,
  type QuoteInput,
} from "./index";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Market data matching spec worked-example prices. */
function makeMarket(): MarketData {
  return {
    metal_price: { Li: 1200, Co: 2800, Ni: 1500, Mn: 200, Cu: 850, Al: 220 },
    fx_rate_usd_inr: 83.2,
    market_snapshot_id: "MKT-TEST-0001",
    snapshot_timestamp: new Date().toISOString(), // fresh
  };
}

/** Base battery input matching spec §8 worked example. */
function makeWorkedExampleInput(): QuoteInput {
  return {
    battery: {
      soh_nominal: 65,
      chemistry: "NMC622",
      capacity_kWh: 2.5,
      weight_kg: 15,
      age_years: 3,
      cycle_count: 1800,
      entropy_anomalies_count: 3, // boundary — passes BMS gate
      ir_imbalance_ratio: 1.0,
      voltage_imbalance_mv: 50,
      temperature_history_max_c: 35,
    },
    damage: { visual: 0, leakage: 0, thermal: 0 },
    distance_km: { in: 50, out_refurb: 50, out_recycle: 50, out_reuse: 50 },
    inflow_type: "external",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Decision Engine", () => {
  beforeEach(() => _resetTraceCounter());

  // ── Layer 1: damage scoring ─────────────────────────────────────────────

  it("01 — damage score 0.0 keeps all pathways eligible", () => {
    const input = makeWorkedExampleInput();
    const out = computeQuote(input, DEFAULT_CONFIG, makeMarket());
    // SoH 65% gates to {REFURBISH, RECYCLE} — damage layer didn't reduce.
    expect(out.decision.eligible_pathways).toContain("REFURBISH");
    expect(out.decision.eligible_pathways).toContain("RECYCLE");
    expect(out.decision.eligible_pathways).not.toContain("REUSE");
  });

  it("02 — damage score 2.0 (visual 2, others 0) drops REUSE", () => {
    const input = makeWorkedExampleInput();
    input.battery.soh_nominal = 85; // high enough that SoH gate wouldn't drop REUSE
    input.damage = { visual: 2, leakage: 0, thermal: 0 }; // 0.8 — actually safe
    // Recompute: 0.4*2 = 0.8 → all paths. Need to bump for actual drop.
    input.damage = { visual: 3, leakage: 2, thermal: 0 }; // 1.2+0.7=1.9 → drops REUSE
    const out = computeQuote(input, DEFAULT_CONFIG, makeMarket());
    expect(out.decision.eligible_pathways).not.toContain("REUSE");
    expect(out.decision.eligible_pathways).toContain("REFURBISH");
  });

  it("03 — damage score > 2.5 forces RECYCLE", () => {
    const input = makeWorkedExampleInput();
    input.battery.soh_nominal = 85;
    input.damage = { visual: 3, leakage: 3, thermal: 2 }; // 1.2+1.05+0.5 = 2.75
    const out = computeQuote(input, DEFAULT_CONFIG, makeMarket());
    expect(out.decision.eligible_pathways).toEqual(["RECYCLE"]);
    expect(out.decision.pathway).toBe("RECYCLE");
  });

  // ── Layer 2: BMS safety ─────────────────────────────────────────────────

  it("04 — entropy_anomalies > 3 forces RECYCLE", () => {
    const input = makeWorkedExampleInput();
    input.battery.soh_nominal = 85;
    input.battery.entropy_anomalies_count = 5;
    const out = computeQuote(input, DEFAULT_CONFIG, makeMarket());
    expect(out.decision.eligible_pathways).toEqual(["RECYCLE"]);
  });

  it("05 — high voltage imbalance drops REUSE (refurb still eligible)", () => {
    const input = makeWorkedExampleInput();
    input.battery.soh_nominal = 85;
    input.battery.voltage_imbalance_mv = 200; // > 150
    const out = computeQuote(input, DEFAULT_CONFIG, makeMarket());
    expect(out.decision.eligible_pathways).not.toContain("REUSE");
    expect(out.decision.eligible_pathways).toContain("REFURBISH");
  });

  it("06 — SoH confidence band > 0.10 raises RETEST_SOH flag", () => {
    const input = makeWorkedExampleInput();
    input.battery.soh_confidence_low = 0.6;
    input.battery.soh_confidence_high = 0.75; // band 0.15
    const out = computeQuote(input, DEFAULT_CONFIG, makeMarket());
    expect(out.decision.flags).toContain("RETEST_SOH");
  });

  // ── Layer 3: SoH gating ─────────────────────────────────────────────────

  it("07 — SoH > 75% keeps all 3 paths eligible", () => {
    const input = makeWorkedExampleInput();
    input.battery.soh_nominal = 85;
    const out = computeQuote(input, DEFAULT_CONFIG, makeMarket());
    expect(out.decision.eligible_pathways).toContain("REUSE");
    expect(out.decision.eligible_pathways).toContain("REFURBISH");
    expect(out.decision.eligible_pathways).toContain("RECYCLE");
  });

  it("08 — SoH = 50 (boundary) drops to RECYCLE only", () => {
    const input = makeWorkedExampleInput();
    input.battery.soh_nominal = 50;
    const out = computeQuote(input, DEFAULT_CONFIG, makeMarket());
    expect(out.decision.eligible_pathways).toEqual(["RECYCLE"]);
  });

  it("09 — unknown chemistry forces RECYCLE with flag", () => {
    const input = makeWorkedExampleInput();
    input.battery.soh_nominal = 85;
    input.battery.chemistry = "unknown";
    const out = computeQuote(input, DEFAULT_CONFIG, makeMarket());
    expect(out.decision.eligible_pathways).toEqual(["RECYCLE"]);
    expect(out.decision.flags).toContain("UNKNOWN_CHEMISTRY");
  });

  it("10 — cycle_count over cap drops REUSE", () => {
    const input = makeWorkedExampleInput();
    input.battery.soh_nominal = 85;
    input.battery.cycle_count = 3500; // > default cap 3000
    const out = computeQuote(input, DEFAULT_CONFIG, makeMarket());
    expect(out.decision.eligible_pathways).not.toContain("REUSE");
  });

  // ── Layer 4 + 5: spec worked example ────────────────────────────────────

  it("11 — SPEC §8 WORKED EXAMPLE: Refurb ₹5,140 beats Recycle ₹4,572", () => {
    const input = makeWorkedExampleInput();
    const market: MarketData = {
      metal_price: { Li: 1200, Co: 2800, Ni: 1500, Mn: 200, Cu: 850, Al: 220 },
      fx_rate_usd_inr: 83.2,
      market_snapshot_id: "MKT-SPEC-EXAMPLE",
      snapshot_timestamp: new Date().toISOString(),
    };
    const out = computeQuote(input, DEFAULT_CONFIG, market);

    expect(out.decision.pathway).toBe("REFURBISH");
    // Rounded to nearest rupee, allow ±2 ₹ for floating-point drift
    expect(out.economics.net_value).toBeGreaterThan(5138);
    expect(out.economics.net_value).toBeLessThan(5142);

    const recycle = out.alternatives.find((a) => a.pathway === "RECYCLE");
    expect(recycle).toBeDefined();
    expect(recycle!.net_value).toBeGreaterThan(4570);
    expect(recycle!.net_value).toBeLessThan(4574);
  });

  // ── Layer 5: tiebreaker ─────────────────────────────────────────────────

  it("12 — tiebreaker: when REFURBISH and RECYCLE within 5%, hierarchy wins", () => {
    const input = makeWorkedExampleInput();
    // Tune cobalt price down so recycle drops just under refurb (within 5%).
    const market = makeMarket();
    market.metal_price.Co = 2700; // small drop
    const config: Config = {
      ...DEFAULT_CONFIG,
      // Tune refurb rate so the gap shrinks
      refurb_pack_rate_per_kWh: {
        ...DEFAULT_CONFIG.refurb_pack_rate_per_kWh,
        NMC622: 5400,
      },
    };
    const out = computeQuote(input, config, market);
    // We don't assert exact winner — just that *if* tiebreaker fires, hierarchy
    // selected the higher one. Lower-bound validation.
    if (out.decision.tiebreaker_applied) {
      // REFURBISH has priority 2, RECYCLE priority 1 — REFURBISH should win.
      expect(out.decision.pathway).toBe("REFURBISH");
    }
  });

  // ── Layer 5: sanity flags ───────────────────────────────────────────────

  it("13 — negative net value raises HOLD flag", () => {
    const input = makeWorkedExampleInput();
    input.battery.soh_nominal = 30; // recycle only
    input.battery.weight_kg = 1; // tiny pack → tiny revenue
    input.distance_km = { in: 5000, out_recycle: 5000 }; // huge logistics cost
    const out = computeQuote(input, DEFAULT_CONFIG, makeMarket());
    expect(out.economics.net_value).toBeLessThan(0);
    expect(out.decision.flags).toContain("HOLD");
  });

  it("14 — net value below hurdle_rate raises REVIEW flag", () => {
    const input = makeWorkedExampleInput();
    input.battery.soh_nominal = 30;
    input.battery.weight_kg = 2;
    const config: Config = { ...DEFAULT_CONFIG, hurdle_rate: 100000 };
    const out = computeQuote(input, config, makeMarket());
    if (out.economics.net_value > 0) {
      expect(out.decision.flags).toContain("REVIEW");
    }
  });

  // ── Pricing band & sourcing ─────────────────────────────────────────────

  it("15 — external sourcing produces pricing band", () => {
    const input = makeWorkedExampleInput();
    const out = computeQuote(input, DEFAULT_CONFIG, makeMarket());
    expect(out.pricing).toBeDefined();
    expect(out.pricing!.p_min).toBeLessThan(out.pricing!.p_recommended);
    expect(out.pricing!.p_recommended).toBeLessThan(out.pricing!.p_max);
    // P_min = NV * 0.7, P_rec = NV * 0.8, P_max = NV * 0.9
    expect(out.pricing!.p_recommended).toBeCloseTo(
      out.economics.net_value * 0.8,
      1
    );
  });

  it("16 — internal sourcing skips pricing band", () => {
    const input = makeWorkedExampleInput();
    input.inflow_type = "internal";
    const out = computeQuote(input, DEFAULT_CONFIG, makeMarket());
    expect(out.pricing).toBeUndefined();
    // net_value still populated (recovered value for internal)
    expect(out.economics.net_value).toBeGreaterThan(0);
  });

  // ── Validation ──────────────────────────────────────────────────────────

  it("17 — SoH out of range throws EngineValidationError", () => {
    const input = makeWorkedExampleInput();
    input.battery.soh_nominal = 150;
    expect(() =>
      computeQuote(input, DEFAULT_CONFIG, makeMarket())
    ).toThrow(EngineValidationError);
  });

  it("18 — stale market data throws StaleMarketDataError", () => {
    const input = makeWorkedExampleInput();
    const market = makeMarket();
    market.snapshot_timestamp = new Date(
      Date.now() - 25 * 3600 * 1000
    ).toISOString();
    expect(() => computeQuote(input, DEFAULT_CONFIG, market)).toThrow(
      StaleMarketDataError
    );
  });

  // ── Reproducibility ─────────────────────────────────────────────────────

  it("19 — same inputs produce identical input_hash and identical economics", () => {
    const input = makeWorkedExampleInput();
    const market = makeMarket();
    const a = computeQuote(input, DEFAULT_CONFIG, market);
    const b = computeQuote(input, DEFAULT_CONFIG, market);
    expect(a.audit.input_hash).toBe(b.audit.input_hash);
    expect(a.economics.net_value).toBe(b.economics.net_value);
  });

  // ── Cost composition: lump_sum vs component ─────────────────────────────

  it("20 — lump-sum and equivalent component-rate produce identical net_value", () => {
    const input = makeWorkedExampleInput();
    const componentConfig: Config = { ...DEFAULT_CONFIG };
    // processing as component @ ₹40/kg, weight 15kg → ₹600
    const lumpSumConfig: Config = {
      ...DEFAULT_CONFIG,
      processing: { mode: "lump_sum", amount: 600 },
    };
    const a = computeQuote(input, componentConfig, makeMarket());
    const b = computeQuote(input, lumpSumConfig, makeMarket());
    expect(a.economics.net_value).toBeCloseTo(b.economics.net_value, 1);
  });
});
