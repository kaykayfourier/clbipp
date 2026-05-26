/**
 * Layer 0 — Intake & Validation
 *
 * - Generate trace_id (format: TRC-YYYY-NNNN) if not provided
 * - Validate required fields, plausible ranges, market freshness, config version
 * - On failure: throw EngineValidationError (caller routes to exception queue)
 */

import {
  EngineValidationError,
  StaleMarketDataError,
  type Config,
  type MarketData,
  type QuoteInput,
} from "../types";

const MARKET_FRESHNESS_MAX_HOURS = 24;

export interface IntakeResult {
  trace_id: string;
  intake_timestamp: string;
}

let traceCounter = 0;

/** Reset counter — exposed for tests only. Not used in production. */
export function _resetTraceCounter(): void {
  traceCounter = 0;
}

function generateTraceId(): string {
  traceCounter += 1;
  const year = new Date().getFullYear();
  const seq = String(traceCounter).padStart(4, "0");
  return `TRC-${year}-${seq}`;
}

export function runIntake(
  input: QuoteInput,
  config: Config,
  market: MarketData
): IntakeResult {
  // Battery field presence + ranges
  const b = input.battery;
  if (b.soh_nominal < 0 || b.soh_nominal > 100) {
    throw new EngineValidationError("battery.soh_nominal", "must be 0–100");
  }
  if (b.capacity_kWh <= 0) {
    throw new EngineValidationError("battery.capacity_kWh", "must be > 0");
  }
  if (b.weight_kg <= 0) {
    throw new EngineValidationError("battery.weight_kg", "must be > 0");
  }
  if (b.age_years < 0) {
    throw new EngineValidationError("battery.age_years", "must be ≥ 0");
  }
  if (b.cycle_count < 0) {
    throw new EngineValidationError("battery.cycle_count", "must be ≥ 0");
  }
  if (b.entropy_anomalies_count < 0) {
    throw new EngineValidationError(
      "battery.entropy_anomalies_count",
      "must be ≥ 0"
    );
  }

  // Damage scores 0..3
  const d = input.damage;
  for (const [k, v] of Object.entries(d)) {
    if (v < 0 || v > 3) {
      throw new EngineValidationError(`damage.${k}`, "must be 0–3");
    }
  }

  // Distance
  if (input.distance_km.in < 0) {
    throw new EngineValidationError("distance_km.in", "must be ≥ 0");
  }

  // Market freshness
  const snapshotMs = Date.parse(market.snapshot_timestamp);
  if (Number.isNaN(snapshotMs)) {
    throw new EngineValidationError(
      "market.snapshot_timestamp",
      "invalid ISO timestamp"
    );
  }
  const ageHours = (Date.now() - snapshotMs) / 3_600_000;
  if (ageHours > MARKET_FRESHNESS_MAX_HOURS) {
    // AMBIGUITY: E7 — fail closed vs fail open. Currently: fail closed.
    throw new StaleMarketDataError(market.snapshot_timestamp, ageHours);
  }

  // Config version present
  if (!config.config_version) {
    throw new EngineValidationError(
      "config.config_version",
      "config must be versioned"
    );
  }

  // Inflow type
  if (input.inflow_type !== "internal" && input.inflow_type !== "external") {
    throw new EngineValidationError(
      "inflow_type",
      "must be 'internal' or 'external'"
    );
  }

  const trace_id = b.trace_id ?? generateTraceId();
  const intake_timestamp = b.intake_timestamp ?? new Date().toISOString();

  return { trace_id, intake_timestamp };
}
