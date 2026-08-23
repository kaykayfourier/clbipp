'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { Banner, Button, Card } from '@clbipp/ui'

import { saveQuoteResult } from '../actions'

type LayerState = 'done' | 'active' | 'todo'

const LAYERS: Array<{ label: string; note: string }> = [
  { label: 'Layer 0 · Intake validated', note: 'trace_id assigned · config pinned' },
  { label: 'Layer 1 · Damage scored', note: 'Weighted score from the rubric' },
  { label: 'Layer 2 · BMS safety checked', note: 'Checking for anomaly flags' },
  { label: 'Layer 3 · SoH gating', note: 'Eligibility by state of health' },
  { label: 'Layer 4 · Pathway economics', note: 'Computing revenue & costs' },
  { label: 'Layer 5 · Selection & pricing', note: 'Picking the winning pathway' },
]

/** batteryType is the DB's BatteryType enum value — /api/quote's own D1 branch key. */
export function ComputingRunner({
  pickupId,
  itemId,
  batteryType,
  quoteInput,
}: {
  pickupId: string
  itemId: string
  batteryType: string
  quoteInput: {
    battery: Record<string, unknown>
    damage: Record<string, unknown>
    distance_km: { in: number }
    inflow_type: string
  }
}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = setInterval(() => {
      setStep((s) => (s < LAYERS.length - 1 ? s + 1 : s))
    }, 250)

    async function run() {
      try {
        const res = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pickupId,
            itemId,
            batteryType,
            battery: quoteInput.battery,
            damage: quoteInput.damage,
            distance_km: quoteInput.distance_km,
            inflow_type: quoteInput.inflow_type,
          }),
        })

        const output = await res.json()
        if (!res.ok) {
          if (!cancelled) setError(output.error ?? 'The engine could not price this item.')
          return
        }

        const saved = await saveQuoteResult(pickupId, itemId, output)
        if (saved.error) {
          if (!cancelled) setError(saved.error)
          return
        }

        if (!cancelled) {
          router.push(`/job/${pickupId}/items/${itemId}/result`)
        }
      } catch {
        if (!cancelled) setError('Could not reach the pricing engine. Check your connection and try again.')
      }
    }

    void run()
    return () => {
      cancelled = true
      clearInterval(tick)
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
          Back to damage rubric
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <div className="text-center">
        <p className="font-serif text-xl font-medium text-text-primary">Running the engine</p>
        <p className="mt-1 text-sm text-text-secondary">Six layers, one pass — hold tight.</p>
      </div>

      <Card variant="elevated" className="w-full">
        <div className="flex flex-col divide-y divide-border">
          {LAYERS.map((layer, i) => {
            const state: LayerState = i < step ? 'done' : i === step ? 'active' : 'todo'
            return (
              <div key={layer.label} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    state === 'done'
                      ? 'bg-primary-green text-primary-black'
                      : state === 'active'
                        ? 'animate-pulse bg-primary-green/30 text-text-primary'
                        : 'bg-border text-text-secondary'
                  }`}
                >
                  {state === 'done' ? '✓' : i}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{layer.label}</p>
                  <p className="text-[11px] text-text-secondary">{layer.note}</p>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <p className="text-[11px] text-text-secondary">POST /api/quote</p>
    </div>
  )
}
