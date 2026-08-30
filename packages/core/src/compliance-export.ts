// ─── Compliance CSV export — shared between customer and admin apps ───────────
// Lifted from apps/customer/src/lib/compliance-export.ts (Batch 9).
// Both apps import from here; the customer route's output must be byte-identical
// before and after the lift — the smoke test's CSV assertion proves it.
//
// Admin gets an additional aggregate export (`buildAdminComplianceAggregate`)
// for per-metal input vs recovered vs yield, and certified mass by period.
// 🔴 No EPR-credit number until the company answers open question 17.

import Papa from 'papaparse'
import { prisma } from '@clbipp/database'
import { aggregateMaterials, formatMaterials } from './impact'
import { certificateNumber } from './documents'

// ─── Vendor-facing CSV (one row per certificate) ─────────────────────────────

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
  rows: number
}

// 🔴 These four strings are the CSV's `category` column, and the lift out of
// apps/customer/src/lib/compliance-export.ts had to preserve them EXACTLY.
// `ev` was 'EV pack' in the original (apps/customer/src/app/(app)/book/copy.ts,
// which the pre-lift builder imported) and was rewritten to 'EV' here — so
// every EV row in every filed return silently changed wording. Restored
// 2026-08-31; `compliance-export.test.ts` pins all four so the next edit to
// this map fails a test instead of a CPCB return.
//
// ⚠ Do NOT re-import book/copy.ts to dedupe this. That file lives in the
// customer app, packages/* cannot import from apps/*, and this map is now the
// shared definition both apps read through buildComplianceCsv.
const CATEGORY_LABELS: Record<string, string> = {
  portable:   'Portable',
  automotive: 'Automotive',
  industrial: 'Industrial',
  ev:         'EV pack',
}

export async function buildComplianceCsv(input: {
  vendorId: string
  origin: string
  year?: string | null
}): Promise<ComplianceCsv> {
  const year = Number(input.year)
  const filterYear =
    Number.isInteger(year) && year > 1900 && year < 3000 ? year : null

  const certificates = await prisma.certificate.findMany({
    where: {
      // empty string = admin export, no vendor scope
      ...(input.vendorId ? { vendorId: input.vendorId } : {}),
      ...(filterYear
        ? {
            certifiedAt: {
              gte: new Date(filterYear, 0, 1),
              lt:  new Date(filterYear + 1, 0, 1),
            },
          }
        : {}),
    },
    orderBy: { certifiedAt: "desc" },
    include: { pickup: { select: { category: true } } },
  })

  const rows: Row[] = certificates.map((cert) => ({
    certificate_number: certificateNumber({
      pickupId:    cert.pickupId,
      category:    cert.pickup.category,
      certifiedAt: cert.certifiedAt,
    }),
    pickup_id:    cert.pickupId,
    certified_on: cert.certifiedAt.toISOString().slice(0, 10),
    category:     CATEGORY_LABELS[cert.pickup.category] ?? cert.pickup.category,
    total_weight_kg:  Number(cert.totalWeightKg),
    co2e_avoided_kg:
      cert.co2AvoidedKg === null ? '' : Number(cert.co2AvoidedKg),
    materials_recovered: formatMaterials(
      aggregateMaterials([cert.materialSummary]),
    ),
    verification_link: `${input.origin}/t/${cert.publicToken}`,
  }))

  const csv = Papa.unparse({
    fields: [...COLUMNS],
    data:   rows.map((row) => COLUMNS.map((col) => row[col])),
  })

  return {
    csv,
    filename: `clbipp-compliance-${filterYear ?? 'all'}.csv`,
    rows: rows.length,
  }
}

// ─── Admin aggregate (per-metal, per-period) ──────────────────────────────────
// 🔴 No EPR-credit number — report certified mass only (open question 17).

export interface MetalAggregate {
  material: string
  totalRecoveredKg: number
}

export interface AdminComplianceAggregate {
  period: string
  certifiedMassKg: number
  co2AvoidedKg: number
  byMetal: MetalAggregate[]
}

export async function buildAdminComplianceAggregate(input: {
  year?: string | null
}): Promise<AdminComplianceAggregate> {
  const year = Number(input.year)
  const filterYear =
    Number.isInteger(year) && year > 1900 && year < 3000 ? year : null

  const certificates = await prisma.certificate.findMany({
    where: filterYear
      ? {
          certifiedAt: {
            gte: new Date(filterYear, 0, 1),
            lt:  new Date(filterYear + 1, 0, 1),
          },
        }
      : {},
    select: {
      totalWeightKg:   true,
      co2AvoidedKg:    true,
      materialSummary: true,
    },
  })

  const certifiedMassKg = certificates.reduce(
    (sum, c) => sum + Number(c.totalWeightKg),
    0,
  )

  const co2Kg = certificates.reduce(
    (sum, c) => sum + (c.co2AvoidedKg !== null ? Number(c.co2AvoidedKg) : 0),
    0,
  )

  const byMetal = aggregateMaterials(
    certificates.map((c) => c.materialSummary),
  ).map((m) => ({
    material:         m.material,
    totalRecoveredKg: m.kg,
  }))

  return {
    period:          filterYear ? String(filterYear) : 'all',
    certifiedMassKg: Math.round(certifiedMassKg * 10) / 10,
    co2AvoidedKg:    Math.round(co2Kg),
    byMetal,
  }
}