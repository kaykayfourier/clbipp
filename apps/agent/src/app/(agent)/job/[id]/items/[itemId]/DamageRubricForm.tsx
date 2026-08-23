'use client'

import { useMemo, useState } from 'react'

import { MAX_FILE_BYTES, removeFile, uploadFile } from '@clbipp/auth/storage'
import { Banner, Button, Card, CardContent, SectionLabel } from '@clbipp/ui'

import { submitDamageRubric } from './actions'

// ─── The damage rubric (D1 · Batch 5a) ────────────────────────────────────────
// Li-ion only — job-nav.ts never routes a non-lithium item here.
//
// Weights and thresholds are copied from packages/decision-engine's
// runDamageScoring / computeDamageScore (layers/damage.ts) — 0.40 / 0.35 /
// 0.25, forced-Recycle above 2.5, Reuse locked out above 1.5 — and MUST stay
// identical to it. This form computes the same score live so the agent sees
// the routing consequence before they submit, but the engine recomputes it
// server-side from the same three raw scores; this copy is a preview, not the
// source of truth.
const WEIGHTS = { visual: 0.4, leakage: 0.35, thermal: 0.25 } as const

// ⚠ WORKAROUND (Batch 5a) — see BatteryItem.quoteData in schema.prisma. These
// four fields are the ones that actually change the engine's decision (Layer 3
// SoH gating, revenue sizing off capacity). The four BMS diagnostic triggers
// (entropy anomalies, IR imbalance, voltage imbalance, max temperature) are
// NOT collected here — there is no instrument on site to read them without
// Entroview, so they are defaulted to "no anomaly detected" server-side
// (submitDamageRubric in ./actions.ts) rather than guessed by the agent.
type BmsQuickEntry = {
  sohPct: string
  capacityKwh: string
  ageYears: string
  cycleCount: string
}

type ScoreValue = 0 | 1 | 2 | 3

function scoreLabel(test: 'visual' | 'leakage' | 'thermal', value: ScoreValue): string {
  const labels: Record<typeof test, [string, string, string, string]> = {
    visual: ['No visible damage', 'Minor scuffs / dents', 'Cracked casing or swelling', 'Structurally compromised'],
    leakage: ['No leakage', 'Trace residue, dry', 'Active seepage', 'Actively leaking'],
    thermal: ['Cool to the touch', 'Slightly warm', 'Warm, uneven', 'Hot — handle with care'],
  }
  return labels[test][value]
}

