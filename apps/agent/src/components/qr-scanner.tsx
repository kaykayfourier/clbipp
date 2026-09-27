'use client'

import { useEffect, useRef, useState } from 'react'

import { Button } from '@clbipp/ui'

// ─── Camera QR scanning (FV10–FV11 · FD12, FD14) ─────────────────────────────
// The agent scans a battery tag at collection and a transport box at the start
// of a run. Until this file the app had no scanner at all (/job/[id]/scan was a
// "not in this build" stub).
//
// Two engines, best first:
//   1. `BarcodeDetector` — built into Chrome on Android, the pilot's phones.
//      Native, fast, no download.
//   2. `jsqr` — pure JavaScript, for everything else (iOS Safari has no
//      BarcodeDetector). Imported LAZILY, so a phone that never needs it never
//      downloads it.
//
// 🔴 TYPING IS ALWAYS THE FALLBACK, never a lesser path. A camera can be
// blocked, a label can be scuffed, a basement can be dark; every place this
// scanner appears also takes the code typed, and every code carries a check
// character (@clbipp/core/tags) so a mistyped one is refused, not bound.
//
// getUserMedia needs a secure context — production is HTTPS and `localhost`
// counts as secure, so this works on `npm run dev` too, but NOT on a phone
// pointed at a laptop's LAN IP over plain http. Said in the error message.

// BarcodeDetector is not in TypeScript's DOM lib yet.
type DetectedBarcode = { rawValue: string }
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = {
  new (opts: { formats: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

const SCAN_INTERVAL_MS = 180

export function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  // Held in a ref so the effect's cleanup and the result handler agree on
  // whether the scan already fired — one scan, one result.
  const done = useRef(false)
  const onResultRef = useRef(onResult)
  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot open the camera here (it needs HTTPS). Type the code instead.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
      } catch {
        setError('Camera blocked or unavailable. Allow camera access, or type the code instead.')
        return
      }
      if (cancelled || !videoRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const video = videoRef.current
      video.srcObject = stream
      await video.play().catch(() => undefined)
      setReady(true)

      const Ctor = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
      let detector: BarcodeDetectorLike | null = null
      if (Ctor) {
        const formats = (await Ctor.getSupportedFormats?.().catch(() => [])) ?? []
        if (formats.includes('qr_code')) detector = new Ctor({ formats: ['qr_code'] })
      }
      // Fallback engine, fetched only when the native one is missing.
      const jsQR = detector ? null : (await import('jsqr')).default

      const tick = async () => {
        if (cancelled || done.current) return
        try {
          let text: string | null = null
          if (detector) {
            const found = await detector.detect(video)
            text = found[0]?.rawValue ?? null
          } else if (jsQR && canvasRef.current && video.videoWidth > 0) {
            const canvas = canvasRef.current
            // Downscale: a 1080p frame is 8 MB of pixels to scan 5× a second,
            // and a QR on a sticker is legible at a fraction of that.
            const scale = Math.min(1, 640 / video.videoWidth)
            canvas.width = Math.round(video.videoWidth * scale)
            canvas.height = Math.round(video.videoHeight * scale)
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
              text = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null
            }
          }
          if (text) {
            done.current = true
            stream?.getTracks().forEach((t) => t.stop())
            onResultRef.current(text)
            return
          }
        } catch {
          // A single failed frame is noise, not an error — keep scanning.
        }
        timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS)
      }
      void tick()
    }

    void start()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p className="rounded-[10px] bg-background px-3 py-2 text-xs text-error">{error}</p>
      ) : (
        <div className="relative overflow-hidden rounded-[12px] bg-primary-black">
          <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
          {/* The aiming square — a QR the size of this box scans first time. */}
          <div className="pointer-events-none absolute inset-[18%] rounded-[14px] border-2 border-primary-green/80" />
          {!ready ? (
            <p className="absolute inset-x-0 bottom-3 text-center text-[11px] text-white/70">Opening camera…</p>
          ) : (
            <p className="absolute inset-x-0 bottom-3 text-center text-[11px] text-white/80">Point at the QR code</p>
          )}
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
      <Button type="button" variant="secondary" fullWidth onClick={onClose}>
        {error ? 'Close' : 'Cancel scan'}
      </Button>
    </div>
  )
}

/**
 * A code input with a Scan button, for use INSIDE a plain `<form action={…}>`.
 * A scan fills the field and submits the form; typing and pressing the submit
 * button does the same without the camera. Keeping the form a plain server
 * action (not a client-side call) is what keeps these writes scriptable for
 * verification — the same reason the admin console's forms are plain.
 */
export function CodeField({
  name = 'code',
  placeholder,
  scanLabel = 'Scan',
  submitLabel,
  autoFocus = false,
}: {
  name?: string
  placeholder: string
  scanLabel?: string
  submitLabel: string
  autoFocus?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      {scanning ? (
        <QrScanner
          onClose={() => setScanning(false)}
          onResult={(text) => {
            setScanning(false)
            const input = inputRef.current
            if (!input) return
            input.value = text
            input.form?.requestSubmit()
          }}
        />
      ) : null}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          name={name}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus={autoFocus}
          className="h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-background px-3 font-mono text-sm uppercase text-text-primary"
        />
        <Button type="button" variant="secondary" onClick={() => setScanning((s) => !s)}>
          {scanning ? 'Hide' : scanLabel}
        </Button>
      </div>
      <Button type="submit" variant="primary" fullWidth>
        {submitLabel}
      </Button>
    </div>
  )
}
