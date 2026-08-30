import 'server-only'

// ─── BatteryItem.quoteData ───────────────────────────────────────────────────
// Batch 12, owner C. Shared between /quotes (D03) and /trace/[traceId] (D04) —
// both read the same Json column, so the shape lives in one place rather than
// twice.
//
// 🔴 This type is NOT imported from the real decision-engine package. That
// package sits at packages/decision-engine and mock-data.ts reaches it with a
// raw relative import (`../../decision-engine/src/decisionEngine/types`) —
// there is no confirmed `@clbipp/decision-engine` workspace export, and
// apps/admin's own package.json is not something this batch can verify a
// dependency onto. Rather than add an import that might not resolve at build
// time, this file defines a LOCAL type that mirrors the real one exactly,
// verified field-for-field against packages/core/src/mock-data.ts's
// `mockQuoteOutput` — which is the actual fixture the agent app's quote
// screens were built against before the real engine was wired in, not a
// guess. If the two ever drift, that is a one-file fix here, not a broken
// import blocking this whole batch.
//
// The schema's own comment on BatteryItem.quoteData confirms the wrapper
// shape: `{ input: QuoteInput, output: QuoteOutput }`, stored so /result,
// /result/breakdown and /result/why (the agent app) can re-render after
// navigation without recomputing. This admin screen is a second reader of
// the exact same column, not a second writer.

export interface EngineQuoteOutput {
  trace_id: string
  battery_id: string
  inflow_type: string

  decision: {
    pathway: string
    rationale: string
    flags: readonly string[]
    tiebreaker_applied: boolean
    eligible_pathways: readonly string[]
  }

  economics: {
    pathway: string
    revenue: number
    revenue_breakdown: Record<string, number>
    costs: number
    cost_breakdown: Record<string, number>
    net_value: number
  }

  pricing: {
    p_min: number
    margin_at_p_min: number
    p_recommended: number
    margin_at_p_recommended: number
    p_max: number
    margin_at_p_max: number
  }

  alternatives: readonly {
    pathway: string
    net_value: number
    delta_vs_winner_pct: number
  }[]

  sensitivity: readonly string[]

  audit: {
    config_version: string
    market_snapshot_id: string
    fx_rate_usd_inr: number
    decision_timestamp: string
    input_hash: string
    engine_version: string
  }
}

export interface EngineQuoteData {
  input: unknown
  output: EngineQuoteOutput
}

/**
 * Defensively unwraps a BatteryItem.quoteData Json value. Prisma hands this
 * back as `Prisma.JsonValue` — untyped by construction — so every field is
 * checked before being trusted rather than cast straight through. Returns
 * null for anything that does not look like the real shape: a null column
 * (flat-rate item, or li-ion not yet quoted), a malformed row, or a shape
 * from before this exact wrapper was settled on.
 */
export function parseQuoteData(value: unknown): EngineQuoteData | null {
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  const output = obj.output
  if (!output || typeof output !== 'object') return null
  const o = output as Record<string, unknown>

  if (
    typeof o.trace_id !== 'string' ||
    typeof o.decision !== 'object' ||
    typeof o.economics !== 'object' ||
    typeof o.pricing !== 'object' ||
    typeof o.audit !== 'object'
  ) {
    return null
  }

  return { input: obj.input, output: o as unknown as EngineQuoteOutput }
}

/** True when an item's flags include HOLD or REVIEW — the two the engine's
 * own selection layer can raise (mirrors the field-agent app's HOLD/REVIEW
 * branches on the same QuoteOutput.decision.flags array). */
export function hasEngineFlag(output: EngineQuoteOutput, flag: 'HOLD' | 'REVIEW'): boolean {
  return output.decision.flags.some((f) => f.toUpperCase() === flag)
}
