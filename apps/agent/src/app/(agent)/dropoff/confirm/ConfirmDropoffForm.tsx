'use client'

import { useEffect, useRef, useState } from 'react'

import { uploadFile } from '@clbipp/auth/storage'
import { Banner, Button, Card, CardContent, SectionLabel } from '@clbipp/ui'

import { confirmDropoff } from './actions'

// ─── Confirm hand-off form (Batch 7a) ────────────────────────────────────────
// Signature capture mirrors CollectForm.tsx's SignaturePad exactly — same
// canvas → Blob → uploadFile path, same reasoning (browser straight to
// storage, not through the server action body). Not extracted into a shared
// component across job/[id]/collect and dropoff/confirm because the two
// signatures mean different things (a vendor confirming collection vs. hub
// staff confirming receipt) and the plan's lane boundaries put them in two
// different batches — duplication here is cheaper than a shared component
// with no shared owner.

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

export type FacilityOption = { id: string; name: string; location: string }

export function ConfirmDropoffForm({
  pickupIds,
  userId,
  facilities,
}: {
  pickupIds: string[]
  userId: string
  facilities: FacilityOption[]
}) {
  const [facilityId, setFacilityId] = useState(facilities[0]?.id ?? '')
  const [staffName, setStaffName] = useState('')
  const [signaturePath, setSignaturePath] = useState<string | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(null),
      { timeout: 8000 },
    )
  }, [])

  const ready = facilityId !== '' && staffName.trim().length > 0 && signaturePath !== null

  return (
    <form action={confirmDropoff} className="flex flex-col gap-4">
      <input type="hidden" name="pickupIds" value={pickupIds.join(',')} />
      {coords && <input type="hidden" name="lat" value={coords.lat} />}
      {coords && <input type="hidden" name="lng" value={coords.lng} />}
      {signaturePath && <input type="hidden" name="signaturePath" value={signaturePath} />}

      <div className="flex flex-col gap-2">
        <SectionLabel>Facility</SectionLabel>
        <Card variant="elevated">
          <CardContent className="flex flex-col px-0 py-0">
            {facilities.map((f) => (
              <label
                key={f.id}
                htmlFor={`fac-${f.id}`}
                className="flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <input
                  type="radio"
                  id={`fac-${f.id}`}
                  name="facilityId"
                  value={f.id}
                  checked={facilityId === f.id}
                  onChange={() => setFacilityId(f.id)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-primary-green"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-primary">{f.name}</span>
                  <span className="block text-xs text-text-secondary">{f.location}</span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Receiving staff</SectionLabel>
        <Banner variant="info">
          Agent-attested only — there&rsquo;s no hub-staff login yet, so this name
          is typed by you, not confirmed by the person it names.
        </Banner>
        <input
          type="text"
          name="receivingStaffName"
          value={staffName}
          onChange={(e) => setStaffName(e.target.value)}
          placeholder="Full name"
          className="h-12 w-full rounded-[10px] border border-border bg-background px-3 text-base text-text-primary"
        />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Staff signature</SectionLabel>
        <SignaturePad userId={userId} onCapture={setSignaturePath} />
      </div>

      <p className="text-[11px] text-text-secondary">
        {coords ? 'Location captured.' : 'Location not available — the hand-off will be recorded without it.'}
      </p>

      <Button type="submit" variant="primary" fullWidth disabled={!ready}>
        Confirm hand-off
      </Button>
    </form>
  )
}
