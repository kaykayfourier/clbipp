'use client'

import { useState, useTransition } from 'react'

import {
  DESTINATION_LABELS,
  MIN_PATHWAY_REASON_CHARS,
  PATHWAY_OPTIONS,
  destinationOf,
} from '@clbipp/core/pathway'

import { setItemPathway } from './actions'

// ─── Overriding the engine's destination for one battery (FV5 · FD4) ─────────
// Collapsed to a link by default. This is a rare, deliberate act — an admin
// saying the engine got a battery wrong — and a form sitting permanently open
// under every item would invite exactly the casual use a mandatory reason
// exists to prevent.

export function PathwayOverride({
  itemId,
  current,
  locked,
}: {
  itemId: string
  current: string | null
  /** Past `tested` the battery has left; its pathway is compliance record now. */
  locked: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pathway, setPathway] = useState(current ?? 'recycle')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (locked) {
    return (
      <p className="text-[11px] text-text-disabled">
        Pathway is part of the compliance record for this pickup and can no longer be changed.
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary"
      >
        Override destination
      </button>
    )
  }

  const destination = destinationOf(pathway)
  const changed = pathway !== current
  const reasonOk = reason.trim().length >= MIN_PATHWAY_REASON_CHARS

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-console-line bg-background p-2.5">
      <div className="flex flex-wrap gap-1.5">
        {PATHWAY_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setPathway(o.value)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
              pathway === o.value
                ? 'border-primary-black bg-primary-black text-white'
                : 'border-console-line text-text-secondary hover:text-text-primary'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* The consequence, stated before they commit to it. "Refurbish" does not
          obviously mean "this stops being shippable to a recycler" unless the
          screen says so. */}
      <p className="text-[11px] leading-relaxed text-text-secondary">
        Goes to <b>{destination ? DESTINATION_LABELS[destination] : '—'}</b>.{' '}
        {destination === 'second_life'
          ? 'It will be held at the facility and excluded from recycler manifests.'
          : 'It stays available to put on a recycler manifest.'}
      </p>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder={`Why is the engine wrong about this battery? (${MIN_PATHWAY_REASON_CHARS} characters minimum)`}
        className="w-full rounded-lg border border-console-line bg-surface px-2 py-1.5 text-xs text-text-primary"
      />

      {error && <p className="text-[11px] text-error-text">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !changed || !reasonOk}
          onClick={() =>
            start(async () => {
              setError(null)
              const result = await setItemPathway({ itemId, pathway, reason })
              if (result.ok) setOpen(false)
              else setError(result.error)
            })
          }
          className="rounded-lg bg-primary-black px-3 py-1.5 text-[11px] font-bold text-primary-green disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Apply override'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
            setReason('')
            setPathway(current ?? 'recycle')
          }}
          className="text-[11px] text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
        {!changed && (
          <span className="text-[11px] text-text-disabled">Pick a different pathway.</span>
        )}
      </div>
    </div>
  )
}
