/**
 * Layer 4C — Recycle Pathway Economics
 *
 * For each metal: metal_mass × recovery_efficiency × metal_price
 * Gross = Σ metal_revenue
 * Revenue = Gross × (1 − yield_loss_pct)
 *
 * Costs = processing (intake) + hydromet + refining + logistics + overhead
 * No QA (pack is shredded).
 *
 * AMBIGUITY: B4 — chemistry_composition tables are placeholder for non-NMC622.
 */

import type {
  Config,
  MarketData,
  Metal,
  PathwayEconomics,
  QuoteInput,
} from "../../types";
import { resolveCost } from "./cost";

const METALS: Metal[] = ["Li", "Co", "Ni", "Mn", "Cu", "Al"];

export function computeRecycleEconomics(
  input: QuoteInput,
  config: Config,
  market: MarketData
): PathwayEconomics {
  const bms = input.battery;
  const composition = config.chemistry_composition[bms.chemistry] ?? {};

  const revenue_breakdown: Record<string, number> = {};
  let gross_revenue = 0;

  for (const metal of METALS) {
    const composition_pct = composition[metal] ?? 0;
    if (composition_pct === 0) continue;

    const metal_mass = bms.weight_kg * composition_pct;
    const recovered_mass = metal_mass * config.recovery_efficiency[metal];
    const metal_revenue = recovered_mass * market.metal_price[metal];

    revenue_breakdown[`metal_${metal}`] = metal_revenue;
    gross_revenue += metal_revenue;
  }

  const revenue = gross_revenue * (1 - config.yield_loss_pct);

  const distance =
    input.distance_km.in + (input.distance_km.out_recycle ?? 0);

  const processing = resolveCost(config.processing, bms.weight_kg);
  const hydromet = resolveCost(config.hydromet, bms.weight_kg);
  const refining = revenue * config.refining_rate_pct;
  const logistics = distance * config.logistics_rate_per_km;
  const overhead = revenue * config.overhead_rate_pct;

  const cost_breakdown: Record<string, number> = {
    processing,
    hydromet,
    refining,
    logistics,
    overhead,
  };
  const costs = Object.values(cost_breakdown).reduce((a, b) => a + b, 0);

  return {
    pathway: "RECYCLE",
    revenue,
    revenue_breakdown,
    costs,
    cost_breakdown,
    net_value: revenue - costs,
  };
}
