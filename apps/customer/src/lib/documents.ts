import 'server-only'
import { prisma } from '@clbipp/database'
import { createAdminClient } from '@clbipp/auth/admin'
import { certificateNumber } from '@clbipp/core'
import {
  renderCertificatePdf,
  renderReceiptPdf,
  renderInvoicePdf,
  type CertificateDoc,
  type ReceiptDoc,
  type InvoiceDoc,
} from '@clbipp/pdf'
import { CATEGORY_LABELS } from '@/app/(app)/book/copy'

// ─── Document generation + caching ───────────────────────────────────────────
// One entry point, `getDocument`, behind the /api/documents route. It:
//
//   1. reads the row SCOPED BY vendorId (Prisma bypasses RLS, so ownership is
//      enforced in code here — the same rule as @/lib/custody and
//      addresses/actions.ts),
//   2. renders + uploads the PDF the first time it's asked for,
//   3. serves the stored object every time after.
//
// ⚠ `pdfUrl` holds a STORAGE OBJECT PATH, not a URL, despite the column name
// (`pdf_url`, schema v2, kept as-is because renaming it is a migration for a
// cosmetic gain). A signed URL would have been the obvious thing to store and
// is the wrong thing: signed URLs expire, so a stored one is a value that
// silently rots. The path is stable; the URL is minted per request — or, here,
// not minted at all, because the route streams the bytes itself.
//
// Generation is LAZY rather than done at the status transition that creates the
// row. It keeps the seed and the agent flow free of any PDF dependency, and a
// template change reaches old documents by deleting the cached object rather
// than by a backfill.

export const DOCUMENT_KINDS = ['certificate', 'receipt', 'invoice'] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export function isDocumentKind(value: string): value is DocumentKind {
  return (DOCUMENT_KINDS as readonly string[]).includes(value)
}

/** Which private bucket each kind lives in. All three are SELECT-less for `authenticated`. */
const BUCKET: Record<DocumentKind, 'certificates' | 'receipts' | 'invoices'> = {
  certificate: 'certificates',
  receipt: 'receipts',
  invoice: 'invoices',
}

export type DocumentResult =
  | { ok: true; buffer: Buffer; filename: string }
  | { ok: false; reason: 'not_found' | 'failed' }