function Segmented({
  test,
  label,
  weight,
  value,
  onChange,
}: {
  test: 'visual' | 'leakage' | 'thermal'
  label: string
  weight: number
  value: ScoreValue
  onChange: (v: ScoreValue) => void
}) {
  return (
    <Card variant="elevated">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-bold text-text-primary">{label}</span>
          <span className="text-[11px] text-text-secondary">weight {weight.toFixed(2)}</span>
        </div>
        <div className="flex gap-2">
          {([0, 1, 2, 3] as ScoreValue[]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`flex h-10 flex-1 items-center justify-center rounded-[10px] border text-sm font-bold ${
                value === n
                  ? 'border-primary-green bg-primary-green/16 text-text-primary'
                  : 'border-border text-text-secondary'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-text-secondary">{scoreLabel(test, value)}</p>
      </CardContent>
    </Card>
  )
}

type Photo = { path: string; previewUrl: string }

function PhotoSlot({
  slotKey,
  userId,
  pickupId,
  itemId,
  photos,
  onAdd,
  onRemove,
}: {
  slotKey: string
  userId: string
  pickupId: string
  itemId: string
  photos: Photo[]
  onAdd: (p: Photo) => void
  onRemove: (path: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).slice(0, 4 - photos.length)
    if (files.length === 0) return
    setError(null)
    setUploading(true)

    const results = await Promise.all(
      files.map(async (file) => ({
        file,
        result: await uploadFile({
          bucket: 'pickup-photos',
          userId,
          file,
          segments: ['jobs', pickupId, itemId, 'damage', slotKey],
        }),
      })),
    )

    const errors: string[] = []
    for (const { file, result } of results) {
      if (result.error !== null) errors.push(result.error)
      else onAdd({ path: result.path, previewUrl: URL.createObjectURL(file) })
    }
    setError(errors.length > 0 ? errors.join(' ') : null)
    setUploading(false)
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-[11px] font-semibold text-error">{error}</p>}
      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {photos.map((p) => (
            <div key={p.path} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.previewUrl}
                alt="Damage evidence photo"
                className="aspect-square w-full rounded-[8px] border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(p.previewUrl)
                  onRemove(p.path)
                  void removeFile('pickup-photos', p.path)
                }}
                className="absolute right-0.5 top-0.5 rounded-full bg-primary-black px-1.5 text-[9px] font-semibold text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <label
        htmlFor={`photo-${slotKey}`}
        className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-border text-xs font-semibold text-text-primary"
      >
        {uploading ? 'Uploading…' : photos.length > 0 ? 'Add another' : 'Add photo evidence'}
      </label>
      <input
        type="file"
        id={`photo-${slotKey}`}
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}

export function DamageRubricForm({
  pickupId,
  itemId,
  userId,
  distanceKm,
}: {
  pickupId: string
  itemId: string
  userId: string
  /** Estimated pickup → facility distance, computed server-side. See ../damage/page.tsx. */
  distanceKm: number
}) {
  const [visual, setVisual] = useState<ScoreValue>(0)
  const [leakage, setLeakage] = useState<ScoreValue>(0)
  const [thermal, setThermal] = useState<ScoreValue>(0)

  const [visualPhotos, setVisualPhotos] = useState<Photo[]>([])
  const [leakagePhotos, setLeakagePhotos] = useState<Photo[]>([])
  const [thermalPhotos, setThermalPhotos] = useState<Photo[]>([])

  const [bms, setBms] = useState<BmsQuickEntry>({
    sohPct: '',
    capacityKwh: '',
    ageYears: '',
    cycleCount: '',
  })

  const score = useMemo(
    () => WEIGHTS.visual * visual + WEIGHTS.leakage * leakage + WEIGHTS.thermal * thermal,
    [visual, leakage, thermal],
  )
  const forcedRecycle = score > 2.5
  const refurbishOnly = !forcedRecycle && score > 1.5

  const bmsComplete =
    bms.sohPct !== '' && bms.capacityKwh !== '' && bms.ageYears !== '' && bms.cycleCount !== ''

  return (
    <form action={submitDamageRubric} className="flex flex-col gap-4">
      <input type="hidden" name="pickupId" value={pickupId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="distanceKm" value={distanceKm} />
      <input type="hidden" name="visual" value={visual} />
      <input type="hidden" name="leakage" value={leakage} />
      <input type="hidden" name="thermal" value={thermal} />
      {[...visualPhotos, ...leakagePhotos, ...thermalPhotos].map((p) => (
        <input key={p.path} type="hidden" name="photoPaths" value={p.path} />
      ))}

      {/* ── BMS quick-entry (workaround) ─────────────────────────────────
          See the note on BatteryItem.quoteData. Four fields, plainly labelled
          as manual for now — not dressed up as an Entroview read. */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Battery specs — manual entry</SectionLabel>
        <Banner variant="info">
          No Entroview connection yet — enter what the BMS or label shows. Other
          diagnostic readings (cell imbalance, temperature history) aren&rsquo;t
          captured on this build and are treated as no anomaly detected.
        </Banner>
        <Card variant="elevated">
          <CardContent className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-text-secondary">State of health (%)</span>
              <input
                type="number"
                name="sohPct"
                min="0"
                max="100"
                step="1"
                inputMode="numeric"
                value={bms.sohPct}
                onChange={(e) => setBms((v) => ({ ...v, sohPct: e.target.value }))}
                className="h-11 rounded-[8px] border border-border bg-background px-2 text-sm"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-text-secondary">Capacity (kWh)</span>
              <input
                type="number"
                name="capacityKwh"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={bms.capacityKwh}
                onChange={(e) => setBms((v) => ({ ...v, capacityKwh: e.target.value }))}
                className="h-11 rounded-[8px] border border-border bg-background px-2 text-sm"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-text-secondary">Age (years)</span>
              <input
                type="number"
                name="ageYears"
                min="0"
                step="0.5"
                inputMode="decimal"
                value={bms.ageYears}
                onChange={(e) => setBms((v) => ({ ...v, ageYears: e.target.value }))}
                className="h-11 rounded-[8px] border border-border bg-background px-2 text-sm"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-text-secondary">Cycle count</span>
              <input
                type="number"
                name="cycleCount"
                min="0"
                step="1"
                inputMode="numeric"
                value={bms.cycleCount}
                onChange={(e) => setBms((v) => ({ ...v, cycleCount: e.target.value }))}
                className="h-11 rounded-[8px] border border-border bg-background px-2 text-sm"
                required
              />
            </label>
          </CardContent>
        </Card>
      </div>

      {/* ── The three-test rubric ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <SectionLabel>Engine Layer 1 · Physical damage</SectionLabel>

        <Segmented test="visual" label="Visual integrity" weight={WEIGHTS.visual} value={visual} onChange={setVisual} />
        <PhotoSlot
          slotKey="visual"
          userId={userId}
          pickupId={pickupId}
          itemId={itemId}
          photos={visualPhotos}
          onAdd={(p) => setVisualPhotos((v) => [...v, p])}
          onRemove={(path) => setVisualPhotos((v) => v.filter((p) => p.path !== path))}
        />

        <Segmented test="leakage" label="Leakage" weight={WEIGHTS.leakage} value={leakage} onChange={setLeakage} />
        <PhotoSlot
          slotKey="leakage"
          userId={userId}
          pickupId={pickupId}
          itemId={itemId}
          photos={leakagePhotos}
          onAdd={(p) => setLeakagePhotos((v) => [...v, p])}
          onRemove={(path) => setLeakagePhotos((v) => v.filter((p) => p.path !== path))}
        />

        <Segmented test="thermal" label="Thermal" weight={WEIGHTS.thermal} value={thermal} onChange={setThermal} />
        <PhotoSlot
          slotKey="thermal"
          userId={userId}
          pickupId={pickupId}
          itemId={itemId}
          photos={thermalPhotos}
          onAdd={(p) => setThermalPhotos((v) => [...v, p])}
          onRemove={(path) => setThermalPhotos((v) => v.filter((p) => p.path !== path))}
        />
      </div>

      {/* ── Live score ────────────────────────────────────────────────────
          Preview only — see the note at the top of the file. */}
      <Card variant="elevated">
        <CardContent className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">
              Weighted damage score
            </p>
            {forcedRecycle && (
              <p className="mt-0.5 text-[11px] font-semibold text-error">&gt;2.5 — Recycle forced</p>
            )}
            {refurbishOnly && (
              <p className="mt-0.5 text-[11px] font-semibold text-warning-text">
                1.6–2.5 — Reuse locked out
              </p>
            )}
          </div>
          <span
            className={`font-serif text-2xl font-semibold ${
              forcedRecycle ? 'text-error' : 'text-text-primary'
            }`}
          >
            {score.toFixed(2)}
          </span>
        </CardContent>
      </Card>

      {forcedRecycle && (
        <Banner variant="warning">
          Damage score forces <b>Recycle</b>. Reuse and Refurbish are locked for
          this pack — the engine will only price the recycle pathway.
        </Banner>
      )}

      <Button type="submit" variant="primary" fullWidth disabled={!bmsComplete}>
        {forcedRecycle ? 'Continue to Recycle pricing' : 'Continue to pricing'}
      </Button>
      {!bmsComplete && (
        <p className="text-center text-[11px] text-text-secondary">
          Fill in all four battery specs to continue.
        </p>
      )}
    </form>
  )
}
