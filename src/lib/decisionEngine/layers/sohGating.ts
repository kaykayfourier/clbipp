/**
 * Layer 3 — SoH Eligibility Gating
 *
 * SoH > 75%      → eligible ∩= {REUSE, REFURBISH, RECYCLE}
 * 50% < SoH ≤ 75% → eligible ∩= {REFURBISH, RECYCLE}
 * SoH ≤ 50%      → eligible ∩= {RECYCLE}
 *
 * Additional filters:
 *  - unknown chemistry → eligible = {RECYCLE}
 *  - cycle_count > cycle_cap → remove REUSE
 *  - age_years > age_cap → remove REUSE
 *
 * AMBIGUITY: E3 — boundary handling at exactly 50.0 / 75.0 (sensor noise).
 *                 Current behaviour: strict per spec. Revisit when we see
 *                 real SoH distributions from Entroview.
 */

import type { BMSData, Config, DecisionFlag, Pathway } from "../types";

export interface SoHGateResult {
  eligible: Pathway[];
  flags: DecisionFlag[];
}

export function runSoHGating(
  bms: BMSData,
  config: Config,
  currentlyEligible: Pathway[]
): SoHGateResult {
  const flags: DecisionFlag[] = [];
  let eligible = [...currentlyEligible];

  // Unknown chemistry → force recycle
  if (bms.chemistry === "unknown") {
    flags.push("UNKNOWN_CHEMISTRY");
    return { eligible: eligible.filter((p) => p === "RECYCLE"), flags };
  }

  // SoH-band filter
  let sohBand: Pathway[];
  if (bms.soh_nominal > 75) {
    sohBand = ["REUSE", "REFURBISH", "RECYCLE"];
  } else if (bms.soh_nominal > 50) {
    sohBand = ["REFURBISH", "RECYCLE"];
  } else {
    sohBand = ["RECYCLE"];
  }
  eligible = eligible.filter((p) => sohBand.includes(p));

  // Additional Reuse filters
  if (bms.cycle_count > config.cycle_cap) {
    eligible = eligible.filter((p) => p !== "REUSE");
  }
  if (bms.age_years > config.age_cap) {
    eligible = eligible.filter((p) => p !== "REUSE");
  }

  return { eligible, flags };
}
