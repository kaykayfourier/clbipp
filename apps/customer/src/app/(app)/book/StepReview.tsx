'use client'

import type { BatteryCategory } from '@clbipp/database'
import { Card } from '@clbipp/ui'

import { CATEGORY_LABELS } from './copy'
import { parseQuantity, parseWeight, type AddressOption, type DraftItem } from './types'

// ─── Step 4 — review ─────────────────────────────────────────────────────────
// 🔴 NO PRICE ON THIS SCREEN (FV1 · FD2, 2026-09-10). Until the company's
// presentation feedback this step rendered an indicative quote — a total, a
// per-line price and a qualitative note each. All of it is gone, deliberately:
// the customer's first number is now the offer the agent makes after physically
// inspecting the batteries.
//
// The vendor-visibility rules this screen used to observe still apply
// everywhere else, and are unchanged: no recovery rate %, ever, and no rupee
// material breakdown on any offer or tracking screen.

export function StepReview({
  category,
  items,
  addresses,
  addressId,
  preferredDate,
  notes,
}: {
  category: BatteryCategory
  items: DraftItem[]
  addresses: AddressOption[]
  addressId: string
  preferredDate: string
  notes: string
}) {
  const address = addresses.find((a) => a.id === addressId)
  const totalUnits = items.reduce((sum, item) => sum + (parseQuantity(item.quantity) ?? 0), 0)
  const weighed = items.map((item) => parseWeight(item.weightKg))
  const knownWeight = weighed.reduce((sum: number, kg) => sum + (kg ?? 0), 0)
  const hasUnweighed = weighed.some((kg) => kg === null)

  return (
    <div className="flex flex-col gap-4">
      {/* ── What happens to the price ──────────────────────────────────────
          Replaces the indicative quote. No number and no range: a range is an
          anchor too, and the whole point of FD2 is that the customer's first
          figure comes after someone has seen the batteries. */}
      <Card variant="elevated" className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
          Your price
        </span>
        <p className="text-sm leading-relaxed text-text-primary">
          We&apos;ll give you a price after our agent has inspected the batteries in person.
        </p>
        <p className="text-xs leading-relaxed text-text-secondary">
          They&apos;ll weigh each line on a digital scale and check its condition, then make you an
          offer on the spot. Nothing is collected until you accept it.
        </p>
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
