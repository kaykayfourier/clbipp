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
  /**
   * FV13 · FD17 — mass routed to a refurbisher for a second life. Printed as
   * its own line, never inside `materials`: a reused battery recovered no
   * metal. Null or 0 prints nothing (every certificate minted before FV13).
   */
  secondLifeKg: number | null
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
  /**
   * FV10 · FD12 — the tag on each collected line, so the vendor's own copy of
   * the receipt names the labels their batteries left with. `tagCode` null
   * means the line left untagged (FD13) and the hub tags it on receipt.
   */
  lines: Array<{ description: string; tagCode: string | null }>
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

/**
 * The chain-of-custody receipt for one hub drop-off (CustodyBatch).
 *
 * FV12 (2026-09-27) rebuilt this shape: it used to carry one weight per pickup
 * read off the superseded `approxWeightKg` column, and an `itemCount` the
 * template labelled "Pickups in batch". It now lists every LINE with its tag
 * and the box it travelled in — the records feedback §4.2 asks for.
 */
export type CustodyDoc = {
  batchNo: string
  agentName: string
  facilityName: string
  handedOffAt: Date
  lat: number | null
  lng: number | null
  totalWeightKg: number
  receivingStaffName: string
  /** The collection runs these pickups were on, if any (FV11). */
  runNos: string[]
  /** Every transport box a line in this batch travelled in (FV11). */
  containers: Array<{ code: string; label: string }>
  pickups: Array<{
    pickupId: string
    vendorName: string
    weightKg: number
    lines: Array<{
      description: string
      weightKg: number
      tagCode: string | null
      containerCode: string | null
      /** FD13 — why this line left untagged, when it did. */
      untaggedReason: string | null
    }>
  }>
}

/** A sheet (or several) of pre-issued battery tags — FV10 · FD12. */
export type TagLabelsDoc = {
  issueBatch: string
  issuedAt: Date
  codes: string[]
}

/** Permanent QR labels for reusable transport boxes — FV11 · FD14. */
export type ContainerLabelsDoc = {
  containers: Array<{ code: string; label: string; capacityKg: number | null }>
}
