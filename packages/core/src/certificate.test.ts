import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked before the module under test is imported, the same way
// payment-actions.test.ts and market.test.ts do it. `certificate.ts` reads the
// database at module scope, and a unit test should not instantiate a client to
// find that out. The fakes below stand in for exactly the three queries it
// makes, so the assertions are about the ARITHMETIC and the SOURCE PRECEDENCE
// — which is where every bug in this file has lived.
//
// ⚠ `vi.hoisted`, not a plain const: `vi.mock` is hoisted above every top-level
// statement in the file, so a factory closing over an ordinary `const db`
// throws "Cannot access 'db' before initialization" at import time.
const db = vi.hoisted(() => ({
  pickup: { findUniqueOrThrow: vi.fn() },
  dispatchManifest: { findMany: vi.fn() },
  batteryItem: { findMany: vi.fn() },
}));
vi.mock("@clbipp/database", () => ({ prisma: db }));

import { buildCertificatePayload } from "./certificate";

const VENDOR = "11111111-1111-1111-1111-111111111111";

/** Two li-ion items, 60 kg and 40 kg, on one pickup. */
function pickup(offerBreakdown: unknown = null) {
  return {
    vendorId: VENDOR,
    items: [
      { id: "i1", confirmedWeightKg: 60, weightKg: 55, chemistry: "li_ion_nmc", category: "ev_pack" },
      { id: "i2", confirmedWeightKg: null, weightKg: 40, chemistry: "li_ion_nmc", category: "ev_pack" },
    ],
    offer: offerBreakdown === null ? null : { materialBreakdown: offerBreakdown },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.dispatchManifest.findMany.mockResolvedValue([]);
  db.batteryItem.findMany.mockResolvedValue([]);
});

describe("buildCertificatePayload — weights", () => {
  it("prefers the agent's confirmed weight over the customer's declaration", async () => {
    db.pickup.findUniqueOrThrow.mockResolvedValue(pickup());
    const out = await buildCertificatePayload("PKP-1");
    // 60 (confirmed, beats the declared 55) + 40 (declared, nothing confirmed).
    expect(out.totalWeightKg).toBe(100);
    expect(out.vendorId).toBe(VENDOR);
  });

  it("reports `none` when there is neither a measurement nor an estimate", async () => {
    db.pickup.findUniqueOrThrow.mockResolvedValue(pickup());
    const out = await buildCertificatePayload("PKP-1");
    expect(out.materialSource).toBe("none");
    expect(out.materialSummary).toEqual([]);
    // CO₂e is still real — it comes from weight and chemistry, not from a
    // recovery report, so it does not depend on a recycler having replied.
    expect(out.co2AvoidedKg).toBeGreaterThan(0);
  });
});

describe("buildCertificatePayload — the estimate fallback", () => {
  // 🔴 THE REGRESSION THIS FILE EXISTS FOR. `Offer.materialBreakdown` writes
  // `weight_kg`; `Certificate.materialSummary` and `aggregateMaterials()` read
  // `recovered_kg`. Feeding the offer blob straight in yields an EMPTY list and
  // nothing throws — which is how this shipped before Admin Batch 7, and would
  // have put a blank materials table on every vendor's EPR certificate.
  it("maps the offer's `weight_kg` key onto `recovered_kg`", async () => {
    db.pickup.findUniqueOrThrow.mockResolvedValue(
      pickup([
        { material: "Nickel", weight_kg: 18 },
        { material: "Cobalt", weight_kg: 7 },
      ]),
    );
    const out = await buildCertificatePayload("PKP-1");
    expect(out.materialSource).toBe("estimated");
    expect(out.materialSummary).toEqual([
      { material: "Nickel", recovered_kg: 18 },
      { material: "Cobalt", recovered_kg: 7 },
    ]);
  });

  it("also accepts an offer already speaking `recovered_kg`", async () => {
    db.pickup.findUniqueOrThrow.mockResolvedValue(pickup([{ material: "Lead", recovered_kg: 4 }]));
    const out = await buildCertificatePayload("PKP-1");
    expect(out.materialSummary).toEqual([{ material: "Lead", recovered_kg: 4 }]);
  });

  it("drops malformed and non-positive lines rather than throwing", async () => {
    db.pickup.findUniqueOrThrow.mockResolvedValue(
      pickup([
        { material: "Nickel", weight_kg: 18 },
        { material: "", weight_kg: 5 },
        { material: "Cobalt", weight_kg: 0 },
        { material: "Copper", weight_kg: -3 },
        null,
        "not an object",
      ]),
    );
    const out = await buildCertificatePayload("PKP-1");
    expect(out.materialSummary).toEqual([{ material: "Nickel", recovered_kg: 18 }]);
  });
});

