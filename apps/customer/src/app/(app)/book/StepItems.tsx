'use client'

import { useRef, useState } from 'react'

import type { BatteryCategory } from '@clbipp/database'
import { MAX_FILE_BYTES, removeFile, uploadFile } from '@clbipp/auth/storage'
import { Banner, Button, Card } from '@clbipp/ui'

import { CATEGORY_LABELS, CONDITION_HINTS, CONDITION_LABELS, CONDITION_ORDER } from './copy'
import { emptyItem, itemError, type DraftItem, type DraftPhoto } from './types'

// ─── Step 2 — the lines ──────────────────────────────────────────────────────
// One card per line, each mapping 1:1 to a `BatteryItem` row on submit. A line
// is quantity + optional weight + condition + photos.
//
// Photos upload from the BROWSER, not through a server action: a `File` does
// not survive serialisation across the server-action boundary. `uploadFile`
// writes to the private `pickup-photos` bucket under `<uid>/bookings/…`, which
// is the prefix every storage RLS policy checks.
//
// It calls `uploadFile` per file rather than `uploadFiles` on the batch, because
// the per-file call keeps each result PAIRED with its `File`. The thumbnail is a
// local blob URL of that File — the bucket is private, so a returned path is not
// directly viewable — and the batch helper returns a flat `paths` array that
// can't be zipped back to its inputs once one upload fails.

const MAX_PHOTOS_PER_LINE = 6
const MAX_LINES = 20
const MAX_FILE_MB = Math.round(MAX_FILE_BYTES / (1024 * 1024))

