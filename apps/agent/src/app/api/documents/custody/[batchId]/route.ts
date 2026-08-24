import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@clbipp/auth/server"
import { createAdminClient } from "@clbipp/auth/admin"
import { prisma } from "@clbipp/database"
import { renderCustodyPdf } from "@clbipp/pdf"
import { custodyBatchNumber } from "@clbipp/core"
import type { CustodyDoc } from "@clbipp/pdf"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await params

  // Session check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Ownership-scoped read — agent can only fetch their own batch
  const batch = await prisma.custodyBatch.findFirst({
    where: { id: batchId, agentId: user.id },
    include: {
      pickups: {
        include: {
          vendor: { select: { fullName: true, companyName: true } },
        },
      },
    },
  })

  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Lazy generation — serve cached PDF if it exists
  if (batch.pdfUrl) {
    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from("documents")
      .download(batch.pdfUrl)

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

  // Generate fresh
  const batchNo = custodyBatchNumber({ batchId: batch.id, handedOffAt: batch.handedOffAt })

  const doc: CustodyDoc = {
    batchNo,
    agentName: user.email ?? "Unknown agent",
    facilityName: batch.facilityId, // TODO: join to Facility.name once Batch 7a seeds it
    handedOffAt: batch.handedOffAt,
    lat: batch.lat ? Number(batch.lat) : null,
    lng: batch.lng ? Number(batch.lng) : null,
    totalWeightKg: Number(batch.totalWeightKg),
    itemCount: batch.itemCount,
    receivingStaffName: batch.receivingStaffName,
    pickups: batch.pickups.map(p => ({
      pickupId: p.id,
      vendorName: p.vendor.companyName ?? p.vendor.fullName,
      weightKg: p.approxWeightKg ? Number(p.approxWeightKg) : null,
    })),
  }
  
  const buffer = await await renderCustodyPdf(doc)

  // Cache to storage — path only, never a signed URL
  const storagePath = `custody/${batchId}/${batchNo}.pdf`
  const admin = createAdminClient()
  await admin.storage.from("documents").upload(storagePath, buffer, {
    contentType: "application/pdf",
    upsert: true,
  })
  const { error: uploadError } = await admin.storage
  .from("documents")
  .upload(storagePath, new Uint8Array(buffer), {
    contentType: "application/pdf",
    upsert: true,
  })

  if (uploadError) {
    console.error("[custody-pdf] storage upload failed:", uploadError.message)
  }
  // Persist the path so the next download serves the cached copy
  await prisma.custodyBatch.update({
    where: { id: batchId },
    data: { pdfUrl: storagePath },
  })

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${batchNo}.pdf"`,
    },
  })
}