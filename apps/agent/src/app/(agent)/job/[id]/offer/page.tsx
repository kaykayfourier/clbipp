// /job/[id]/offer  —  Batch 5a · Ali
//
// The multi-item consequence (plan §2, D5/D7): every item's own price, summed
// into ONE Offer for the pickup. Not in the wireframe at all — the wireframe
// assumed one battery per job.

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { isLithium } from '@clbipp/core/intake'
import { formatPaise } from '@clbipp/core/format'
import { offerState } from '@clbipp/core/collection'
import { AppShell, Banner, Button, Card, CardContent, DetailRow, PagePadding, SectionLabel } from '@clbipp/ui'

import { requireSafetyChecklist } from '@/lib/safety-gate'
import { presentOfferAndRedirect } from './actions'
import { CollectionDateForm } from './CollectionDateForm'

const PATHWAY_LABEL: Record<string, string> = {
  reuse: 'Reuse',
  refurbish: 'Refurbish',
  recycle: 'Recycle',
  dispose: 'Dispose',
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
    },
  })
  if (!pickup) redirect('/')

  // Already past this stage — the offer exists, show it read-only rather than
  // re-render a "Present" button that would just be an idempotent no-op click.
  // 🔴 FV3 · FD0. `offered` carries THREE sub-states now and no screen works
  // them out for itself — `offerState` in @clbipp/core is the one reading.
  const timing = offerState({
    offerCreatedAt: pickup.offer?.createdAt,
    acceptedAt: pickup.offer?.acceptedAt,
    collectionScheduledAt: pickup.collectionScheduledAt,
  })

  if (pickup.status !== 'arrived' && pickup.offer) {
    return (
      <AppShell title="Offer" showBack backHref={`/job/${id}`} hideNav>
        <PagePadding className="flex flex-col gap-4">
          {error && <Banner variant="error">{error}</Banner>}
          {timing.state === 'awaiting_vendor' ? (
            <Banner variant={timing.expired ? 'warning' : 'info'}>
              Offer presented — {formatPaise(pickup.offer.estimatedPrice)},{' '}
              {timing.expired
                ? 'expired after 7 days. The office will re-confirm the price.'
                : `waiting for the vendor. Valid ${timing.daysRemaining} more day${timing.daysRemaining === 1 ? '' : 's'}.`}
            </Banner>
          ) : timing.state === 'collection_scheduled' ? (
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

  const holdItems = pickup.items.filter((i) => {
    const output = (i.quoteData as { output?: { decision?: { flags?: string[] } } } | null)?.output
    return isLithium(i.chemistry) && Boolean(output?.decision?.flags?.includes('HOLD'))
  })
  const unpriced = pickup.items.filter((i) => i.unitPricePaise === null || i.linePricePaise === null)
  const included = pickup.items.filter((i) => !holdItems.some((h) => h.id === i.id))
  const total = included.reduce((sum, i) => sum + (i.linePricePaise ?? 0), 0)

  const canPresent = unpriced.length === 0 && included.length > 0

  // Configured, not hardcoded: the company has not given us the number yet.
  // Unset → the button renders disabled and says so, never a dead `tel:` link.
  const officePhone = process.env.NEXT_PUBLIC_OFFICE_PHONE ?? null

  return (
    <AppShell title="Present offer" showBack backHref={`/job/${id}/items`} hideNav>
      <PagePadding className="flex flex-col gap-4">
        {error && <Banner variant="error">{error}</Banner>}

        <SectionLabel>Items in this offer</SectionLabel>
        <Card variant="elevated">
          <CardContent className="flex flex-col">
            {included.map((item, i) => (
              <DetailRow
                key={item.id}
                label={`${item.category}${item.pathway ? ` · ${PATHWAY_LABEL[item.pathway] ?? item.pathway}` : ''}`}
                value={item.linePricePaise === null ? 'Not priced' : formatPaise(item.linePricePaise)}
                last={i === included.length - 1}
              />
            ))}
            {included.length === 0 && (
              <p className="py-2 text-xs text-text-secondary">No items are ready to offer yet.</p>
            )}
          </CardContent>
        </Card>

        {unpriced.length > 0 && (
          <Banner variant="warning">
            {unpriced.length} item{unpriced.length === 1 ? '' : 's'} still need pricing.
          </Banner>
        )}

        {holdItems.length > 0 && (
          <Banner variant="error">
            {holdItems.length} item{holdItems.length === 1 ? '' : 's'} on hold, left out.
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
            <span className="font-serif text-xl font-semibold text-primary-green">{formatPaise(total)}</span>
          </div>
          <span className="text-[11px] text-white/60">Internal. The vendor never sees this.</span>
        </div>

        <SectionLabel>Agree the price</SectionLabel>
        {officePhone ? (
          <a href={`tel:${officePhone.replace(/\s+/g, '')}`}>
            <Button variant="secondary" fullWidth>
              Call the office
            </Button>
          </a>
        ) : (
          <div className="flex flex-col gap-1">
            <Button variant="secondary" fullWidth disabled>
              Call the office
            </Button>
            <p className="text-center text-[11px] text-text-secondary">Office line not connected yet</p>
          </div>
        )}

        <form action={presentOfferAndRedirect.bind(null, id)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agreedRupees" className="text-xs font-medium text-text-primary">
              Agreed price (₹)
            </label>
            <input
              type="number"
              id="agreedRupees"
              name="agreedRupees"
              min="1"
              step="0.01"
              inputMode="decimal"
              placeholder={String(Math.round(total / 100))}
              className="h-11 w-full rounded-[10px] border border-border bg-background px-3 text-base text-text-primary"
            />
            <p className="text-[11px] text-text-secondary">Leave blank to offer {formatPaise(total)}.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="priceNote" className="text-xs font-medium text-text-primary">
              Note (needed if the price changed)
            </label>
            <textarea
              id="priceNote"
              name="priceNote"
              rows={2}
              maxLength={500}
              placeholder="e.g. Agreed with Rahul at the office"
              className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-sm text-text-primary"
            />
          </div>
          <Button type="submit" variant="primary" fullWidth disabled={!canPresent}>
            Present offer to vendor
          </Button>
        </form>
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
