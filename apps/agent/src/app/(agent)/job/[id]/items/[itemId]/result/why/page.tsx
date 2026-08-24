// …/result/why  —  Batch 5a · Ali
//
// Rationale, alternatives, sensitivity, audit footer. The wireframe's "AI
// explanation" button is CUT — no /api/explain exists and it is not in scope
// (plan §2).

import { redirect } from 'next/navigation'

import { createClient } from '@clbipp/auth/server'
import { formatPaise } from '@clbipp/core/format'
import { AppShell, Card, CardContent, PagePadding } from '@clbipp/ui'

import { requireSafetyChecklist } from '@/lib/safety-gate'
import { loadResultData } from '../data'
import { SubNav } from '../page'

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
  if (data.kind === 'simple') redirect(`/job/${id}/items/${itemId}/result`)

  const { output } = data

  return (
    <AppShell title={`${output.trace_id} · Why`} showBack backHref={`/job/${id}/items/${itemId}/result`} hideNav>
      <PagePadding className="flex flex-col gap-4">
        <SubNav pickupId={id} itemId={itemId} active="why" />

        <Card variant="elevated">
          <CardContent className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-widest text-text-secondary">
              Plain-English rationale
            </p>
            <p className="text-sm leading-relaxed text-text-secondary">{output.decision.rationale}</p>
          </CardContent>
        </Card>

        <Card variant="elevated">
          <CardContent className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-widest text-text-secondary">
              Alternative pathways
            </p>
            {output.alternatives.length === 0 ? (
              <p className="text-xs text-text-secondary">
                No other pathway was eligible after the gating layers.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {output.alternatives.map((alt) => (
                  <div key={alt.pathway} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-text-secondary">{PATHWAY_LABEL[alt.pathway] ?? alt.pathway}</span>
                    <span className="font-medium text-text-primary">
                      {formatPaise(Math.round(alt.net_value * 100))} · {alt.delta_vs_winner_pct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {output.sensitivity.length > 0 && (
          <Card variant="elevated">
            <CardContent className="flex flex-col gap-2">
              <p className="text-xs font-bold uppercase tracking-widest text-text-secondary">Sensitivity</p>
              <div className="flex flex-col gap-2">
                {output.sensitivity.map((note, i) => (
                  <p key={i} className="text-xs leading-relaxed text-text-secondary">
                    {note}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card variant="elevated">
          <CardContent className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-widest text-text-secondary">Audit footer</p>
            <div className="flex flex-col divide-y divide-border font-mono text-[11px]">
              <div className="flex justify-between py-1.5">
                <span className="text-text-secondary">Config version</span>
                <span className="text-text-primary">{output.audit.config_version}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-text-secondary">Market snapshot</span>
                <span className="text-text-primary">{output.audit.market_snapshot_id}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-text-secondary">FX rate</span>
                <span className="text-text-primary">USD/INR {output.audit.fx_rate_usd_inr}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-text-secondary">trace_id</span>
                <span className="text-text-primary">{output.trace_id}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </PagePadding>
    </AppShell>
  )
}
