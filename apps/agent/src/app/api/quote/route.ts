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
import { getActiveConfig } from "@clbipp/core/engine-config"
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

    const config = await getActiveConfig()

    // 🔴 supplier_id is derived from the PICKUP, never taken from the body.
    //
    // It selects this vendor's margin-tier override (Config.supplier_margin_
    // overrides → computePricingBand's p_recommended), so a client-supplied
    // value would be the AD9 defect wearing a different hat: an agent's browser
    // could name any vendor and pull that vendor's pricing onto this quote.
    // Reading it off Pickup.vendorId costs one indexed lookup and makes the
    // field unspoofable. Before Batch 11 nothing sent supplier_id at all, so
    // the override silently never fired — see buildSupplierMarginOverrides().
    const pickup = body.pickupId
      ? await prisma.pickup.findUnique({
          where: { id: body.pickupId },
          select: { vendorId: true },
        })
      : null

    const result = computeQuote(
      {
        trace_id:    traceId,
        battery:     body.battery,
        damage:      body.damage,
        distance_km: body.distance_km,
        inflow_type: body.inflow_type ?? "external",
        supplier_id: pickup?.vendorId,
      },
      config,
      marketData
    )

    return NextResponse.json(result)
// ⚠ NOTHING persists a `PathwayDecision` row — not here, not in Batch 5a where
// this comment used to promise it would, not anywhere in the repo. The table has
// zero rows and `PathwayDecision.traceId` (added in agent Batch 0a to carry the
// `BatteryItem.traceId` join) has nothing to join to.
//
// It is not a gap anything currently reads around: the engine's full output is
// stored on `BatteryItem.quoteData`, which is what `/trace/[traceId]` and the
// agent's own result tabs render. So this is a dormant table, not a broken
// feature — but the old comment asserted a write that does not exist, which is
// worse than saying nothing. If a real decision ledger is ever wanted, this is
// the call site, and packId / inspectionId / factorConfigId are the context it
// would still need.

  } catch (err: unknown) {
    if (err instanceof EngineValidationError)
      return NextResponse.json({ error: (err as Error).message }, { status: 422 })
    if (err instanceof StaleMarketDataError)
      return NextResponse.json({ error: "Market data stale" }, { status: 503 })
    throw err
  }
}