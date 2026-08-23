// /pickups/[id]/map  —  Batch 8 · Aamir
//
// Where the collection point is, and how to get there. Turn-by-turn navigation
// is CUT (D4/W8): the wireframe asked for it and then specified Leaflet + OSM,
// which does not do turn-by-turn at all. What replaced it is this static map for
// orientation plus a Google Maps deep link that hands off to an app that really
// can navigate.

import { notFound, redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { AppShell, Banner, Button, Card, CardContent, PagePadding } from '@clbipp/ui'

import { mapsHref, toCoord } from '@/lib/job-nav'
import { JobMap } from './JobMap'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const pickup = await prisma.pickup.findUnique({
    where: { id },
    select: {
      id: true,
      agentId: true,
      location: true,
      notes: true,
      scheduledSlot: true,
      vendor: { select: { fullName: true, phone: true, companyName: true } },
      address: {
        select: {
          label: true,
          line1: true,
          line2: true,
          city: true,
          state: true,
          pincode: true,
          lat: true,
          lng: true,
        },
      },
    },
  })

  // 🔴 Ownership in code — Prisma bypasses RLS (D10). An address is a real
  // person's premises, so this check is doing more here than routing hygiene.
  if (!pickup || pickup.agentId !== user.id) notFound()

  const address = pickup.address
  const textAddress = address
    ? [address.line1, address.line2, address.city, address.state, address.pincode]
        .filter(Boolean)
        .join(', ')
    : pickup.location

  // ⚠ BOTH nullable — manual address entry has to stay possible when a vendor
  // denies location permission at booking. No pair means no map, rather than a
  // marker dropped in the Atlantic at 0°N 0°E.
  const lat = toCoord(address?.lat)
  const lng = toCoord(address?.lng)
  const hasCoords = lat !== null && lng !== null

  return (
    <AppShell title="Location" showBack backHref={`/pickups/${pickup.id}`} hideNav>
      <PagePadding className="flex flex-col gap-4">
        {hasCoords ? (
          <JobMap lat={lat} lng={lng} label={textAddress} />
        ) : (
          <Banner variant="info">
            No pin recorded for this address — the vendor entered it by hand.
            Google Maps will still search for it by name.
          </Banner>
        )}

        <Card variant="elevated">
          <CardContent className="flex flex-col gap-2">
            <p className="text-[15px] font-bold text-text-primary">
              {pickup.vendor.companyName ?? pickup.vendor.fullName}
            </p>
            {address?.label && (
              <p className="text-xs uppercase tracking-widest text-text-secondary">
                {address.label}
              </p>
            )}
            <p className="text-sm leading-relaxed text-text-secondary">{textAddress}</p>

            {pickup.scheduledSlot && (
              <p className="text-xs text-text-secondary">
                Scheduled{' '}
                {pickup.scheduledSlot.toLocaleString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            )}

            {pickup.notes && (
              <p className="rounded-[10px] bg-background px-3 py-2 text-xs leading-relaxed text-text-primary">
                {pickup.notes}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          {/* Same helper the job screen uses (@/lib/job-nav), so the two
              "get me there" buttons can never disagree about where there is. */}
          <a
            href={mapsHref(lat, lng, textAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1"
          >
            <Button fullWidth>Open in Google Maps</Button>
          </a>

          {/* Only when there is a number to dial — a dead `tel:` link on a
              field agent's phone is worse than no button. */}
          {pickup.vendor.phone && (
            <a href={`tel:${pickup.vendor.phone}`} className="flex-1">
              <Button variant="secondary" fullWidth>
                Call
              </Button>
            </a>
          )}
        </div>
      </PagePadding>
    </AppShell>
  )
}