export function StepItems({
  userId,
  category,
  items,
  onChange,
  onUploadingChange,
}: {
  userId: string
  category: BatteryCategory
  items: DraftItem[]
  // A SetStateAction dispatcher, not a plain setter: photo uploads are async,
  // so an update that lands after an await must be applied to the CURRENT
  // basket. Writing a closed-over `items` back would silently revert whatever
  // the customer typed while the upload was in flight.
  onChange: React.Dispatch<React.SetStateAction<DraftItem[]>>
  onUploadingChange: (count: number) => void
}) {
  const [uploading, setUploading] = useState<string[]>([])
  const [photoErrors, setPhotoErrors] = useState<Record<string, string[]>>({})

  function setUploadingFor(key: string, active: boolean) {
    setUploading((prev) => {
      const next = active ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)
      // Reported up so the wizard can hold "Continue" until uploads settle —
      // advancing mid-upload would drop the paths that hadn't landed yet.
      onUploadingChange(next.length)
      return next
    })
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    onChange((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  function addLine() {
    onChange((prev) => (prev.length >= MAX_LINES ? prev : [...prev, emptyItem()]))
  }

  function removeLine(key: string) {
    const line = items.find((i) => i.key === key)
    // Drop the uploaded objects too — otherwise removing a line orphans its
    // photos in the bucket with nothing pointing at them.
    line?.photos.forEach((photo) => {
      URL.revokeObjectURL(photo.previewUrl)
      void removeFile('pickup-photos', photo.path)
    })
    onChange((prev) => prev.filter((item) => item.key !== key))
    setPhotoErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  async function handleFiles(key: string, fileList: FileList | null) {
    const picked = Array.from(fileList ?? [])
    if (picked.length === 0) return

    const line = items.find((i) => i.key === key)
    const room = MAX_PHOTOS_PER_LINE - (line?.photos.length ?? 0)

    const files = picked.slice(0, Math.max(0, room))
    const errors: string[] =
      picked.length > files.length
        ? [`Up to ${MAX_PHOTOS_PER_LINE} photos per line — the extras were skipped.`]
        : []

    if (files.length === 0) {
      setPhotoErrors((prev) => ({ ...prev, [key]: errors }))
      return
    }

    setPhotoErrors((prev) => ({ ...prev, [key]: [] }))
    setUploadingFor(key, true)

    const results = await Promise.all(
      files.map(async (file) => ({
        file,
        result: await uploadFile({ bucket: 'pickup-photos', userId, file, segments: ['bookings'] }),
      })),
    )

    const landed: DraftPhoto[] = []
    for (const { file, result } of results) {
      // Discriminate on `error`, not on `path` — `UploadResult` is a union of
      // {path, error: null} | {path: null, error}, and a truthiness check on
      // `path` doesn't narrow it (an empty string would land in both arms).
      if (result.error !== null) {
        errors.push(result.error)
      } else {
        landed.push({ path: result.path, previewUrl: URL.createObjectURL(file) })
      }
    }

    // Partial success is a real outcome: keep what landed, report only what
    // failed, so the customer re-picks one photo instead of all of them.
    setPhotoErrors((prev) => ({ ...prev, [key]: errors }))
    setUploadingFor(key, false)

    if (landed.length > 0) {
      // Functional update: this runs after an await, so it must append to the
      // basket as it is NOW, not as it was when the file picker closed.
      onChange((prev) =>
        prev.map((item) =>
          item.key === key ? { ...item, photos: [...item.photos, ...landed] } : item,
        ),
      )
    }
  }

  function removePhoto(key: string, path: string) {
    const line = items.find((i) => i.key === key)
    const photo = line?.photos.find((p) => p.path === path)
    if (photo) URL.revokeObjectURL(photo.previewUrl)

    void removeFile('pickup-photos', path)
    onChange((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, photos: item.photos.filter((p) => p.path !== path) } : item,
      ),
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-text-secondary">
        Add a line for each batch of {CATEGORY_LABELS[category].toLowerCase()} batteries. Weight
        is optional — leave it blank and the agent weighs them on collection.
      </p>

      {items.map((item, index) => (
        <LineCard
          key={item.key}
          index={index}
          item={item}
          canRemove={items.length > 1}
          isUploading={uploading.includes(item.key)}
          photoErrors={photoErrors[item.key] ?? []}
          onPatch={(patch) => updateItem(item.key, patch)}
          onRemove={() => removeLine(item.key)}
          onFiles={(files) => void handleFiles(item.key, files)}
          onRemovePhoto={(path) => removePhoto(item.key, path)}
        />
      ))}

      {items.length < MAX_LINES && (
        <Button variant="secondary" fullWidth onClick={addLine}>
          + Add another line
        </Button>
      )}
    </div>
  )
}

function LineCard({
  index,
  item,
  canRemove,
  isUploading,
  photoErrors,
  onPatch,
  onRemove,
  onFiles,
  onRemovePhoto,
}: {
  index: number
  item: DraftItem
  canRemove: boolean
  isUploading: boolean
  photoErrors: string[]
  onPatch: (patch: Partial<DraftItem>) => void
  onRemove: () => void
  onFiles: (files: FileList | null) => void
  onRemovePhoto: (path: string) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const error = itemError(item)

  return (
    <Card variant="default" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
          Line {index + 1}
        </span>
        {canRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity" htmlFor={`qty-${item.key}`} required>
          <input
            id={`qty-${item.key}`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={item.quantity}
            onChange={(e) => onPatch({ quantity: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label="Total weight (kg)" htmlFor={`kg-${item.key}`} hint="Optional">
          <input
            id={`kg-${item.key}`}
            type="number"
            inputMode="decimal"
            min={0.1}
            step={0.1}
            placeholder="e.g. 196"
            value={item.weightKg}
            onChange={(e) => onPatch({ weightKg: e.target.value })}
            className={inputClass}
          />
        </Field>
      </div>

      {/* Condition chips. The customer's self-report — the agent records the
          confirmed condition per item on site. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-text-primary">Condition</legend>
        <div className="flex flex-wrap gap-2">
          {CONDITION_ORDER.map((condition) => {
            const selected = item.condition === condition
            return (
              <button
                key={condition}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ condition })}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  selected
                    ? 'border-primary-green bg-primary-green/20 text-text-primary'
                    : 'border-border text-text-secondary'
                }`}
              >
                {CONDITION_LABELS[condition]}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-text-secondary">{CONDITION_HINTS[item.condition]}</p>
        {item.condition !== 'healthy' && (
          <Banner variant="warning">
            Please don&apos;t stack or puncture these. Keep them somewhere cool and away from
            other waste until we collect.
          </Banner>
        )}
      </fieldset>

      {/* Photos */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text-primary">
          Photos <span className="font-normal text-text-secondary">(optional)</span>
        </span>

        {item.photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {item.photos.map((photo) => (
              <div key={photo.path} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element --
                    a blob: URL of a File the customer just picked; next/image
                    would want a loader and a remote pattern for no benefit. */}
                <img
                  src={photo.previewUrl}
                  alt="Battery photo"
                  className="h-16 w-16 rounded-lg border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={() => onRemovePhoto(photo.path)}
                  aria-label="Remove photo"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-text-primary text-xs text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files)
            // Reset so re-picking the same file fires onChange again.
            e.target.value = ''
          }}
        />

        <Button
          variant="secondary"
          size="sm"
          loading={isUploading}
          disabled={isUploading || item.photos.length >= 6}
          onClick={() => fileInput.current?.click()}
        >
          {item.photos.length > 0 ? 'Add more photos' : '+ Add photos'}
        </Button>

        <p className="text-xs text-text-secondary">
          Up to 6 photos, {MAX_FILE_MB} MB each. They go on your pickup record and help the agent
          come prepared.
        </p>

        {photoErrors.map((message) => (
          <p key={message} role="alert" className="text-xs text-red-600">
            {message}
          </p>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </Card>
  )
}

const inputClass =
  'w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-green'

function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-primary">
        {label}
        {required && <span className="text-red-500"> *</span>}
        {hint && <span className="ml-1 text-xs font-normal text-text-secondary">{hint}</span>}
      </label>
      {children}
    </div>
  )
}
