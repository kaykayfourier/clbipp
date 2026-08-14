// ─── Booking quote engine ────────────────────────────────────────────────────
// The indicative quote the customer sees at step 3 of the booking wizard,
// before any agent has seen the request. Signatures are pinned by the A↔B
// contract in BATCH_0B_SCHEMA.md §7 — changing a name or type here is a
// cross-lane change, say so the same day.
//
// All money is integer PAISE. There is no float in this file: rates are paise
// per kg, multipliers are basis points (10000 = 1.00x), and every division
// rounds at the very end of a line.

import { prisma } from "@clbipp/database";
import type {
  BatteryCategory,
  BatteryCondition,
  PricingRate,
} from "@clbipp/database";

// One line in the booking form. Maps 1:1 to a BatteryItem row on submit.
// `weightKg` is the TOTAL weight of the line, not per unit — the seed follows
// the same convention (14 automotive batteries = 196 kg).
export type BookingLineItem = {
  category: BatteryCategory;
  quantity: number;
  weightKg: number | null;
  condition: BatteryCondition;
  photoUrls: string[];
};

export type QuoteLine = {
  index: number; // position in the input array
  linePaise: number;
  basis: "per_kg" | "per_unit";
  note: string | null; // qualitative, safe to show the customer
};

export type QuoteResult = {
  totalPaise: number;
  lines: QuoteLine[];
  disclaimer: string;
};

export const QUOTE_DISCLAIMER =
  "Indicative only. The final value is confirmed after the agent inspects and weighs the batteries on site.";

// Fallback weights used only when the customer cannot weigh the batteries.
// Demo placeholders of the right order of magnitude, consistent with the seed
// fixtures — NOT researched figures. The agent's confirmed weight replaces
// this the moment the pickup is collected.
const TYPICAL_UNIT_WEIGHT_KG: Record<BatteryCategory, number> = {
  portable: 0.6,
  automotive: 14,
  industrial: 40,
  ev: 250,
};

// Customer-facing rationale per condition. Qualitative by design: the vendor
// sees a price and a reason, never a rupee deduction or a recovery rate.
const CONDITION_NOTES: Record<BatteryCondition, string | null> = {
  healthy: null,
  dead: "End-of-life cells still carry full material value — only a small handling allowance applies.",
  swollen: "Swollen cells need a fire-safe crate and careful handling, which lowers the indicative value.",
  leaking: "Leaking cells are hazardous to move and may have lost material, so the indicative value is well below a healthy unit.",
};

const ESTIMATED_WEIGHT_NOTE =
  "Estimated from a typical unit weight — we'll confirm the real weight when we collect.";

// Pick the best rate row for a line. Booking is category-first: the customer is
// never asked for chemistry (the company doc assigns that to the field agent),
// so the chemistry-null fallback rows are the ones that normally match here.
// Preference order, most specific first.
function pickRate(
  rates: PricingRate[],
  category: BatteryCategory,
  condition: BatteryCondition,
): PricingRate | null {
  const active = rates.filter((r) => r.isActive && r.category === category);
  if (active.length === 0) return null;

  return (
    active.find((r) => r.chemistry === null && r.condition === condition) ??
    active.find((r) => r.condition === condition) ??
    active.find((r) => r.chemistry === null && r.condition === null) ??
    active.find((r) => r.condition === null) ??
    active[0]
  );
}

// PURE. No DB, no async, no clock — rates are passed in, and the effective-date
// window is filtered by the caller (getQuote does it in SQL). That is what
// makes this unit-testable.
export function estimateQuote(
  items: BookingLineItem[],
  rates: PricingRate[],
): QuoteResult {
  const lines: QuoteLine[] = items.map((item, index) => {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new RangeError(`Line ${index}: quantity must be a positive integer`);
    }
    if (item.weightKg !== null && !(item.weightKg > 0)) {
      throw new RangeError(`Line ${index}: weight must be greater than zero`);
    }

    const rate = pickRate(rates, item.category, item.condition);
    if (!rate) {
      // No rate configured for this category — quote nothing rather than
      // inventing a number. The booking still goes through; the agent prices it.
      return { index, linePaise: 0, basis: "per_kg", note: null };
    }

    const weighed = item.weightKg !== null;
    const basis: QuoteLine["basis"] = weighed ? "per_kg" : "per_unit";

    let linePaise: number;
    if (!weighed && rate.ratePerUnitPaise !== null) {
      // A per-unit rate is authoritative when the line has no weight.
      linePaise = rate.ratePerUnitPaise * item.quantity;
    } else {
      const kg = weighed
        ? (item.weightKg as number)
        : TYPICAL_UNIT_WEIGHT_KG[item.category] * item.quantity;
      linePaise = kg * rate.ratePerKgPaise;
    }

    // Basis points applied last, then rounded once — money stays an integer.
    linePaise = Math.round((linePaise * rate.conditionMultiplierBp) / 10000);

    const conditionNote = CONDITION_NOTES[item.condition];
    const note = weighed
      ? conditionNote
      : conditionNote
        ? `${conditionNote} ${ESTIMATED_WEIGHT_NOTE}`
        : ESTIMATED_WEIGHT_NOTE;

    return { index, linePaise, basis, note };
  });

  return {
    totalPaise: lines.reduce((sum, line) => sum + line.linePaise, 0),
    lines,
    disclaimer: QUOTE_DISCLAIMER,
  };
}

// Thin DB wrapper around the above — the one the quote step calls. Loads only
// the rates that are live right now, so `estimateQuote` never has to know the
// date.
export async function getQuote(items: BookingLineItem[]): Promise<QuoteResult> {
  const now = new Date();
  const rates = await prisma.pricingRate.findMany({
    where: {
      isActive: true,
      category: { in: items.map((item) => item.category) },
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
  });

  return estimateQuote(items, rates);
}
