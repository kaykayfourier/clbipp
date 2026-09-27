import { Path, Rect, Svg } from '@react-pdf/renderer'
import QRCode from 'qrcode'

// ─── A QR code as vector paths (FV10–FV11) ───────────────────────────────────
// Drawn from the module matrix rather than embedded as a PNG: vectors stay
// crisp on any printer at any label size, and there is no image codec in the
// render path. Horizontal runs of dark modules are merged into one rectangle
// each and the whole code is ONE path, so a 24-label sheet is 24 paths rather
// than ~7,000 rectangles.
//
// Error correction M (~15%): a label on a battery gets scuffed, and M still
// fits a 10-character payload in the smallest (21 × 21) symbol.

function qrPath(text: string): { size: number; d: string } {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const { size } = qr.modules
  const parts: string[] = []
  for (let row = 0; row < size; row += 1) {
    let col = 0
    while (col < size) {
      if (!qr.modules.get(row, col)) {
        col += 1
        continue
      }
      const start = col
      while (col < size && qr.modules.get(row, col)) col += 1
      parts.push(`M${start} ${row}h${col - start}v1h${start - col}z`)
    }
  }
  return { size, d: parts.join('') }
}

/**
 * A QR symbol `size` points square, with the standard 4-module quiet zone
 * included INSIDE that square — a scanner needs it, and a label template that
 * forgot it would print codes that only scan on a good day.
 */
export function QrSvg({ text, size }: { text: string; size: number }) {
  const { size: modules, d } = qrPath(text)
  const quiet = 4
  const box = modules + quiet * 2
  return (
    <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${box} ${box}`}>
      <Rect x={-quiet} y={-quiet} width={box} height={box} fill="#FFFFFF" />
      <Path d={d} fill="#000000" />
    </Svg>
  )
}
