'use client'

import { useState } from 'react'

import { formatVehicleReg, isVehicleCorrection, normaliseVehicleReg } from '@clbipp/core/vehicle'
import { SectionLabel } from '@clbipp/ui'

// ─── Vehicle number (AF2 · FD25) ─────────────────────────────────────────────
// Mandatory at collection and at hub drop-off, prefilled. The server action
// recomputes the prefill itself and decides what counts as a correction — the
// hint here only tells the agent what will be recorded.

export function VehicleField({
  prefill,
  onValidChange,
}: {
  /** Canonical registration the server worked out, or null. */
  prefill: string | null
  onValidChange: (valid: boolean) => void
}) {
  const [value, setValue] = useState(prefill ? formatVehicleReg(prefill) : '')
  const reg = normaliseVehicleReg(value)
  const changed = reg !== null && isVehicleCorrection(prefill, reg)

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
        placeholder="DL 1LR 4471"
        autoCapitalize="characters"
        autoComplete="off"
        required
        className="h-12 w-full rounded-[10px] border border-border bg-background px-3 text-base uppercase text-text-primary"
      />
      {value.trim() !== '' && reg === null && (
        <p className="text-[11px] font-semibold text-error">Use the format DL 1LR 4471.</p>
      )}
      {changed && prefill && (
        <p className="text-[11px] text-text-secondary">
          Changed from {formatVehicleReg(prefill)}. The change is recorded.
        </p>
      )}
    </div>
  )
}
