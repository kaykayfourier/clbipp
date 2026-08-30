import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@clbipp/auth'
import { buildComplianceCsv } from '@clbipp/core/compliance-export'

// ─── GET /api/exports/compliance[?year=2026] ─────────────────────────────────
// Batch 9 (B5). Streams the caller's compliance log as CSV, for their CPCB
// return. Built on the Batch 8 document route rather than as a page action:
// same ownership-scoped read, same "stream the bytes, never mint a signed URL"
// rule, same explicit no-cache.
//
// ⚠ This is an API route with NO page and no `loading.tsx`, deliberately. A
// redirect from a route that has a loading boundary travels inside the RSC
// stream and comes back as a 200 with no Location header (the trap Batch 7A
// hit), which would make a guard here impossible to assert. A route handler
// answers with a real status code.
export const runtime = 'nodejs'

// A compliance export is per-user and changes the moment a certificate is
// issued. Caching it by URL would hand one customer another's return, and even
// a correct cache would serve a stale filing — the one document where stale is
// worst.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const current = await getCurrentProfile()
  if (!current?.profile) {
    // The middleware bounces logged-out requests before this runs. Kept as a
    // second check that answers in JSON rather than trusting the matcher — an
    // auth check that lives only in middleware is one config edit from gone.
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const url = new URL(request.url)

  let result
  try {
    result = await buildComplianceCsv({
      vendorId: current.user.id,
      // The request's own origin, so the verification links in the file point at
      // whichever deployment produced it rather than a hard-coded host.
      origin: url.origin,
      year: url.searchParams.get('year'),
    })
  } catch (error) {
    console.error('Compliance export failed:', error)
    return NextResponse.json({ error: 'Could not build the export.' }, { status: 500 })
  }

  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      // charset spelled out: the material names are ASCII today, but a vendor
      // name or a future column will not be, and Excel guesses badly.
      'Content-Type': 'text/csv; charset=utf-8',
      // `attachment`, not `inline` as the PDFs use — nobody reads a CSV in a
      // browser tab, they open it in a spreadsheet.
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
