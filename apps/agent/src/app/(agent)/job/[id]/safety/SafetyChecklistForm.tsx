'use client'

import { useState } from 'react'

import { Button, Card, CardContent, SectionLabel } from '@clbipp/ui'
import { SAFETY_ITEMS, type SafetyAnswers, type SafetyItemGroup } from '@clbipp/core/safety'

import { submitSafetyChecklist } from './actions'

// ─── The checklist form (W1 · Batch 2) ───────────────────────────────────────
// The ONLY reason this is a client component is the lithium toggle: the li-on
// block has to appear and disappear as the agent answers, and a server round
// trip to reveal three checkboxes would be absurd on a phone at a loading bay.
// Everything else is uncontrolled — plain <input type="checkbox"> inside a form
// with a server action, so the ticks post fine even if the JS never hydrates.
//
// ⚠ `@clbipp/core/safety`, NOT `@clbipp/core`. The package barrel re-exports
// booking-actions / payment-actions, so importing the catalogue from the barrel
// would pull Prisma into the browser bundle. Same trap as `formatPaise`, same
// fix — the subpath resolves to a module that imports nothing.
//
// The submit button is deliberately NEVER disabled. A disabled button on a
// half-done checklist tells an agent nothing about what is missing, and the
// server is the thing that decides pass/fail anyway — so submitting an
// incomplete checklist is a real, useful action that returns a list of what is
// outstanding and records that the check was attempted.

const GROUP_LABEL: Record<SafetyItemGroup, string> = {
  general: 'Before you handle anything',
  lithium: 'Lithium-ion handling',
  damaged: 'Damaged units declared',
}

function CheckItem({
  itemKey,
  label,
  help,
  defaultChecked,
  outstanding,
}: {
  itemKey: string
  label: string
  help: string
  defaultChecked: boolean
  outstanding: boolean
}) {
  return (
    <label
      htmlFor={itemKey}
      className="flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 last:border-b-0"
    >
      <input
        type="checkbox"
        id={itemKey}
        name={itemKey}
        defaultChecked={defaultChecked}
        // h-5/w-5 with a 44px-tall row: this gets tapped with gloves on.
        className="mt-0.5 h-5 w-5 shrink-0 accent-primary-green"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text-primary">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-text-secondary">{help}</span>
        {outstanding && (
          <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wider text-error">
            Outstanding
          </span>
        )}
      </span>
    </label>
  )
}

export function SafetyChecklistForm({
  pickupId,
  defaultAnswers,
  defaultLithiumPresent,
  damagedUnitsPresent,
  missing,
  lithiumGuessReason,
}: {
  pickupId: string
  defaultAnswers: SafetyAnswers
  defaultLithiumPresent: boolean
  damagedUnitsPresent: boolean
  /** Keys left unticked by the previous submission, highlighted inline. */
  missing: string[]
  /** Plain-language note on why the toggle defaulted the way it did. */
  lithiumGuessReason: string
}) {
  const [lithiumPresent, setLithiumPresent] = useState(defaultLithiumPresent)

  const visible = SAFETY_ITEMS.filter((item) => {
    if (item.group === 'lithium') return lithiumPresent
    if (item.group === 'damaged') return damagedUnitsPresent
    return true
  })

  const groups: SafetyItemGroup[] = ['general', 'lithium', 'damaged']

  return (
    <form action={submitSafetyChecklist} className="flex flex-col gap-4">
      <input type="hidden" name="pickupId" value={pickupId} />
      {/* The toggle's answer travels as a real field so the server records the
          agent's judgement rather than re-deriving its own guess. The server
          still recomputes which items were REQUIRED from it — a posted "no"
          shortens the list but can never drop the HR-mandated five. */}
      <input type="hidden" name="lithiumPresent" value={lithiumPresent ? 'yes' : 'no'} />

      {/* ── The chemistry question ──────────────────────────────────────────
          Asked rather than guessed, because BatteryItem.chemistry is not filled
          in until intake — the screen this checklist gates — so the customer's
          declared category is the only chemistry-adjacent data that exists
          here, and it is a form factor, not a chemistry. The agent is looking
          at the load; they answer better than the guess does. */}
      <Card variant="elevated">
        <CardContent className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-bold text-text-primary">
              Does this load contain lithium-ion?
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              {lithiumGuessReason}
            </p>
          </div>

          <div className="flex gap-2" role="group" aria-label="Load contains lithium-ion">
            {[
              { value: true, label: 'Yes' },
              { value: false, label: 'No' },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={lithiumPresent === option.value}
                onClick={() => setLithiumPresent(option.value)}
                className={[
                  'h-11 flex-1 rounded-full border-2 text-sm font-semibold transition-colors',
                  lithiumPresent === option.value
                    ? 'border-primary-black bg-primary-green text-text-primary'
                    : 'border-border bg-transparent text-text-secondary',
                ].join(' ')}
              >
                {option.label}
              </button>
            ))}
          </div>

          {!lithiumPresent && (
            <p className="text-[11px] leading-relaxed text-text-secondary">
              Answering No removes the lithium-specific items only. Everything
              below stays required on every job.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── The items ─────────────────────────────────────────────────────── */}
      {groups.map((group) => {
        const items = visible.filter((item) => item.group === group)
        if (items.length === 0) return null

        return (
          <div key={group} className="flex flex-col gap-2">
            <SectionLabel>{GROUP_LABEL[group]}</SectionLabel>
            <Card variant="elevated">
              <CardContent className="flex flex-col px-0 py-0">
                {items.map((item) => (
                  <CheckItem
                    key={item.key}
                    itemKey={item.key}
                    label={item.label}
                    help={item.help}
                    defaultChecked={defaultAnswers[item.key] === true}
                    outstanding={missing.includes(item.key)}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        )
      })}

      <Button type="submit" variant="primary" fullWidth>
        Confirm and continue to intake
      </Button>

      <p className="text-[11px] leading-relaxed text-text-secondary">
        Recorded against your name and this job. Intake stays locked until every
        item above is confirmed.
      </p>
    </form>
  )
}
