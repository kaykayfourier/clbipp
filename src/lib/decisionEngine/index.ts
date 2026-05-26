/**
 * Decision Engine — Public Entry Point
 *
 * Pure function. No DB, no HTTP, no logging side-effects.
 * Caller is responsible for: persisting QuoteOutput, emitting telemetry,
 * and converting EngineValidationError / StaleMarketDataError into HTTP
 * responses (typically 422 and 503 respectively).
 */

import { DEFAULT_CONFIG, ENGINE_VERSION } from "./defaults";
import { runBMSSafety } from "./layers/bmsSafety";
import { runDamageScoring } from "./layers/damage";
import { computeRecycleEconomics } from "./layers/economics/recycle";
import { computeRefurbishEconomics } from "./layers/economics/refurbish";
import { computeReuseEconomics } from "./layers/economics/reuse";
import { runIntake } from "./layers/intake";
import {
  buildRationale,
  buildSensitivity,
  computePricingBand,
  runSelection,
} from "./layers/selection";
import { runSoHGating } from "./layers/sohGating";
import type {
  Config,
  DecisionFlag,
  MarketData,
  Pathway,
  PathwayEconomics,
  QuoteInput,
  QuoteOutput,
} from "./types";

export * from "./types";
export { DEFAULT_CONFIG } from "./defaults";

/**
 * Hash function over the input bundle for the audit trail.
 * Not cryptographic — just stable identification of "same inputs → same hash"
 * for reproducibility tests.
 */
function hashInputs(
  input: QuoteInput,
  config: Config,
  market: MarketData
): string {
  const blob = JSON.stringify({
    input,
    config_version: config.config_version,
    market_snapshot_id: market.market_snapshot_id,
  });
  // FNV-1a 32-bit hash — fast, deterministic, non-cryptographic.
  let h = 0x811c9dc5;
  for (let i = 0; i < blob.length; i++) {
    h ^= blob.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function computeQuote(
  input: QuoteInput,
  config: Config = DEFAULT_CONFIG,
  market: MarketData
): QuoteOutput {
  // Layer 0 — intake & validation (throws on failure)
  const intake = runIntake(input, config, market);

  const flags: DecisionFlag[] = [];

  // Layer 1 — damage scoring
  const damage = runDamageScoring(input.damage);

  // Layer 2 — BMS safety
  const bmsRes = runBMSSafety(input.battery, damage.eligible);
  flags.push(...bmsRes.flags);

  // Layer 3 — SoH gating
  const sohRes = runSoHGating(input.battery, config, bmsRes.eligible);
  flags.push(...sohRes.flags);

  const eligible = sohRes.eligible;

  // Layer 4 — per-pathway economics
  const economics: PathwayEconomics[] = [];
  if (eligible.includes("REUSE")) {
    economics.push(computeReuseEconomics(input, config));
  }
  if (eligible.includes("REFURBISH")) {
    economics.push(computeRefurbishEconomics(input, config));
  }
  if (eligible.includes("RECYCLE")) {
    economics.push(computeRecycleEconomics(input, config, market));
  }

  // Layer 5 — selection, sanity, pricing
  const selection = runSelection(economics, config);
  flags.push(...selection.flags);

  // Build alternatives list relative to winner
  const winnerNV = selection.winner?.net_value ?? 0;
  const alternatives = selection.alternatives.map((a) => ({
    pathway: a.pathway,
    net_value: a.net_value,
    delta_vs_winner_pct: winnerNV
      ? ((a.net_value - winnerNV) / winnerNV) * 100
      : 0,
  }));

  // Build economics block (winner's) — if no winner (all paths HOLD), use a
  // zeroed placeholder so the output shape is stable.
  const winnerEconomics: PathwayEconomics =
    selection.winner ?? {
      pathway: "RECYCLE", // placeholder; pathway will be null in decision
      revenue: 0,
      revenue_breakdown: {},
      costs: 0,
      cost_breakdown: {},
      net_value: 0,
    };

  // Pricing band — only for external inflow, only when winner is profitable
  const pricing =
    input.inflow_type === "external" && selection.winner && winnerNV > 0
      ? computePricingBand(winnerNV, config, input.supplier_id)
      : undefined;

  const rationale = selection.winner
    ? buildRationale(
        selection.winner,
        selection.alternatives,
        selection.tiebreaker_applied
      )
    : "No eligible pathway after gating layers, or all yielded negative Net Value. HOLD for review.";

  const sensitivity = selection.winner
    ? buildSensitivity(selection.winner, selection.alternatives)
    : [];

  return {
    trace_id: intake.trace_id,
    battery_id: input.battery.battery_id,
    inflow_type: input.inflow_type,
    decision: {
      pathway: selection.winner?.pathway ?? null,
      rationale,
      flags,
      tiebreaker_applied: selection.tiebreaker_applied,
      eligible_pathways: eligible as Pathway[],
    },
    economics: winnerEconomics,
    pricing,
    alternatives,
    sensitivity,
    audit: {
      config_version: config.config_version,
      market_snapshot_id: market.market_snapshot_id,
      fx_rate_usd_inr: market.fx_rate_usd_inr,
      decision_timestamp: new Date().toISOString(),
      input_hash: hashInputs(input, config, market),
      engine_version: ENGINE_VERSION,
    },
  };
}