describe("buildCertificatePayload — measured recovery (AD5/AD6)", () => {
  it("prefers a reconciled manifest's recoveryData over the offer estimate", async () => {
    db.pickup.findUniqueOrThrow.mockResolvedValue(pickup([{ material: "Nickel", weight_kg: 999 }]));
    db.dispatchManifest.findMany.mockResolvedValue([
      { id: "m1", itemIds: ["i1", "i2"], recoveryData: [{ material: "Nickel", recovered_kg: 12 }] },
    ]);
    db.batteryItem.findMany.mockResolvedValue([
      { id: "i1", confirmedWeightKg: 60, weightKg: 55 },
      { id: "i2", confirmedWeightKg: null, weightKg: 40 },
    ]);
    const out = await buildCertificatePayload("PKP-1");
    expect(out.materialSource).toBe("measured");
    // The whole load is this pickup's, so share = 1 and nothing is scaled.
    expect(out.materialSummary).toEqual([{ material: "Nickel", recovered_kg: 12 }]);
  });

  it("pro-rates by mass share when the manifest carries another pickup too", async () => {
    db.pickup.findUniqueOrThrow.mockResolvedValue(pickup());
    db.dispatchManifest.findMany.mockResolvedValue([
      // 100 kg of ours (i1 + i2) alongside 300 kg of someone else's → share 0.25.
      { id: "m1", itemIds: ["i1", "i2", "other"], recoveryData: [{ material: "Nickel", recovered_kg: 40 }] },
    ]);
    db.batteryItem.findMany.mockResolvedValue([
      { id: "i1", confirmedWeightKg: 60, weightKg: 55 },
      { id: "i2", confirmedWeightKg: null, weightKg: 40 },
      { id: "other", confirmedWeightKg: 300, weightKg: 300 },
    ]);
    const out = await buildCertificatePayload("PKP-1");
    expect(out.materialSummary).toEqual([{ material: "Nickel", recovered_kg: 10 }]);
  });

  it("sums across the two manifests a chemistry-split pickup lands on (AD6)", async () => {
    db.pickup.findUniqueOrThrow.mockResolvedValue(pickup());
    db.dispatchManifest.findMany.mockResolvedValue([
      { id: "m1", itemIds: ["i1"], recoveryData: [{ material: "Nickel", recovered_kg: 9 }] },
      { id: "m2", itemIds: ["i2"], recoveryData: [{ material: "Nickel", recovered_kg: 6 }, { material: "Lead", recovered_kg: 2 }] },
    ]);
    db.batteryItem.findMany.mockResolvedValue([
      { id: "i1", confirmedWeightKg: 60, weightKg: 55 },
      { id: "i2", confirmedWeightKg: null, weightKg: 40 },
    ]);
    const out = await buildCertificatePayload("PKP-1");
    expect(out.materialSummary).toEqual([
      { material: "Nickel", recovered_kg: 15 },
      { material: "Lead", recovered_kg: 2 },
    ]);
  });

  it("ignores a reconciled manifest carrying none of this pickup's items", async () => {
    db.pickup.findUniqueOrThrow.mockResolvedValue(pickup([{ material: "Cobalt", weight_kg: 3 }]));
    db.dispatchManifest.findMany.mockResolvedValue([
      { id: "m1", itemIds: ["someone-else"], recoveryData: [{ material: "Nickel", recovered_kg: 99 }] },
    ]);
    const out = await buildCertificatePayload("PKP-1");
    expect(out.materialSource).toBe("estimated");
    expect(out.materialSummary).toEqual([{ material: "Cobalt", recovered_kg: 3 }]);
  });

  it("skips a zero-weight load rather than dividing by it", async () => {
    db.pickup.findUniqueOrThrow.mockResolvedValue(pickup());
    db.dispatchManifest.findMany.mockResolvedValue([
      { id: "m1", itemIds: ["i1"], recoveryData: [{ material: "Nickel", recovered_kg: 5 }] },
    ]);
    // Every item on the manifest weighs nothing — Infinity on a compliance
    // document would be worse than one manifest's contribution going missing.
    db.batteryItem.findMany.mockResolvedValue([{ id: "i1", confirmedWeightKg: 0, weightKg: 0 }]);
    const out = await buildCertificatePayload("PKP-1");
    expect(out.materialSummary).toEqual([]);
    expect(out.materialSource).toBe("none");
  });

  it("falls back to the estimate when the reconciled manifest has no figures", async () => {
    db.pickup.findUniqueOrThrow.mockResolvedValue(pickup([{ material: "Copper", weight_kg: 8 }]));
    // A back-filled seed row predating the recovery_data column.
    db.dispatchManifest.findMany.mockResolvedValue([{ id: "m1", itemIds: ["i1", "i2"], recoveryData: null }]);
    db.batteryItem.findMany.mockResolvedValue([
      { id: "i1", confirmedWeightKg: 60, weightKg: 55 },
      { id: "i2", confirmedWeightKg: null, weightKg: 40 },
    ]);
    const out = await buildCertificatePayload("PKP-1");
    expect(out.materialSource).toBe("estimated");
    expect(out.materialSummary).toEqual([{ material: "Copper", recovered_kg: 8 }]);
  });

  it("only reads manifests at `reconciled` — a received one is not a measurement", async () => {
    db.pickup.findUniqueOrThrow.mockResolvedValue(pickup());
    await buildCertificatePayload("PKP-1");
    expect(db.dispatchManifest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "reconciled" } }),
    );
  });
});
