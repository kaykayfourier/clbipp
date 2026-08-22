import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@clbipp/auth/server"
import { prisma } from "@clbipp/database"
import { getMarketData } from "@clbipp/core"
import { getQuote, type BookingLineItem } from "@clbipp/core"
import { isLithium } from "@clbipp/core/intake"
import {
  computeQuote,
  EngineValidationError,
  StaleMarketDataError,
} from "@clbipp/decision-engine"

// The D1 branch — li-ion goes through the engine, everything else is priced off
// PricingRate. The list of li-ion families lives in @clbipp/core/intake
// (LI_ION_CHEMISTRIES) so this route and the agent's item screens can never
// disagree about which chemistry takes which path. A local copy here was
// replaced in Batch 3; don't reintroduce one.

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  // ── Non-li-ion path — simple pricing via existing estimateQuote ───────────
  if (!isLithium(body.batteryType)) {
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

    return NextResponse.json(result)
// PathwayDecision persistence happens in Batch 5a when the Offer row is created.
// The full context (packId, inspectionId, factorConfigId) is only available there.

  } catch (err: unknown) {
    if (err instanceof EngineValidationError)
      return NextResponse.json({ error: (err as Error).message }, { status: 422 })
    if (err instanceof StaleMarketDataError)
      return NextResponse.json({ error: "Market data stale" }, { status: 503 })
    throw err
  }
}