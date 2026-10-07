import Link from 'next/link'
import { notFound } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { categoryLabel, chemistryLabel } from '@clbipp/core/intake'
import { formatPaise, rupeesToPaise } from '@clbipp/core/format'
import { Card, DetailRow } from '@clbipp/ui'

import { PageHead } from '@/components/console'
import { formatIstDateTime } from '@/lib/ist'
import { parseQuoteData } from '@/lib/quote-data'
import { PathwayChip, EngineFlagChip } from '@/app/(admin)/quotes/pathway-chip'

// D04 · Traceability — Batch 12, owner C.
//
// One trace_id unpacked in full: verdict, price band, the complete revenue/
// cost breakdown, alternatives the engine considered and rejected, and the
// audit block underneath it all. This is the "why" behind a single line in
// /quotes — the opposite direction of the customer app's own offer screen,
// which shows the vendor a price and a one-line rationale and nothing else
// (AD12: margin and cost detail is admin/agent-only and must never reach a
// vendor screen — this page is exactly that detail).
//
// 🔴 traceId is NOT a unique index on BatteryItem (the schema's own comment:
// "a re-quote of the same item would reuse one"). findFirst ordered by
// updatedAt, not findUnique — the newest run for this trace id is the one
// that matters.
//
// Read-only. Nothing on this page writes anything.
export const dynamic = 'force-dynamic'

