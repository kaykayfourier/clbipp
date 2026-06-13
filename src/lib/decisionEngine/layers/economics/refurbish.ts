/**
 * Layer 4B — Refurbish Pathway Economics
 *
 * post_refurb_SoH = min(95, SoH + soh_restoration_delta)
 * refurb_usable_kWh = capacity_kWh × (post_refurb_SoH / 100)
 *
 * Revenue = refurb_usable_kWh × refurb_pack_rate_per_kWh[chemistry]
 *
 * Costs = processing + refurb_labor + cell_replacement + qa_refurb + logistics + overhead
 *
 * Where cell_replacement = entropy_anomalies_count × cell_replacement_rate.
 *
 * AMBIGUITIES:
 *  A3 — entropy_anomalies_count: events vs unique cells
 *  B6 — cell_replacement_rate canonical default
 *  B7 — soh_restoration_delta per chemistry
 */

import type { Config, PathwayEconomics, QuoteInput } from "../../types";
import { resolveCost } from "./cost";

export function computeRefurbishEconomics(
  input: QuoteInput,
  config: Config
): PathwayEconomics {
  const bms = input.battery;

  const post_refurb_SoH = Math.min(
    95,
    bms.soh_nominal + config.soh_restoration_delta
  );
  const refurb_usable_kWh = bms.capacity_kWh * (post_refurb_SoH / 100);
  const rate = config.refurb_pack_rate_per_kWh[bms.chemistry] ?? 0;
  const revenue = refurb_usable_kWh * rate;

  const distance =
    input.distance_km.in + (input.distance_km.out_refurb ?? 0);

  const processing = resolveCost(config.processing, bms.weight_kg);
  const refurb_labor = resolveCost(config.refurb_labor, bms.weight_kg);
  const cell_replacement =
    bms.entropy_anomalies_count * config.cell_replacement_rate;
  const qa = resolveCost(config.qa_refurb, bms.weight_kg);
  const logistics = distance * config.logistics_rate_per_km;
  const overhead = revenue * config.overhead_rate_pct;

  const cost_breakdown: Record<string, number> = {
    processing,
    refurb_labor,
    cell_replacement,
    qa,
    logistics,
    overhead,
  };
  const costs = Object.values(cost_breakdown).reduce((a, b) => a + b, 0);

  return {
    pathway: "REFURBISH",
    revenue,
    revenue_breakdown: { refurb_pack_resale: revenue },
    costs,
    cost_breakdown,
    net_value: revenue - costs,
  };
}
