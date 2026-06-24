/**
 * Decision Engine — Type Definitions
 *
 * All input and output shapes for the CLBIPP Module 2 engine.
 * See docs/AMBIGUITIES.md for fields whose semantics are still being confirmed.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Inputs: Battery (from Module 1 / Entroview / BMS)
// ─────────────────────────────────────────────────────────────────────────────

export type Chemistry =
  | "LFP"
  | "NMC622"
  | "NMC811"
  | "LCO"
  | "NCA"
  | "unknown"; // AMBIGUITY: A8 — Entroview's chemistry naming may not match these

export type InflowType = "internal" | "external";

export interface DamageScores {
  // Layer 1 inputs — inspector-provided, each 0..3
  visual: number; // weight 0.40 (Suzuki IDIS, ISO 12405-4)
  leakage: number; // weight 0.35 (DOT Special Provision 188)
  thermal: number; // weight 0.25 (EUCAR / Suzuki)
}

export interface BMSData {
  // Used in decision logic
  soh_nominal: number; // %, 0..100
  chemistry: Chemistry;
  capacity_kWh: number;
  weight_kg: number;
  age_years: number;
  cycle_count: number;

  // Layer 2 triggers — AMBIGUITY A5/A6/A7: units & semantics need confirmation
  entropy_anomalies_count: number; // AMBIGUITY: A3 — events vs unique cells?
  ir_imbalance_ratio: number; // AMBIGUITY: A5 — max/min, max/mean, or stdev/mean?
  voltage_imbalance_mv: number; // AMBIGUITY: A7 — mV or % of nominal?
  temperature_history_max_c: number; // AMBIGUITY: A6 — lifetime/recent/test-bench?

  // Optional — engine falls back if absent
  remaining_useful_life_months?: number; // AMBIGUITY: A1 — availability & reliability
  soh_confidence_low?: number; // AMBIGUITY: A2 — does Entroview emit a band?
  soh_confidence_high?: number;
  cells_per_pack?: number; // AMBIGUITY: A4 — BMS field or chemistry lookup?

  // Stored for audit only — not used in decision logic
  trace_id?: string;
  battery_id?: string;
  qr_code?: string;
  intake_timestamp?: string;
  inspector_id?: string;
}

export interface QuoteInput {
  battery: BMSData;
  damage: DamageScores;
  distance_km: {
    in: number;
    out_reuse?: number;
    out_refurb?: number;
    out_recycle?: number;
  };
  inflow_type: InflowType;
  supplier_id?: string; // for external — used to look up margin tier override
}

// ─────────────────────────────────────────────────────────────────────────────
// Inputs: Business config (admin-configurable, versioned)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each cost field accepts either a lump-sum (₹) or a component rate.
 * Spec §4.6 — admin picks per field.
 */
export type CostInput =
  | { mode: "lump_sum"; amount: number }
  | { mode: "component"; rate: number };

export interface Config {
  config_version: string; // e.g. "v2026-04-25-r3"

  // ─── Cost rates ───
  // Common (intake) — applies to all pathways, sunk before pathway decision
  processing: CostInput; // ₹/kg or flat

  // QA — post-decision, pathway-dependent
  // AMBIGUITY: B5 — flat_repackaging_fee default missing from spec
  qa_reuse: CostInput; // full certification (highest)
  qa_refurb: CostInput; // post-rebuild verification (medium)
  // No QA cost for recycle — pack is shredded

  flat_repackaging_fee: number; // Reuse only, AMBIGUITY: B5

  // Refurbish-specific
  refurb_labor: CostInput; // default ₹180/kg per spec
  cell_replacement_rate: number; // ₹/cell, AMBIGUITY: B6 — no canonical default in spec
  soh_restoration_delta: number; // default 15, AMBIGUITY: B7 — per-chemistry table missing

  // Recycle-specific
  hydromet: CostInput; // ₹/kg
  refining_rate_pct: number; // default 0.05 (5% of recycle revenue)
  yield_loss_pct: number; // default 0.05 (5% process loss)

