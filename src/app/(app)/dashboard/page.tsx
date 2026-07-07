import Link from "next/link"
import { redirect } from "next/navigation"

import { prisma } from "@/lib/prisma"
import { getCurrentProfile } from "@/lib/supabase/auth"

import { ListRow } from "@/components/ui/list-row"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

import type { Pickup } from "@prisma/client"

type DashboardStats = {
  pickupCount: number
  certificateCount: number
  recoveredKg: number
}

function PopulatedDashboardPage({
  pickups,
  stats,
  displayName,
}: {
  pickups: Pickup[]
  stats: DashboardStats
  displayName: string
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Heading */}
      <div>
        <h1 className="font-serif text-2xl font-medium text-[#0E120E]">
          Hello, {displayName}
        </h1>
        <p className="text-sm text-[#666666]">
          Your recovery at a glance
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card variant="elevated">
          <CardContent>
            <div className="font-serif text-xl font-semibold">
              {stats.pickupCount}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-[#666666] mt-1">
              Pickups
            </div>
          </CardContent>
        </Card>

        <Card variant="elevated">
          <CardContent>
            <div className="font-serif text-xl font-semibold"> {stats.recoveredKg} </div>
            <div className="text-[10px] uppercase tracking-widest text-[#666666] mt-1">
              Recovered
            </div>
          </CardContent>
        </Card>

        <Card variant="elevated">
          <CardContent>
            <div className="font-serif text-xl font-semibold">
              {stats.certificateCount}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-[#666666] mt-1">
              Certificates
            </div>
          </CardContent>
        </Card>
      </div>

      <Button variant="primary" fullWidth>
        Request a pickup
      </Button>

      <p className="text-[11px] font-semibold tracking-widest uppercase text-[#666666]">
        Recent Pickups
      </p>

      <div className="flex flex-col gap-2">
        {pickups.map((pickup) => (
          <Link key={pickup.id} href={`/track/${pickup.id}`}>
            <ListRow
              id={pickup.id}
              subtitle={`${pickup.batteryType} · ${pickup.approxQuantity}`}
              status={pickup.status}
            />
          </Link>
        ))}
      </div>
    </div>
  )
}

function EmptyDashboardPage() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center gap-4 p-8 min-h-[70vh]">
      <div className="w-20 h-20 rounded-2xl bg-[#E8E1D2] flex items-center justify-center text-[#6B6F6B]" />

      <h1 className="font-serif text-2xl font-medium text-[#0E120E]">
        No pickups yet
      </h1>

      <p className="text-sm text-[#3B3F3B] max-w-[220px] leading-relaxed">
        Request your first battery pickup to start recovering materials and
        earning EPR certificates.
      </p>

      <Button variant="primary" fullWidth className="max-w-[220px]">
        Request a pickup
      </Button>
    </div>
  )
}

export default async function DashboardPage() {
  const current = await getCurrentProfile()

if (!current || !current.profile) {
  redirect("/login")
}

const { user, profile } = current


  const vendorId = user.id

  const [pickups, certificateCount] = await Promise.all([
    prisma.pickup.findMany({
      where: {
        vendorId,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),

    prisma.certificate.count({
      where: {
        vendorId,
      },
    }),
  ])

  const offers = await prisma.offer.findMany({
  where: { vendorId },
  select: {
    materialBreakdown: true,
  },
  })
  let recoveredKg = 0

for (const offer of offers) {
  const materials = offer.materialBreakdown as Array<{
    weight_kg: number
  }>

  for (const material of materials) {
    recoveredKg += material.weight_kg
  }
}



  const stats: DashboardStats = {
    pickupCount: pickups.length,
    certificateCount,
    recoveredKg,
  }

const displayName =
  profile.company_name ?? profile.full_name
  if (pickups.length === 0) {
    return <EmptyDashboardPage />
  }

  return (
    <PopulatedDashboardPage
      pickups={pickups}
      stats={stats}
      displayName={displayName}
    />
  )
}