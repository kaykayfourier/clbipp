/**
 * Layer 4A — Reuse Pathway Economics
 *
 * usable_kWh = capacity_kWh × (SoH / 100)
 *
 * revenue_multiplier:
 *   If RUL available & trustworthy:
 *     ≥24mo → 1.00 ; 12–24mo → 0.85 ; <12mo → 0.65
 *   Else:
 *     age_discount × cycle_discount (both floored)
 *
 * Revenue = usable_kWh × second_life_rate × multiplier × chemistry_mult
 *
 * Costs = processing + qa_reuse + flat_repackaging + logistics + overhead
 *
 * AMBIGUITY: A1 — RUL availability + reliability. Engine auto-fallbacks if absent.
 */

import type {
  BMSData,
  Config,
  PathwayEconomics,
  QuoteInput,
} from "../../types";
import { resolveCost } from "./cost";

function reuseRevenueMultiplier(bms: BMSData): number {
  const rul = bms.remaining_useful_life_months;
  if (rul !== undefined && rul >= 0) {
    if (rul >= 24) return 1.0;
    if (rul >= 12) return 0.85;
    return 0.65;
  }
  // Fallback: age × cycle discount (avoid double-counting per spec)
  const age_discount = Math.max(0.7, 1 - bms.age_years * 0.03);
  const cycle_discount = Math.max(0.75, 1 - bms.cycle_count / 10000);
  return age_discount * cycle_discount;
}

export function computeReuseEconomics(
  input: QuoteInput,
  config: Config
): PathwayEconomics {
  const bms = input.battery;
  const usable_kWh = bms.capacity_kWh * (bms.soh_nominal / 100);
  const multiplier = reuseRevenueMultiplier(bms);
  const chemistry_mult = config.chemistry_mult[bms.chemistry] ?? 1.0;
  const rate = config.second_life_rate_per_kWh[bms.chemistry] ?? 0;

  const revenue = usable_kWh * rate * multiplier * chemistry_mult;

  const distance =
    input.distance_km.in + (input.distance_km.out_reuse ?? 0);

  const processing = resolveCost(config.processing, bms.weight_kg);
  const qa = resolveCost(config.qa_reuse, bms.weight_kg);
  const repackaging = config.flat_repackaging_fee;
  const logistics = distance * config.logistics_rate_per_km;
  const overhead = revenue * config.overhead_rate_pct;

  const cost_breakdown: Record<string, number> = {
    processing,
    qa,
    repackaging,
    logistics,
    overhead,
  };
  const costs = Object.values(cost_breakdown).reduce((a, b) => a + b, 0);

  return {
    pathway: "REUSE",
    revenue,
    revenue_breakdown: { second_life_resale: revenue },
    costs,
    cost_breakdown,
    net_value: revenue - costs,
  };
}
