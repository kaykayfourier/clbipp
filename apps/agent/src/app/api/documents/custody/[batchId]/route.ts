// GET /api/documents/custody/[batchId] — the chain-of-custody receipt PDF.
//
// Batch 7b, rebuilt in FV12 (2026-09-27). The first version printed the
// facility's UUID where its name belongs (a TODO waiting on a seed that had
// long since landed), the agent's EMAIL as their name, a per-pickup weight read
// off the superseded `approxWeightKg` column (null for every pickup booked
// since schema v2), and uploaded the PDF twice. It now lists every battery LINE
// with its tag and the box it travelled in — feedback §4.2's records.
//
// Rendered lazily on first download and cached as an object PATH in
// `CustodyBatch.pdfUrl`, the same pipeline receipts and invoices use.
//
// ⚠ Cached in the private `receipts` bucket. It used to target a `documents`
// bucket that create-buckets.ts has never created, so every cache upload
// failed — and the path was written to `pdfUrl` anyway, so every later
// download missed and re-rendered. It is a receipt; it lives with receipts. The
// receipt is the agent's record of the hand-off, so the cached copy is what
// left the van; the hub's later check-in is its own record, on the console.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@clbipp/auth/server"
import { createAdminClient } from "@clbipp/auth/admin"
import { prisma } from "@clbipp/database"
import { renderCustodyPdf } from "@clbipp/pdf"
import { custodyBatchNumber } from "@clbipp/core"
import { categoryLabel } from "@clbipp/core/intake"
import type { CustodyDoc } from "@clbipp/pdf"

// @react-pdf needs Node streams and Buffer (packages/pdf/src/render.tsx).
export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await params

  // Session check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Ownership-scoped read — agent can only fetch their own batch (D10).
  const batch = await prisma.custodyBatch.findFirst({
    where: { id: batchId, agentId: user.id },
    select: {
      id: true,
      batchNo: true,
      handedOffAt: true,
      receivingStaffName: true,
      lat: true,
      lng: true,
      pdfUrl: true,
      facility: { select: { name: true } },
      agent: { select: { fullName: true } },
      pickups: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          vendor: { select: { fullName: true, companyName: true } },
          collectionRun: { select: { runNo: true } },
          items: {
            orderBy: { createdAt: "asc" },
            select: {
              category: true,
              quantity: true,
              weightKg: true,
              confirmedWeightKg: true,
              untaggedReason: true,
              tag: { select: { code: true, container: { select: { code: true, label: true } } } },
            },
          },
        },
      },
    },
  })

  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const admin = createAdminClient()
  const BUCKET = "receipts"

  // Lazy generation — serve the cached PDF if it exists
  if (batch.pdfUrl) {
    const { data, error } = await admin.storage.from(BUCKET).download(batch.pdfUrl)
    if (!error && data) {
      const buffer = await data.arrayBuffer()
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${batch.pdfUrl.split("/").pop()}"`,
        },
      })
    }
  }

  // The seeded batch carries a real batch_no; a drop-off made in the app does
  // too. custodyBatchNumber() is the fallback for a row that somehow has none.
  const batchNo = batch.batchNo || custodyBatchNumber({ batchId: batch.id, handedOffAt: batch.handedOffAt })

  const weightOf = (i: { confirmedWeightKg: unknown; weightKg: unknown }) => {
    const n = Number(i.confirmedWeightKg ?? i.weightKg ?? 0)
    return Number.isFinite(n) ? n : 0
  }

  const pickups: CustodyDoc["pickups"] = batch.pickups.map((p) => ({
    pickupId: p.id,
    vendorName: p.vendor.companyName ?? p.vendor.fullName,
    weightKg: p.items.reduce((s, i) => s + weightOf(i), 0),
    lines: p.items.map((i) => ({
      description: `${categoryLabel(i.category)} × ${i.quantity}`,
      weightKg: weightOf(i),
      tagCode: i.tag?.code ?? null,
      containerCode: i.tag?.container?.code ?? null,
      untaggedReason: i.untaggedReason,
    })),
  }))

  const containers = new Map<string, { code: string; label: string }>()
  for (const p of batch.pickups) {
    for (const i of p.items) if (i.tag?.container) containers.set(i.tag.container.code, i.tag.container)
  }

  const doc: CustodyDoc = {
    batchNo,
    agentName: batch.agent.fullName,
    facilityName: batch.facility.name,
    handedOffAt: batch.handedOffAt,
    lat: batch.lat ? Number(batch.lat) : null,
    lng: batch.lng ? Number(batch.lng) : null,
    totalWeightKg: Math.round(pickups.reduce((s, p) => s + p.weightKg, 0) * 10) / 10,
    receivingStaffName: batch.receivingStaffName,
    runNos: [...new Set(batch.pickups.map((p) => p.collectionRun?.runNo).filter((r): r is string => Boolean(r)))],
    containers: [...containers.values()],
    pickups,
  }

  const buffer = await renderCustodyPdf(doc)

  // Cache to storage — path only, never a signed URL. ONE upload (the first
  // version uploaded twice, the first time with a Buffer the client rejects).
  const storagePath = `custody/${batchId}/${batchNo}.pdf`
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, new Uint8Array(buffer), { contentType: "application/pdf", upsert: true })

  if (uploadError) {
    // A failed cache is not a failed download — serve what was rendered.
    console.error("[custody-pdf] storage upload failed:", uploadError.message)
  } else {
    await prisma.custodyBatch.update({ where: { id: batchId }, data: { pdfUrl: storagePath } })
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${batchNo}.pdf"`,
    },
  })
}
