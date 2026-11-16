'use client'

import { useState } from 'react'

import { normaliseVehicleReg } from '@clbipp/core/vehicle'
import { SectionLabel } from '@clbipp/ui'

// ─── Vehicle number (AF2 · FD25, blank since round 3) ────────────────────────
// Mandatory at collection and at hub drop-off, and deliberately EMPTY. The
// company's round-3 feedback: a prefilled number gets tapped past without
// anyone looking at the plate, so the agent types what is on the van in front
// of them. No prefill, no hint, and no example registration anywhere on this
// field — not even as a placeholder or in the format error, since any number
// shown here is one an agent can copy instead of checking.
//
// The server action still knows the vehicle on record (run, profile, or the
// collection vehicle at drop-off) and logs a `vehicle_corrections` row when
// the typed number differs. That comparison never reaches the phone.

export function VehicleField({ onValidChange }: { onValidChange: (valid: boolean) => void }) {
  const [value, setValue] = useState('')
  const invalid = value.trim() !== '' && normaliseVehicleReg(value) === null

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Vehicle number</SectionLabel>
      <input
        type="text"
        name="vehicle"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          onValidChange(normaliseVehicleReg(e.target.value) !== null)
        }}
        placeholder="Type the number on your vehicle"
        autoCapitalize="characters"
        autoComplete="off"
        required
        className="h-12 w-full rounded-[10px] border border-border bg-background px-3 text-base uppercase text-text-primary"
      />
      {invalid && (
        <p className="text-[11px] font-semibold text-error">That is not a full vehicle number. Check the plate.</p>
      )}
    </div>
  )
}
