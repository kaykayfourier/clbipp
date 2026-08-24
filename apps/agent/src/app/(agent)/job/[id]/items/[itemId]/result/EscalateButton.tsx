'use client'

import { useState, useTransition } from 'react'

import { Button } from '@clbipp/ui'

import { escalateToAdmin } from './actions'

export function EscalateButton({
  pickupId,
  itemId,
  traceId,
}: {
  pickupId: string
  itemId: string
  traceId: string
}) {
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (done) {
    return (
      <p className="rounded-[10px] border border-border px-4 py-3 text-center text-xs leading-relaxed text-text-secondary">
        Escalated. Recorded on this pickup&rsquo;s timeline for admin to review.
      </p>
    )
  }

  return (
    <>
      <Button
        variant="secondary"
        fullWidth
        loading={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await escalateToAdmin(pickupId, itemId, traceId)
            if (result.error) setError(result.error)
            else setDone(true)
          })
        }
      >
        Escalate to admin
      </Button>
      {error && <p className="text-center text-xs text-error">{error}</p>}
    </>
  )
}
