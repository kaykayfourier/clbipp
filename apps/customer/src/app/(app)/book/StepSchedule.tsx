'use client'

import Link from 'next/link'

import { Card } from '@clbipp/ui'

import type { AddressOption } from './types'

// ─── Step 3 — where and when ─────────────────────────────────────────────────
// The picker only ever shows OPERATIONAL addresses (filtered in page.tsx);
// `not_operational` means "on file, but we can't collect from it today".
//
// The customer states a PREFERRED date, not a booked slot. `Pickup.preferredDate`
// and `Pickup.scheduledSlot` are two different columns for that reason: the slot
// is filled in when ops accept the request, which is why this screen promises a
// confirmation rather than a time.

/** Today in the browser's own timezone — `toISOString()` would shift the date. */
function todayLocalISO(): string {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10)
}

export function StepSchedule({
  addresses,
  addressId,
  onAddressChange,
  preferredDate,
  onPreferredDateChange,
  notes,
  onNotesChange,
}: {
  addresses: AddressOption[]
  addressId: string
  onAddressChange: (id: string) => void
  preferredDate: string
  onPreferredDateChange: (date: string) => void
  notes: string
  onNotesChange: (notes: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-text-primary">Pickup address</legend>

        {addresses.map((address) => {
          const selected = address.id === addressId
          return (
            <Card
              key={address.id}
              variant={selected ? 'elevated' : 'default'}
              className={selected ? 'ring-2 ring-primary-green' : undefined}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="addressId"
                  value={address.id}
                  checked={selected}
                  onChange={() => onAddressChange(address.id)}
                  className="mt-1 h-4 w-4 accent-primary-green"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">
                      {address.label}
                    </span>
                    {address.isDefault && (
                      <span className="rounded-full bg-primary-green/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-primary">
                        Default
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ''}
                    <br />
                    {address.city}, {address.state} {address.pincode}
                  </span>
                </span>
              </label>
            </Card>
          )
        })}

        <p className="text-xs text-text-secondary">
          Collecting from somewhere else?{' '}
          <Link href="/addresses/new" className="underline">
            Add an address
          </Link>
          . Addresses marked not operational aren&apos;t shown here.
        </p>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="preferred-date" className="text-sm font-medium text-text-primary">
          Preferred date <span className="text-xs font-normal text-text-secondary">Optional</span>
        </label>
        <input
          id="preferred-date"
          type="date"
          min={todayLocalISO()}
          value={preferredDate}
          onChange={(e) => onPreferredDateChange(e.target.value)}
          className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-green"
        />
        <p className="text-xs text-text-secondary">
          We&apos;ll confirm the actual slot once an agent is assigned.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-sm font-medium text-text-primary">
          Notes <span className="text-xs font-normal text-text-secondary">Optional</span>
        </label>
        <textarea
          id="notes"
          rows={3}
          maxLength={500}
          placeholder="Access via gate B, ask for Ravi on arrival, loading bay closes at 5pm…"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-green"
        />
        <p className="text-xs text-text-secondary">
          Access details, on-site contact, anything the agent should know.
        </p>
      </div>
    </div>
  )
}
