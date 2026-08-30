import { prisma } from '@clbipp/database'
import { categoryLabel, chemistryLabel } from '@clbipp/core/intake'

import { PageHead, KpiTile } from '@/components/console'
import { formatAge } from '@/lib/ist'
import { parseQuoteData, hasEngineFlag } from '@/lib/quote-data'
import { QuotesTable, type QuoteRow } from './QuotesTable'

// D03 · Quote queue — Batch 12, owner C.
//
// Every priced BatteryItem, across every pickup — the engine-quoted li-ion
// items AND the flat-rate lead-acid/NiMH/other items side by side. That
// second half is the whole point of this batch (W2/AD1): a queue that only
// ever showed engine output would make a quarter of the company's actual
// battery volume invisible.
//
// "Priced" is the scope, not "every item that exists" — an item still
// mid-intake with neither a traceId nor a flat-rate price has nothing to
// show here yet; it belongs on /pickups/[id], not in a queue named for the
// thing that has already happened to it.
//
// Deliberately does NOT parse quoteData for the pathway/price columns —
// BatteryItem.pathway/traceId/linePricePaise are the flat, denormalised
// columns the schema stores precisely so a list screen never has to open the
// Json blob per row. quoteData is parsed only for the HOLD/REVIEW flag,
// which has no flat column of its own — see @/lib/quote-data.
//
// Read-only. No actions.ts — nothing here writes anything.
export const dynamic = 'force-dynamic'

const MAX_ROWS = 500

export default async function QuotesPage() {
  const items = await prisma.batteryItem.findMany({
    where: {
      OR: [{ traceId: { not: null } }, { linePricePaise: { not: null } }],
    },
    orderBy: { updatedAt: 'desc' },
    take: MAX_ROWS,
    select: {
      id: true,
      pickupId: true,
      category: true,
      chemistry: true,
      pathway: true,
      traceId: true,
      linePricePaise: true,
      quoteData: true,
      updatedAt: true,
      pickup: {
        select: {
          status: true,
          vendor: { select: { fullName: true, companyName: true } },
        },
      },
    },
  })

  const now = new Date()

  const rows: QuoteRow[] = items.map((item) => {
    const parsed = parseQuoteData(item.quoteData)
    // hasEngineFlag checks one named flag at a time — call it once per known
    // flag rather than filtering the raw array with an unsafe cast.
    const flags = parsed ? (['HOLD', 'REVIEW'] as const).filter((f) => hasEngineFlag(parsed.output, f)) : []

    return {
      itemId: item.id,
      pickupId: item.pickupId,
      pickupStatus: item.pickup.status,
      vendorName: item.pickup.vendor.companyName || item.pickup.vendor.fullName,
      category: categoryLabel(item.category),
      chemistry: item.chemistry ? (chemistryLabel(item.chemistry) ?? item.chemistry) : null,
      pathway: item.pathway,
      traceId: item.traceId,
      pricePaise: item.linePricePaise,
      flags,
      updatedAgo: formatAge(item.updatedAt, now),
    }
  })

  const enginePriced = rows.filter((r) => r.traceId !== null).length
  const flatRate = rows.length - enginePriced
  const flagged = rows.filter((r) => r.flags.length > 0).length

  return (
    <>
      <PageHead
        title="Quote queue"
        description={`Every priced item — engine-quoted and flat-rate alike (AD1). ${items.length >= MAX_ROWS ? `Showing the most recent ${MAX_ROWS}.` : ''}`}
      />

      <div className="flex flex-wrap gap-3">
        <KpiTile label="Total quoted" value={String(rows.length)} />
        <KpiTile label="Engine-priced" value={String(enginePriced)} delta="li-ion, damage-rubric routed" deltaTone="neutral" />
        <KpiTile label="Flat-rate" value={String(flatRate)} delta="lead-acid / NiMH / other" deltaTone="neutral" />
        <KpiTile
          label="HOLD / REVIEW"
          value={String(flagged)}
          delta={flagged > 0 ? 'engine raised a flag' : 'none flagged'}
          tone={flagged > 0 ? 'exception' : 'default'}
        />
      </div>

      <QuotesTable rows={rows} />

      <p className="text-xs leading-relaxed text-text-secondary">
        Read-only. A flagged item is resolved on{' '}
        <span className="font-mono text-[11px]">/exceptions</span>, not here.
      </p>
    </>
  )
}
