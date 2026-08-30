import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked before the module under test is imported, the same way
// certificate.test.ts, payment-actions.test.ts and market.test.ts do it.
// `compliance-export.ts` reads the database at module scope.
//
// ⚠ `vi.hoisted`, not a plain const — `vi.mock` is hoisted above every
// top-level statement, so a factory closing over an ordinary `const db` throws
// "Cannot access 'db' before initialization" at import time.
//
// `certificateNumber`, `aggregateMaterials` and `formatMaterials` are NOT
// mocked. They are pure and they are part of what the CSV promises, so letting
// them run is the point: this file asserts the BYTES a CPCB return is filed
// with, not that a mapper was called.
const db = vi.hoisted(() => ({
  certificate: { findMany: vi.fn() },
}));
vi.mock("@clbipp/database", () => ({ prisma: db }));

import { buildComplianceCsv, buildAdminComplianceAggregate } from "./compliance-export";

const VENDOR = "11111111-1111-1111-1111-111111111111";
const ORIGIN = "https://clbipp.example";

/** One certificate row, shaped exactly as the `findMany` in the module selects it. */
function cert(over: Partial<Record<string, unknown>> = {}) {
  return {
    pickupId: "PKP-2026-000109",
    certifiedAt: new Date("2026-08-14T09:30:00.000Z"),
    totalWeightKg: 148.5,
    co2AvoidedKg: 921,
    materialSummary: [
      { material: "Nickel", recovered_kg: 5.7 },
      { material: "Cobalt", recovered_kg: 2.2 },
    ],
    publicToken: "abc-token",
    pickup: { category: "ev" },
    ...over,
  };
}

/** The header line plus one data line, split for readability in assertions. */
function lines(csv: string): string[] {
  return csv.trim().split("\n");
}