export default async function TracePage({ params }: { params: Promise<{ traceId: string }> }) {
  const { traceId } = await params

  const item = await prisma.batteryItem.findFirst({
    where: { traceId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      pickupId: true,
      category: true,
      chemistry: true,
      pathway: true,
      linePricePaise: true,
      quoteData: true,
      updatedAt: true,
      pickup: {
        select: { status: true, vendor: { select: { fullName: true, companyName: true } } },
      },
    },
  })

  if (!item) notFound()

  const parsed = parseQuoteData(item.quoteData)

  if (!parsed) {
    // A real BatteryItem with this trace id exists, but the engine payload
    // behind it does not parse — an item mid-quote, or a row from before this
    // wrapper shape was settled on. Not a 404 (the trace id is real and the
    // item is real); a clear "nothing to show yet" instead.
    return (
      <>
        <PageHead
          title={traceId}
          description="Traceability"
          actions={
            <Link href={`/pickups/${encodeURIComponent(item.pickupId)}`} className="rounded-lg border border-console-line px-3 py-1.5 text-xs font-bold text-text-primary hover:bg-background">
              ← {item.pickupId}
            </Link>
          }
        />
        <Card>
          <p className="text-sm font-bold text-text-primary">No engine record for this trace id yet</p>
        </Card>
      </>
    )
  }

  const { output } = parsed
  const vendorName = item.pickup.vendor.companyName || item.pickup.vendor.fullName

  // 🔴 The engine speaks rupee floats (mock-data.ts: `net_value: 3940` means
  // ₹3940, not 3940 paise) — every money field on QuoteOutput needs
  // rupeesToPaise() before it reaches formatPaise(), which expects integer
  // paise. A raw `* 100` here would both use the wrong rounding rule (D8:
  // "round half-up at the paise level") and skip it entirely on values that
  // are not already whole rupees. Converted once, up front, rather than
  // inline at each call site, so there is exactly one place this can be
  // gotten wrong instead of eleven.
  const netValuePaise = rupeesToPaise(output.economics.net_value)
  const revenuePaise = rupeesToPaise(output.economics.revenue)
  const costsPaise = rupeesToPaise(output.economics.costs)
  const pMinPaise = rupeesToPaise(output.pricing.p_min)
  const pRecommendedPaise = rupeesToPaise(output.pricing.p_recommended)
  const pMaxPaise = rupeesToPaise(output.pricing.p_max)
  const revenueLines = Object.entries(output.economics.revenue_breakdown).map(
    ([k, v]) => [k, rupeesToPaise(v)] as const,
  )
  const costLines = Object.entries(output.economics.cost_breakdown).map(([k, v]) => [k, rupeesToPaise(v)] as const)
  const alternatives = output.alternatives.map((alt) => ({ ...alt, net_value_paise: rupeesToPaise(alt.net_value) }))

  return (
    <>
      <PageHead
        title={traceId}
        description={`${vendorName} · ${categoryLabel(item.category)}${item.chemistry ? ` · ${chemistryLabel(item.chemistry) ?? item.chemistry}` : ''}`}
        actions={
          <Link
            href={`/pickups/${encodeURIComponent(item.pickupId)}`}
            className="rounded-lg border border-console-line px-3 py-1.5 text-xs font-bold text-text-primary hover:bg-background"
          >
            ← {item.pickupId}
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-[18px]">
          {/* ── Verdict ─────────────────────────────────────────────────── */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-text-secondary">Verdict</p>
                <div className="mt-2 flex items-center gap-2">
                  <PathwayChip pathway={output.decision.pathway} className="text-[13px] px-3 py-1.5" />
                  {output.decision.flags.map((f) => (
                    <EngineFlagChip key={f} flag={f} />
                  ))}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase tracking-widest text-text-secondary">Net value</p>
                <p className="font-display text-2xl font-medium text-text-primary">{formatPaise(netValuePaise)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-text-primary">{output.decision.rationale}</p>
            {output.decision.tiebreaker_applied ? (
              <p className="mt-2 text-xs text-warning-text">
                Decided by tiebreaker — see Alternatives.
              </p>
            ) : null}
            {output.decision.eligible_pathways.length > 1 ? (
              <p className="mt-2 text-xs text-text-secondary">
                Eligible pathways this run: {output.decision.eligible_pathways.join(', ')}
              </p>
            ) : null}
          </Card>

          {/* ── Price band ──────────────────────────────────────────────── */}
          <Card>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-text-secondary">Price band</p>
            <div className="grid grid-cols-3 gap-2">
              <PriceBandCell label="P min" paise={pMinPaise} margin={output.pricing.margin_at_p_min} />
              <PriceBandCell
                label="P recommended"
                paise={pRecommendedPaise}
                margin={output.pricing.margin_at_p_recommended}
                emphasis
              />
              <PriceBandCell label="P max" paise={pMaxPaise} margin={output.pricing.margin_at_p_max} />
            </div>
            {item.linePricePaise !== null && item.linePricePaise !== pRecommendedPaise ? (
              <p className="mt-3 text-xs text-warning-text">
                Recorded line price is {formatPaise(item.linePricePaise)} — likely re-quoted later.
              </p>
            ) : null}
          </Card>

          {/* ── Economics ───────────────────────────────────────────────── */}
          <Card>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-text-secondary">Economics</p>
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <div>
                <p className="mb-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-disabled">
                  Revenue · {formatPaise(revenuePaise)}
                </p>
                <div className="flex flex-col">
                  {revenueLines.map(([k, v], i) => (
                    <DetailRow key={k} label={humanizeKey(k)} value={formatPaise(v)} last={i === revenueLines.length - 1} />
                  ))}
                </div>
              </div>
              <div className="mt-4 sm:mt-0">
                <p className="mb-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-disabled">
                  Costs · {formatPaise(costsPaise)}
                </p>
                <div className="flex flex-col">
                  {costLines.map(([k, v], i) => (
                    <DetailRow key={k} label={humanizeKey(k)} value={`−${formatPaise(v)}`} last={i === costLines.length - 1} />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 border-t border-console-line pt-3">
              <DetailRow label="Net value" value={formatPaise(netValuePaise)} strong last />
            </div>
          </Card>

          {/* ── Alternatives ────────────────────────────────────────────── */}
          {alternatives.length > 0 ? (
            <Card>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-text-secondary">
                Alternatives considered
              </p>
              <div className="flex flex-col">
                {alternatives.map((alt, i) => (
                  <div
                    key={alt.pathway}
                    className={`flex items-center justify-between gap-3 py-2.5 ${i !== alternatives.length - 1 ? 'border-b border-console-line' : ''}`}
                  >
                    <PathwayChip pathway={alt.pathway} />
                    <span className="text-right text-sm">
                      <span className="font-medium text-text-primary">{formatPaise(alt.net_value_paise)}</span>{' '}
                      <span className="text-text-secondary">
                        ({alt.delta_vs_winner_pct >= 0 ? '+' : ''}
                        {alt.delta_vs_winner_pct.toFixed(1)}% vs winner)
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {/* ── Sensitivity ─────────────────────────────────────────────── */}
          {output.sensitivity.length > 0 ? (
            <Card>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-text-secondary">Sensitivity</p>
              <ul className="flex flex-col gap-2">
                {output.sensitivity.map((s, i) => (
                  <li key={i} className="text-sm leading-relaxed text-text-primary">
                    · {s}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        {/* ── Audit block ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-[18px]">
          <div className="rounded-xl border border-console-line bg-background p-4">
            <p className="mb-3 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              Audit block — immutable
            </p>
            <div className="flex flex-col gap-2.5 font-mono text-[11px]">
              <AuditRow label="Trace id" value={output.trace_id} />
              <AuditRow label="Battery id" value={output.battery_id} />
              <AuditRow label="Config version" value={output.audit.config_version} />
              <AuditRow label="Market snapshot" value={output.audit.market_snapshot_id} />
              <AuditRow label="USD/INR" value={output.audit.fx_rate_usd_inr.toFixed(2)} />
              <AuditRow label="Decided at" value={formatIstDateTime(new Date(output.audit.decision_timestamp))} />
              <AuditRow label="Input hash" value={output.audit.input_hash} />
              <AuditRow label="Engine version" value={output.audit.engine_version} />
            </div>
          </div>

          <Card>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-text-secondary">Pickup</p>
            <div className="flex flex-col">
              <DetailRow label="Pickup" value={<Link href={`/pickups/${encodeURIComponent(item.pickupId)}`} className="underline underline-offset-2">{item.pickupId}</Link>} />
              <DetailRow label="Vendor" value={vendorName} />
              <DetailRow label="Status" value={item.pickup.status} last />
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

function PriceBandCell({
  label,
  paise,
  margin,
  emphasis = false,
}: {
  label: string
  paise: number
  margin: number
  emphasis?: boolean
}) {
  return (
    <div className={`rounded-lg border p-3 text-center ${emphasis ? 'border-primary-black bg-primary-black' : 'border-console-line bg-surface'}`}>
      <p className={`font-mono text-[8.5px] uppercase tracking-[0.08em] ${emphasis ? 'text-console-rail-muted' : 'text-text-secondary'}`}>
        {label}
      </p>
      <p className={`mt-1.5 font-display text-base font-medium ${emphasis ? 'text-primary-green' : 'text-text-primary'}`}>
        {formatPaise(paise)}
      </p>
      <p className={`mt-0.5 font-mono text-[9px] ${emphasis ? 'text-console-rail-muted' : 'text-text-disabled'}`}>
        {(margin * 100).toFixed(0)}% margin
      </p>
    </div>
  )
}

function AuditRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-text-disabled">{label}</span>
      <span className="text-right text-text-primary">{value}</span>
    </div>
  )
}

/** `refurb_pack_value` → "Refurb pack value". Purely cosmetic — the engine's
 * breakdown keys are already descriptive snake_case, this just matches the
 * console's title-case convention elsewhere. */
function humanizeKey(key: string): string {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
