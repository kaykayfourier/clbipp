'use client'

import { useState } from 'react'
import { Button } from '@clbipp/ui'

// Must be a client component: navigator.geolocation only exists in the browser.
//
// No embedded map picker by design (Plan v2 §5 A2) — a Maps picker needs a
// billed Google key, and lat/lng from the device plus the typed address carry
// the same information. Coordinates stay OPTIONAL: if the customer denies the
// permission prompt, the form still submits and the address saves without them.

type GeoState =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'captured'; lat: number; lng: number; accuracy: number }
  | { kind: 'failed'; message: string }

// Field is duplicated from (auth)/field.tsx rather than imported across route
// groups — same reason the original exists: C's shared <Input> never landed.
// TODO: collapse both into a shared @clbipp/ui <Input> when it does.
function Field({
  label,
  name,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label htmlFor={name} className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold tracking-wide text-text-secondary">{label}</span>
      <input
        id={name}
        name={name}
        className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green"
        {...props}
      />
      {hint && <span className="text-[11px] text-text-secondary">{hint}</span>}
    </label>
  )
}

export function AddressForm({ action }: { action: (formData: FormData) => void }) {
  const [geo, setGeo] = useState<GeoState>({ kind: 'idle' })

  function captureLocation() {
    if (!('geolocation' in navigator)) {
      setGeo({ kind: 'failed', message: "This device can't share a location. Type the address instead." })
      return
    }

    setGeo({ kind: 'locating' })

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeo({
          kind: 'captured',
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        })
      },
      (err) => {
        // PERMISSION_DENIED is the common case and isn't an error worth
        // alarming anyone about — the address is still perfectly usable.
        const message =
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Enter the address manually — that's fine."
            : "Couldn't get your location. Enter the address manually."
        setGeo({ kind: 'failed', message })
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    )
  }

  const captured = geo.kind === 'captured'

  return (
    <form action={action} className="flex flex-col gap-3">
      <Field
        label="Label"
        name="label"
        type="text"
        required
        maxLength={40}
        placeholder="Warehouse, Home, Depot 2"
        hint="A short name so you can tell your addresses apart."
      />
      <Field label="Address line 1" name="line1" type="text" required maxLength={120} placeholder="Building, street" />
      <Field label="Address line 2" name="line2" type="text" maxLength={120} placeholder="Area, landmark (optional)" />

      <div className="grid grid-cols-2 gap-3">
        <Field label="City" name="city" type="text" required maxLength={60} placeholder="Bengaluru" />
        <Field label="State" name="state" type="text" required maxLength={60} placeholder="Karnataka" />
      </div>

      <Field
        label="PIN code"
        name="pincode"
        type="text"
        required
        inputMode="numeric"
        pattern="[1-9][0-9]{5}"
        maxLength={6}
        placeholder="560001"
      />

      {/* ── GPS capture ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <span className="text-[11px] font-bold tracking-wide text-text-secondary">
          Location (optional)
        </span>
        <p className="text-[11px] text-text-secondary">
          Sharing GPS coordinates helps the collection partner find you. You can skip this.
        </p>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={captureLocation}
          loading={geo.kind === 'locating'}
        >
          {captured ? 'Update my location' : 'Use my current location'}
        </Button>

        {captured && (
          <p className="text-[11px] text-text-primary">
            Location captured — accurate to about {geo.accuracy} m.
          </p>
        )}
        {geo.kind === 'failed' && (
          <p className="text-[11px] text-text-secondary">{geo.message}</p>
        )}

        {/* The only carrier of lat/lng into the server action. Empty strings
            when nothing was captured; the schema normalises those to undefined. */}
        <input type="hidden" name="lat" value={captured ? geo.lat : ''} />
        <input type="hidden" name="lng" value={captured ? geo.lng : ''} />
      </div>

      <label className="flex items-center gap-2 py-1">
        <input
          type="checkbox"
          name="isDefault"
          className="h-4 w-4 accent-[var(--color-primary-green)]"
        />
        <span className="text-sm text-text-primary">Make this my default pickup address</span>
      </label>

      <Button type="submit" fullWidth className="mt-1">
        Save address
      </Button>
    </form>
  )
}
