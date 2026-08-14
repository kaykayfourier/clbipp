import 'server-only'
import Papa from 'papaparse'
import { prisma } from '@clbipp/database'
import { aggregateMaterials, certificateNumber, formatMaterials } from '@clbipp/core'
import { CATEGORY_LABELS } from '@/app/(app)/book/copy'

// ─── Compliance CSV export ───────────────────────────────────────────────────
// Batch 9 (B5). One entry point, `buildComplianceCsv`, behind
// /api/exports/compliance. Same shape as @/lib/documents:
//
//   1. read the rows SCOPED BY vendorId — Prisma bypasses RLS, so ownership is
//      enforced in code here, the same rule as @/lib/documents, @/lib/custody
//      and addresses/actions.ts;
//   2. serialise to CSV;
//   3. the route streams the bytes.
//
// No signed URL and no stored object, unlike the PDFs. A CSV is cheap to
// regenerate, it changes every time a certificate is issued, and caching it
// would mean serving a stale compliance return — the one document where stale
// is worst. Streaming also keeps the session as the only key, which is why the
// PDF route stopped minting signed URLs in Batch 8.
//
// ⚠ Column set. One row per CERTIFICATE, because a CPCB return is filed per
// consignment and because a stable column set is worth more in a spreadsheet
// than columns that change shape between exports (which is what per-material
// columns would do — the material list varies by chemistry). Materials collapse
// into one text cell via `formatMaterials`.
//
// The authoritative return format is an OPEN QUESTION FOR THE COMPANY, the same
// class as the invoice's zero `taxPaise`. Their answer changes this array and
// the mapper below it, and nothing else — that is why the shape lives in one
// place.

const COLUMNS = [
  'certificate_number',
  'pickup_id',
  'certified_on',
  'category',
  'total_weight_kg',
  'co2e_avoided_kg',
  'materials_recovered',
  'verification_link',
] as const

type Column = (typeof COLUMNS)[number]
type Row = Record<Column, string | number>

export interface ComplianceCsv {
  csv: string
  filename: string
  /** Row count excluding the header — the route logs nothing, but callers assert on it. */
  rows: number
}

/**
 * @param year Optional four-digit compliance year, so an export matches the
 *   filter showing on `/compliance` rather than silently returning everything.
 *   Anything unparseable is ignored rather than erroring — a bad query string
 *   should not be able to turn a download into a 500.
 */
export async function buildComplianceCsv(input: {
  vendorId: string
  origin: string
  year?: string | null
}): Promise<ComplianceCsv> {
  const year = Number(input.year)
  const filterYear = Number.isInteger(year) && year > 1900 && year < 3000 ? year : null

  const certificates = await prisma.certificate.findMany({
    where: {
      vendorId: input.vendorId,
      ...(filterYear
        ? {
            // A half-open range on the indexed column rather than an extracted
            // year, so Postgres can still use the index. Local midnight on both
            // ends, matching how the screen groups by `getFullYear()`.
            certifiedAt: {
              gte: new Date(filterYear, 0, 1),
              lt: new Date(filterYear + 1, 0, 1),
            },
          }
        : {}),
    },
    orderBy: { certifiedAt: 'desc' },
    include: { pickup: { select: { category: true } } },
  })

  const rows: Row[] = certificates.map((cert) => ({
    certificate_number: certificateNumber({
      pickupId: cert.pickupId,
      category: cert.pickup.category,
      certifiedAt: cert.certifiedAt,
    }),
    pickup_id: cert.pickupId,
    // ISO date, not a localised one. A compliance file gets opened in a
    // spreadsheet in an unknown locale, where `09/08/2026` is ambiguous and
    // `2026-08-09` is not.
    certified_on: cert.certifiedAt.toISOString().slice(0, 10),
    category: CATEGORY_LABELS[cert.pickup.category],
    total_weight_kg: Number(cert.totalWeightKg),
    // Nullable on certificates issued before the column existed. Blank rather
    // than 0 — an empty cell reads as "not recorded", a zero reads as a claim.
    co2e_avoided_kg: cert.co2AvoidedKg === null ? '' : Number(cert.co2AvoidedKg),
    materials_recovered: formatMaterials(aggregateMaterials([cert.materialSummary])),
    // The existing public tracking page. Absolute, because the file leaves the
    // app — a relative path in a spreadsheet is not a link.
    verification_link: `${input.origin}/t/${cert.publicToken}`,
  }))

  // The `{ fields, data }` form rather than `unparse(rows, { columns })`,
  // because that form emits NOTHING AT ALL for an empty array — a year filter
  // matching no certificates would download a zero-byte file that reads as a
  // broken download rather than as "no certificates in 2025". Passing the
  // fields explicitly guarantees the header row and the column order in both
  // cases, from the one COLUMNS array.
  const csv = Papa.unparse({
    fields: [...COLUMNS],
    data: rows.map((row) => COLUMNS.map((column) => row[column])),
  })

  return {
    csv,
    // Named by what it contains, so a folder of these is still readable.
    filename: `clbipp-compliance-${filterYear ?? 'all'}.csv`,
    rows: rows.length,
  }
}
