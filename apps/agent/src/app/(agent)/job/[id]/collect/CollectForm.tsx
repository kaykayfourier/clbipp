'use client'

import { useEffect, useRef, useState } from 'react'

import { MAX_FILE_BYTES, uploadFile } from '@clbipp/auth/storage'
import { Banner, Button, Card, CardContent, SectionLabel } from '@clbipp/ui'

import { confirmCollection } from './actions'

// ─── The collect form (D7 · Batch 6) ─────────────────────────────────────────
// Gated on Offer.acceptedAt by collect/page.tsx before this ever renders — see
// that file for the vendor-declined / awaiting branches.
//
// Signature is a plain <canvas> pad, drawn to a Blob and uploaded through
// uploadFile the same way ItemConfirmForm.tsx uploads photos — browser
// straight to storage, not through the server action body (same 1MB limit
// reasoning). What reaches confirmCollection is only the resulting PATH.

const MAX_FILE_MB = Math.round(MAX_FILE_BYTES / (1024 * 1024))

function SignaturePad({ userId, onCapture }: { userId: string; onCapture: (path: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [captured, setCaptured] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true
    setCaptured(false)
    const ctx = canvasRef.current?.getContext('2d')
    const { x, y } = point(e)
    ctx?.beginPath()
    ctx?.moveTo(x, y)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    const { x, y } = point(e)
    if (ctx) {
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#111'
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    setHasDrawn(true)
  }

  function end() {
    drawing.current = false
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
    setCaptured(false)
  }

  async function save() {
    const canvas = canvasRef.current
    if (!canvas) return
    setUploading(true)
    setError(null)
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) {
      setUploading(false)
      setError('Could not capture the signature. Try again.')
      return
    }
    const file = new File([blob], 'signature.png', { type: 'image/png' })
    const result = await uploadFile({ bucket: 'pickup-photos', userId, file, segments: ['signatures'] })
    setUploading(false)
    if (result.error !== null) {
      setError(result.error)
      return
    }
    setCaptured(true)
    onCapture(result.path)
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-[11px] font-semibold text-error">{error}</p>}
      <canvas
        ref={canvasRef}
        width={320}
        height={140}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full touch-none rounded-[10px] border border-border bg-background"
      />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" fullWidth onClick={clear}>
          Clear
        </Button>
        <Button
          type="button"
          variant="secondary"
          fullWidth
          disabled={!hasDrawn || uploading}
          onClick={() => void save()}
        >
          {uploading ? 'Saving…' : captured ? 'Signature saved' : 'Use this signature'}
        </Button>
      </div>
    </div>
  )
}

export function CollectForm({
  pickupId,
  userId,
  vendorName,
  agentFeePaise,
}: {
  pickupId: string
  userId: string
  vendorName: string
  agentFeePaise: number
}) {
  const [signaturePath, setSignaturePath] = useState<string | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [contactConfirmed, setContactConfirmed] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  // Best-effort. PickupReceipt.capturedLat/Lng are nullable for exactly this
  // reason (same as Address.lat/lng) — a denied permission must not block
  // collection.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(null),
      { timeout: 8000 },
    )
  }, [])

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).slice(0, 6 - photos.length)
    if (files.length === 0) return
    setUploading(true)
    setUploadError(null)
    const results = await Promise.all(
      files.map((file) => uploadFile({ bucket: 'pickup-photos', userId, file, segments: ['jobs', pickupId, 'collect'] })),
    )
    const errors: string[] = []
    const landed: string[] = []
    for (const result of results) {
      if (result.error !== null) errors.push(result.error)
      else landed.push(result.path)
    }
    setUploadError(errors.length > 0 ? errors.join(' ') : null)
    setUploading(false)
    if (landed.length > 0) setPhotos((prev) => [...prev, ...landed])
  }

  const ready = signaturePath !== null && contactConfirmed

  return (
    <form action={confirmCollection} className="flex flex-col gap-4">
      <input type="hidden" name="pickupId" value={pickupId} />
      {coords && <input type="hidden" name="lat" value={coords.lat} />}
      {coords && <input type="hidden" name="lng" value={coords.lng} />}
      {signaturePath && <input type="hidden" name="signaturePath" value={signaturePath} />}
      {photos.map((p) => (
        <input key={p} type="hidden" name="photoPaths" value={p} />
      ))}

      <div className="flex flex-col gap-2">
        <SectionLabel>Hand-off photos — optional</SectionLabel>
        {uploadError && <Banner variant="error">{uploadError}</Banner>}
        <Card variant="elevated">
          <CardContent className="flex flex-col gap-3">
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p) => (
                  <div
                    key={p}
                    className="flex aspect-square items-center justify-center rounded-[10px] border border-border bg-background text-[10px] text-text-secondary"
                  >
                    Saved
                  </div>
                ))}
              </div>
            )}
            <label
              htmlFor="collectPhotos"
              className="flex h-11 cursor-pointer items-center justify-center rounded-[10px] border-2 border-dashed border-border text-sm font-semibold text-text-primary"
            >
              {uploading ? 'Uploading…' : 'Add photo'}
            </label>
            <input
              type="file"
              id="collectPhotos"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <p className="text-[11px] text-text-secondary">Up to 6 photos, {MAX_FILE_MB} MB each.</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Confirm with {vendorName}</SectionLabel>
        <Card variant="elevated">
          <CardContent>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={contactConfirmed}
                onChange={(e) => setContactConfirmed(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-primary-green"
              />
              <span className="text-sm text-text-primary">
                I confirmed with {vendorName} that everything on the offer is being
                collected, and handed them their receipt.
              </span>
            </label>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>{vendorName}&rsquo;s signature</SectionLabel>
        <SignaturePad userId={userId} onCapture={setSignaturePath} />
      </div>

      <Card variant="elevated">
        <CardContent className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text-primary">Your fee for this job</span>
          <span className="font-serif text-lg font-semibold text-primary-green">
            ₹{(agentFeePaise / 100).toFixed(2)}
          </span>
        </CardContent>
      </Card>

      <Button type="submit" variant="primary" fullWidth disabled={!ready}>
        Confirm collection
      </Button>
      {!ready && (
        <p className="text-center text-[11px] text-text-secondary">
          Get the signature and confirm with the vendor to continue.
        </p>
      )}
    </form>
  )
}
