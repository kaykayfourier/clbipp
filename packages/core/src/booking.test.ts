import { describe, expect, it } from "vitest";
import type { BatteryCategory, BatteryCondition, PricingRate } from "@clbipp/database";
import { estimateQuote, type BookingLineItem } from "./booking";

// Mirrors the seeded rates (BATCH_0B_SCHEMA.md §6) but only for the categories
// each test needs — the pure function has no idea where rates come from.
function rate(
  category: BatteryCategory,
  ratePerKgPaise: number,
  condition: BatteryCondition | null,
  conditionMultiplierBp: number,
  overrides: Partial<PricingRate> = {},
): PricingRate {
  return {
    id: `${category}-${condition ?? "any"}`,
    category,
    chemistry: null,
    condition,
    ratePerKgPaise,
    ratePerUnitPaise: null,
    conditionMultiplierBp,
    isActive: true,
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

const RATES: PricingRate[] = [
  rate("automotive", 7000, "healthy", 10000),
  rate("automotive", 7000, "leaking", 5000),
  rate("portable", 12000, "healthy", 10000),
  rate("portable", 12000, "swollen", 7000),
];

function line(overrides: Partial<BookingLineItem> = {}): BookingLineItem {
  return {
    category: "automotive",
    quantity: 1,
    weightKg: 10,
    condition: "healthy",
    photoUrls: [],
    ...overrides,
  };
}

describe("estimateQuote", () => {
  it("prices a weighed line at kg x rate", () => {
    const quote = estimateQuote([line({ weightKg: 196, quantity: 14 })], RATES);

    // 196 kg x 7000 paise = ₹13,720. Quantity does not double-count: weightKg
    // is the whole line, not per unit.
    expect(quote.lines[0]).toMatchObject({ linePaise: 1_372_000, basis: "per_kg" });
    expect(quote.totalPaise).toBe(1_372_000);
  });

  it("applies the condition multiplier", () => {
    const quote = estimateQuote(
      [line({ weightKg: 100, condition: "leaking" })],
      RATES,
    );

    // 100 x 7000 = 700000, x 0.50 = 350000
    expect(quote.lines[0].linePaise).toBe(350_000);
    expect(quote.lines[0].note).toMatch(/hazardous/i);
  });

  it("falls back to a typical unit weight when the line has no weight", () => {
    const quote = estimateQuote(
      [line({ category: "portable", quantity: 10, weightKg: null })],
      RATES,
    );

    // 10 units x 0.6 kg x 12000 paise = ₹720
    expect(quote.lines[0]).toMatchObject({ linePaise: 72_000, basis: "per_unit" });
    expect(quote.lines[0].note).toMatch(/estimated from a typical unit weight/i);
  });

  it("prefers a per-unit rate over the estimated weight when one exists", () => {
    const rates = [
      rate("portable", 12000, "healthy", 10000, { ratePerUnitPaise: 5000 }),
    ];
    const quote = estimateQuote(
      [line({ category: "portable", quantity: 3, weightKg: null })],
      rates,
    );

    expect(quote.lines[0]).toMatchObject({ linePaise: 15_000, basis: "per_unit" });
  });

  it("returns integer paise even when the maths does not divide evenly", () => {
    const quote = estimateQuote(
      [line({ category: "portable", weightKg: 1.37, condition: "swollen" })],
      RATES,
    );

    // 1.37 x 12000 = 16440, x 0.70 = 11508
    expect(quote.lines[0].linePaise).toBe(11_508);
    expect(Number.isInteger(quote.lines[0].linePaise)).toBe(true);
  });

  it("sums every line into the total and keeps input order", () => {
    const quote = estimateQuote(
      [
        line({ weightKg: 10 }),
        line({ category: "portable", weightKg: 5, condition: "swollen" }),
      ],
      RATES,
    );

    expect(quote.lines.map((l) => l.index)).toEqual([0, 1]);
    // 70000 + round(60000 x 0.7) = 70000 + 42000
    expect(quote.totalPaise).toBe(112_000);
  });

  it("ignores inactive rates and quotes zero when nothing matches", () => {
    const inactive = [rate("ev", 20000, "healthy", 10000, { isActive: false })];
    const quote = estimateQuote(
      [line({ category: "ev", weightKg: 300 })],
      inactive,
    );

    expect(quote.totalPaise).toBe(0);
    expect(quote.lines[0].linePaise).toBe(0);
  });

  it("falls back to a condition-agnostic rate row when the condition has none", () => {
    const rates = [rate("ev", 20000, null, 10000)];
    const quote = estimateQuote(
      [line({ category: "ev", weightKg: 100, condition: "dead" })],
      rates,
    );

    expect(quote.lines[0].linePaise).toBe(2_000_000);
  });

  it("healthy lines carry no rationale note", () => {
    const quote = estimateQuote([line()], RATES);
    expect(quote.lines[0].note).toBeNull();
  });

  it("rejects a non-positive quantity", () => {
    expect(() => estimateQuote([line({ quantity: 0 })], RATES)).toThrow(RangeError);
  });

  it("rejects a zero or negative weight", () => {
    expect(() => estimateQuote([line({ weightKg: 0 })], RATES)).toThrow(RangeError);
  });

  it("returns an empty quote for an empty basket", () => {
    const quote = estimateQuote([], RATES);
    expect(quote).toMatchObject({ totalPaise: 0, lines: [] });
    expect(quote.disclaimer).toMatch(/indicative only/i);
  });
});
