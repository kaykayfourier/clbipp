'use client'

import type { BatteryCategory } from '@clbipp/database'
import { Card } from '@clbipp/ui'

import { CATEGORY_HINTS, CATEGORY_LABELS, CATEGORY_ORDER } from './copy'

// ─── Step 1 — category ───────────────────────────────────────────────────────
// One category per pickup, not per line. `Pickup.category` is a single header
// column, so a mixed basket could not be represented faithfully — a customer
// with both car and laptop batteries books two pickups. The quote engine is
// category-first for the same reason, and the customer is never asked for
// chemistry: the company flow document assigns that to the field agent.

export function StepCategory({
  value,
  onChange,
}: {
  value: BatteryCategory | null
  onChange: (next: BatteryCategory) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-text-secondary">
        Pick the closest match. Our field agent confirms the exact chemistry and condition on
        site — you don&apos;t need to know it.
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Battery category</legend>

        {CATEGORY_ORDER.map((category) => {
          const selected = value === category
          return (
            <Card
              key={category}
              variant={selected ? 'elevated' : 'default'}
              className={selected ? 'ring-2 ring-primary-green' : undefined}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="category"
                  value={category}
                  checked={selected}
                  onChange={() => onChange(category)}
                  className="mt-1 h-4 w-4 accent-primary-green"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-primary">
                    {CATEGORY_LABELS[category]}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-text-secondary">
                    {CATEGORY_HINTS[category]}
                  </span>
                </span>
              </label>
            </Card>
          )
        })}
      </fieldset>

      <p className="text-xs leading-relaxed text-text-secondary">
        Collecting more than one category? Book them as separate pickups so each gets its own
        agent, quote and EPR certificate.
      </p>
    </div>
  )
}
