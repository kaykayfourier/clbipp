'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { AddressStatus } from '@clbipp/database'
import { Button, Card } from '@clbipp/ui'

import { deleteAddress, setDefaultAddress, updateAddressStatus } from './actions'

// Client island for the per-address actions. A server component can't hand an
// onClick to the browser — that's the crash that took out /scheduled — so the
// row buttons live here and the page stays a server component.
// Mirrors ../scheduled/PickupActions.tsx: useTransition + router.refresh().

// Only the fields the row renders. The page maps Prisma rows into this shape
// because Decimal (lat/lng) and Date don't cross the boundary cleanly.
export type AddressCardData = {
  id: string
  label: string
  line1: string
  line2: string | null
  city: string
  state: string
  pincode: string
  hasCoords: boolean
  status: AddressStatus
  isDefault: boolean
}

export function AddressCard({ address }: { address: AddressCardData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isOperational = address.status === 'operational'

  function run(action: () => Promise<{ error: string | null }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  function handleDelete() {
    if (!window.confirm(`Remove "${address.label}" from your addresses?`)) return
    run(() => deleteAddress(address.id))
  }

  return (
    <Card variant={address.isDefault ? 'elevated' : 'default'}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">{address.label}</span>

              {address.isDefault && (
                <span className="rounded-full bg-primary-green/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-primary">
                  Default
                </span>
              )}

              {!isOperational && (
                <span className="rounded-full bg-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                  Not operational
                </span>
              )}
            </div>

            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ''}
              <br />
              {address.city}, {address.state} {address.pincode}
            </p>

            {address.hasCoords && (
              <p className="mt-1 text-[11px] text-text-secondary">
                📍 Map pin saved for the collection partner
              </p>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!address.isDefault && (
            <Button
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={() => run(() => setDefaultAddress(address.id))}
            >
              Make default
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() =>
              run(() =>
                updateAddressStatus(address.id, isOperational ? 'not_operational' : 'operational'),
              )
            }
          >
            {isOperational ? 'Mark not operational' : 'Mark operational'}
          </Button>

          <Button variant="ghost" size="sm" disabled={isPending} onClick={handleDelete}>
            Remove
          </Button>
        </div>
      </div>
    </Card>
  )
}
