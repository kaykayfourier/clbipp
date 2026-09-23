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
          {timing.state === 'awaiting_vendor' ? (
            <Banner variant={timing.expired ? 'warning' : 'info'}>
              Offer presented — {formatPaise(pickup.offer.estimatedPrice)},{' '}
              {timing.expired
                ? 'and the 7-day validity has now lapsed. The office will re-confirm the price before collection.'
                : `awaiting the vendor's decision. Valid for ${timing.daysRemaining} more day${timing.daysRemaining === 1 ? '' : 's'}.`}
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
              <p className="text-[11px] leading-relaxed text-text-secondary">
                Book a date when the van is full, the load needs a bigger vehicle, or the site
                isn&rsquo;t ready. The vendor sees the date on their own screen, and the job
                stays yours.
              </p>
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

  // FV6 · M2. Configured, not hardcoded — the company has not told us the
  // number yet (open question M1), and a wrong number in a `tel:` link is worse
  // than no link. Absent → the button simply does not render, the same rule the
  // vendor `tel:` link on the job screen already follows.
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
            {unpriced.length} item{unpriced.length === 1 ? '' : 's'} still need pricing —
            finish those from the item list before you can present.
          </Banner>
        )}

        {holdItems.length > 0 && (
          <Banner variant="error">
            {holdItems.length} item{holdItems.length === 1 ? '' : 's'} on HOLD, excluded from
            this offer. Escalate {holdItems.length === 1 ? 'it' : 'each'} from its own result
            screen if you haven&rsquo;t already.
          </Banner>
        )}

        <div className="flex flex-col gap-1 rounded-[10px] bg-primary-black px-4 py-3.5 text-white">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">
              Total offer
            </span>
            <span className="font-serif text-xl font-semibold text-primary-green">
              {formatPaise(total)}
            </span>
          </div>
        </div>

        {/* 🔴 FV6 · FD5 — the human step. One form, two buttons' worth of
            behaviour: leave the adjustment blank and the engine's total is
            presented unchanged; fill it in and yours is, with the reason
            recorded and the engine's figure kept beside it. */}
        <form action={presentOfferAndRedirect.bind(null, id)} className="flex flex-col gap-3">
          <Button type="submit" variant="primary" fullWidth disabled={!canPresent}>
            Present offer to vendor
          </Button>

          <details className="rounded-[10px] border border-border px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-text-primary">
              Adjust the price before presenting
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-[11px] leading-relaxed text-text-secondary">
                Use this when the office has agreed a different number, or when something about
                this load isn&rsquo;t in the calculation. Leave it blank to present{' '}
                {formatPaise(total)}.
              </p>
              <label htmlFor="overrideRupees" className="text-xs font-medium text-text-primary">
                Agreed total (₹)
              </label>
              <input
                type="number"
                id="overrideRupees"
                name="overrideRupees"
                min="1"
                step="0.01"
                inputMode="decimal"
                placeholder={String(Math.round(total / 100))}
                className="h-11 w-full rounded-[10px] border border-border bg-background px-3 text-base text-text-primary"
              />
              <label htmlFor="overrideReason" className="text-xs font-medium text-text-primary">
                Why
              </label>
              <textarea
                id="overrideReason"
                name="overrideReason"
                rows={2}
                placeholder="e.g. Office agreed ₹48,000 with the vendor by phone"
                className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-sm text-text-primary"
              />
            </div>
          </details>
        </form>

        {/* FV6 · M2. The office, one tap away, on the screen where an agent is
            most likely to need it — standing in front of a vendor who disagrees
            with a number. */}
        {officePhone && (
          <a href={`tel:${officePhone.replace(/\s+/g, '')}`}>
            <Button variant="secondary" fullWidth>
              Call the office
            </Button>
          </a>
        )}

        <p className="text-[11px] leading-relaxed text-text-secondary">
          This moves the job to <b>Offered</b> and the vendor sees this total on
          their own screen. They accept it there — you&rsquo;ll see that reflected
          here once they do.
        </p>
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
