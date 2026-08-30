import 'server-only'

import { prisma } from '@clbipp/database'
import { rupeesToPaise } from '@clbipp/core/format'

import { parseQuoteData } from './quote-data'

// ─── Dashboard + Analytics aggregation ───────────────────────────────────────
// Batch 15, owner C. Shared between `/` (B01) and `/analytics` (F02) — the
// batch's own trap: "every tile is an aggregate of screens already built."
// Nothing here is a new business rule. It re-derives the same facts
// /pickups, /quotes, /suppliers, /agents and /inventory already show, just
// rolled up — so if a number here ever disagrees with one of those screens,
// that is a bug in THIS file, not a second source of truth to reconcile.
//
// PRICED_ITEM_FILTER matches /quotes' own scoping exactly (traceId set OR
// linePricePaise set) — "priced", not "every item that exists" (that
// screen's own comment). Duplicated here rather than imported because it's a
// three-line Prisma where-clause, not a function; importing one line from a
// page.tsx to a lib file would be a stranger coupling than repeating it.
const PRICED_ITEM_WHERE = {
  OR: [
    { traceId: { not: null } },
    { linePricePaise: { not: null } },
  ],
}

export interface PathwayCounts {
  reuse: number
  refurbish: number
  recycle: number
  /** `pathway === null` (non-lithium, flat-rate) OR `dispose` — neither is a
   * position in the REUSE/REFURBISH/RECYCLE mix SplitBar draws, so both land
   * here rather than forcing a fourth bar segment onto a chart the wireframe
   * only ever drew with three. */
  other: number
}

export async function computePathwaySplit(sinceDate?: Date): Promise<PathwayCounts> {
  const items = await prisma.batteryItem.findMany({
    where: sinceDate ? { ...PRICED_ITEM_WHERE, updatedAt: { gte: sinceDate } } : PRICED_ITEM_WHERE,
    select: { pathway: true },
  })
  const counts: PathwayCounts = { reuse: 0, refurbish: 0, recycle: 0, other: 0 }
  for (const item of items) {
    if (item.pathway === 'reuse') counts.reuse++
    else if (item.pathway === 'refurbish') counts.refurbish++
    else if (item.pathway === 'recycle') counts.recycle++
    else counts.other++
  }
  return counts
}

export interface MarginSample {
  netValueRupees: number
  marginAtRecommended: number
}

/**
 * Pulls quoteData for every engine-priced item updated since `sinceDate` and
 * parses it — the one place in this batch that opens the Json column rather
 * than reading a flat column, because average margin % has no flat column of
 * its own (only unitPricePaise/linePricePaise do). Capped at MAX_SAMPLE for
 * the same reason /quotes caps at 500 rows: a dashboard tile computing off an
 * unbounded full-table JSON parse is a query that gets slower every day this
 * product is used, for a number that does not need be more precise than a
 * few hundred samples already give it.
 */
const MAX_MARGIN_SAMPLE = 500

export async function sampleMargins(sinceDate: Date): Promise<MarginSample[]> {
  const items = await prisma.batteryItem.findMany({
    where: { traceId: { not: null }, updatedAt: { gte: sinceDate } },
    orderBy: { updatedAt: 'desc' },
    take: MAX_MARGIN_SAMPLE,
    select: { quoteData: true },
  })
  const samples: MarginSample[] = []
  for (const item of items) {
    const parsed = parseQuoteData(item.quoteData)
    if (!parsed) continue
    samples.push({
      netValueRupees: parsed.output.economics.net_value,
      marginAtRecommended: parsed.output.pricing.margin_at_p_recommended,
    })
  }
  return samples
}

export function averageMarginPct(samples: readonly MarginSample[]): number | null {
  if (samples.length === 0) return null
  const sum = samples.reduce((s, m) => s + m.marginAtRecommended, 0)
  return (sum / samples.length) * 100
}

export function totalNetValuePaise(samples: readonly MarginSample[]): number {
  const totalRupees = samples.reduce((s, m) => s + m.netValueRupees, 0)
  return rupeesToPaise(totalRupees)
}

export interface WeeklyMargin {
  weekLabel: string
  avgMarginPct: number | null
  sampleCount: number
}

/** Average `margin_at_p_recommended` bucketed by ISO week, oldest first —
 * feeds /analytics' margin trend chart. Same MAX_MARGIN_SAMPLE reasoning as
 * sampleMargins: bounded, recency-ordered, good enough for a trend line
 * without an unbounded per-request JSON parse over the whole table. */
