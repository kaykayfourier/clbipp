/**
 * Default Config — Engine-side reference values.
 *
 * ALL VALUES ARE PLACEHOLDERS until confirmed by the commercial / ops team.
 * See docs/AMBIGUITIES.md (sections B and the missing-tables section).
 *
 * The engine treats these as the safe-to-ship defaults. In production, admin
 * overrides every value through the config UI (/admin/config).
 */

import type { Chemistry, Config, Metal } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Chemistry composition (kg per kg of pack weight)
// AMBIGUITY: B4 — only NMC622 implied from spec's worked example. Rest are
//                industry-typical placeholders; commercial team to confirm.
// ─────────────────────────────────────────────────────────────────────────────

export const CHEMISTRY_COMPOSITION: Record<
  Chemistry,
  Partial<Record<Metal, number>>
> = {
  // Derived from spec worked example: 15kg pack →
  //   Li 1.05kg (7%), Co 0.75kg (5%), Ni 2.25kg (15%),
  //   Mn 0.75kg (5%), Cu 1.80kg (12%), Al 2.25kg (15%)
  NMC622: { Li: 0.07, Co: 0.05, Ni: 0.15, Mn: 0.05, Cu: 0.12, Al: 0.15 },

  // PLACEHOLDERS — industry-typical, confirm with commercial team
  NMC811: { Li: 0.07, Co: 0.03, Ni: 0.2, Mn: 0.03, Cu: 0.12, Al: 0.15 },
  LFP: { Li: 0.05, Cu: 0.12, Al: 0.15 }, // no Co/Ni/Mn
  LCO: { Li: 0.07, Co: 0.18, Cu: 0.12, Al: 0.15 },
  NCA: { Li: 0.07, Co: 0.04, Ni: 0.18, Cu: 0.12, Al: 0.15 },

  unknown: {}, // forces RECYCLE via Layer 3
};

// ─────────────────────────────────────────────────────────────────────────────
// Recovery efficiencies — derived from spec worked example
// ─────────────────────────────────────────────────────────────────────────────

export const RECOVERY_EFFICIENCY: Record<Metal, number> = {
  Li: 0.85,
  Co: 0.95,
  Ni: 0.95,
  Mn: 0.9,
  Cu: 0.95,
  Al: 0.92,
};

// ─────────────────────────────────────────────────────────────────────────────
// Revenue rates per chemistry (₹/kWh)
// AMBIGUITY: B3 — placeholder values from spec worked example + wireframe data.
//                Commercial team owns the final numbers.
// ─────────────────────────────────────────────────────────────────────────────

export const SECOND_LIFE_RATE_PER_KWH: Record<Chemistry, number> = {
  NMC622: 8500,
  NMC811: 9200,
  LFP: 6000,
  LCO: 7400,
  NCA: 8800,
  unknown: 0,
};

export const REFURB_PACK_RATE_PER_KWH: Record<Chemistry, number> = {
  NMC622: 6000,
  NMC811: 6800,
  LFP: 4200,
  LCO: 5400,
  NCA: 6400,
  unknown: 0,
};

export const CHEMISTRY_MULT: Record<Chemistry, number> = {
  LFP: 1.1, // strong fit for stationary ESS per spec
  NMC622: 1.0,
  NMC811: 1.0,
  LCO: 0.95,
  NCA: 1.0,
  unknown: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Default full config — every value overridable per quote
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_CONFIG: Config = {
  config_version: "v0.1.0-placeholder",

  processing: { mode: "component", rate: 40 }, // ₹/kg, from worked example
  qa_reuse: { mode: "component", rate: 50 },
  qa_refurb: { mode: "component", rate: 40 },
  flat_repackaging_fee: 0, // AMBIGUITY: B5

  refurb_labor: { mode: "component", rate: 180 }, // spec default
  cell_replacement_rate: 400, // AMBIGUITY: B6 — worked example, not canonical
  soh_restoration_delta: 15, // AMBIGUITY: B7 — universal default

  hydromet: { mode: "component", rate: 60 },
  refining_rate_pct: 0.05,
  yield_loss_pct: 0.05,

  logistics_rate_per_km: 8,
  overhead_rate_pct: 0.08,

  cycle_cap: 3000,
  age_cap: 8,

  recovery_efficiency: RECOVERY_EFFICIENCY,
  chemistry_composition: CHEMISTRY_COMPOSITION,
  second_life_rate_per_kWh: SECOND_LIFE_RATE_PER_KWH,
  refurb_pack_rate_per_kWh: REFURB_PACK_RATE_PER_KWH,
  chemistry_mult: CHEMISTRY_MULT,

  margin_tiers: {
    aggressive: 0.3,
    standard: 0.2,
    generous: 0.1,
  },
  hurdle_rate: 500, // AMBIGUITY: B8 — placeholder, team to confirm
};

export const ENGINE_VERSION = "0.1.0";
