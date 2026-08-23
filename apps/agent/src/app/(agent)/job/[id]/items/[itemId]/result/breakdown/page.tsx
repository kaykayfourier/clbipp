// …/result/breakdown  —  Batch 5a · Ali
//
// Full revenue + cost lines. AGENT-ONLY — the deliberate inverse of the
// vendor-visibility rule (plan §0). Nothing rendered on this screen may ever
// appear on a customer-app surface (/offer, /offer-breakdown stay
// price + qualitative rationale, weight-only, no margins, no recovery rate).

import { redirect } from 'next/navigation'

import { createClient } from '@clbipp/auth/server'
import { formatPaise } from '@clbipp/core/format'
import { AppShell, Card, CardContent, PagePadding } from '@clbipp/ui'

import { requireSafetyChecklist } from '@/lib/safety-gate'
import { loadResultData } from '../data'
import { SubNav } from '../page'

function label(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
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
  // Nothing to break down for a rate-card price — back to the verdict, which
  // is the whole story for a non-lithium line.
  if (data.kind === 'simple') redirect(`/job/${id}/items/${itemId}/result`)

  const { output } = data
  const { economics } = output
  const netPaise = Math.round(economics.net_value * 100)
  const revenuePaise = Math.round(economics.revenue * 100)
  const costsPaise = Math.round(economics.costs * 100)

  return (
    <AppShell title={`${output.trace_id} · Breakdown`} showBack backHref={`/job/${id}/items/${itemId}/result`} hideNav>
      <PagePadding className="flex flex-col gap-4">
        <SubNav pickupId={id} itemId={itemId} active="breakdown" />

        <Card variant="elevated">
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">
                Revenue · {economics.pathway}
              </span>
              <span className="font-serif text-lg font-semibold text-text-primary">
                {formatPaise(revenuePaise)}
              </span>
            </div>
            <div className="flex flex-col divide-y divide-border">
              {Object.entries(economics.revenue_breakdown).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-text-secondary">{label(key)}</span>
                  <span className="font-medium text-text-primary">{formatPaise(Math.round(value * 100))}</span>
                </div>
              ))}
              {Object.keys(economics.revenue_breakdown).length === 0 && (
                <p className="py-1.5 text-xs text-text-secondary">No revenue lines.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card variant="elevated">
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">Costs</span>
              <span className="font-serif text-lg font-semibold text-error">−{formatPaise(costsPaise)}</span>
            </div>
            <div className="flex flex-col divide-y divide-border">
              {Object.entries(economics.cost_breakdown).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-text-secondary">{label(key)}</span>
                  <span className="font-medium text-text-primary">{formatPaise(Math.round(value * 100))}</span>
                </div>
              ))}
              {Object.keys(economics.cost_breakdown).length === 0 && (
                <p className="py-1.5 text-xs text-text-secondary">No cost lines.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-1 rounded-[10px] bg-primary-black px-4 py-3.5 text-white">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Net value</span>
            <span className="font-serif text-xl font-semibold text-primary-green">
              {formatPaise(netPaise)}
            </span>
          </div>
          <p className="font-mono text-[10px] text-white/50">
            {formatPaise(revenuePaise)} − {formatPaise(costsPaise)} = {formatPaise(netPaise)}
            {output.pricing && ` · margin at recommended ${(output.pricing.margin_at_p_recommended * 100).toFixed(0)}%`}
          </p>
        </div>
      </PagePadding>
    </AppShell>
  )
}
