import { Document, Page, Text, View } from '@react-pdf/renderer'

import { pdfColors, formatDocDate } from '../theme'
import type { ContainerLabelsDoc, TagLabelsDoc } from '../types'
import { QrSvg } from './qr'

// ─── Label sheets: battery tags and transport boxes (FV10–FV11 · FD12, FD14) ─
// FD11 said "no physical tagging in the pilot" because there was no printer in
// the van. These sheets are the answer to that: the office prints them on any
// A4 printer, on ordinary sticker stock, BEFORE the run — the van only needs a
// sheet in the glovebox.
//
// Tag sheet geometry is the common 3 × 8 layout (63.5 × 33.9 mm labels,
// 2.5 mm column gap — Avery L7159 and its many equivalents), so a sheet bought
// at any stationer lines up. On plain paper the dashed guides are cut lines.
//
// The QR encodes the bare code (TG-XXXXXXC / BX-XXXXC) and the code is also
// printed in large type underneath: the scan is the fast path, typing is the
// fallback, and the check character catches a mistyped one.

const MM = 72 / 25.4

const TAG = {
  cols: 3,
  rows: 8,
  width: 63.5 * MM,
  height: 33.9 * MM,
  left: 7.25 * MM,
  top: 12.9 * MM,
  pitchX: 66 * MM,
  pitchY: 33.9 * MM,
}

export function TagLabelsTemplate({ doc }: { doc: TagLabelsDoc }) {
  const perPage = TAG.cols * TAG.rows
  const pages: string[][] = []
  for (let i = 0; i < doc.codes.length; i += perPage) pages.push(doc.codes.slice(i, i + perPage))

  return (
    <Document title={`Battery tags ${doc.issueBatch}`} author="Back2Basics" subject="Battery tag label sheet">
      {pages.map((codes, pageIndex) => (
        <Page key={pageIndex} size="A4" style={{ position: 'relative', backgroundColor: pdfColors.paper }}>
          {codes.map((code, i) => {
            const col = i % TAG.cols
            const row = Math.floor(i / TAG.cols)
            return (
              <View
                key={code}
                style={{
                  position: 'absolute',
                  left: TAG.left + col * TAG.pitchX,
                  top: TAG.top + row * TAG.pitchY,
                  width: TAG.width,
                  height: TAG.height,
                  borderWidth: 0.4,
                  borderStyle: 'dashed',
                  borderColor: pdfColors.faint,
                  borderRadius: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 6,
                }}
              >
                <QrSvg text={code} size={TAG.height - 12} />
                <View style={{ marginLeft: 6, flexGrow: 1, flexBasis: 0 }}>
                  <Text style={{ fontSize: 6, letterSpacing: 1, color: pdfColors.muted, fontFamily: 'Helvetica-Bold' }}>
                    CLBIPP · BATTERY TAG
                  </Text>
                  <Text style={{ fontSize: 12.5, fontFamily: 'Helvetica-Bold', marginTop: 3 }}>{code}</Text>
                  <Text style={{ fontSize: 6, color: pdfColors.muted, marginTop: 3, lineHeight: 1.3 }}>
                    One per battery line. Stick on the battery, or on the bag or crate holding the lot.
                  </Text>
                  <Text style={{ fontSize: 5.5, color: pdfColors.faint, marginTop: 2 }}>{doc.issueBatch}</Text>
                </View>
              </View>
            )
          })}
          <Text
            style={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', fontSize: 6.5, color: pdfColors.faint }}
            fixed
          >
            {`${doc.issueBatch} · issued ${formatDocDate(doc.issuedAt)} · sheet ${pageIndex + 1} of ${pages.length} · ${doc.codes.length} tags`}
          </Text>
        </Page>
      ))}
    </Document>
  )
}

export function ContainerLabelsTemplate({ doc }: { doc: ContainerLabelsDoc }) {
  // Two per A4 page, each half-page: large enough to scan from across a van
  // floor, and one label per face of a small crate if printed twice.
  const pages: ContainerLabelsDoc['containers'][] = []
  for (let i = 0; i < doc.containers.length; i += 2) pages.push(doc.containers.slice(i, i + 2))

  return (
    <Document title="Transport box labels" author="Back2Basics" subject="Transport box QR labels">
      {pages.map((pair, pageIndex) => (
        <Page key={pageIndex} size="A4" style={{ padding: 28, backgroundColor: pdfColors.paper }}>
          {pair.map((c) => (
            <View
              key={c.code}
              style={{
                height: '48%',
                marginBottom: '4%',
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: pdfColors.faint,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
                padding: 24,
              }}
            >
              <QrSvg text={c.code} size={230} />
              <View style={{ marginLeft: 22, flexGrow: 1, flexBasis: 0 }}>
                <Text style={{ fontSize: 9, letterSpacing: 1.6, color: pdfColors.muted, fontFamily: 'Helvetica-Bold' }}>
                  CLBIPP · TRANSPORT BOX
                </Text>
                <Text style={{ fontSize: 34, fontFamily: 'Helvetica-Bold', marginTop: 8 }}>{c.code}</Text>
                <Text style={{ fontSize: 14, marginTop: 8 }}>{c.label}</Text>
                {c.capacityKg !== null && (
                  <Text style={{ fontSize: 10, color: pdfColors.muted, marginTop: 4 }}>
                    {`Capacity ${c.capacityKg.toLocaleString('en-IN')} kg`}
                  </Text>
                )}
                <Text style={{ fontSize: 9, color: pdfColors.muted, marginTop: 14, lineHeight: 1.4 }}>
                  Scan at the start of every collection run. Batteries go in tagged; the hub scans each tag
                  back out.
                </Text>
              </View>
            </View>
          ))}
        </Page>
      ))}
    </Document>
  )
}
