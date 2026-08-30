import Link from 'next/link'

import { prisma } from '@clbipp/database'
import { categoryLabel, chemistryLabel } from '@clbipp/core/intake'

import { formatIstDate } from '@/lib/ist'
import { loadManifestBuildStock } from '@/lib/lifecycle-units'

import { ManifestBuilder, type BuilderItem } from './ManifestBuilder'

// C03 · New manifest — Batch 6, owner A — Aamir.
//
// The server half: read the stock and the recyclers, hand them to the picker.
// Every rule this screen appears to enforce is re-enforced in `createManifest()`
// — see the header of ManifestBuilder.tsx for why that is not belt-and-braces
// but the actual arrangement (AD3: no RLS behind any of this).
//
// 🔴 The stock rule is NARROWER than /inventory's, deliberately. See
// loadManifestBuildStock() in @/lib/lifecycle-units: this screen asks "what may
// I ship?", and an item already on someone's DRAFT is spoken for, whereas
// /inventory asks "what is physically on hand?" and a draft has moved nothing.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell (AD11, trap 15).

export const dynamic = 'force-dynamic'

export default async function NewManifestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  const [stock, recyclers] = await Promise.all([
    loadManifestBuildStock(),
    prisma.recycler.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        cpcbRegNo: true,
        isActive: true,
        acceptedChemistries: true,
      },
    }),
  ])

  // Facilities that actually have shippable stock. Listing every facility would
  // put empty options in the picker, and the empty state inside the builder
  // already explains a facility that has nothing.
  const facilities = [...new Map(stock.map((s) => [s.facilityId, s.facilityName])).entries()].map(
    ([id, name]) => ({ id, name }),
  )

  // Dates are formatted server-side rather than sent across the RSC boundary as
  // Date objects: @/lib/ist is the single place the console decides its
  // timezone, and it is a server module. A client component formatting its own
  // dates would silently use the BROWSER's timezone.
  const items: BuilderItem[] = stock.map((s) => ({
    itemId: s.itemId,
    pickupId: s.pickupId,
    vendorName: s.vendorName,
    chemistry: s.chemistry,
    chemistryLabel: s.chemistry ? (chemistryLabel(s.chemistry) ?? s.chemistry) : 'Unrecorded',
    categoryLabel: categoryLabel(s.category),
    quantity: s.quantity,
    weightKg: s.weightKg,
    facilityId: s.facilityId,
    facilityName: s.facilityName,
    handedOffLabel: formatIstDate(s.handedOffAt),
  }))

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">
            New manifest
          </h1>
          <p className="mt-1 max-w-[620px] text-xs leading-relaxed text-text-secondary">
            Build a shipment from a facility&rsquo;s tested stock and name a recycler.
          </p>
        </div>
        <Link
          href="/manifests"
          className="inline-flex shrink-0 items-center rounded-lg border border-console-line px-3 py-1.5 text-xs font-bold text-text-primary transition-colors hover:bg-background"
        >
          All manifests
        </Link>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-error-border bg-error-bg px-4 py-3 text-xs leading-relaxed text-error-text"
        >
          {error}
        </div>
      ) : null}

      {facilities.length === 0 ? (
        <div className="rounded-xl border border-console-line bg-surface px-6 py-12 text-center">
          <p className="text-sm font-bold text-text-primary">No shippable stock</p>
          <p className="mx-auto mt-1 max-w-[460px] text-xs leading-relaxed text-text-secondary">
            Nothing is sitting at a facility on a pickup that has reached tested and is not already
            on a manifest. Advance a hub batch on the lifecycle board first — that is the
            <span className="font-mono text-[11px]"> collected → tested </span>
            write, and it is what makes stock shippable.
          </p>
          <Link
            href="/lifecycle"
            className="mt-4 inline-flex items-center rounded-lg bg-primary-black px-3 py-1.5 text-xs font-bold text-primary-green transition-opacity hover:opacity-90"
          >
            Go to lifecycle control
          </Link>
        </div>
      ) : (
        <ManifestBuilder
          facilities={facilities}
          items={items}
          recyclers={recyclers.map((r) => ({
            id: r.id,
            name: r.name,
            cpcbRegNo: r.cpcbRegNo,
            isActive: r.isActive,
            acceptedChemistries: r.acceptedChemistries as string[],
            acceptedLabels: r.acceptedChemistries.map((c) => chemistryLabel(c) ?? c),
          }))}
        />
      )}
    </>
  )
}
