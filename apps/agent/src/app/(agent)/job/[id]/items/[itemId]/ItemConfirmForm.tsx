'use client'

import { useState } from 'react'

import { MAX_FILE_BYTES, removeFile, uploadFile } from '@clbipp/auth/storage'
import {
  CHEMISTRY_OPTIONS,
  CONDITION_OPTIONS,
  isLithium,
  requiresPhotoEvidence,
  type ChemistryValue,
  type ConditionValue,
} from '@clbipp/core/intake'
import { Banner, Button, Card, CardContent, SectionLabel } from '@clbipp/ui'

import { confirmItem } from '../actions'

// ─── The per-item confirm form (D1 · Batch 3) ────────────────────────────────
// A client component for two reasons and no others:
//
//   1. PHOTOS. They upload from the BROWSER straight to Supabase Storage, not
//      through the server action. A `File` posted to a server action is capped
//      by Next's `serverActions.bodySizeLimit`, which DEFAULTS TO 1 MB and is
//      not raised in either next.config.ts — while our bucket limit is 5 MB per
//      file (MAX_FILE_BYTES). Three photos of a leaking pack would fail at the
//      framework boundary before Supabase ever saw them.
//
//      This is a deliberate deviation from the task sheet's "upload through a
//      server action using the service role", agreed before building and
//      written up in "Batch 3 — as built". The storage RLS policy already
//      allows it: `pickup-photos` INSERT checks
//      `(storage.foldername(name))[1] = auth.uid()`, and an agent is an
//      authenticated user, so uploading under `<agentUid>/…` passes with no
//      policy change. `buildObjectPath` (inside uploadFile) guarantees that
//      prefix. What reaches the server action is only the resulting PATHS, and
//      it re-checks the prefix there because the service role bypasses RLS.
//
//   2. The live branch hint — the agent should see "this one goes to the damage
//      rubric" as they pick a chemistry, not after a round trip.
//
// Everything else is uncontrolled: plain radios and a number input inside a form
// with a server action, so the confirmation still posts if the JS never
// hydrates. Only the photo picker degrades.
//
// ⚠ `@clbipp/core/intake`, NOT `@clbipp/core`. The package barrel re-exports
// booking-actions / payment-actions, so importing from it would pull Prisma into
// the browser bundle. Same trap as `formatPaise`, same fix.

const MAX_PHOTOS = 8
const MAX_FILE_MB = Math.round(MAX_FILE_BYTES / (1024 * 1024))

type Photo = { path: string; previewUrl: string }

