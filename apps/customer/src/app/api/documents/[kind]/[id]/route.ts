import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@clbipp/auth'
import { getDocument, isDocumentKind } from '@/lib/documents'

// ─── GET /api/documents/{certificate|receipt|invoice}/{pickupId} ─────────────
// Streams the PDF bytes for a document the caller owns.
//
// Why bytes and not a signed URL. The three document buckets are private with
// no SELECT policy for `authenticated`, so a signed URL minted with the service
// role was the obvious route (it is how custody photos work). It's the wrong
// one here: a signed URL is a bearer capability that keeps working for an hour
// after it leaves our control — pasted into a chat, sitting in browser history
// — for a document that names a customer and states what they were paid.
// Photos need a URL because an <img> needs one; a download does not. Streaming
// keeps the session as the only key.
//
// Node runtime, not edge: @react-pdf/renderer's renderToBuffer needs Buffer and
// node streams.
export const runtime = 'nodejs'

// Nothing here is cacheable — the response is per-user by definition, and Next
// caching a PDF keyed only by URL would serve one customer's certificate to
// another. Explicit rather than relying on the default for a route with no
// obvious cache signal.
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params

  if (!isDocumentKind(kind)) {
    return NextResponse.json({ error: 'Unknown document type.' }, { status: 404 })
  }

  const current = await getCurrentProfile()
  if (!current?.profile) {
    // In practice the middleware has already bounced a logged-out request to
    // /login before this runs. Kept as a second check that answers in JSON
    // rather than assuming the middleware matcher will always cover /api — an
    // auth check that exists only in middleware is one config edit from gone.
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const result = await getDocument({ kind, pickupId: id, vendorId: current.user.id })

  if (!result.ok) {
    // `not_found` covers both "no such document" and "not yours" — the mapper
    // scopes every query by vendorId, so a foreign id simply matches nothing.
    // Deliberately indistinguishable: a 403 here would confirm that a guessed
    // pickup id exists.
    return NextResponse.json(
      { error: result.reason === 'not_found' ? 'Document not found.' : 'Could not generate the document.' },
      { status: result.reason === 'not_found' ? 404 : 500 },
    )
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      // `inline` so a tap opens the phone's PDF viewer instead of dropping a
      // file in Downloads — the customer usually wants to look at it, and the
      // viewer offers a save button anyway.
      'Content-Disposition': `inline; filename="${result.filename}"`,
      'Content-Length': String(result.buffer.byteLength),
      'Cache-Control': 'private, no-store',
    },
  })
}