  // Common
  logistics_rate_per_km: number; // ₹/km
  overhead_rate_pct: number; // default 0.08 (8% of revenue)

  // ─── Eligibility caps ───
  cycle_cap: number; // default 3000, remove REUSE above
  age_cap: number; // default 8 years, remove REUSE above

  // ─── Recovery & composition tables ───
  recovery_efficiency: Record<Metal, number>; // 0..1
  chemistry_composition: Record<Chemistry, Partial<Record<Metal, number>>>; // kg/kg

  // ─── Revenue rates per chemistry ───
  second_life_rate_per_kWh: Record<Chemistry, number>; // ₹/kWh
  refurb_pack_rate_per_kWh: Record<Chemistry, number>; // ₹/kWh
  chemistry_mult: Record<Chemistry, number>; // application multiplier

  // ─── Margin & pricing ───
  margin_tiers: {
    aggressive: number; // 0.30 (we keep 30%)
    standard: number; // 0.20
    generous: number; // 0.10
  };
  hurdle_rate: number; // ₹, below which winner gets REVIEW flag
  // AMBIGUITY: B8 — hurdle_rate canonical default not in spec

  supplier_margin_overrides?: Record<string, keyof Config["margin_tiers"]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inputs: Market (live or cached, freshness-stamped)
// ─────────────────────────────────────────────────────────────────────────────

export type Metal = "Li" | "Co" | "Ni" | "Mn" | "Cu" | "Al";

export interface MarketData {
  metal_price: Record<Metal, number>; // ₹/kg, FX-converted
  fx_rate_usd_inr: number;
  market_snapshot_id: string; // e.g. "MKT-20260425-0900"
  snapshot_timestamp: string; // ISO 8601
}

// ─────────────────────────────────────────────────────────────────────────────
// Outputs: structured, immutable, auditable
// ─────────────────────────────────────────────────────────────────────────────

export type Pathway = "REUSE" | "REFURBISH" | "RECYCLE";
export type DecisionFlag = "HOLD" | "REVIEW" | "RETEST_SOH" | "UNKNOWN_CHEMISTRY";

export interface PathwayEconomics {
  pathway: Pathway;
  revenue: number;
  revenue_breakdown: Record<string, number>;
  costs: number;
  cost_breakdown: Record<string, number>;
  net_value: number;
}

export interface PricingBand {
  p_min: number;
  margin_at_p_min: number;
  p_recommended: number;
  margin_at_p_recommended: number;
  p_max: number;
  margin_at_p_max: number;
}

export interface AuditTrail {
  config_version: string;
  market_snapshot_id: string;
  fx_rate_usd_inr: number;
  decision_timestamp: string;
  input_hash: string;
  engine_version: string;
}

export interface QuoteOutput {
  trace_id: string;
  battery_id?: string;
  inflow_type: InflowType;

  decision: {
    pathway: Pathway | null; // null when HOLD
    rationale: string;
    flags: DecisionFlag[];
    tiebreaker_applied: boolean;
    eligible_pathways: Pathway[];
  };

  economics: PathwayEconomics;

  // For external: full pricing band
  // For internal: skipped (recovered_value lives in economics.net_value;
  // process/hold determined by hurdle_rate flag)
  pricing?: PricingBand;

  // Other pathways for transparency
  alternatives: Array<{
    pathway: Pathway;
    net_value: number;
    delta_vs_winner_pct: number;
  }>;

  sensitivity: string[]; // human-readable nudges

  audit: AuditTrail;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine errors — thrown by Layer 0, caught by caller
// ─────────────────────────────────────────────────────────────────────────────

export class EngineValidationError extends Error {
  constructor(public field: string, message: string) {
    super(`Validation failed [${field}]: ${message}`);
    this.name = "EngineValidationError";
  }
}

export class StaleMarketDataError extends Error {
  constructor(public snapshot_timestamp: string, public age_hours: number) {
    super(
      `Market data is ${age_hours.toFixed(1)}h old (snapshot: ${snapshot_timestamp}). Max allowed: 24h.`
    );
    this.name = "StaleMarketDataError";
  }
}
