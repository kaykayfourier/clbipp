'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { formatPaise } from '@clbipp/core/format'
import { Button, Card, CardContent } from '@clbipp/ui'

export type PendingJob = {
  id: string
  vendorName: string
  itemCount: number
  totalWeightKg: number
  linePricePaise: number
}

// ─── Batch select (Batch 7a) ─────────────────────────────────────────────────
// Defaults to every pending job selected — "the collected pickups going to the
// hub in one CustodyBatch" (stub's own description) reads as all of them by
// default, with the option to hold one back (e.g. it's staying in the vehicle
// for a second stop first).
//
// The selection travels to /dropoff/confirm as a query string, not a draft row
// in the database — there is no CustodyBatch until the confirm screen actually
// creates one, and adding a "draft batch" table for a hand-off between two
// screens in the same flow would be schema for something that isn't state,
// it's a form. Same reasoning as any multi-step form keeping its own state.
export function BatchSelectForm({ jobs }: { jobs: PendingJob[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set(jobs.map((j) => j.id)))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const chosen = jobs.filter((j) => selected.has(j.id))
  const totalWeight = chosen.reduce((s, j) => s + j.totalWeightKg, 0)
  const totalItems = chosen.reduce((s, j) => s + j.itemCount, 0)

  return (
    <div className="flex flex-col gap-4">
      <Card variant="elevated">
        <CardContent className="flex flex-col divide-y divide-border px-0 py-0">
          {jobs.map((job) => (
            <label
              key={job.id}
              htmlFor={`job-${job.id}`}
              className="flex cursor-pointer items-start gap-3 px-4 py-3"
            >
              <input
                type="checkbox"
                id={`job-${job.id}`}
                checked={selected.has(job.id)}
                onChange={() => toggle(job.id)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-primary-green"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-text-primary">{job.vendorName}</span>
                <span className="block text-xs text-text-secondary">
                  {job.itemCount} item{job.itemCount === 1 ? '' : 's'} · {job.totalWeightKg.toFixed(1)} kg ·{' '}
                  {formatPaise(job.linePricePaise)}
                </span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-1 rounded-[10px] bg-primary-black px-4 py-3.5 text-white">
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/60">Batch total</span>
          <span className="font-semibold text-primary-green">
            {chosen.length} job{chosen.length === 1 ? '' : 's'} · {totalWeight.toFixed(1)} kg ·{' '}
            {totalItems} item{totalItems === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <Button
        variant="primary"
        fullWidth
        disabled={chosen.length === 0}
        onClick={() =>
          router.push(`/dropoff/confirm?pickups=${chosen.map((j) => j.id).join(',')}`)
        }
      >
        Continue to hand-off
      </Button>
    </div>
  )
}
