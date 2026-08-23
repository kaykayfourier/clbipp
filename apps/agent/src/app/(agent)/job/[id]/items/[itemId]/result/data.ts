import { notFound } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { isLithium } from '@clbipp/core/intake'
import { getQuote, type BookingLineItem } from '@clbipp/core'

// ─── Shared result-tab data loading (Batch 5a) ───────────────────────────────
// One place for the two branches every result tab needs: the li-ion item with
// a stored QuoteOutput (rendered 1:1 per the plan), and the non-lithium item
// priced straight off PricingRate with no rubric and no pathway (D1). Both
// return the same shape so Verdict/Breakdown/Why don't each re-derive it.

export type ResultData =
  | {
      kind: 'lithium'
      itemId: string
      pickupId: string
      quantity: number
      output: LithiumOutput
    }
  | {
      kind: 'simple'
      itemId: string
      pickupId: string
      quantity: number
      unitPricePaise: number
      linePricePaise: number
    }

// The subset of QuoteOutput this app actually renders. Kept local (not
// re-imported from @clbipp/decision-engine into three page files) because a
// JSON column round-trip loses the class instances the full type carries
// (EngineValidationError etc.) — this is the plain-data shape that survives it.
export interface LithiumOutput {
  trace_id: string
  decision: {
    pathway: 'REUSE' | 'REFURBISH' | 'RECYCLE' | null
    rationale: string
    flags: string[]
    tiebreaker_applied: boolean
    eligible_pathways: string[]
  }
  economics: {
    pathway: string
    revenue: number
    revenue_breakdown: Record<string, number>
    costs: number
    cost_breakdown: Record<string, number>
    net_value: number
  }
  pricing?: {
    p_min: number
    margin_at_p_min: number
    p_recommended: number
    margin_at_p_recommended: number
    p_max: number
    margin_at_p_max: number
  }
  alternatives: Array<{ pathway: string; net_value: number; delta_vs_winner_pct: number }>
  sensitivity: string[]
  audit: {
    config_version: string
    market_snapshot_id: string
    fx_rate_usd_inr: number
    decision_timestamp: string
    input_hash: string
    engine_version: string
  }
}

/**
 * Load (and, for a non-lithium item, price-if-needed) the data a result tab
 * renders. `notFound()` on anything that isn't this agent's — same posture as
 * every other screen past the gate.
 */
export async function loadResultData(
  pickupId: string,
  itemId: string,
  agentId: string,
): Promise<ResultData> {
  const item = await prisma.batteryItem.findFirst({
    where: { id: itemId, pickupId, pickup: { agentId } },
    select: {
      id: true,
      pickupId: true,
      quantity: true,
      category: true,
      chemistry: true,
      condition: true,
      confirmedCondition: true,
      weightKg: true,
      confirmedWeightKg: true,
      unitPricePaise: true,
      linePricePaise: true,
      quoteData: true,
    },
  })
  if (!item) notFound()

  if (isLithium(item.chemistry)) {
    const quoteData = item.quoteData as { output?: LithiumOutput } | null
    if (!quoteData?.output) notFound() // computing/page.tsx redirects here first
    return {
      kind: 'lithium',
      itemId: item.id,
      pickupId: item.pickupId,
      quantity: item.quantity,
      output: quoteData.output,
    }
  }

  // Non-lithium: price on first view if not already priced. Idempotent — a
  // re-render or a back-navigation just re-reads what's already stored.
  if (item.unitPricePaise === null || item.linePricePaise === null) {
    const lineItem: BookingLineItem = {
      category: item.category,
      quantity: item.quantity,
      weightKg: Number(item.confirmedWeightKg ?? item.weightKg ?? 0),
      condition: item.confirmedCondition ?? item.condition,
      photoUrls: [],
    }
    const quote = await getQuote([lineItem])
    const linePricePaise = quote.totalPaise
    const unitPricePaise = item.quantity > 0 ? Math.round(linePricePaise / item.quantity) : linePricePaise

    await prisma.batteryItem.update({
      where: { id: item.id },
      data: { unitPricePaise, linePricePaise },
    })

    return { kind: 'simple', itemId: item.id, pickupId: item.pickupId, quantity: item.quantity, unitPricePaise, linePricePaise }
  }

  return {
    kind: 'simple',
    itemId: item.id,
    pickupId: item.pickupId,
    quantity: item.quantity,
    unitPricePaise: item.unitPricePaise,
    linePricePaise: item.linePricePaise,
  }
}
