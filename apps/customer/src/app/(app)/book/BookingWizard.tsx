'use client'

import { useMemo, useState, useTransition } from 'react'

import type { BatteryCategory } from '@clbipp/database'
import type { BookingLineItem, QuoteResult } from '@clbipp/core'
import { AppShell, Banner, Button, PagePadding } from '@clbipp/ui'

import { quoteBooking, submitBooking } from './actions'
import { STEP_TITLES } from './copy'
import { StepCategory } from './StepCategory'
import { StepItems } from './StepItems'
import { StepReview } from './StepReview'
import { StepSchedule } from './StepSchedule'
import {
  emptyItem,
  itemError,
  parseQuantity,
  parseWeight,
  type AddressOption,
  type DraftItem,
} from './types'

// ─── The 4-step booking wizard ───────────────────────────────────────────────
// One client component holding the whole draft in state; the four steps are
// presentational and receive setters. Nothing is written until step 4 — a
// half-finished booking should not exist as a row, because every downstream
// screen (dashboard, tracking, compliance) reads pickups unconditionally.
//
// The steps are category → lines → address/date → quote, in that order for a
// reason: the quote engine is category-first (the customer is never asked for
// chemistry), so the category has to be known before a line can be priced, and
// the quote has to be last because it depends on every line.

const TOTAL_STEPS = 4

export function BookingWizard({
  userId,
  addresses,
}: {
  userId: string
  addresses: AddressOption[]
}) {
  const [step, setStep] = useState(1)

  const [category, setCategory] = useState<BatteryCategory | null>(null)
  const [items, setItems] = useState<DraftItem[]>([emptyItem()])
  const [addressId, setAddressId] = useState<string>(
    // Preselect the default so the common case is zero taps on step 3.
    () => addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? '',
  )
  const [preferredDate, setPreferredDate] = useState('')
  const [notes, setNotes] = useState('')

  const [quote, setQuote] = useState<QuoteResult | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // True while a photo is still uploading anywhere in the basket. Advancing
  // past step 2 mid-upload would drop the paths that hadn't landed yet.
  const [uploadingCount, setUploadingCount] = useState(0)

  const stepError = useMemo(() => {
    if (step === 1) return category ? null : 'Pick a category to continue.'
    if (step === 2) {
      if (items.length === 0) return 'Add at least one line.'
      const firstBad = items.map(itemError).find((e) => e !== null)
      if (firstBad) return firstBad
      if (uploadingCount > 0) return 'Waiting for photos to finish uploading…'
      return null
    }
    if (step === 3) return addressId ? null : 'Choose a pickup address.'
    return null
  }, [step, category, items, addressId, uploadingCount])

  /** The submitted shape — only ever built from a validated draft. */
  const payload = useMemo(() => {
    if (!category) return null
    const lines: BookingLineItem[] = items.map((item) => ({
      category,
      quantity: parseQuantity(item.quantity) ?? 1,
      weightKg: parseWeight(item.weightKg),
      condition: item.condition,
      photoUrls: item.photos.map((p) => p.path),
    }))

    return {
      category,
      addressId,
      items: lines,
      preferredDate: preferredDate === '' ? null : preferredDate,
      notes: notes.trim() === '' ? null : notes.trim(),
    }
  }, [category, items, addressId, preferredDate, notes])

  function goBack() {
    setSubmitError(null)
    setStep((s) => Math.max(1, s - 1))
  }

  function goNext() {
    if (stepError) return
    const next = step + 1
    setStep(next)
    // Step 4 is the quote screen — fetch it on arrival rather than on every
    // keystroke in step 2, so a basket is priced once when it's final.
    if (next === TOTAL_STEPS) void loadQuote()
  }

  async function loadQuote() {
    if (!payload) return
    setQuote(null)
    setQuoteError(null)

    const result = await quoteBooking(payload)
    if (result.ok) {
      setQuote(result.quote)
    } else {
      setQuoteError(result.error)
    }
  }

  function handleSubmit() {
    if (!payload) return
    setSubmitError(null)

    startTransition(async () => {
      // Returns only on failure — success redirects to /submitted.
      const result = await submitBooking(payload)
      if (result?.error) setSubmitError(result.error)
    })
  }

  return (
    <AppShell
      title="Request pickup"
      showBack
      backHref="/dashboard"
      hideNav
    >
      <PagePadding className="flex flex-col gap-4 pb-8">
        <StepHeader step={step} />

        {step === 1 && <StepCategory value={category} onChange={setCategory} />}

        {step === 2 && category && (
          <StepItems
            userId={userId}
            category={category}
            items={items}
            onChange={setItems}
            onUploadingChange={setUploadingCount}
          />
        )}

        {step === 3 && (
          <StepSchedule
            addresses={addresses}
            addressId={addressId}
            onAddressChange={setAddressId}
            preferredDate={preferredDate}
            onPreferredDateChange={setPreferredDate}
            notes={notes}
            onNotesChange={setNotes}
          />
        )}

        {step === 4 && category && (
          <StepReview
            category={category}
            items={items}
            addresses={addresses}
            addressId={addressId}
            preferredDate={preferredDate}
            notes={notes}
            quote={quote}
            quoteError={quoteError}
            onRetryQuote={() => void loadQuote()}
          />
        )}

        {submitError && <Banner variant="error">{submitError}</Banner>}

        {/* ── Step navigation ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          {step < TOTAL_STEPS ? (
            <Button variant="primary" fullWidth disabled={stepError !== null} onClick={goNext}>
              Continue
            </Button>
          ) : (
            <Button
              variant="primary"
              fullWidth
              loading={isPending}
              disabled={isPending}
              onClick={handleSubmit}
            >
              Submit request
            </Button>
          )}

          {step > 1 && (
            <Button variant="ghost" fullWidth disabled={isPending} onClick={goBack}>
              Back
            </Button>
          )}

          {/* Surfaced rather than left as a silently disabled button — a
              disabled CTA with no reason is the commonest dead end in a wizard. */}
          {stepError && step < TOTAL_STEPS && (
            <p className="text-center text-xs text-text-secondary">{stepError}</p>
          )}
        </div>
      </PagePadding>
    </AppShell>
  )
}

function StepHeader({ step }: { step: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5" role="presentation">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${
              i < step ? 'bg-primary-green' : 'bg-border'
            }`}
          />
        ))}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
          Step {step} of {TOTAL_STEPS}
        </p>
        <h2 className="font-serif text-xl font-medium text-text-primary">
          {STEP_TITLES[step - 1]}
        </h2>
      </div>
    </div>
  )
}
