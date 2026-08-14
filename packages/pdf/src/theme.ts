import { StyleSheet } from '@react-pdf/renderer'

// ─── PDF styling ─────────────────────────────────────────────────────────────
// react-pdf has its own layout engine — no Tailwind, no CSS variables — so the
// brand values are restated here as a small palette.
//
// Why duplicated rather than imported from @clbipp/ui: that package's only
// export is its barrel, which pulls in every client component (next/link,
// "use client" files). Dragging those into a Node PDF render just to read six
// hex strings would be a real cost for a cosmetic gain. If a brand colour
// changes, packages/ui/src/tokens.ts is the source of truth and this list
// follows it.

export const pdfColors = {
  ink: '#111111',
  muted: '#666666',
  faint: '#AAAAAA',
  rule: '#E5E5E5',
  paper: '#FFFFFF',
  wash: '#F8F5EE',
  brand: '#C8F53D',
  success: '#15803D',
} as const

// Helvetica is one of the 14 PDF base fonts, so it embeds nothing and needs no
// font file shipped with the package. A custom face would mean registering a
// .ttf and bundling a binary — not worth it for documents whose layout the
// company is going to replace anyway.
export const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: pdfColors.ink,
    backgroundColor: pdfColors.paper,
  },

  // Header band — the same black bar with the lime mark the app screens use.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: pdfColors.ink,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  headerBrand: { flexDirection: 'row', alignItems: 'center' },
  headerMark: {
    width: 18,
    height: 18,
    backgroundColor: pdfColors.brand,
    color: pdfColors.ink,
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    paddingTop: 4,
    marginRight: 8,
  },
  headerName: { color: pdfColors.paper, fontSize: 12, fontFamily: 'Helvetica-Bold' },
  headerKind: { color: pdfColors.paper, fontSize: 8, letterSpacing: 1.5, opacity: 0.8 },

  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subtitle: { fontSize: 9, color: pdfColors.muted, marginBottom: 18 },

  sectionLabel: {
    fontSize: 8,
    letterSpacing: 1.2,
    color: pdfColors.muted,
    fontFamily: 'Helvetica-Bold',
    marginTop: 16,
    marginBottom: 6,
  },

  // Label/value rows — the dominant pattern in all three documents.
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: pdfColors.rule,
  },
  rowLast: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  label: { color: pdfColors.muted },
  value: { fontFamily: 'Helvetica-Bold' },

  // Table (invoice lines, material summary)
  th: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: pdfColors.ink,
    paddingBottom: 4,
    marginBottom: 2,
  },
  thText: { fontSize: 8, letterSpacing: 0.8, color: pdfColors.muted, fontFamily: 'Helvetica-Bold' },
  td: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: pdfColors.rule,
  },
  colGrow: { flexGrow: 1, flexBasis: 0 },
  colNum: { width: 80, textAlign: 'right' },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: pdfColors.ink,
  },
  totalLabel: { fontFamily: 'Helvetica-Bold', marginRight: 16 },
  totalValue: { fontFamily: 'Helvetica-Bold', fontSize: 13, width: 110, textAlign: 'right' },

  callout: {
    backgroundColor: pdfColors.wash,
    padding: 12,
    marginTop: 18,
    fontSize: 9,
    color: pdfColors.muted,
    lineHeight: 1.5,
  },

  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 7.5,
    color: pdfColors.faint,
    textAlign: 'center',
    lineHeight: 1.5,
  },
})

/** Consistent date rendering across all three documents. */
export function formatDocDate(value: Date): string {
  return value.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
