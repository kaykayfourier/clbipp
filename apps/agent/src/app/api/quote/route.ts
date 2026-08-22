import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@clbipp/auth/server"
import { prisma } from "@clbipp/database"
import { getMarketData } from "../../../../../../packages/core/src/market"
import { getQuote, type BookingLineItem } from "../../../../../../packages/core/src/booking"
import {
  computeQuote,
  EngineValidationError,
  StaleMarketDataError,
} from "../../../../../../packages/decision-engine/src/decisionEngine/index"

const LI_ION_TYPES = ["li_ion_nmc", "li_ion_lfp", "li_ion_nca"]

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  // ── Non-li-ion path — simple pricing via existing estimateQuote ───────────
  if (!LI_ION_TYPES.includes(body.batteryType)) {
    const lineItem: BookingLineItem = {
      category:  body.category,
      quantity:  body.quantity,
      weightKg:  body.weightKg ?? null,
      condition: body.condition,
      photoUrls: body.photoUrls ?? [],
    }
    const result = await getQuote([lineItem])
    return NextResponse.json(result)
  }

  // ── Li-ion path — full decision engine ───────────────────────────────────
  const traceId = `${body.pickupId}-${body.itemId}`

  try {
    const marketData = await getMarketData()

    const result = computeQuote(
      {
        trace_id:   traceId,
        battery:    body.battery,
        damage:     body.damage,
        distance_km: body.distance_km,
        inflow_type: body.inflow_type ?? "external",
        supplier_id: body.supplier_id,
      },
      body.config,
      marketData
    )

    await prisma.pathwayDecision.create({
      data: {
        packId:            body.packId,
        inspectionId:      body.inspectionId,
        factorConfigId:    body.factorConfigId,
        traceId:           traceId,
        pathway:           result.decision.pathway ?? "RECYCLE",
        decisionRationale: result.decision.rationale,
        netRevenue:        result.economics.net_value,
        pMin:              result.pricing?.p_min              ?? null,
        pRecommended:      result.pricing?.p_recommended      ?? null,
        pMax:              result.pricing?.p_max              ?? null,
        costBreakdown:     result.economics.cost_breakdown    as object,
        revenueBreakdown:  result.economics.revenue_breakdown as object,
      },
    })

    return NextResponse.json(result)

  } catch (err: unknown) {
    if (err instanceof EngineValidationError)
      return NextResponse.json({ error: (err as Error).message }, { status: 422 })
    if (err instanceof StaleMarketDataError)
      return NextResponse.json({ error: "Market data stale" }, { status: 503 })
    throw err
  }
}