describe("buildComplianceCsv — the filed CSV's contract", () => {
  beforeEach(() => vi.clearAllMocks());

  // 🔴 THE REGRESSION THIS FILE EXISTS FOR.
  //
  // The Batch 8 lift out of apps/customer/src/lib/compliance-export.ts rewrote
  // the `ev` label from 'EV pack' to 'EV'. Nothing caught it: the column set
  // was unchanged, the row count was unchanged, the build passed and lint
  // passed — and every EV row in every filed return changed wording. The lift's
  // own done-when said "byte-identical before and after", and there was no test
  // that could fail.
  //
  // These four strings are the pre-lift values, from the CATEGORY_LABELS the
  // customer builder imported (apps/customer/src/app/(app)/book/copy.ts).
  it("labels every category exactly as the pre-lift export did", async () => {
    const categories = ["portable", "automotive", "industrial", "ev"] as const;
    const expected = ["Portable", "Automotive", "Industrial", "EV pack"];

    for (const [i, category] of categories.entries()) {
      db.certificate.findMany.mockResolvedValue([cert({ pickup: { category } })]);

      const { csv } = await buildComplianceCsv({ vendorId: VENDOR, origin: ORIGIN });

      // Column 4 (0-indexed 3) is `category`.
      expect(lines(csv)[1].split(",")[3]).toBe(expected[i]);
    }
  });

  // An unrecognised category falls through to the raw enum value rather than
  // blanking the cell. A filing with a missing category is worse than one with
  // an unpretty category.
  it("falls back to the raw category when the label map has no entry", async () => {
    db.certificate.findMany.mockResolvedValue([
      cert({ pickup: { category: "some_future_category" } }),
    ]);

    const { csv } = await buildComplianceCsv({ vendorId: VENDOR, origin: ORIGIN });

    expect(lines(csv)[1].split(",")[3]).toBe("some_future_category");
  });

  // The column set is the part of this file the company will eventually replace
  // (the authoritative CPCB return format is still an open question). Pinning
  // the header means that change is deliberate and visible in a diff, rather
  // than something a screen edit can do by accident.
  it("emits the eight columns, in order", async () => {
    db.certificate.findMany.mockResolvedValue([]);

    const { csv } = await buildComplianceCsv({ vendorId: VENDOR, origin: ORIGIN });

    expect(lines(csv)[0]).toBe(
      "certificate_number,pickup_id,certified_on,category,total_weight_kg,co2e_avoided_kg,materials_recovered,verification_link",
    );
  });

  it("builds each cell from the row it was given", async () => {
    db.certificate.findMany.mockResolvedValue([cert()]);

    const { csv, rows } = await buildComplianceCsv({ vendorId: VENDOR, origin: ORIGIN });
    const cells = lines(csv)[1].split(",");

    expect(rows).toBe(1);
    expect(cells[0]).toBe("CERT-2026-PKP-2026-000109-EV");
    expect(cells[1]).toBe("PKP-2026-000109");
    expect(cells[2]).toBe("2026-08-14");
    expect(cells[4]).toBe("148.5");
    expect(cells[5]).toBe("921");
    // formatMaterials collapses the per-metal figures into ONE cell, and the
    // separator is a semicolon precisely so the cell needs no quoting and the
    // column count stays fixed regardless of chemistry. Asserting it unquoted
    // is asserting that: a comma separator here would force Papa to quote, and
    // any consumer splitting on commas would see a different shape per row.
    expect(cells[6]).toBe("Nickel: 5.7 kg; Cobalt: 2.2 kg");
    expect(csv).not.toContain('"Nickel');
    expect(csv).toContain(`${ORIGIN}/t/abc-token`);
  });

  // A null co2 figure becomes an EMPTY cell, never a 0. A certificate minted
  // before impact.ts existed genuinely has no figure, and writing 0 would claim
  // we avoided nothing rather than that we did not measure.
  it("writes an empty cell, not a zero, for a missing CO₂e figure", async () => {
    db.certificate.findMany.mockResolvedValue([cert({ co2AvoidedKg: null })]);

    const { csv } = await buildComplianceCsv({ vendorId: VENDOR, origin: ORIGIN });

    expect(lines(csv)[1].split(",")[5]).toBe("");
  });

  // 🔴 The one difference between the customer's export and the admin's. The
  // customer route passes its own session's id; the admin route passes ''. If
  // the empty string ever started meaning `vendorId: ''` instead of "no
  // filter", the admin export would silently return zero rows — the failure
  // mode this asserts against.
  describe("vendor scoping", () => {
    it("scopes to one vendor when given an id", async () => {
      db.certificate.findMany.mockResolvedValue([]);

      await buildComplianceCsv({ vendorId: VENDOR, origin: ORIGIN });

      expect(db.certificate.findMany.mock.calls[0][0].where).toMatchObject({
        vendorId: VENDOR,
      });
    });

    it("applies no vendor filter at all for the admin export", async () => {
      db.certificate.findMany.mockResolvedValue([]);

      await buildComplianceCsv({ vendorId: "", origin: ORIGIN });

      expect(db.certificate.findMany.mock.calls[0][0].where).not.toHaveProperty("vendorId");
    });
  });

  describe("year filter", () => {
    it("bounds the query to the calendar year", async () => {
      db.certificate.findMany.mockResolvedValue([]);

      const { filename } = await buildComplianceCsv({
        vendorId: VENDOR,
        origin: ORIGIN,
        year: "2026",
      });

      expect(db.certificate.findMany.mock.calls[0][0].where.certifiedAt).toEqual({
        gte: new Date(2026, 0, 1),
        lt: new Date(2027, 0, 1),
      });
      expect(filename).toBe("clbipp-compliance-2026.csv");
    });

    // A bad query string must not turn a download into a 500. Both routes pass
    // `searchParams.get('year')` straight through, so this is the guard.
    it.each([["not-a-year"], ["1066"], ["9999"], [null]])(
      "ignores an unusable year (%s) rather than throwing",
      async (year) => {
        db.certificate.findMany.mockResolvedValue([]);

        const { filename } = await buildComplianceCsv({
          vendorId: VENDOR,
          origin: ORIGIN,
          year: year as string | null,
        });

        expect(db.certificate.findMany.mock.calls[0][0].where).not.toHaveProperty("certifiedAt");
        expect(filename).toBe("clbipp-compliance-all.csv");
      },
    );
  });
});

describe("buildAdminComplianceAggregate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("totals mass and CO₂e and merges the per-metal figures", async () => {
    db.certificate.findMany.mockResolvedValue([
      {
        totalWeightKg: 148.5,
        co2AvoidedKg: 921,
        materialSummary: [{ material: "Nickel", recovered_kg: 5.7 }],
      },
      {
        totalWeightKg: 51.5,
        co2AvoidedKg: 300,
        materialSummary: [
          { material: "Nickel", recovered_kg: 4.3 },
          { material: "Cobalt", recovered_kg: 2.2 },
        ],
      },
    ]);

    const result = await buildAdminComplianceAggregate({ year: "2026" });

    expect(result.period).toBe("2026");
    expect(result.certifiedMassKg).toBe(200);
    expect(result.co2AvoidedKg).toBe(1221);
    // aggregateMaterials sorts by mass descending, so Nickel (5.7 + 4.3) leads.
    expect(result.byMetal).toEqual([
      { material: "Nickel", totalRecoveredKg: 10 },
      { material: "Cobalt", totalRecoveredKg: 2.2 },
    ]);
  });

  // 🔴 Open question 17. Certified mass is reported; an EPR-credit number is
  // NOT derived, because the conversion is a regulatory rule we do not have.
  // Asserting the shape is how that decision survives a future edit.
  it("reports certified mass and no EPR-credit figure", async () => {
    db.certificate.findMany.mockResolvedValue([]);

    const result = await buildAdminComplianceAggregate({ year: null });

    expect(result).toEqual({
      period: "all",
      certifiedMassKg: 0,
      co2AvoidedKg: 0,
      byMetal: [],
    });
    expect(result).not.toHaveProperty("eprCredits");
  });
});
