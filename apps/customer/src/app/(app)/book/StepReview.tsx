'use client'

import type { BatteryCategory } from '@clbipp/database'
import type { QuoteResult } from '@clbipp/core'
import { Banner, Button, Card } from '@clbipp/ui'

import { CATEGORY_LABELS, CONDITION_LABELS, formatPaise } from './copy'
import { parseQuantity, parseWeight, type AddressOption, type DraftItem } from './types'

// ─── Step 4 — review + indicative quote ──────────────────────────────────────
// The quote comes from `getQuote` through the `quoteBooking` server action —
// the pricing rates live in the database, so the browser can't price a basket.
// The number shown here is INDICATIVE and is recomputed server-side on submit;
// what the client displays never becomes what the row stores.
//
// What is shown: a price and a qualitative reason per line. What is not: a
// recovery rate (never shown to a vendor, anywhere) or a rupee material
// breakdown. `QuoteLine.note` is qualitative by design for exactly this.

export function StepReview({
  category,
  items,
  addresses,
  addressId,
  preferredDate,
  notes,
  quote,
  quoteError,
  onRetryQuote,
}: {
  category: BatteryCategory
  items: DraftItem[]
  addresses: AddressOption[]
  addressId: string
  preferredDate: string
  notes: string
  quote: QuoteResult | null
  quoteError: string | null
  onRetryQuote: () => void
}) {
  const address = addresses.find((a) => a.id === addressId)
  const totalUnits = items.reduce((sum, item) => sum + (parseQuantity(item.quantity) ?? 0), 0)
  const weighed = items.map((item) => parseWeight(item.weightKg))
  const knownWeight = weighed.reduce((sum: number, kg) => sum + (kg ?? 0), 0)
  const hasUnweighed = weighed.some((kg) => kg === null)

  return (
    <div className="flex flex-col gap-4">
      {/* ── The quote ─────────────────────────────────────────────────────── */}
      <Card variant="elevated" className="flex flex-col gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
          Indicative quote
        </span>

        {quote === null && quoteError === null && (
          <p className="text-sm text-text-secondary">Pricing your pickup…</p>
        )}

        {quoteError !== null && (
          <div className="flex flex-col gap-2">
            <Banner variant="warning">
              {quoteError} You can still submit — the agent will quote on site.
            </Banner>
            <Button variant="secondary" size="sm" onClick={onRetryQuote}>
              Try again
            </Button>
          </div>
        )}

        {quote !== null && (
          <>
            <p className="font-serif text-4xl font-semibold text-text-primary">
              {formatPaise(quote.totalPaise)}
            </p>

            <div className="flex flex-col gap-2">
              {quote.lines.map((line) => {
                const item = items[line.index]
                if (!item) return null
                const kg = parseWeight(item.weightKg)
                return (
                  <div key={line.index} className="flex flex-col gap-0.5 border-t border-border pt-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-text-primary">
                        {parseQuantity(item.quantity) ?? 0} × {CATEGORY_LABELS[category]}
                        <span className="text-text-secondary">
                          {' · '}
                          {CONDITION_LABELS[item.condition]}
                          {kg !== null ? ` · ${kg} kg` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-medium text-text-primary">
                        {formatPaise(line.linePaise)}
                      </span>
                    </div>
                    {line.note && (
                      <p className="text-xs leading-relaxed text-text-secondary">{line.note}</p>
                    )}
                  </div>
                )
              })}
            </div>

            <p className="text-xs leading-relaxed text-text-secondary">{quote.disclaimer}</p>
          </>
        )}
      </Card>

      {/* ── What we're collecting ─────────────────────────────────────────── */}
      <Card variant="default" className="flex flex-col gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
          Your request
        </span>

        <SummaryRow label="Category" value={CATEGORY_LABELS[category]} />
        <SummaryRow
          label="Batteries"
          value={`${totalUnits} unit${totalUnits === 1 ? '' : 's'} across ${items.length} line${
            items.length === 1 ? '' : 's'
          }`}
        />
        <SummaryRow
          label="Weight"
          value={
            knownWeight > 0
              ? `${knownWeight} kg${hasUnweighed ? ' + unweighed lines' : ''}`
              : 'To be weighed on collection'
          }
        />
        <SummaryRow
          label="Photos"
          value={String(items.reduce((sum, item) => sum + item.photos.length, 0))}
        />
        <SummaryRow
          label="Pickup address"
          value={
            address
              ? `${address.label} — ${address.line1}, ${address.city} ${address.pincode}`
              : '—'
          }
        />
        <SummaryRow
          label="Preferred date"
          value={preferredDate === '' ? 'No preference' : formatDate(preferredDate)}
        />
        {notes.trim() !== '' && <SummaryRow label="Notes" value={notes.trim()} />}
      </Card>

      <p className="text-xs leading-relaxed text-text-secondary">
        Submitting sends this to our operations team. You&apos;ll be able to track it from the
        moment it&apos;s created, and you can cancel while it&apos;s still unscheduled.
      </p>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border pt-2 first-of-type:border-t-0 first-of-type:pt-0">
      <span className="shrink-0 text-sm text-text-secondary">{label}</span>
      <span className="text-right text-sm font-medium text-text-primary">{value}</span>
    </div>
  )
}

/** "2026-08-20" → "20 Aug 2026". Parsed as parts, not `new Date(string)`, so a
 *  browser timezone can't render the customer's chosen date as the day before. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
