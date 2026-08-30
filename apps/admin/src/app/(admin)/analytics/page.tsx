import Link from 'next/link'

import { formatPaise } from '@clbipp/core/format'

import { SplitBar, MiniBarChart } from '@/components/console'
import { computePathwaySplit, pickupsPerDay, marginTrendByWeek, topVendorsByValue } from '@/lib/dashboard-data'

// F02 · Analytics — Batch 15, owner C — Ali.
//
// Throughput + margin trend, pathway mix YTD, top vendors. Same posture as
// `/` (B01): every tile is an aggregate of a screen already built, nothing
// new invented. This is the screen §5's cut list names first if a batch runs
// short ("keep the dashboard, drop /analytics") — built anyway here since
// there was room for both, but `/` alone is the load-bearing one if either
// has to give.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav (AD11, trap 15).
export const dynamic = 'force-dynamic'

const THROUGHPUT_DAYS = 14
const MARGIN_WEEKS = 8
const TOP_VENDOR_COUNT = 8

export default async function AnalyticsPage() {
  const startOfYear = new Date(new Date().getFullYear(), 0, 1)

  const [pathwaySplitYtd, throughput, marginTrend, topVendors] = await Promise.all([
    computePathwaySplit(startOfYear),
    pickupsPerDay(THROUGHPUT_DAYS),
    marginTrendByWeek(MARGIN_WEEKS),
    topVendorsByValue(TOP_VENDOR_COUNT),
  ])

  const marginPoints = marginTrend.map((w) => ({ label: w.weekLabel, value: w.avgMarginPct ?? 0 }))
  const weightPoints = throughput.map((d) => ({ label: d.dateLabel, value: d.weightKg }))

  return (
    <>
      <div>
        <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">Analytics</h1>
        <p className="mt-1 text-xs text-text-secondary">Throughput and margin trend, pathway mix, top vendors.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-xl border border-console-line bg-surface p-4">
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary">
            Throughput — last {THROUGHPUT_DAYS} days
          </h2>
          <MiniBarChart points={weightPoints} formatValue={(v) => `${v.toFixed(1)} kg`} />
          <p className="text-[10.5px] text-text-disabled">Confirmed weight collected, by day.</p>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-console-line bg-surface p-4">
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary">
            Margin trend — last {MARGIN_WEEKS} weeks
          </h2>
          <MiniBarChart points={marginPoints} formatValue={(v) => `${v.toFixed(1)}%`} />
          <p className="text-[10.5px] text-text-disabled">
            Average margin at recommended price, engine-priced items only, by week starting.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-2 rounded-xl border border-console-line bg-surface p-4">
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary">Pathway mix — YTD</h2>
          <SplitBar
            segments={[
              { key: 'reuse', label: 'Reuse', value: pathwaySplitYtd.reuse },
              { key: 'refurbish', label: 'Refurbish', value: pathwaySplitYtd.refurbish },
              { key: 'recycle', label: 'Recycle', value: pathwaySplitYtd.recycle },
            ]}
          />
          {pathwaySplitYtd.other > 0 ? (
            <p className="text-[10.5px] text-text-secondary">
              + {pathwaySplitYtd.other} flat-rate / dispose item{pathwaySplitYtd.other === 1 ? '' : 's'} year to date.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-console-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary">Top vendors — by priced value</h2>
            <Link href="/suppliers" className="font-mono text-[10px] text-text-secondary hover:text-text-primary">
              all suppliers →
            </Link>
          </div>
          {topVendors.length > 0 ? (
            <div className="flex flex-col divide-y divide-console-line">
              {topVendors.map((v, i) => (
                <div key={v.vendorId} className="flex items-center justify-between py-2 text-[12.5px]">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-text-disabled">{i + 1}</span>
                    <span className="font-medium text-text-primary">{v.name}</span>
                    <span className="text-xs text-text-secondary">· {v.pickupCount} pickup{v.pickupCount === 1 ? '' : 's'}</span>
                  </span>
                  <span className="font-mono font-bold text-text-primary">{formatPaise(v.pricedValuePaise)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-secondary">No priced items yet.</p>
          )}
        </div>
      </div>
    </>
  )
}
