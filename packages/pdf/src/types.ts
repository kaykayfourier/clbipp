// ─── Document data shapes ────────────────────────────────────────────────────
// The three templates take PLAIN data — no Prisma model types, and critically
// no `Decimal`. A Prisma Decimal that reaches a template renders as "[object
// Object]" rather than a number, and it can't cross a serialisation boundary
// either. Mapping happens once, in the caller (apps/customer/src/lib/documents.ts).
//
// Money is integer PAISE everywhere, per the repo-wide rule. The templates are
// the only place it becomes a rupee string, via formatPaise from @clbipp/core.
//
// Keys here are a stable shared shape — don't rename one without updating the
// mapper and the template that reads it.

/** One recovered material line. Weight in kg; no value — see the note below. */
export interface MaterialLine {
  material: string
  recoveredKg: number
}

/**
 * The EPR certificate — the compliance document, issued after recycling.
 *
 * ⚠ LAYOUT IS DELIBERATELY PLAIN AND SWAPPABLE. The company will supply the
 * authoritative certificate format; when they do, only
 * templates/certificate.tsx changes, because the data query and this shape are
 * separate from it. Don't invest design effort here.
 */
export interface CertificateDoc {
  certificateNumber: string
  pickupId: string
  /** Company name for a fleet account, full name for an individual. */
  vendorName: string
  vendorType: string
  category: string
  totalWeightKg: number
  materials: MaterialLine[]
  co2AvoidedKg: number | null
  certifiedAt: Date
  /** Printed for manual verification against the public record. */
  publicToken: string
}

/**
 * The pickup receipt — handed over AT COLLECTION (company doc §4 step 4).
 * This is NOT the EPR certificate; it proves the batteries changed hands,
 * not that they were recycled.
 */
export interface ReceiptDoc {
  receiptNo: string
  pickupId: string
  vendorName: string
  category: string
  itemCount: number
  totalWeightKg: number
  amountPaise: number | null
  agentName: string | null
  collectedAt: Date
  capturedLat: number | null
  capturedLng: number | null
  publicToken: string
}

/** One priced line on the invoice. */
export interface InvoiceLine {
  description: string
  quantity: number
  weightKg: number | null
  amountPaise: number
}

/**
 * The invoice for a single pickup's payout.
 *
 * Direction matters: WE pay the vendor for the batteries, so this reads as a
 * payout advice rather than a demand for money. `taxPaise` is 0 today —
 * whether GST applies to scrap purchased from an unregistered individual is a
 * question for the company, and inventing a rate would be worse than showing
 * zero. Flagged in the Batch 8 notes.
 */
export interface InvoiceDoc {
  number: string
  pickupId: string
  vendorName: string
  vendorAddress: string | null
  gstNumber: string | null
  lines: InvoiceLine[]
  subtotalPaise: number
  taxPaise: number
  totalPaise: number
  issuedAt: Date
  paidAt: Date | null
  paymentMethod: string | null
}