export function ItemConfirmForm({
  pickupId,
  itemId,
  userId,
  declaredWeightKg,
  declaredCondition,
  defaultChemistry,
  defaultCondition,
  existingPhotoPaths,
}: {
  pickupId: string
  itemId: string
  userId: string
  /** Shown beside the weight field for comparison — never prefilled into it. */
  declaredWeightKg: number | null
  declaredCondition: string
  defaultChemistry: string | null
  defaultCondition: string
  /** Paths already stored on the row, re-posted so a re-submit keeps them. */
  existingPhotoPaths: readonly string[]
}) {
  const [chemistry, setChemistry] = useState<ChemistryValue | null>(
    (CHEMISTRY_OPTIONS.find((o) => o.value === defaultChemistry)?.value ?? null) as ChemistryValue | null,
  )
  const [condition, setCondition] = useState<ConditionValue>(
    (CONDITION_OPTIONS.find((o) => o.value === defaultCondition)?.value ?? 'healthy') as ConditionValue,
  )

  // Photos already on the row keep their stored path; the bucket is private so
  // there is no preview URL for them here — the page above renders those from
  // signed URLs. New ones get a local blob URL for an instant thumbnail.
  const [keptPaths, setKeptPaths] = useState<string[]>([...existingPhotoPaths])
  const [added, setAdded] = useState<Photo[]>([])
  const [uploading, setUploading] = useState(false)
  const [photoErrors, setPhotoErrors] = useState<string[]>([])

  const totalPhotos = keptPaths.length + added.length
  const photoRequired = requiresPhotoEvidence(condition)
  const photoMissing = photoRequired && totalPhotos === 0

  async function handleFiles(fileList: FileList | null) {
    const picked = Array.from(fileList ?? [])
    if (picked.length === 0) return

    const room = MAX_PHOTOS - totalPhotos
    const files = picked.slice(0, Math.max(0, room))
    const errors: string[] =
      picked.length > files.length ? [`Up to ${MAX_PHOTOS} photos per line — the extras were skipped.`] : []

    if (files.length === 0) {
      setPhotoErrors(errors)
      return
    }

    setPhotoErrors([])
    setUploading(true)

    // Per file rather than the batch helper, so each result stays PAIRED with
    // its File — the thumbnail is a blob URL of that File, and the batch helper
    // returns a flat array that can't be zipped back once one upload fails.
    // Same reasoning as the customer app's StepItems.tsx.
    //
    // The path segments put every item's photos in their own folder: photos are
    // evidence of ONE consignment and must never be shared between lines.
    const results = await Promise.all(
      files.map(async (file) => ({
        file,
        result: await uploadFile({
          bucket: 'pickup-photos',
          userId,
          file,
          segments: ['jobs', pickupId, itemId],
        }),
      })),
    )

    const landed: Photo[] = []
    for (const { file, result } of results) {
      // Discriminate on `error`, not on `path` — UploadResult is a union and a
      // truthiness check on `path` does not narrow it.
      if (result.error !== null) errors.push(result.error)
      else landed.push({ path: result.path, previewUrl: URL.createObjectURL(file) })
    }

    // Partial success is a real outcome on a loading bay: keep what landed,
    // report only what failed, so the agent re-takes one photo not all of them.
    setPhotoErrors(errors)
    setUploading(false)
    if (landed.length > 0) setAdded((prev) => [...prev, ...landed])
  }

  function dropAdded(path: string) {
    const photo = added.find((p) => p.path === path)
    if (photo) URL.revokeObjectURL(photo.previewUrl)
    setAdded((prev) => prev.filter((p) => p.path !== path))
    // Remove the object too — otherwise dropping a photo orphans it in the
    // bucket with nothing pointing at it.
    void removeFile('pickup-photos', path)
  }

  function dropKept(path: string) {
    // NOT deleted from the bucket. It is still referenced by the stored row
    // until this form is submitted, and an agent who taps remove then backs out
    // must not find their evidence gone.
    setKeptPaths((prev) => prev.filter((p) => p !== path))
  }

  return (
    <form action={confirmItem} className="flex flex-col gap-4">
      <input type="hidden" name="pickupId" value={pickupId} />
      <input type="hidden" name="itemId" value={itemId} />
      {[...keptPaths, ...added.map((p) => p.path)].map((path) => (
        <input key={path} type="hidden" name="photoPaths" value={path} />
      ))}

      {/* ── Chemistry ─────────────────────────────────────────────────────
          NOTHING IS PRESELECTED on a first pass. Chemistry is the one thing the
          agent is here to determine, and a pre-set control with no stated basis
          reads as fact — the same call the safety checklist's lithium toggle
          documented. A declared `category` is a form factor, not a chemistry. */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Chemistry — read it off the label</SectionLabel>
        <Card variant="elevated">
          <CardContent className="flex flex-col px-0 py-0">
            {CHEMISTRY_OPTIONS.map((option) => (
              <label
                key={option.value}
                htmlFor={`chem-${option.value}`}
                className="flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <input
                  type="radio"
                  id={`chem-${option.value}`}
                  name="chemistry"
                  value={option.value}
                  checked={chemistry === option.value}
                  onChange={() => setChemistry(option.value)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-primary-green"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-primary">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-text-secondary">
                    {option.help}
                  </span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        {/* The D1 branch, live. Honest about what happens next rather than
            silently routing differently once the agent taps continue. */}
        {chemistry && (
          <p className="text-[11px] leading-relaxed text-text-secondary">
            {isLithium(chemistry)
              ? 'Lithium — this line goes through the damage rubric and the pricing engine.'
              : 'Not lithium — this line is priced straight off the rate card. No rubric.'}
          </p>
        )}
      </div>

      {/* ── Weighed kg ────────────────────────────────────────────────────
          Deliberately EMPTY by default. Prefilling the declared weight into a
          field whose whole purpose is to record what the scale said would get
          it accepted unread. The declared figure sits beside it instead. */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Weighed on site</SectionLabel>
        <Card variant="elevated">
          <CardContent className="flex flex-col gap-2">
            <label htmlFor="weightKg" className="text-sm font-semibold text-text-primary">
              Actual weight (kg)
            </label>
            <input
              type="number"
              id="weightKg"
              name="weightKg"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0.00"
              className="h-12 w-full rounded-[10px] border border-border bg-background px-3 text-base text-text-primary"
            />
            <p className="text-[11px] leading-relaxed text-text-secondary">
              {declaredWeightKg === null
                ? 'The customer gave no weight for this line.'
                : `Customer declared ${declaredWeightKg.toFixed(1)} kg. A difference is fine — record what the scale says.`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Condition ─────────────────────────────────────────────────────
          Defaults to the customer's declaration. Unlike category, this HAS its
          own confirmed column, so an override is non-destructive — both values
          survive side by side. */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Condition you found</SectionLabel>
        <Card variant="elevated">
          <CardContent className="flex flex-col px-0 py-0">
            {CONDITION_OPTIONS.map((option) => (
              <label
                key={option.value}
                htmlFor={`cond-${option.value}`}
                className="flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <input
                  type="radio"
                  id={`cond-${option.value}`}
                  name="condition"
                  value={option.value}
                  checked={condition === option.value}
                  onChange={() => setCondition(option.value)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-primary-green"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-primary">
                    {option.label}
                    {option.value === declaredCondition && (
                      <span className="ml-2 text-[11px] font-normal text-text-secondary">
                        as declared
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-text-secondary">
                    {option.help}
                  </span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Photos ────────────────────────────────────────────────────────
          Required for a damaged line, optional otherwise. A swollen, leaking or
          dead line is the one that gets argued about later — by the vendor, the
          hub, or an auditor — and the agent is standing in front of it right
          now. A healthy line is not worth blocking a job over. */}
      <div className="flex flex-col gap-2">
        <SectionLabel>
          Photos {photoRequired ? '— required for this condition' : '— optional'}
        </SectionLabel>

        {photoErrors.length > 0 && (
          <Banner variant="error">{photoErrors.join(' ')}</Banner>
        )}

        {photoMissing && (
          <Banner variant="warning">
            A {condition} line needs at least one photo before it counts as
            confirmed. You can save now and add it later — the line stays open.
          </Banner>
        )}

        <Card variant="elevated">
          <CardContent className="flex flex-col gap-3">
            {(keptPaths.length > 0 || added.length > 0) && (
              <div className="grid grid-cols-3 gap-2">
                {keptPaths.map((path) => (
                  <div
                    key={path}
                    className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-[10px] border border-border bg-background px-1 text-center"
                  >
                    <span className="text-[10px] leading-tight text-text-secondary">Saved photo</span>
                    <button
                      type="button"
                      onClick={() => dropKept(path)}
                      className="text-[10px] font-semibold text-error underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {added.map((photo) => (
                  <div key={photo.path} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.previewUrl}
                      alt="Photo you just took of this line"
                      className="aspect-square w-full rounded-[10px] border border-border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => dropAdded(photo.path)}
                      className="absolute right-1 top-1 rounded-full bg-primary-black px-2 py-0.5 text-[10px] font-semibold text-white"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label
              htmlFor="itemPhotos"
              className="flex h-12 cursor-pointer items-center justify-center rounded-[10px] border-2 border-dashed border-border text-sm font-semibold text-text-primary"
            >
              {uploading ? 'Uploading…' : totalPhotos > 0 ? 'Add another photo' : 'Add a photo'}
            </label>
            <input
              type="file"
              id="itemPhotos"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files)
                // Reset so re-picking the same file fires onChange again.
                e.target.value = ''
              }}
            />
            <p className="text-[11px] leading-relaxed text-text-secondary">
              Up to {MAX_PHOTOS} photos, {MAX_FILE_MB} MB each. Photos belong to this
              line only — never reuse one from another line.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Never disabled while uploading is idle: the server decides what is
          valid and says what is missing, which is more use to an agent than a
          dead button. Held only while an upload is genuinely in flight, because
          submitting then would drop the paths that hadn't landed. */}
      <Button type="submit" variant="primary" fullWidth disabled={uploading}>
        {uploading ? 'Waiting for photos…' : 'Save this line'}
      </Button>

      <p className="text-[11px] leading-relaxed text-text-secondary">
        Recorded against your name and this job. The customer&rsquo;s declaration
        above is never overwritten.
      </p>
    </form>
  )
}
