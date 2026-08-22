import type { QuoteOutput } from "../../decision-engine/src/decisionEngine/types"

export const mockQuoteOutput: QuoteOutput = {
  trace_id: "TRC-2026-0001",
  battery_id: "PKP-2026-000102-item-1",
  inflow_type: "external",

  decision: {
    pathway: "REFURBISH",
    rationale: "SoH 72% — within refurbishment range. Damage score 0.4, no safety flags.",
    flags: [],
    tiebreaker_applied: false,
    eligible_pathways: ["REFURBISH", "RECYCLE"],
  },

  economics: {
    pathway: "REFURBISH",
    revenue: 5140,
    revenue_breakdown: {
      refurb_pack_value: 5140,
    },
    costs: 1200,
    cost_breakdown: {
      processing: 300,
      logistics_in: 400,
      logistics_out: 300,
      qa_refurb: 200,
    },
    net_value: 3940,
  },

  pricing: {
    p_min: 2758,
    margin_at_p_min: 0.30,
    p_recommended: 3152,
    margin_at_p_recommended: 0.20,
    p_max: 3546,
    margin_at_p_max: 0.10,
  },

  alternatives: [
    {
      pathway: "RECYCLE",
      net_value: 3572,
      delta_vs_winner_pct: -9.3,
    },
  ],

  sensitivity: [
    "A 10% rise in Ni price would increase net value by ₹180.",
    "Reducing inbound distance by 20 km saves ₹160 in logistics.",
  ],

  audit: {
    config_version: "v2026-04-25-r3",
    market_snapshot_id: "MKT-MOCK-0001",
    fx_rate_usd_inr: 83.2,
    decision_timestamp: new Date().toISOString(),
    input_hash: "mock-hash-not-real",
    engine_version: "1.0.0",
  },
}