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
import { AppShell, Banner, Button, Card, CardContent, DetailRow, PagePadding, SectionLabel } from '@clbipp/ui'

import { requireSafetyChecklist } from '@/lib/safety-gate'
import { presentOfferAndRedirect } from './actions'

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
      offer: { select: { estimatedPrice: true, pathway: true, acceptedAt: true } },
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
  if (pickup.status !== 'arrived' && pickup.offer) {
    return (
      <AppShell title="Offer" showBack backHref={`/job/${id}`} hideNav>
        <PagePadding className="flex flex-col gap-4">
          {pickup.offer.acceptedAt ? (
            <>
              <Banner variant="success">
                Vendor accepted — {formatPaise(pickup.offer.estimatedPrice)}. Ready to collect.
              </Banner>
              <Link href={`/job/${id}/collect`}>
                <Button variant="primary" fullWidth>
                  Collect this pickup
                </Button>
              </Link>
            </>
          ) : (
            <Banner variant="info">
              Offer presented — {formatPaise(pickup.offer.estimatedPrice)}, awaiting the
              vendor&rsquo;s decision.
            </Banner>
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

        <form action={presentOfferAndRedirect.bind(null, id)}>
          <Button type="submit" variant="primary" fullWidth disabled={!canPresent}>
            Present offer to vendor
          </Button>
        </form>

        <p className="text-[11px] leading-relaxed text-text-secondary">
          This moves the job to <b>Offered</b> and the vendor sees this total on
          their own screen. They accept it there — you&rsquo;ll see that reflected
          here once they do.
        </p>
      </PagePadding>
    </AppShell>
  )
}
