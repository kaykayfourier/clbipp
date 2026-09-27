// ─── GET /api/labels/containers[?id=…] — FV11 · FD14 ─────────────────────────
// Permanent QR labels for transport boxes, two to an A4 page. With `id`, one
// box (a replacement label); without, every active box.
//
// Same two gates as /api/labels/tags and /api/exports/compliance.

import { NextResponse } from 'next/server'

import { prisma } from '@clbipp/database'
import { renderContainerLabelsPdf } from '@clbipp/pdf'

import { requireAdmin } from '@/lib/admin-identity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = (new URL(request.url).searchParams.get('id') ?? '').trim()

  const containers = await prisma.transportContainer.findMany({
    where: id ? { id } : { isActive: true },
    select: { code: true, label: true, capacityKg: true },
    orderBy: { code: 'asc' },
  })
  if (containers.length === 0) return NextResponse.json({ error: 'No boxes to print.' }, { status: 404 })

  const pdf = await renderContainerLabelsPdf({
    containers: containers.map((c) => ({
      code: c.code,
      label: c.label,
      capacityKg: c.capacityKg !== null ? Number(c.capacityKg) : null,
    })),
  })

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${id ? containers[0].code : 'transport-boxes'}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