export async function marginTrendByWeek(weeks: number): Promise<WeeklyMargin[]> {
  const since = new Date()
  since.setDate(since.getDate() - weeks * 7)

  const items = await prisma.batteryItem.findMany({
    where: { traceId: { not: null }, updatedAt: { gte: since } },
    orderBy: { updatedAt: 'desc' },
    take: MAX_MARGIN_SAMPLE,
    select: { quoteData: true, updatedAt: true },
  })

  const buckets = new Map<string, { sum: number; count: number; weekStart: Date }>()
  for (let i = 0; i < weeks; i++) {
    const weekStart = weekStartOf(new Date(since.getTime() + i * 7 * 24 * 3_600_000))
    buckets.set(weekStart.toISOString().slice(0, 10), { sum: 0, count: 0, weekStart })
  }

  for (const item of items) {
    const parsed = parseQuoteData(item.quoteData)
    if (!parsed) continue
    const key = weekStartOf(item.updatedAt).toISOString().slice(0, 10)
    const bucket = buckets.get(key)
    if (!bucket) continue
    bucket.sum += parsed.output.pricing.margin_at_p_recommended
    bucket.count += 1
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
    .map((b) => ({
      weekLabel: `${b.weekStart.getDate()}/${b.weekStart.getMonth() + 1}`,
      avgMarginPct: b.count > 0 ? (b.sum / b.count) * 100 : null,
      sampleCount: b.count,
    }))
}

function weekStartOf(date: Date): Date {
  const ist = new Date(date.getTime() + 5.5 * 3_600_000)
  const day = ist.getUTCDay() // 0 = Sunday
  const monday = new Date(ist)
  monday.setUTCDate(ist.getUTCDate() - ((day + 6) % 7))
  monday.setUTCHours(0, 0, 0, 0)
  return monday
}

export interface VendorRanking {
  vendorId: string
  name: string
  pickupCount: number
  pricedValuePaise: number
}

/** Ranked by total priced value — the sum of each vendor's items'
 * linePricePaise, a flat column, not a second quoteData parse per vendor. */
export async function topVendorsByValue(limit: number): Promise<VendorRanking[]> {
  const vendors = await prisma.profile.findMany({
    where: { role: 'customer' },
    select: {
      id: true,
      fullName: true,
      companyName: true,
      pickups: {
        select: { items: { select: { linePricePaise: true } } },
      },
    },
  })

  const ranked: VendorRanking[] = vendors.map((v) => {
    const pricedValuePaise = v.pickups.reduce(
      (sum, p) => sum + p.items.reduce((s, i) => s + (i.linePricePaise ?? 0), 0),
      0,
    )
    return {
      vendorId: v.id,
      name: v.companyName || v.fullName,
      pickupCount: v.pickups.length,
      pricedValuePaise,
    }
  })

  return ranked
    .filter((v) => v.pricedValuePaise > 0)
    .sort((a, b) => b.pricedValuePaise - a.pricedValuePaise)
    .slice(0, limit)
}

export interface DailyCount {
  dateLabel: string
  count: number
  weightKg: number
}

/** One bucket per calendar day (IST), oldest first — feeds <MiniBarChart>
 * directly. `days` counts back from today inclusive. */
export async function pickupsPerDay(days: number): Promise<DailyCount[]> {
  const since = new Date()
  since.setDate(since.getDate() - (days - 1))
  since.setHours(0, 0, 0, 0)

  const pickups = await prisma.pickup.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, items: { select: { weightKg: true, confirmedWeightKg: true } } },
  })

  const buckets = new Map<string, { count: number; weightKg: number }>()
  for (let i = 0; i < days; i++) {
    const d = new Date(since)
    d.setDate(d.getDate() + i)
    buckets.set(dayKey(d), { count: 0, weightKg: 0 })
  }

  for (const p of pickups) {
    const key = dayKey(p.createdAt)
    const bucket = buckets.get(key)
    if (!bucket) continue // outside the window — shouldn't happen given the where clause, kept defensive
    bucket.count += 1
    bucket.weightKg += p.items.reduce((s, i) => s + Number(i.confirmedWeightKg ?? i.weightKg ?? 0), 0)
  }

  return Array.from(buckets.entries()).map(([key, v]) => ({
    dateLabel: key.slice(8, 10), // DD — a 14-tile chart has no room for the month
    count: v.count,
    weightKg: v.weightKg,
  }))
}

function dayKey(date: Date): string {
  // IST-shifted calendar day, not UTC — a pickup created at 11pm IST must not
  // land in tomorrow's bucket.
  const ist = new Date(date.getTime() + 5.5 * 3_600_000)
  return ist.toISOString().slice(0, 10)
}
