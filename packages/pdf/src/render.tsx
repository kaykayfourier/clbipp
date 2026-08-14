import 'server-only'
import { renderToBuffer } from '@react-pdf/renderer'
import { CertificateTemplate } from './templates/certificate'
import { ReceiptTemplate } from './templates/receipt'
import { InvoiceTemplate } from './templates/invoice'
import type { CertificateDoc, ReceiptDoc, InvoiceDoc } from './types'

// ─── Render entry points ─────────────────────────────────────────────────────
// "server-only" lives HERE and not in the templates or the types, for the same
// reason @clbipp/auth splits storage.ts from storage-server.ts: a "server-only"
// import anywhere in a module's graph turns any client component that touches
// it into a build error. The templates and the doc shapes are safe to import
// from anywhere; only the act of rendering is server-bound.
//
// renderToBuffer needs Node (streams, Buffer), so every route handler calling
// these must set `export const runtime = 'nodejs'`.

export function renderCertificatePdf(doc: CertificateDoc): Promise<Buffer> {
  return renderToBuffer(<CertificateTemplate doc={doc} />)
}

export function renderReceiptPdf(doc: ReceiptDoc): Promise<Buffer> {
  return renderToBuffer(<ReceiptTemplate doc={doc} />)
}

export function renderInvoicePdf(doc: InvoiceDoc): Promise<Buffer> {
  return renderToBuffer(<InvoiceTemplate doc={doc} />)
}
