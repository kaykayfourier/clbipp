// ─── Offer display helpers ───────────────────────────────────────────────────
// Shared by /offer and /offer-breakdown so the paise→₹ conversion and pathway
// labels live in one place.

import type { RecoveryPathway } from "@prisma/client";

// `Offer.estimatedPrice` is stored as an integer number of PAISE (see seed:
// 18450000 = ₹1,84,500). Divide by 100 for the rupee figure.
export function formatOfferPrice(estimatedPricePaise: number): string {
  const rupees = estimatedPricePaise / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// Human-readable label for each recovery pathway enum value. Typed as a Record
// over the enum so adding a pathway forces a label here (exhaustiveness).
const PATHWAY_LABELS: Record<RecoveryPathway, string> = {
  recycle: "Recycling",
  refurbish: "Refurbishment",
  reuse: "Reuse",
  dispose: "Disposal",
};

// String-safe lookup — the Supabase client returns `pathway` untyped, so callers
// pass a plain string and fall back to the raw value for anything unexpected.
export function pathwayLabel(pathway: string): string {
  return PATHWAY_LABELS[pathway as RecoveryPathway] ?? pathway;
}

// One recovered material, WEIGHT ONLY. `Offer.materialBreakdown` also carries a
// `value_paise` per line — deliberately dropped here: the locked rule forbids
// rendering material/deduction ₹ to the vendor. Weight (kg) is allowed.
export interface MaterialWeight {
  material: string;
  weightKg: number;
}

// Defensively parse the untyped materialBreakdown JSON into weight-only rows.
// Anything malformed is skipped rather than crashing the offer screen.
export function parseMaterialWeights(raw: unknown): MaterialWeight[] {
  if (!Array.isArray(raw)) return [];
  const rows: MaterialWeight[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { material, weight_kg } = item as Record<string, unknown>;
    if (typeof material === "string" && typeof weight_kg === "number") {
      rows.push({ material, weightKg: weight_kg });
    }
  }
  return rows;
}
