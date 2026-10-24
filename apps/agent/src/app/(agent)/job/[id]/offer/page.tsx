// /job/[id]/offer  —  Batch 5a · Ali, reworked for AF5 (2026-10-24)
//
// The multi-item consequence (plan §2, D5/D7): every item's own price, summed
// into ONE Offer for the pickup by recommendedOfferTotal(). Not in the
// wireframe at all — the wireframe assumed one battery per job.
//
// 🔴 AF5 · FD23 — the agent types no price before presenting. The office sets
// one on /pickups/[id] (it appears here by itself — RefreshWhile), or the agent
// presents the engine's recommendation. After presenting, FD24: the agent may
// re-offer inside the band; above it, the office sets the price again.

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { recommendedOfferTotal } from '@clbipp/core'
import { formatPaise } from '@clbipp/core/format'
import { offerState } from '@clbipp/core/collection'
import { formatBandBp, getNegotiationBandBp, reofferCeilingPaise, sanctionedPricePaise } from '@clbipp/core/negotiation'
import { AppShell, Banner, Button, Card, CardContent, DetailRow, PagePadding, SectionLabel } from '@clbipp/ui'

import { CallOfficeButton } from '@/components/call-office'
import { RefreshWhile } from '@/components/refresh-while'
import { requireSafetyChecklist } from '@/lib/safety-gate'
import { presentOfferAndRedirect, reofferPriceAndRedirect } from './actions'
import { CollectionDateForm } from './CollectionDateForm'

const PATHWAY_LABEL: Record<string, string> = {
  reuse: 'Reuse',
  refurbish: 'Refurbish',
  recycle: 'Recycle',
  dispose: 'Dispose',
}

const BASIS_LABEL: Record<string, string> = { engine: 'Recommended', office: 'Office price', agent: 'Your re-offer' }
const OUTCOME_LABEL: Record<string, string> = { accepted: 'Accepted', declined: 'Declined', superseded: 'Replaced' }

