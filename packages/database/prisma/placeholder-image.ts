/**
 * Minimal PNG encoder for demo photos (Batch 7B).
 *
 * The seed needs REAL objects in the private `pickup-photos` bucket, not empty
 * `photo_urls` arrays — otherwise the tracking screen's signed-URL path renders
 * nothing and `createSignedUrls` stays unexercised, which it had been for three
 * batches. A few hundred bytes each, generated rather than committed, so no
 * binary fixtures land in git.
 *
 * Hand-rolled instead of pulling in an image library: a solid-colour PNG is
 * chunk headers + a zlib stream + CRCs, `node:zlib` supplies the only hard part,
 * and this seed already runs on `tsx` with no build step.
 */
import { deflateSync } from "node:zlib"

// Standard CRC-32 (the PNG spec's, and zlib's). Node only exposes zlib.crc32 on
// newer runtimes, so it's computed here rather than gambling on the version.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** length + type + data + crc(type+data) — the PNG chunk framing. */
function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii")
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([length, typeBuf, data, crc])
}

export type Rgb = [number, number, number]

/**
 * A solid-colour PNG with a darker border, so a thumbnail grid reads as several
 * distinct photos rather than one repeated swatch.
 */
export function solidPng(width: number, height: number, [r, g, b]: Rgb): Buffer {
  const BORDER = 6
  const raw = Buffer.alloc(height * (1 + width * 3))

  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3)
    raw[rowStart] = 0 // filter type 0 (none) — one byte per scanline
    for (let x = 0; x < width; x++) {
      const edge = x < BORDER || y < BORDER || x >= width - BORDER || y >= height - BORDER
      const k = edge ? 0.55 : 1
      const p = rowStart + 1 + x * 3
      raw[p] = Math.round(r * k)
      raw[p + 1] = Math.round(g * k)
      raw[p + 2] = Math.round(b * k)
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type 2 = truecolour RGB
  // 10..12 = compression, filter, interlace — all 0, already zeroed

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

/** Muted, distinguishable swatches — one per kind of demo photo. */
export const PHOTO_COLOURS: Record<string, Rgb> = {
  booking: [104, 132, 158],
  arrived: [150, 138, 104],
  offered: [140, 116, 150],
  collected: [104, 150, 122],
}
