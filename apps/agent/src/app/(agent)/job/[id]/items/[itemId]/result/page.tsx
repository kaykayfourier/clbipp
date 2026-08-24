// …/result  —  Batch 5a · Ali
//
// Pathway hero, net value, P_min/P_recommended/P_max band. HOLD and REVIEW are
// branches of THIS screen, not separate routes (plan §2). Escalate-to-admin
// actually flags the pickup (./actions.ts) rather than going nowhere.
//
// Non-lithium items land here too (job-nav.ts routes them straight past the
// rubric) and get the D1 "no engine, no rubric, no pathway" reading: a plain
// price, no subnav, no verdict hero.

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@clbipp/auth/server'
import { formatPaise } from '@clbipp/core/format'
import { AppShell, Banner, Button, Card, CardContent, PagePadding } from '@clbipp/ui'

import { requireSafetyChecklist } from '@/lib/safety-gate'
import { loadResultData } from './data'
import { EscalateButton } from './EscalateButton'

const PATHWAY_LABEL: Record<string, string> = {
  REUSE: 'Reuse',
  REFURBISH: 'Refurbish',
  RECYCLE: 'Recycle',
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>
}) {
  const { id, itemId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await requireSafetyChecklist(id, user.id)

  const data = await loadResultData(id, itemId, user.id)

  // ── Non-lithium: the simple D1 branch ──────────────────────────────────
  if (data.kind === 'simple') {
    return (
      <AppShell title="Price" showBack backHref={`/job/${id}/items/${itemId}`} hideNav>
        <PagePadding className="flex flex-col gap-4">
          <Card variant="elevated">
            <CardContent className="flex flex-col items-center gap-1 py-6 text-center">
              <span className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">
                Priced off the rate card
              </span>
              <span className="font-serif text-3xl font-semibold text-text-primary">
                {formatPaise(data.linePricePaise)}
              </span>
              <span className="text-xs text-text-secondary">
                {formatPaise(data.unitPricePaise)} × {data.quantity} unit{data.quantity === 1 ? '' : 's'}
              </span>
            </CardContent>
          </Card>
          <p className="text-[11px] leading-relaxed text-text-secondary">
            Not lithium — no damage rubric and no pathway decision. Weight and
            condition price this line directly (D1).
          </p>
          <Link href={`/job/${id}/items`}>
            <Button variant="primary" fullWidth>
              Back to items
            </Button>
          </Link>
        </PagePadding>
      </AppShell>
    )
  }

  // ── Lithium: the engine's verdict, rendered 1:1 ─────────────────────────
  const { output } = data
  const isHold = output.decision.flags.includes('HOLD')
  const isReview = output.decision.flags.includes('REVIEW')
  const pathwayLabel = output.decision.pathway ? PATHWAY_LABEL[output.decision.pathway] : 'HOLD'

  return (
    <AppShell title={`${output.trace_id} · Verdict`} showBack backHref={`/job/${id}/items/${itemId}`} hideNav>
      <PagePadding className="flex flex-col gap-4">
        <SubNav pickupId={id} itemId={itemId} active="verdict" />

        <Card variant="elevated">
          <CardContent className="flex flex-col items-center gap-1 py-6 text-center">
            <span className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">
              {isHold ? 'No profitable pathway' : 'Selected pathway'}
            </span>
            <span className="font-serif text-2xl font-semibold text-text-primary">{pathwayLabel}</span>
            {!isHold && (
              <>
                <span className="font-serif text-xl font-semibold text-text-primary">
                  {formatPaise(Math.round(output.economics.net_value * 100))}
                </span>
                <span className="text-xs text-text-secondary">
                  Net value · <b>estimated</b> offer
                </span>
              </>
            )}
          </CardContent>
        </Card>

        {output.pricing && (
          <Card variant="elevated">
            <CardContent className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-text-secondary">P min</p>
                <p className="text-sm font-bold text-text-primary">
                  {formatPaise(Math.round(output.pricing.p_min * 100))}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-text-secondary">P recommended</p>
                <p className="text-sm font-bold text-text-primary">
                  {formatPaise(Math.round(output.pricing.p_recommended * 100))}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-text-secondary">P max</p>
                <p className="text-sm font-bold text-text-primary">
                  {formatPaise(Math.round(output.pricing.p_max * 100))}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {isHold && (
          <>
            <Banner variant="error">
              Every eligible pathway returns a negative net value at current
              market rates. Do not present an offer for this line — escalate to
              admin.
            </Banner>
            <EscalateButton pickupId={id} itemId={itemId} traceId={output.trace_id} />
          </>
        )}

        {isReview && !isHold && (
          <Banner variant="warning">
            <b>REVIEW</b> — net value clears the floor but sits below the hurdle
            rate. Confirm with admin before presenting this line in the offer.
          </Banner>
        )}

        <Link href={`/job/${id}/items/${itemId}/result/breakdown`}>
          <Button variant="secondary" fullWidth>
            View full breakdown
          </Button>
        </Link>

        <Link href={`/job/${id}/items`}>
          <Button variant="primary" fullWidth>
            Back to items
          </Button>
        </Link>
      </PagePadding>
    </AppShell>
  )
}

export function SubNav({
  pickupId,
  itemId,
  active,
}: {
  pickupId: string
  itemId: string
  active: 'verdict' | 'breakdown' | 'why'
}) {
  const base = `/job/${pickupId}/items/${itemId}/result`
  const tabs: Array<{ key: typeof active; label: string; href: string }> = [
    { key: 'verdict', label: 'Verdict', href: base },
    { key: 'breakdown', label: 'Breakdown', href: `${base}/breakdown` },
    { key: 'why', label: 'Why', href: `${base}/why` },
  ]
  return (
    <div className="flex gap-1 rounded-[10px] border border-border p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`flex-1 rounded-[8px] py-2 text-center text-xs font-bold ${
            tab.key === active ? 'bg-primary-black text-white' : 'text-text-secondary'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
