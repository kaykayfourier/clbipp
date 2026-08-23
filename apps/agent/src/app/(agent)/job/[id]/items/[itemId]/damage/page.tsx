// …/damage  —  Batch 5a · Ali
//
// Li-ion only. Visual 0.40 / Leakage 0.35 / Thermal 0.25 with photo slots —
// matches DamageScores exactly (packages/decision-engine/…/layers/damage.ts).
// job-nav.ts's itemNextHref only ever routes a LITHIUM, CONFIRMED item here;
// the redirect below is the server-side backstop for a stale link or a typed
// URL, same posture as every other guard in this app.

import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { isLithium } from '@clbipp/core/intake'
import { AppShell, Banner, PagePadding } from '@clbipp/ui'

import { requireSafetyChecklist } from '@/lib/safety-gate'
import { itemNextHref } from '@/lib/job-nav'

import { DamageRubricForm } from '../DamageRubricForm'

/** Great-circle distance in km — Haversine, good enough for a logistics estimate. */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; itemId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id, itemId } = await params
  const { error } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 🔴 THE GATE. See items/page.tsx for the full note.
  await requireSafetyChecklist(id, user.id)

  const item = await prisma.batteryItem.findFirst({
    where: { id: itemId, pickupId: id },
    select: { id: true, pickupId: true, chemistry: true },
  })
  if (!item) redirect(`/job/${id}/items`)

  // Not lithium (or not yet confirmed) → this screen doesn't apply. Send them
  // to wherever the item's own next-step logic says, rather than 404 — a stale
  // bookmark shouldn't dead-end the agent.
  if (!isLithium(item.chemistry)) {
    redirect(itemNextHref(id, item.id, item.chemistry))
  }

  // Distance estimate for the engine's logistics cost line. Haversine between
  // the pickup address and the one active facility — a straight-line estimate,
  // not routed distance, and clearly a placeholder: there's no admin-configured
  // per-agent routing in this build. Falls back to 0 km (no address coordinates,
  // or no active facility) rather than blocking the rubric on it.
  const [pickup, facility] = await Promise.all([
    prisma.pickup.findUnique({
      where: { id },
      select: { address: { select: { lat: true, lng: true } } },
    }),
    prisma.facility.findFirst({ where: { isActive: true }, select: { lat: true, lng: true } }),
  ])

  let distanceKm = 0
  if (pickup?.address?.lat != null && pickup.address.lng != null && facility?.lat != null && facility.lng != null) {
    distanceKm =
      Math.round(
        haversineKm(
          { lat: Number(pickup.address.lat), lng: Number(pickup.address.lng) },
          { lat: Number(facility.lat), lng: Number(facility.lng) },
        ) * 10,
      ) / 10
  }

  return (
    <AppShell title="Damage rubric" showBack backHref={`/job/${id}/items/${item.id}`} hideNav>
      <PagePadding className="flex flex-col gap-4">
        {error && <Banner variant="error">{error}</Banner>}
        <DamageRubricForm pickupId={id} itemId={item.id} userId={user.id} distanceKm={distanceKm} />
      </PagePadding>
    </AppShell>
  )
}