/** Prisma Decimal (or anything numeric-ish) → number. Templates take plain numbers. */
function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function optionalNum(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Company name for a fleet account, person's name for an individual. */
function displayName(profile: { fullName: string; companyName: string | null }): string {
  return profile.companyName ?? profile.fullName
}

// ─── Data mappers: Prisma row → template props ───────────────────────────────
// Each returns null when the document doesn't exist for this vendor. Foreign
// ids and missing rows are the same answer on purpose — a 404 tells an attacker
// nothing that a 403 wouldn't have confirmed.

async function certificateDoc(pickupId: string, vendorId: string): Promise<CertificateDoc | null> {
  const cert = await prisma.certificate.findFirst({
    where: { pickupId, vendorId },
    include: {
      pickup: { select: { category: true } },
      vendor: { select: { fullName: true, companyName: true, vendorType: true } },
    },
  })
  if (!cert) return null

  const materials = Array.isArray(cert.materialSummary)
    ? (cert.materialSummary as Array<{ material?: unknown; recovered_kg?: unknown }>).flatMap((m) =>
        typeof m?.material === 'string' && typeof m?.recovered_kg === 'number'
          ? [{ material: m.material, recoveredKg: m.recovered_kg }]
          : [],
      )
    : []

  return {
    certificateNumber: certificateNumber({
      pickupId: cert.pickupId,
      category: cert.pickup.category,
      certifiedAt: cert.certifiedAt,
    }),
    pickupId: cert.pickupId,
    vendorName: displayName(cert.vendor),
    vendorType: cert.vendor.vendorType === 'fleet' ? 'Fleet / company' : 'Individual',
    category: CATEGORY_LABELS[cert.pickup.category],
    totalWeightKg: num(cert.totalWeightKg),
    materials,
    co2AvoidedKg: optionalNum(cert.co2AvoidedKg),
    certifiedAt: cert.certifiedAt,
    publicToken: cert.publicToken,
  }
}

async function receiptDoc(pickupId: string, vendorId: string): Promise<ReceiptDoc | null> {
  // PickupReceipt has no vendorId of its own, so the scope goes through the
  // pickup relation. Filtering on the relation (rather than fetching then
  // checking) means a foreign id matches zero rows in the database.
  const receipt = await prisma.pickupReceipt.findFirst({
    where: { pickupId, pickup: { vendorId } },
    include: {
      pickup: {
        select: {
          category: true,
          vendor: { select: { fullName: true, companyName: true } },
        },
      },
    },
  })
  if (!receipt) return null

  const agent = receipt.agentId
    ? await prisma.profile.findUnique({
        where: { id: receipt.agentId },
        select: { fullName: true },
      })
    : null

  return {
    receiptNo: receipt.receiptNo,
    pickupId: receipt.pickupId,
    vendorName: displayName(receipt.pickup.vendor),
    category: CATEGORY_LABELS[receipt.pickup.category],
    itemCount: receipt.itemCount,
    totalWeightKg: num(receipt.totalWeightKg),
    amountPaise: receipt.amountPaise,
    agentName: agent?.fullName ?? null,
    collectedAt: receipt.collectedAt,
    capturedLat: optionalNum(receipt.capturedLat),
    capturedLng: optionalNum(receipt.capturedLng),
    publicToken: receipt.publicToken,
  }
}

/**
 * Exported (Batch 10) so `/invoices/[id]` renders from the SAME mapper the PDF
 * template consumes. An invoice screen that disagreed with its own invoice PDF
 * — different line split, different total — is the worst bug this surface could
 * have, and sharing the mapper makes it unrepresentable.
 *
 * ⚠ Same rule as `getDocument`: CALLER MUST PASS THE SESSION'S OWN vendorId.
 * The scope is enforced here in code, because Prisma bypasses RLS.
 */
export async function getInvoiceDoc(
  pickupId: string,
  vendorId: string,
): Promise<InvoiceDoc | null> {
  return invoiceDoc(pickupId, vendorId)
}

async function invoiceDoc(pickupId: string, vendorId: string): Promise<InvoiceDoc | null> {
  const invoice = await prisma.invoice.findFirst({
    where: { pickupId, vendorId },
    include: {
      vendor: {
        select: {
          fullName: true,
          companyName: true,
          businessAddress: true,
          gstNumber: true,
        },
      },
      pickup: {
        select: {
          category: true,
          items: {
            select: {
              quantity: true,
              weightKg: true,
              confirmedWeightKg: true,
              linePricePaise: true,
            },
          },
        },
      },
    },
  })
  if (!invoice || !invoice.pickup) return null

  const categoryLabel = CATEGORY_LABELS[invoice.pickup.category]

  // Per-item pricing is the agent's job and is null until they price on site
  // (BatteryItem.linePricePaise). Until then the invoice carries ONE line for
  // the whole consignment at the settled amount, rather than inventing a split
  // — an invoice that apportions money we never apportioned would be a fiction
  // on a financial document.
  const priced = invoice.pickup.items.filter((i) => i.linePricePaise !== null)
  const lines =
    priced.length > 0
      ? priced.map((item) => ({
          description: `${categoryLabel} batteries`,
          quantity: item.quantity,
          weightKg: optionalNum(item.confirmedWeightKg ?? item.weightKg),
          amountPaise: item.linePricePaise!,
        }))
      : [
          {
            // Description carries no quantity: `quantity` is its own field, the
            // PDF renders it as its own column, and /invoices/[id] renders it
            // alongside the label — so a "— N units" suffix here printed the
            // same number twice on both surfaces.
            description: `${categoryLabel} batteries`,
            quantity: invoice.pickup.items.reduce((sum, i) => sum + i.quantity, 0),
            weightKg: invoice.pickup.items.reduce(
              (sum, i) => sum + num(i.confirmedWeightKg ?? i.weightKg),
              0,
            ),
            amountPaise: invoice.subtotalPaise,
          },
        ]

  const payment = await prisma.payment.findUnique({
    where: { pickupId },
    select: { paidAt: true, method: true, status: true },
  })

  return {
    number: invoice.number,
    pickupId,
    vendorName: displayName(invoice.vendor),
    vendorAddress: invoice.vendor.businessAddress,
    gstNumber: invoice.vendor.gstNumber,
    lines,
    subtotalPaise: invoice.subtotalPaise,
    taxPaise: invoice.taxPaise,
    totalPaise: invoice.totalPaise,
    issuedAt: invoice.issuedAt,
    paidAt: payment?.status === 'paid' ? payment.paidAt : null,
    paymentMethod: payment?.status === 'paid' ? PAYMENT_METHOD_LABELS[payment.method] : null,
  }
}

/** Payment method wording for the invoice. Kept here rather than in the template — it's data, not layout. */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  wallet: 'Back2Basics wallet',
  cash: 'Cash',
}

// ─── Storage + persistence ───────────────────────────────────────────────────

/**
 * `<vendorId>/<pickupId>/<kind>.pdf`.
 *
 * The service role bypasses storage RLS, so this layout isn't load-bearing for
 * these three buckets the way it is for `pickup-photos` — but it matches
 * `buildObjectPath`'s `<uid>/…` convention anyway, so the admin app can apply
 * one mental model to every bucket, and a stray policy added later behaves.
 */
