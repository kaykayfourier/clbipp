'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { Banner, Button, Card } from '@clbipp/ui'

import { computeItemQuote } from '../actions'

// Runs the engine through a server action as soon as the screen opens, then
// moves on to the result. The price is worked out and stored on the server.
export function ComputingRunner({ pickupId, itemId }: { pickupId: string; itemId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    computeItemQuote(pickupId, itemId)
      .then((result) => {
        if (cancelled) return
        if (result.error) setError(result.error)
        else router.push(`/job/${pickupId}/items/${itemId}/result`)
      })
      .catch(() => {
        if (!cancelled) setError('No connection. Try again.')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Banner variant="error">{error}</Banner>
        <Button variant="primary" fullWidth onClick={() => window.location.reload()}>
          Try again
        </Button>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => router.push(`/job/${pickupId}/items/${itemId}/damage`)}
        >
          Back to damage readings
        </Button>
      </div>
    )
  }

  return (
    <Card variant="elevated" className="flex flex-col items-center gap-3 py-8">
      <span
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary-green"
      />
      <p className="text-sm font-semibold text-text-primary">Calculating price…</p>
    </Card>
  )
}
