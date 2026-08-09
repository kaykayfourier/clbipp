import Link from "next/link"
import { redirect } from "next/navigation"

import { prisma } from "@clbipp/database"
import { getCurrentProfile } from "@clbipp/auth"
import { ListRow } from "@clbipp/ui"
import { Button } from "@clbipp/ui"
import { Card, CardContent } from "@clbipp/ui"
import type { Pickup } from "@clbipp/database"
import { AddressChip } from "../addresses/AddressChip"
import { CATEGORY_LABELS } from "../book/copy"

function pickupSubtitle(pickup: PickupRow): string {
  const lines = pickup._count.items
  // Seeded and wizard-created pickups both have items; the handful of legacy
  // rows written by the old request form have none, so fall back to the
  // superseded columns rather than showing "0 lines".
  if (lines === 0) {
    return [pickup.batteryType, pickup.approxQuantity].filter(Boolean).join(" · ") || "Pickup"
  }
  return `${CATEGORY_LABELS[pickup.category]} · ${lines} line${lines === 1 ? "" : "s"}`
}

// A Pickup plus its line count. The row subtitle used to read `batteryType` +
// `approxQuantity`, but schema v2 superseded both and the Batch 5 booking wizard
// leaves them null — a new pickup rendered "null · null". Category plus the
// BatteryItem count is the shape that's actually populated now.
type PickupRow = Pickup & { _count: { items: number } }

type DashboardStats = {
  pickupCount: number
  certificateCount: number
  recoveredKg: number
}

function PopulatedDashboardPage({
  pickups,
  stats,
  displayName,
  profileId,
}: {
  pickups: PickupRow[]
  stats: DashboardStats
  displayName: string
  profileId: string
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col items-start gap-2">
        <div>
          <h1 className="font-serif text-2xl font-medium text-[#0E120E]">
            Hello, {displayName}
          </h1>
          <p className="text-sm text-[#666666]">Your recovery at a glance</p>
        </div>
        <AddressChip profileId={profileId} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card variant="elevated">
          <CardContent>
            <div className="font-serif text-xl font-semibold">{stats.pickupCount}</div>
            <div className="text-[10px] uppercase tracking-widest text-[#666666] mt-1">Pickups</div>
          </CardContent>
        </Card>
        <Card variant="elevated">
          <CardContent>
            <div className="font-serif text-xl font-semibold">{stats.recoveredKg} kg</div>
            <div className="text-[10px] uppercase tracking-widest text-[#666666] mt-1">Recovered</div>
          </CardContent>
        </Card>
        <Card variant="elevated">
          <CardContent>
            <div className="font-serif text-xl font-semibold">{stats.certificateCount}</div>
            <div className="text-[10px] uppercase tracking-widest text-[#666666] mt-1">Certificates</div>
          </CardContent>
        </Card>
      </div>

      {/* fixed: Link wraps Button for navigation */}
      <Link href="/book">
        <Button variant="primary" fullWidth>Request a pickup</Button>
      </Link>

      <p className="text-[11px] font-semibold tracking-widest uppercase text-[#666666]">
        Recent Pickups
      </p>

      <div className="flex flex-col gap-2">
        {pickups.map((pickup) => (
          <Link
            key={pickup.id}
            // Status-routed: requested → the request screen, offered → straight
            // to the offer (it's the one stage waiting on the customer, so the
            // row should land on the decision, not on tracking), everything
            // else → tracking.
            href={
              pickup.status === "requested"
                ? `/scheduled?id=${pickup.id}`
                : pickup.status === "offered"
                  ? `/offer?id=${pickup.id}`
                  : `/track/${pickup.id}`
            }
          >
            <ListRow
              id={pickup.id}
              subtitle={pickupSubtitle(pickup)}
              status={pickup.status}
            />
          </Link>
        ))}
      </div>
    </div>
  )
}

function EmptyDashboardPage({ profileId }: { profileId: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center gap-4 p-8 min-h-[70vh]">
      <div className="w-20 h-20 rounded-2xl bg-[#E8E1D2] flex items-center justify-center text-[#6B6F6B]" />
      <h1 className="font-serif text-2xl font-medium text-[#0E120E]">No pickups yet</h1>
      <p className="text-sm text-[#3B3F3B] max-w-[220px] leading-relaxed">
        Request your first battery pickup to start recovering materials and earning EPR certificates.
      </p>
      <Link href="/book">
        <Button variant="primary" fullWidth className="max-w-[220px]">
          Request a pickup
        </Button>
      </Link>
      <AddressChip profileId={profileId} />
    </div>
  )
}

export default async function DashboardPage() {
  const current = await getCurrentProfile()
  if (!current?.profile) redirect("/login")

  const { user, profile } = current
  const vendorId = user.id

  const [pickups, certificateCount, offers] = await Promise.all([
    prisma.pickup.findMany({
      where: { vendorId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { items: true } } },
    }),
    prisma.certificate.count({ where: { vendorId } }),
    // fixed: scope recovered kg only to recovered/certified pickups
    prisma.offer.findMany({
      where: {
        vendorId,
        pickup: { status: { in: ["recovered", "certified"] } },
      },
      select: { materialBreakdown: true },
    }),
  ])

  const recoveredKg = offers.reduce((sum, offer) => {
    const materials = offer.materialBreakdown as Array<{ weight_kg: number }>
    return sum + materials.reduce((s, m) => s + m.weight_kg, 0)
  }, 0)

  const stats: DashboardStats = {
    pickupCount: pickups.length,
    certificateCount,
    recoveredKg,
  }

  const displayName = profile.company_name ?? profile.full_name

  if (pickups.length === 0) return <EmptyDashboardPage profileId={vendorId} />
  return (
    <PopulatedDashboardPage
      pickups={pickups}
      stats={stats}
      displayName={displayName}
      profileId={vendorId}
    />
  )
}