function objectPath(kind: DocumentKind, vendorId: string, pickupId: string): string {
  return `${vendorId}/${pickupId}/${kind}.pdf`
}

async function readStored(kind: DocumentKind, path: string): Promise<Buffer | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(BUCKET[kind]).download(path)
  if (error || !data) {
    // Not fatal: a missing object means the cache is stale (bucket wiped by a
    // reseed, template regenerated). Fall through and re-render.
    console.warn(`[documents] cached ${kind} missing at ${path}:`, error?.message)
    return null
  }
  return Buffer.from(await data.arrayBuffer())
}

async function store(kind: DocumentKind, path: string, buffer: Buffer): Promise<boolean> {
  const admin = createAdminClient()
  const { error } = await admin.storage.from(BUCKET[kind]).upload(path, buffer, {
    contentType: 'application/pdf',
    // Overwrite is correct HERE and wrong for photos: this object is a
    // derivable render of the row, not evidence. Re-rendering after a template
    // change must replace it, and there is nothing to lose if it does.
    upsert: true,
  })
  if (error) {
    console.error(`[documents] upload failed for ${path}:`, error.message)
    return false
  }
  return true
}

/** Persist the path so the next request skips rendering. */
async function rememberPath(kind: DocumentKind, pickupId: string, path: string): Promise<void> {
  if (kind === 'certificate') {
    await prisma.certificate.update({ where: { pickupId }, data: { pdfUrl: path } })
  } else if (kind === 'receipt') {
    await prisma.pickupReceipt.update({ where: { pickupId }, data: { pdfUrl: path } })
  } else {
    await prisma.invoice.update({ where: { pickupId }, data: { pdfUrl: path } })
  }
}

async function storedPath(kind: DocumentKind, pickupId: string): Promise<string | null> {
  const row =
    kind === 'certificate'
      ? await prisma.certificate.findUnique({ where: { pickupId }, select: { pdfUrl: true } })
      : kind === 'receipt'
        ? await prisma.pickupReceipt.findUnique({ where: { pickupId }, select: { pdfUrl: true } })
        : await prisma.invoice.findUnique({ where: { pickupId }, select: { pdfUrl: true } })

  // The seed writes "" rather than null for Certificate.pdfUrl, so emptiness is
  // the test, not nullness.
  return row?.pdfUrl ? row.pdfUrl : null
}

/**
 * Fetch a document, generating and caching it on first request.
 *
 * ⚠ CALLER MUST PASS THE SESSION'S OWN vendorId. Every query below is scoped by
 * it; passing anything else hands out someone else's compliance document.
 */
export async function getDocument(input: {
  kind: DocumentKind
  pickupId: string
  vendorId: string
}): Promise<DocumentResult> {
  const { kind, pickupId, vendorId } = input

  try {
    // The ownership-scoped read happens first, unconditionally — before any
    // cached path is trusted. Reversing this would let a known pickup id fetch
    // a cached object without ever proving ownership of the row.
    const doc =
      kind === 'certificate'
        ? await certificateDoc(pickupId, vendorId)
        : kind === 'receipt'
          ? await receiptDoc(pickupId, vendorId)
          : await invoiceDoc(pickupId, vendorId)

    if (!doc) return { ok: false, reason: 'not_found' }

    const path = objectPath(kind, vendorId, pickupId)
    const filename = `${documentName(kind, doc)}.pdf`

    const cachedPath = await storedPath(kind, pickupId)
    if (cachedPath) {
      const cached = await readStored(kind, cachedPath)
      if (cached) return { ok: true, buffer: cached, filename }
    }

    const buffer =
      kind === 'certificate'
        ? await renderCertificatePdf(doc as CertificateDoc)
        : kind === 'receipt'
          ? await renderReceiptPdf(doc as ReceiptDoc)
          : await renderInvoicePdf(doc as InvoiceDoc)

    // Caching is best-effort: a Storage or DB hiccup must not stop the customer
    // getting the document they asked for. Worst case it re-renders next time.
    if (await store(kind, path, buffer)) {
      await rememberPath(kind, pickupId, path).catch((e) =>
        console.error('[documents] could not persist pdf path:', e),
      )
    }

    return { ok: true, buffer, filename }
  } catch (error) {
    console.error(`[documents] ${kind} generation failed for ${pickupId}:`, error)
    return { ok: false, reason: 'failed' }
  }
}

/** The download filename — the document's own number, which is what a customer files it under. */
function documentName(
  kind: DocumentKind,
  doc: CertificateDoc | ReceiptDoc | InvoiceDoc,
): string {
  if (kind === 'certificate') return (doc as CertificateDoc).certificateNumber
  if (kind === 'receipt') return (doc as ReceiptDoc).receiptNo
  return (doc as InvoiceDoc).number
}
