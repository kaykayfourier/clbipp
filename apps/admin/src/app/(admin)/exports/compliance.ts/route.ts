// Admin CPCB export — all vendors, no ownership scope.
// Reuses buildComplianceCsv from @clbipp/core/compliance-export (Batch 8).
// 🔴 No EPR-credit figure (open question 17).

import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-identity"
import { buildComplianceCsv } from "@clbipp/core/compliance-export"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(request.url)

  // Admin export covers ALL vendors — no vendorId filter.
  // buildComplianceCsv accepts an empty string to mean "no vendor scope".
  // Pass a sentinel that the WHERE clause skips.
  let result
  try {
    result = await buildComplianceCsv({
      vendorId: "",
      origin:   url.origin,
      year:     url.searchParams.get("year"),
    })
  } catch (error) {
    console.error("Admin compliance export failed:", error)
    return NextResponse.json({ error: "Could not build the export." }, { status: 500 })
  }

  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control":       "private, no-store",
    },
  })
}