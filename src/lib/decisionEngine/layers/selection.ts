/**
 * Layer 5 — Selection, Sanity Checks, Pricing Band
 *
 * Selection: argmax(Net_Value) over eligible pathways.
 * Tiebreaker: when |Δ| / top.net_value < 5%, prefer higher hierarchy
 *             (REUSE > REFURBISH > RECYCLE).
 *
 * Sanity:
 *   net_value < 0          → flag = HOLD
 *   net_value < hurdle     → flag = REVIEW
 *
 * Pricing band (margin as % of Net Value, procurement convention):
 *   P_min = NV × (1 − 0.30)
 *   P_rec = NV × (1 − 0.20)
 *   P_max = NV × (1 − 0.10)
 *
 * Internal stock: no pricing band — caller uses net_value as recovered value
 *                 and hurdle_rate as a process/hold gate.
 */

import type {
  Config,
  DecisionFlag,
  Pathway,
  PathwayEconomics,
  PricingBand,
} from "../types";

const HIERARCHY: Record<Pathway, number> = {
  REUSE: 3,
  REFURBISH: 2,
  RECYCLE: 1,
};

export interface SelectionResult {
  winner: PathwayEconomics | null;
  alternatives: PathwayEconomics[];
  tiebreaker_applied: boolean;
  flags: DecisionFlag[];
}

export function runSelection(
  pathways: PathwayEconomics[],
  config: Config
): SelectionResult {
  if (pathways.length === 0) {
    return {
      winner: null,
      alternatives: [],
      tiebreaker_applied: false,
      flags: ["HOLD"],
    };
  }

  const sorted = [...pathways].sort((a, b) => b.net_value - a.net_value);
  let winner = sorted[0];
  let tiebreaker_applied = false;

  // Tiebreaker check — only between top 2
  if (sorted.length >= 2 && winner.net_value > 0) {
    const delta = Math.abs(winner.net_value - sorted[1].net_value);
    const delta_pct = delta / winner.net_value;
    if (delta_pct < 0.05) {
      const higher =
        HIERARCHY[sorted[1].pathway] > HIERARCHY[winner.pathway]
          ? sorted[1]
          : winner;
      if (higher !== winner) {
        tiebreaker_applied = true;
        winner = higher;
      }
    }
  }

  const alternatives = pathways.filter((p) => p !== winner);
  const flags: DecisionFlag[] = [];

  if (winner.net_value < 0) flags.push("HOLD");
  else if (winner.net_value < config.hurdle_rate) flags.push("REVIEW");

  return { winner, alternatives, tiebreaker_applied, flags };
}

export function computePricingBand(
  net_value: number,
  config: Config,
  supplier_id?: string
): PricingBand {
  const { aggressive, standard, generous } = config.margin_tiers;

  // Per-supplier override may shift the recommended tier
  const overrideTier = supplier_id
    ? config.supplier_margin_overrides?.[supplier_id]
    : undefined;
  // Default: standard. Override only changes the recommended price,
  // not the full band (P_min and P_max stay anchored to the tier extremes).
  const recommended_margin = overrideTier
    ? config.margin_tiers[overrideTier]
    : standard;

  return {
    p_min: net_value * (1 - aggressive),
    margin_at_p_min: aggressive,
    p_recommended: net_value * (1 - recommended_margin),
    margin_at_p_recommended: recommended_margin,
    p_max: net_value * (1 - generous),
    margin_at_p_max: generous,
  };
}

export function buildRationale(
  winner: PathwayEconomics,
  alternatives: PathwayEconomics[],
  tiebreaker_applied: boolean
): string {
  if (alternatives.length === 0) {
    return `Only ${winner.pathway} is eligible after gating layers; Net Value ₹${Math.round(winner.net_value)}.`;
  }

  const runnerUp = [...alternatives].sort((a, b) => b.net_value - a.net_value)[0];
  if (tiebreaker_applied) {
    return `${winner.pathway} chosen via tiebreaker (within 5% of ${runnerUp.pathway}: ₹${Math.round(winner.net_value)} vs ₹${Math.round(runnerUp.net_value)}). Higher hierarchy preferred.`;
  }
  return `${winner.pathway} Net Value (₹${Math.round(winner.net_value)}) exceeds ${runnerUp.pathway} (₹${Math.round(runnerUp.net_value)}).`;
}

export function buildSensitivity(
  winner: PathwayEconomics,
  alternatives: PathwayEconomics[]
): string[] {
  const notes: string[] = [];
  for (const alt of alternatives) {
    if (winner.net_value <= 0) continue;
    const gap_pct = ((winner.net_value - alt.net_value) / winner.net_value) * 100;
    if (gap_pct < 15) {
      notes.push(
        `${alt.pathway} is ${gap_pct.toFixed(1)}% behind — small input swings could flip the decision.`
      );
    }
  }
  return notes;
}