const fieldClass = 'w-full rounded-[10px] border border-border bg-background px-3 text-base text-text-primary'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  const { id } = await params
  const { error, ok } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 🔴 THE GATE.
  await requireSafetyChecklist(id, user.id)

  const pickup = await prisma.pickup.findFirst({
    where: { id, agentId: user.id },
    select: {
      id: true,
      status: true,
      collectionScheduledAt: true,
      offer: { select: { estimatedPrice: true, pathway: true, acceptedAt: true, createdAt: true } },
      items: {
        select: {
          id: true,
          category: true,
          chemistry: true,
          quantity: true,
          pathway: true,
          unitPricePaise: true,
          linePricePaise: true,
          quoteData: true,
        },
      },
      officePrices: {
        orderBy: { setAt: 'desc' },
        take: 1,
        select: { id: true, pricePaise: true, reason: true, acknowledgedAt: true, setter: { select: { fullName: true } } },
      },
      offerRounds: {
        orderBy: { roundNo: 'asc' },
        select: { roundNo: true, pricePaise: true, basis: true, outcome: true },
      },
    },
  })
  if (!pickup) redirect('/')

  const rec = recommendedOfferTotal(pickup.items)
  const office = pickup.officePrices[0] ?? null

  // 🔴 FV3 · FD0. `offered` carries THREE sub-states and no screen works them
  // out for itself — `offerState` in @clbipp/core is the one reading.
  const timing = offerState({
    offerCreatedAt: pickup.offer?.createdAt,
    acceptedAt: pickup.offer?.acceptedAt,
    collectionScheduledAt: pickup.collectionScheduledAt,
  })

  if (pickup.status !== 'arrived' && pickup.offer) {
    if (timing.state === 'awaiting_vendor') {
      const latest = pickup.offerRounds[pickup.offerRounds.length - 1] ?? null
      const declined = latest?.outcome === 'declined'
      // An office price no agent has presented yet (presenting acknowledges it).
      const freshOffice = office && office.acknowledgedAt === null ? office : null
      const bandBp = await getNegotiationBandBp(prisma)
      const sanctioned = sanctionedPricePaise({ enginePaise: rec.totalPaise, officePricePaise: office?.pricePaise })
      const ceiling = reofferCeilingPaise(sanctioned, bandBp)

      return (
        <AppShell title="Offer" showBack backHref={`/job/${id}`} hideNav>
          <PagePadding className="flex flex-col gap-4">
            <RefreshWhile active />
            {error && <Banner variant="error">{error}</Banner>}
            {ok && <Banner variant="success">{ok}</Banner>}
            {declined ? (
              <Banner variant="warning">
                The vendor declined {formatPaise(pickup.offer.estimatedPrice)}. Re-offer below, or call the office.
              </Banner>
            ) : (
              <Banner variant={timing.expired ? 'warning' : 'info'}>
                Offer presented — {formatPaise(pickup.offer.estimatedPrice)},{' '}
                {timing.expired
                  ? 'expired after 7 days. The office will re-confirm the price.'
                  : `waiting for the vendor. Valid ${timing.daysRemaining} more day${timing.daysRemaining === 1 ? '' : 's'}.`}
              </Banner>
            )}

            <SectionLabel>Rounds</SectionLabel>
            <Card variant="elevated">
              <CardContent className="flex flex-col">
                {pickup.offerRounds.map((r, i) => (
                  <DetailRow
                    key={r.roundNo}
                    label={`Round ${r.roundNo} · ${BASIS_LABEL[r.basis] ?? r.basis}`}
                    value={`${formatPaise(r.pricePaise)}${r.outcome ? ` · ${OUTCOME_LABEL[r.outcome] ?? r.outcome}` : ' · With the vendor'}`}
                    last={i === pickup.offerRounds.length - 1}
                  />
                ))}
              </CardContent>
            </Card>

            {freshOffice ? (
              <>
                <SectionLabel>New price from the office</SectionLabel>
                <Card variant="elevated">
                  <CardContent className="flex flex-col gap-3">
                    <div>
                      <p className="font-serif text-xl font-semibold text-text-primary">{formatPaise(freshOffice.pricePaise)}</p>
                      <p className="text-[11px] text-text-secondary">
                        Set by {freshOffice.setter.fullName} · {freshOffice.reason}
                      </p>
                    </div>
                    <form action={reofferPriceAndRedirect} className="flex flex-col gap-2">
                      <input type="hidden" name="pickupId" value={id} />
                      <input type="hidden" name="mode" value="office" />
                      <input type="hidden" name="officePriceId" value={freshOffice.id} />
                      <textarea name="note" rows={2} maxLength={500} placeholder="Your note (optional)" className={`${fieldClass} py-2 text-sm`} />
                      <Button type="submit" variant="primary" fullWidth>
                        {`Present ${formatPaise(freshOffice.pricePaise)}`}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </>
            ) : null}

            <SectionLabel>Re-offer</SectionLabel>
            <Card variant="elevated">
              <CardContent className="flex flex-col gap-3">
                <p className="text-[11px] text-text-secondary">
                  {`You can offer up to ${formatPaise(ceiling)} (${formatBandBp(bandBp)} above ${formatPaise(sanctioned)}). Above that, call the office.`}
                </p>
                <form action={reofferPriceAndRedirect} className="flex flex-col gap-2">
                  <input type="hidden" name="pickupId" value={id} />
                  <input type="hidden" name="mode" value="agent" />
                  <label htmlFor="rupees" className="text-xs font-medium text-text-primary">
                    New price (₹)
                  </label>
                  <input type="number" id="rupees" name="rupees" min="1" step="0.01" inputMode="decimal" required className={`${fieldClass} h-11`} />
                  <label htmlFor="note" className="text-xs font-medium text-text-primary">
                    Note
                  </label>
                  <textarea
                    id="note"
                    name="note"
                    rows={2}
                    maxLength={500}
                    required
                    placeholder="e.g. Vendor asked for ₹52,000; settled at ₹51,000"
                    className={`${fieldClass} py-2 text-sm`}
                  />
                  <Button type="submit" variant="primary" fullWidth>
                    Re-offer
                  </Button>
                </form>
                <CallOfficeButton />
              </CardContent>
            </Card>

            <Link href={`/job/${id}`}>
              <Button variant="secondary" fullWidth>
                Back to job
              </Button>
            </Link>
          </PagePadding>
        </AppShell>
      )
    }

    return (
      <AppShell title="Offer" showBack backHref={`/job/${id}`} hideNav>
        <PagePadding className="flex flex-col gap-4">
          {error && <Banner variant="error">{error}</Banner>}
          {timing.state === 'collection_scheduled' ? (
            <>
              {/* FV3. Accepted, but not going in the van today. The date is the
                  headline because it is the only thing the agent needs from
                  this screen until it arrives. */}
              <Banner variant="success">
                Vendor accepted — {formatPaise(pickup.offer.estimatedPrice)}. Collection booked
                for <b>{formatCollectionDate(pickup.collectionScheduledAt)}</b>.
              </Banner>
              <Link href={`/job/${id}/collect`}>
                <Button variant="primary" fullWidth>
                  Collect now instead
                </Button>
              </Link>
              <CollectionDateForm
                pickupId={id}
                defaultValue={toDateInput(pickup.collectionScheduledAt)}
                label="Change the date"
                cta="Update collection date"
              />
            </>
          ) : (
            <>
              <Banner variant="success">
                Vendor accepted — {formatPaise(pickup.offer.estimatedPrice)}.
              </Banner>
              {/* 🔴 FV3 · FD0 — the feedback's "Collect Today OR Schedule Pickup
                  for Later". Two routes from the same accepted offer. Neither
                  changes the pickup's STATUS: collecting advances it, scheduling
                  only books a date. */}
              <Link href={`/job/${id}/collect`}>
                <Button variant="primary" fullWidth>
                  Collect today
                </Button>
              </Link>
              <CollectionDateForm
                pickupId={id}
                defaultValue=""
                label="Or book it for a later date"
                cta="Schedule collection"
              />
            </>
          )}
          <Link href={`/job/${id}`}>
            <Button variant="secondary" fullWidth>
              Back to job
            </Button>
          </Link>
        </PagePadding>
      </AppShell>
    )
  }

  return (
    <AppShell title="Present offer" showBack backHref={`/job/${id}/items`} hideNav>
      <PagePadding className="flex flex-col gap-4">
        {/* An office price set while the agent waits appears by itself. */}
        <RefreshWhile active />
        {error && <Banner variant="error">{error}</Banner>}

        <SectionLabel>Items in this offer</SectionLabel>
        <Card variant="elevated">
          <CardContent className="flex flex-col">
            {rec.included.map((item, i) => (
              <DetailRow
                key={item.id}
                label={`${item.category}${item.pathway ? ` · ${PATHWAY_LABEL[item.pathway] ?? item.pathway}` : ''}`}
                value={item.linePricePaise === null ? 'Not priced' : formatPaise(item.linePricePaise)}
                last={i === rec.included.length - 1}
              />
            ))}
            {rec.included.length === 0 && (
              <p className="py-2 text-xs text-text-secondary">No items are ready to offer yet.</p>
            )}
          </CardContent>
        </Card>

        {rec.unpriced.length > 0 && (
          <Banner variant="warning">
            {rec.unpriced.length} item{rec.unpriced.length === 1 ? '' : 's'} still need pricing.
          </Banner>
        )}

        {rec.held.length > 0 && (
          <Banner variant="error">
            {rec.held.length} item{rec.held.length === 1 ? '' : 's'} on hold, left out.
            Escalate from the item&rsquo;s price screen.
          </Banner>
        )}

        {/* The engine's figure is a recommendation only (pilot). The vendor
            never sees it; it is stored on the offer for internal comparison. */}
        <div className="flex flex-col gap-1 rounded-[10px] bg-primary-black px-4 py-3.5 text-white">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">
              Recommended total
            </span>
            <span className="font-serif text-xl font-semibold text-primary-green">{formatPaise(rec.totalPaise)}</span>
          </div>
          <span className="text-[11px] text-white/60">Internal. The vendor never sees this.</span>
        </div>

        {office ? (
          <>
            <SectionLabel>Office price</SectionLabel>
            <Card variant="elevated">
              <CardContent className="flex flex-col gap-3">
                <div>
                  <p className="font-serif text-xl font-semibold text-text-primary">{formatPaise(office.pricePaise)}</p>
                  <p className="text-[11px] text-text-secondary">
                    Set by {office.setter.fullName} · {office.reason}
                  </p>
                </div>
                <form action={presentOfferAndRedirect} className="flex flex-col gap-2">
                  <input type="hidden" name="pickupId" value={id} />
                  <input type="hidden" name="officePriceId" value={office.id} />
                  <textarea name="note" rows={2} maxLength={500} placeholder="Your note (optional)" className={`${fieldClass} py-2 text-sm`} />
                  <Button type="submit" variant="primary" fullWidth disabled={!rec.canPresent}>
                    {`Present ${formatPaise(office.pricePaise)}`}
                  </Button>
                </form>
              </CardContent>
            </Card>
            <CallOfficeButton />
          </>
        ) : (
          <>
            <SectionLabel>Price</SectionLabel>
            <p className="px-1 text-[11px] text-text-secondary">
              To change the price, call the office. Their price appears here.
            </p>
            <CallOfficeButton />
            <form action={presentOfferAndRedirect} className="flex flex-col gap-2">
              <input type="hidden" name="pickupId" value={id} />
              <input type="hidden" name="officePriceId" value="" />
              <Button type="submit" variant="primary" fullWidth disabled={!rec.canPresent}>
                {`Present recommended ${formatPaise(rec.totalPaise)}`}
              </Button>
            </form>
          </>
        )}
      </PagePadding>
    </AppShell>
  )
}

/** "20 Sep 2026", or an em dash when there is no date. */
function formatCollectionDate(date: Date | null): string {
  if (!date) return '—'
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Date → "YYYY-MM-DD" for a date input, in LOCAL time (see CollectionDateForm). */
function toDateInput(date: Date | null): string {
  if (!date) return ''
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}
