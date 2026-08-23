// /job/[id]  —  Batch 1 · Aamir
//
// An ASSIGNED job, not a pool offer (D2) — so there is no Accept and no
// Decline-into-the-pool. The wireframe's `request-detail` and `navigate` screens
// are both folded in here: turn-by-turn navigation, in-app chat and VoIP call
// are cut (D4), leaving a Google Maps deep link and a `tel:` link.
//
// This is the agent's side of the mirror: they see the full declared load and
// their own fee. Nothing on this screen may leak onto a vendor screen.

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { createSignedUrls } from '@clbipp/auth/storage-server'
import { formatPaise } from '@clbipp/core/format'
import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  DetailRow,
  PagePadding,
  SectionLabel,
  StatusBadge,
  isStageBefore,
} from '@clbipp/ui'

import { mapsHref, toCoord } from '@/lib/job-nav'

import { markArrivedAndContinue } from './actions'

const CATEGORY_LABELS: Record<string, string> = {
  portable: 'Portable',
  automotive: 'Automotive',
  industrial: 'Industrial',
  ev: 'EV',
}

const CONDITION_LABELS: Record<string, string> = {
  healthy: 'Healthy',
  swollen: 'Swollen',
  leaking: 'Leaking',
  dead: 'Dead',
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams

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
      status: true,
      category: true,
      location: true,
      notes: true,
      scheduledSlot: true,
      agentFeePaise: true,
      vendor: { select: { fullName: true, phone: true, companyName: true } },
      address: {
        select: { line1: true, line2: true, city: true, state: true, pincode: true, lat: true, lng: true },
      },
      items: {
        select: {
          id: true,
          category: true,
          quantity: true,
          weightKg: true,
          condition: true,
          photoUrls: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      safetyChecklist: { select: { passed: true } },
    },
  })

  // 🔴 Ownership is enforced HERE, in code — Prisma bypasses RLS (D10), so the
  // agent SELECT policy Batch 8 added for Realtime does NOT back this read up.
  // In-code scoping is the whole boundary. `notFound()` rather than a
  // "not yours" message so the screen doesn't confirm that a given pickup id
  // exists to an agent who has no business knowing.
  if (!pickup || pickup.agentId !== user.id) notFound()

  const address = pickup.address
  const textAddress = address
    ? [address.line1, address.line2, address.city, address.state, address.pincode]
        .filter(Boolean)
        .join(', ')
    : pickup.location

  // The customer's booking photos. Every bucket is private, so a stored path is
  // only viewable through a short-lived signed URL — and signing a path grants
  // access to it, which is why the ownership check above has to come first.
  const photoPaths = pickup.items.flatMap((item) => item.photoUrls)
  const { urls } = await createSignedUrls('pickup-photos', photoPaths)
  const photoUrl = new Map(urls.map((u) => [u.path, u.url]))

  const notYetArrived = isStageBefore(pickup.status, 'arrived')
  const totalUnits = pickup.items.reduce((sum, item) => sum + item.quantity, 0)
  const totalWeightKg = pickup.items.reduce((sum, item) => sum + Number(item.weightKg ?? 0), 0)

  return (
    <AppShell title="Job" showBack backHref="/" hideNav>
      <PagePadding className="flex flex-col gap-4">
        {error && <Banner variant="error">{error}</Banner>}

        {/* ── Who and where ─────────────────────────────────────────────── */}
        <Card variant="elevated">
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-text-primary">
                  {pickup.vendor.companyName ?? pickup.vendor.fullName}
                </p>
                <p className="mt-0.5 font-mono text-xs text-text-secondary">{pickup.id}</p>
              </div>
              <StatusBadge status={pickup.status} />
            </div>

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

            <div className="flex gap-2">
              <a
                href={mapsHref(toCoord(address?.lat), toCoord(address?.lng), textAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <Button variant="secondary" fullWidth>
                  Open in Google Maps
                </Button>
              </a>

              {/* Rendered only when there is a number to dial — a dead `tel:`
                  link on a field agent's phone is worse than no button. */}
              {pickup.vendor.phone && (
                <a href={`tel:${pickup.vendor.phone}`} className="flex-1">
                  <Button variant="secondary" fullWidth>
                    Call
                  </Button>
                </a>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── The agent's fee ───────────────────────────────────────────────
            The inverse of the vendor-visibility rule: the agent sees their own
            money plainly. This is what THEY earn for the job (D3), which is a
            different number from what the vendor is paid for the batteries —
            the copy below says so, because the wireframe's version didn't and
            the two are easy to confuse on site. */}
        <Card variant="elevated">
          <CardContent className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
                Your fee for this job
              </span>
              <span className="font-serif text-lg font-semibold text-text-primary">
                {pickup.agentFeePaise === null ? '—' : formatPaise(pickup.agentFeePaise)}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-text-secondary">
              Paid on collection. Separate from the battery&rsquo;s purchase price
              shown to the vendor, which the pricing engine sets after assessment.
            </p>
          </CardContent>
        </Card>

        {/* ── What the customer declared ────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Declared load</SectionLabel>
            <span className="text-[11px] text-text-secondary">
              {CATEGORY_LABELS[pickup.category] ?? pickup.category} · {totalUnits} unit
              {totalUnits === 1 ? '' : 's'} · ~{totalWeightKg.toFixed(1)} kg
            </span>
          </div>

          <Card variant="elevated">
            <CardContent className="flex flex-col">
              {pickup.items.map((item, index) => (
                <DetailRow
                  key={item.id}
                  label={`${CATEGORY_LABELS[item.category] ?? item.category} × ${item.quantity}`}
                  value={
                    <span className="flex items-center gap-2">
                      <span>{Number(item.weightKg ?? 0).toFixed(1)} kg</span>
                      <Badge variant={item.condition === 'healthy' ? 'default' : 'warning'}>
                        {CONDITION_LABELS[item.condition] ?? item.condition}
                      </Badge>
                    </span>
                  }
                  last={index === pickup.items.length - 1}
                />
              ))}
            </CardContent>
          </Card>

          <p className="text-[11px] leading-relaxed text-text-secondary">
            Declared by the customer at booking. You confirm chemistry, weight and
            condition per item during intake.
          </p>

          {photoPaths.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photoPaths.map((path) => {
                const url = photoUrl.get(path)
                if (!url) return null
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={path}
                    src={url}
                    alt="Customer's photo of the declared batteries"
                    className="aspect-square w-full rounded-[10px] border border-border object-cover"
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* ── The one action ────────────────────────────────────────────────
            A POST, not a <Link>: this advances the lifecycle, and a GET that
            mutates gets fired by link prefetchers and crawlers (the customer
            app's Batch 12 lesson). Once past `scheduled` it becomes a plain
            link onward to the safety checklist, which is the mandatory gate in
            front of intake (W1 / Batch 2). */}
        {notYetArrived ? (
          <form action={markArrivedAndContinue}>
            <input type="hidden" name="pickupId" value={pickup.id} />
            <Button type="submit" variant="primary" fullWidth>
              Arrived on site
            </Button>
          </form>
        ) : (
          <Link href={`/job/${pickup.id}/safety`}>
            <Button variant="primary" fullWidth>
              {pickup.safetyChecklist?.passed
                ? 'Continue to intake'
                : 'Continue to safety checklist'}
            </Button>
          </Link>
        )}

        {pickup.safetyChecklist?.passed && (
          <Banner variant="success">Safety checklist completed for this job.</Banner>
        )}
      </PagePadding>
    </AppShell>
  )
}
