// ─── GET /api/labels/tags?batch=ISS-…[&unused=1] — FV10 · FD12 ───────────────
// A printable A4 sheet of one issue batch's battery tags.
//
// Two gates, the same as /api/exports/compliance: src/proxy.ts bounces a
// non-admin session before this runs (its matcher covers /api), and
// requireAdmin() re-checks the role here — under AD3 there is no RLS behind
// either.
//
// Rendered on every request, never cached to storage: a tag sheet is cheap to
// draw (~0.3 s for 30), it contains nothing but codes, and a reprint must
// reflect `unused=1` against the current bindings.

import { NextResponse } from 'next/server'

import { prisma } from '@clbipp/database'
import { renderTagLabelsPdf } from '@clbipp/pdf'

import { requireAdmin } from '@/lib/admin-identity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const batch = (url.searchParams.get('batch') ?? '').trim()
  const unusedOnly = url.searchParams.get('unused') === '1'
  if (!batch) return NextResponse.json({ error: 'Which batch? Pass ?batch=ISS-…' }, { status: 400 })

  const tags = await prisma.itemTag.findMany({
    where: { issueBatch: batch, ...(unusedOnly ? { batteryItemId: null } : {}) },
    select: { code: true, createdAt: true },
    orderBy: { code: 'asc' },
  })
  if (tags.length === 0) return NextResponse.json({ error: 'No tags in that batch.' }, { status: 404 })

  const pdf = await renderTagLabelsPdf({
    issueBatch: batch,
    issuedAt: tags.reduce((min, t) => (t.createdAt < min ? t.createdAt : min), tags[0].createdAt),
    codes: tags.map((t) => t.code),
  })

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      // Inline: the office wants to see it before printing, not hunt for it
      // in a downloads folder.
      'Content-Disposition': `inline; filename="${batch}${unusedOnly ? '-unused' : ''}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
