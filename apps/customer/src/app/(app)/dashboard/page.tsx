import Link from "next/link"
import { redirect } from "next/navigation"

import { prisma } from "@clbipp/database"
import { getCurrentProfile } from "@clbipp/auth"
import { aggregateMaterials, formatPaise, type RecoveredMaterial } from "@clbipp/core"
import { ListRow } from "@clbipp/ui"
import { Button } from "@clbipp/ui"
import { Card, CardContent, DetailRow, SectionLabel } from "@clbipp/ui"
import type { Pickup } from "@clbipp/database"
import { AddressChip } from "../addresses/AddressChip"
import { pickupHref, pickupSubtitle } from "@/lib/pickup-nav"

// A Pickup plus its line count. `pickupSubtitle` and `pickupHref` moved to
// @/lib/pickup-nav in Batch 10, when /history became a second list of these
// same rows — two pickup lists that route or describe differently is a drift
// bug, and the status routing is a Batch 7A decision that deserves one home.
type PickupRow = Pickup & { _count: { items: number } }

/** How many rows the home screen shows before deferring to /history. */
const RECENT_LIMIT = 5

type DashboardStats = {
  pickupCount: number
  certificateCount: number
  recoveredKg: number
}

// Batch 9 (B4). Everything in this card comes from ISSUED CERTIFICATES only —
// the stored `Certificate.co2AvoidedKg` and `materialSummary`, not a live
// recomputation and not anything still in progress.
//
// That is a deliberate limit rather than a shortcut. The same CO₂ figure is
// printed on the EPR certificate PDF, so it is a compliance-adjacent claim;
// counting batteries that are still in a truck towards "avoided" would be
// claiming an outcome that hasn't happened. The heading says where the numbers
// come from and the footnote says they are estimates, so the screen states what
// it is showing instead of implying a measurement. Factors + sources:
// packages/core/src/impact.ts.
type ImpactSummary = {
  co2AvoidedKg: number
  materials: RecoveredMaterial[]
  walletBalancePaise: number
}

function ImpactCard({ impact }: { impact: ImpactSummary }) {
  // Nothing certified yet → no impact to report. An "0 kg CO₂e avoided" tile on
  // a brand-new account reads as a failure rather than as "not yet".
  if (impact.co2AvoidedKg === 0 && impact.materials.length === 0) return null

  return (
    <div className="flex flex-col">
      <SectionLabel>Your impact</SectionLabel>
      <Card variant="elevated" className="mt-3">
        <CardContent className="flex flex-col gap-1">
          <div className="flex flex-col items-center gap-0.5 pb-3">
            <span className="font-serif text-3xl font-semibold text-text-primary">
              {impact.co2AvoidedKg.toLocaleString("en-IN")} kg
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">
              CO₂e avoided
            </span>
          </div>

          {impact.materials.map((material, index) => (
            <DetailRow
              key={material.material}
              label={material.material}
              value={`${material.kg.toLocaleString("en-IN")} kg`}
              last={index === impact.materials.length - 1}
            />
          ))}

          <p className="pt-3 text-[11px] leading-relaxed text-text-secondary">
            From your issued certificates. CO₂e is estimated from published
            recycling factors for each battery chemistry, not a measured figure.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// The wallet has no tab of its own (the bottom bar is fixed at four), so it is
// reached from here and from /profile. Both read `profiles.wallet_balance_paise`
// — the CACHE column that settlePayment writes alongside the WalletTxn ledger in
// one transaction — so the dashboard, the profile and /wallet cannot disagree.
// formatPaise is the app's only ₹ formatter; never a local /100.
function WalletCard({ balancePaise }: { balancePaise: number }) {
  return (
    <Link href="/wallet" className="block">
      <Card variant="elevated">
        <CardContent className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-bold text-text-primary">Wallet</p>
            <p className="text-xs text-text-secondary">Payouts from your pickups</p>
          </div>
          <span className="font-serif text-lg font-semibold text-text-primary">
            {formatPaise(balancePaise)}
          </span>
        </CardContent>
      </Card>
    </Link>
  )
}

function PopulatedDashboardPage({
  pickups,
  stats,
  impact,
  displayName,
  profileId,
}: {
  pickups: PickupRow[]
  stats: DashboardStats
  impact: ImpactSummary
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

      {/* Second priority in the post-login flow, right after requesting a
          pickup — a pickup needs somewhere to collect from. */}
      <Link href="/addresses/new">
        <Button variant="secondary" fullWidth>Add address</Button>
      </Link>

      <WalletCard balancePaise={impact.walletBalancePaise} />

      <ImpactCard impact={impact} />

      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-semibold tracking-widest uppercase text-[#666666]">
          Recent Pickups
        </p>
        {/* The home screen used to render EVERY pickup — an account with forty
            of them scrolled forty rows before reaching the end. */}
        {pickups.length > RECENT_LIMIT && (
          <Link
            href="/history"
            className="text-[11px] font-semibold text-text-primary underline underline-offset-2"
          >
            View all {pickups.length}
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {pickups.slice(0, RECENT_LIMIT).map((pickup) => (
          <Link key={pickup.id} href={pickupHref(pickup.status, pickup.id)}>
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
      {/* Second priority here too, for the same reason as the populated view. */}
      <Link href="/addresses/new" className="w-full max-w-[220px]">
        <Button variant="secondary" fullWidth>
          Add address
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

  const [pickups, certificates, offers, walletProfile] = await Promise.all([
    prisma.pickup.findMany({
      where: { vendorId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { items: true } } },
    }),
    // Batch 9 (B4): the impact card's whole source. Selected rather than counted
    // now, because the count, the CO₂ total and the material list all come out
    // of the same rows — three queries for one table would be careless.
    prisma.certificate.findMany({
      where: { vendorId },
      select: { co2AvoidedKg: true, materialSummary: true },
    }),
    // fixed: scope recovered kg only to recovered/certified pickups
    prisma.offer.findMany({
      where: {
        vendorId,
        pickup: { status: { in: ["recovered", "certified"] } },
      },
      select: { materialBreakdown: true },
    }),
    // The cache column, matching /wallet and /profile. See WalletCard.
    prisma.profile.findUnique({
      where: { id: vendorId },
      select: { walletBalancePaise: true },
    }),
  ])

  const recoveredKg = offers.reduce((sum, offer) => {
    const materials = offer.materialBreakdown as Array<{ weight_kg: number }>
    return sum + materials.reduce((s, m) => s + m.weight_kg, 0)
  }, 0)

  const stats: DashboardStats = {
    pickupCount: pickups.length,
    certificateCount: certificates.length,
    recoveredKg,
  }

  const impact: ImpactSummary = {
    // Prisma hands back a Decimal; Number() it here so no Decimal ever crosses
    // into a component. `co2AvoidedKg` is nullable — a certificate issued before
    // the column existed contributes 0 rather than NaN.
    co2AvoidedKg: Math.round(
      certificates.reduce((sum, cert) => sum + Number(cert.co2AvoidedKg ?? 0), 0),
    ),
    materials: aggregateMaterials(certificates.map((cert) => cert.materialSummary)),
    walletBalancePaise: walletProfile?.walletBalancePaise ?? 0,
  }

  const displayName = profile.company_name ?? profile.full_name

  if (pickups.length === 0) return <EmptyDashboardPage profileId={vendorId} />
  return (
    <PopulatedDashboardPage
      pickups={pickups}
      stats={stats}
      impact={impact}
      displayName={displayName}
      profileId={vendorId}
    />
  )
}