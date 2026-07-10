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
