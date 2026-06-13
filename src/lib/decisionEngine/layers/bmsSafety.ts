/**
 * Layer 2 — BMS Safety Assessment
 *
 * IF entropy_anomalies_count > 3
 *    OR temperature_history_max_c > 55
 *    OR ir_imbalance_ratio > 1.5:
 *      eligible ∩= {RECYCLE}
 * ELSE IF voltage_imbalance_mv > 150:
 *      eligible ∩= {REFURBISH, RECYCLE}
 *
 * Also: confidence guard — if SoH band > 0.10, flag for RETEST_SOH (engine
 * still runs but caller may choose to delay quoting for Reuse).
 *
 * AMBIGUITIES: A3, A5, A6, A7 — semantics of every threshold field depend on
 *              how Entroview actually emits them. Confirm before going live.
 */

import type { BMSData, DecisionFlag, Pathway } from "../types";

const ENTROPY_MAX = 3;
const TEMP_MAX_C = 55;
const IR_IMBALANCE_MAX = 1.5;
const VOLTAGE_IMBALANCE_MV_MAX = 150;
const SOH_CONFIDENCE_BAND_MAX = 0.1;

export interface BMSSafetyResult {
  eligible: Pathway[];
  flags: DecisionFlag[];
}

export function runBMSSafety(
  bms: BMSData,
  currentlyEligible: Pathway[]
): BMSSafetyResult {
  const flags: DecisionFlag[] = [];
  let eligible = [...currentlyEligible];

  const forceRecycle =
    bms.entropy_anomalies_count > ENTROPY_MAX ||
    bms.temperature_history_max_c > TEMP_MAX_C ||
    bms.ir_imbalance_ratio > IR_IMBALANCE_MAX;

  if (forceRecycle) {
    eligible = eligible.filter((p) => p === "RECYCLE");
  } else if (bms.voltage_imbalance_mv > VOLTAGE_IMBALANCE_MV_MAX) {
    // High imbalance is fixable by refurb (cell rebalancing/replacement)
    // but unsafe for direct reuse without intervention.
    eligible = eligible.filter((p) => p !== "REUSE");
  }

  // SoH confidence band check — informational, doesn't drop eligibility,
  // but adds a flag so the caller can decide whether to delay reuse quoting.
  if (
    bms.soh_confidence_low !== undefined &&
    bms.soh_confidence_high !== undefined
  ) {
    const band = bms.soh_confidence_high - bms.soh_confidence_low;
    if (band > SOH_CONFIDENCE_BAND_MAX) {
      flags.push("RETEST_SOH");
    }
  }

  return { eligible, flags };
}
