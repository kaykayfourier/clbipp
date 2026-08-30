// ─── GET /api/exports/compliance[?year=2026] — Batch 13 ──────────────────────
// Admin CPCB export: every vendor, no ownership scope. Reuses
// buildComplianceCsv from @clbipp/core/compliance-export (Batch 8), so this and
// the customer's return are the same bytes from the same builder — the only
// difference is that this one passes no vendorId.
//
// ⚠ Lives at src/app/api/..., mirroring apps/customer/src/app/api/exports/
// compliance/route.ts. It was originally committed at
// `(admin)/exports/compliance.ts/route.ts` — a directory literally named
// `compliance.ts`, inside the page route group — which served it at
// `/exports/compliance.ts` while the screen linked to a third path again. Moved
// 2026-08-30; the convention is the one in CLAUDE.md: API routes at
// apps/<app>/src/app/api/[route]/route.ts.
//
// Two gates, deliberately: src/proxy.ts bounces a non-admin session before this
// runs (the matcher covers /api), and requireAdmin() re-checks the role here.
// Under AD3 there is no RLS behind either — this file reads every vendor's
// certificates through Prisma's table-owner connection.
//
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