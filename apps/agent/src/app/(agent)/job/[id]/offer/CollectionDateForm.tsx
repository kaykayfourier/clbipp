import { Button } from '@clbipp/ui'

import { MAX_COLLECTION_DAYS_AHEAD } from '@clbipp/core/collection'

import { scheduleCollectionAndReturn } from '../actions'

// ─── Book a collection for a later day (FV3 · FD0) ───────────────────────────
// A plain server-action form, deliberately: no client component, no state, no
// JavaScript required. An agent standing in a warehouse basement with one bar
// of signal gets a working date picker and a POST, which is the whole point.
//
// 🔴 A POST, never a GET. Every lifecycle-adjacent write in this app is a form
// action for the reason Batch 12 learned the hard way in the customer app — a
// GET that mutates is advanced by a link prefetch, a crawler, or a smoke test.
//
// The `min`/`max` attributes are a convenience, not the rule: `parseCollection
// Date` in @clbipp/core re-checks both server-side, because the form is not the
// boundary.
export function CollectionDateForm({
  pickupId,
  defaultValue,
  label,
  cta,
}: {
  pickupId: string
  /** "YYYY-MM-DD", or "" for an unbooked pickup. */
  defaultValue: string
  label: string
  cta: string
}) {
  const today = new Date()
  const max = new Date(today.getTime() + MAX_COLLECTION_DAYS_AHEAD * 86_400_000)

  return (
    <form action={scheduleCollectionAndReturn} className="flex flex-col gap-2">
      <input type="hidden" name="pickupId" value={pickupId} />
      <label htmlFor="collectionDate" className="text-sm font-semibold text-text-primary">
        {label}
      </label>
      <input
        type="date"
        id="collectionDate"
        name="collectionDate"
        required
        defaultValue={defaultValue}
        min={toInput(today)}
        max={toInput(max)}
        className="h-12 w-full rounded-[10px] border border-border bg-background px-3 text-base text-text-primary"
      />
      <Button type="submit" variant="secondary" fullWidth>
        {cta}
      </Button>
    </form>
  )
}

/** Date → "YYYY-MM-DD" in LOCAL time. `toISOString()` would be wrong here: it
 *  converts to UTC first, so an evening in IST renders as the previous day. */
function toInput(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}
