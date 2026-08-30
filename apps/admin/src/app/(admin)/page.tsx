import Link from 'next/link'

import { prisma } from '@clbipp/database'
import { categoryLabel } from '@clbipp/core/intake'
import { formatPaise } from '@clbipp/core/format'

import { KpiTile, SplitBar } from '@/components/console'
import { formatAge } from '@/lib/ist'
import { computePathwaySplit, sampleMargins, averageMarginPct, totalNetValuePaise } from '@/lib/dashboard-data'
import { PathwayChip, EngineFlagChip } from '@/app/(admin)/quotes/pathway-chip'
import { parseQuoteData, hasEngineFlag } from '@/lib/quote-data'

// B01 · Overview — Batch 15, owner C — Ali.
//
// Five KPI tiles, pathway split, market state, the head of the queue. Every
// number here is an aggregate of a screen already built (/pickups, /quotes,
// /suppliers, /agents, /inventory) — this batch's own trap. Nothing on this
// page invents a fact those screens don't already show; see
// @/lib/dashboard-data for the aggregation queries themselves.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav (AD11, trap 15).
export const dynamic = 'force-dynamic'

const IN_FLIGHT_STATUSES = ['requested', 'scheduled', 'arrived', 'offered', 'collected', 'tested', 'processed', 'recovered'] as const
const QUEUE_HEAD_SIZE = 8
const MARGIN_WINDOW_DAYS = 30

export default async function OverviewPage() {
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const marginWindowStart = new Date(now.getTime() - MARGIN_WINDOW_DAYS * 24 * 3_600_000)

  const [pickupsToday, activePickups, openExceptions, pathwaySplit, marginSamples, latestMarket, queueHead] = await Promise.all([
    prisma.pickup.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.pickup.count({ where: { status: { in: [...IN_FLIGHT_STATUSES] } } }),
    prisma.itemException.count({ where: { resolvedAt: null } }),
    computePathwaySplit(),
    sampleMargins(marginWindowStart),
    prisma.marketPrices.findFirst({ orderBy: { updatedAt: 'desc' } }),
    prisma.batteryItem.findMany({
      where: { OR: [{ traceId: { not: null } }, { linePricePaise: { not: null } }] },
      orderBy: { updatedAt: 'desc' },
      take: QUEUE_HEAD_SIZE,
      select: {
        id: true,
        category: true,
        pathway: true,
        traceId: true,
        linePricePaise: true,
        quoteData: true,
        updatedAt: true,
        pickup: { select: { vendor: { select: { fullName: true, companyName: true } } } },
      },
    }),
  ])

  const avgMargin = averageMarginPct(marginSamples)
  const netValuePaise = totalNetValuePaise(marginSamples)

  return (
    <>
      <div>
        <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">Overview</h1>
        <p className="mt-1 text-xs text-text-secondary">Quotes, throughput, margin and the head of the queue.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <KpiTile label="Pickups today" value={String(pickupsToday)} delta="requested since midnight IST" deltaTone="neutral" />
        <KpiTile label="Active pickups" value={String(activePickups)} delta="requested → recovered" deltaTone="neutral" />
        <KpiTile label="Avg margin" value={avgMargin !== null ? `${avgMargin.toFixed(1)}%` : '—'} delta={`last ${MARGIN_WINDOW_DAYS}d, engine-priced`} deltaTone="neutral" />
        <KpiTile label="Net value" value={formatPaise(netValuePaise)} delta={`last ${MARGIN_WINDOW_DAYS}d`} deltaTone="neutral" />
        <KpiTile
          label="In exception"
          value={String(openExceptions)}
          delta={openExceptions > 0 ? 'open — needs review' : 'none open'}
          tone={openExceptions > 0 ? 'exception' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-2 rounded-xl border border-console-line bg-surface p-4">
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary">Pathway split — all priced items</h2>
          <SplitBar
            segments={[
              { key: 'reuse', label: 'Reuse', value: pathwaySplit.reuse },
              { key: 'refurbish', label: 'Refurbish', value: pathwaySplit.refurbish },
              { key: 'recycle', label: 'Recycle', value: pathwaySplit.recycle },
            ]}
          />
          {pathwaySplit.other > 0 ? (
            <p className="text-[10.5px] text-text-secondary">
              + {pathwaySplit.other} flat-rate / dispose item{pathwaySplit.other === 1 ? '' : 's'} outside the engine pathway mix.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-console-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary">Market state</h2>
            {latestMarket ? <span className="font-mono text-[9.5px] text-text-disabled">{formatAge(latestMarket.updatedAt, now)} old</span> : null}
          </div>
          {latestMarket ? (
            <div className="flex flex-col divide-y divide-console-line">
              {(
                [
                  ['Lithium', latestMarket.Li],
                  ['Cobalt', latestMarket.Co],
                  ['Nickel', latestMarket.Ni],
                  ['Manganese', latestMarket.Mn],
                  ['Copper', latestMarket.Cu],
                  ['Aluminium', latestMarket.Al],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-1.5 text-[12px]">
                  <span className="text-text-secondary">{label}</span>
                  <span className="font-mono font-semibold text-text-primary">₹{Number(value).toLocaleString('en-IN')}/kg</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1.5 text-[10.5px] text-text-disabled">
                <span>USD/INR</span>
                <span className="font-mono">{Number(latestMarket.fxRateUsdInr).toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-text-secondary">No market snapshot yet.</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary">Head of the queue</h2>
          <Link href="/quotes" className="font-mono text-[10px] text-text-secondary hover:text-text-primary">
            view all →
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-console-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {queueHead.map((item) => {
                const parsed = parseQuoteData(item.quoteData)
                const flags = parsed ? (['HOLD', 'REVIEW'] as const).filter((f) => hasEngineFlag(parsed.output, f)) : []
                return (
                  <tr key={item.id} className="border-t border-console-line first:border-t-0">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-text-primary">{item.pickup.vendor.companyName || item.pickup.vendor.fullName}</div>
                      <div className="text-xs text-text-secondary">{categoryLabel(item.category)}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <PathwayChip pathway={item.pathway} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        {flags.map((f) => (
                          <EngineFlagChip key={f} flag={f} />
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-text-primary">
                      {item.linePricePaise !== null ? formatPaise(item.linePricePaise) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[10.5px] text-text-secondary">{formatAge(item.updatedAt, now)}</td>
                  </tr>
                )
              })}
              {queueHead.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-xs text-text-secondary">
                    Nothing quoted yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
