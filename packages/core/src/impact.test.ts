import { describe, expect, it } from "vitest";
import {
  CO2E_AVOIDED_KG_PER_KG,
  CO2E_AVOIDED_KG_PER_KG_BY_CATEGORY,
  aggregateMaterials,
  co2eAvoidedKg,
  co2eFactorFor,
  formatMaterials,
} from "./impact";

describe("the CO₂e factor tables", () => {
  it("covers every chemistry with a positive factor", () => {
    // Guards the reason these are typed as a Record over the enum: a chemistry
    // added to BatteryType without a factor here would silently certify 0 kg.
    for (const [chemistry, factor] of Object.entries(CO2E_AVOIDED_KG_PER_KG)) {
      expect(factor, chemistry).toBeGreaterThan(0);
    }
    for (const [category, factor] of Object.entries(CO2E_AVOIDED_KG_PER_KG_BY_CATEGORY)) {
      expect(factor, category).toBeGreaterThan(0);
    }
  });

  it("never lets an unconfirmed category out-claim its likely chemistry", () => {
    // The whole point of the fallback table being separate. A guess must not
    // produce a larger claim than the confirmed chemistry it stands in for.
    expect(CO2E_AVOIDED_KG_PER_KG_BY_CATEGORY.portable).toBeLessThan(
      CO2E_AVOIDED_KG_PER_KG.li_ion_nmc,
    );
    expect(CO2E_AVOIDED_KG_PER_KG_BY_CATEGORY.ev).toBeLessThan(CO2E_AVOIDED_KG_PER_KG.li_ion_nmc);
    expect(CO2E_AVOIDED_KG_PER_KG_BY_CATEGORY.automotive).toBeLessThanOrEqual(
      CO2E_AVOIDED_KG_PER_KG.lead_acid,
    );
  });

  it("prices lead-acid well below li-ion — the overclaim this table exists to fix", () => {
    // The seed used to apply the Li-ion 8 kg/kg figure to every chemistry,
    // including the lead-acid pickups, which is roughly a 4× overstatement.
    expect(CO2E_AVOIDED_KG_PER_KG.lead_acid).toBeLessThan(
      CO2E_AVOIDED_KG_PER_KG.li_ion_nmc / 3,
    );
  });
});

describe("co2eFactorFor", () => {
  it("uses the confirmed chemistry when there is one", () => {
    expect(co2eFactorFor({ category: "portable", chemistry: "lead_acid" })).toBe(
      CO2E_AVOIDED_KG_PER_KG.lead_acid,
    );
  });

  it("falls back to the category when chemistry is null (pre-collection)", () => {
    // Chemistry is agent-confirmed, so it is null on everything the customer has
    // only just booked.
    expect(co2eFactorFor({ category: "ev", chemistry: null })).toBe(
      CO2E_AVOIDED_KG_PER_KG_BY_CATEGORY.ev,
    );
    expect(co2eFactorFor({ category: "automotive" })).toBe(
      CO2E_AVOIDED_KG_PER_KG_BY_CATEGORY.automotive,
    );
  });

  it("falls back for an unrecognised chemistry rather than claiming zero", () => {
    expect(co2eFactorFor({ category: "portable", chemistry: "sodium_ion" })).toBe(
      CO2E_AVOIDED_KG_PER_KG_BY_CATEGORY.portable,
    );
  });

  it("floors an unrecognised category at the `other` factor", () => {
    expect(co2eFactorFor({ category: "spacecraft", chemistry: null })).toBe(
      CO2E_AVOIDED_KG_PER_KG.other,
    );
  });
});

describe("co2eAvoidedKg", () => {
  it("sums per line at each line's own factor", () => {
    // 100 kg lead-acid at 2.0 + 10 kg NMC at 8.0 = 200 + 80.
    expect(
      co2eAvoidedKg([
        { weightKg: 100, category: "automotive", chemistry: "lead_acid" },
        { weightKg: 10, category: "portable", chemistry: "li_ion_nmc" },
      ]),
    ).toBe(280);
  });

  it("mixes confirmed and unconfirmed lines in one load", () => {
    // Mid-collection loads really do look like this: the agent has recorded some
    // lines and not others.
    expect(
      co2eAvoidedKg([
        { weightKg: 50, category: "portable", chemistry: "li_ion_lfp" }, // 125
        { weightKg: 50, category: "portable", chemistry: null }, // 200
      ]),
    ).toBe(325);
  });

  it("rounds once at the end, not per line", () => {
    // Three lines each ending in .5 would round up three times if the rounding
    // were per line (12 rather than 11). A certificate must agree with a
    // recomputation of itself.
    const items = Array.from({ length: 3 }, () => ({
      weightKg: 1.4375,
      category: "automotive",
      chemistry: "lead_acid",
    }));
    expect(co2eAvoidedKg(items)).toBe(9);
  });

  it("returns 0 for an empty load", () => {
    expect(co2eAvoidedKg([])).toBe(0);
  });

  it("skips missing, negative and non-numeric weights instead of producing NaN", () => {
    expect(
      co2eAvoidedKg([
        { weightKg: 10, category: "portable", chemistry: "li_ion_nmc" },
        { weightKg: Number.NaN, category: "portable", chemistry: "li_ion_nmc" },
        { weightKg: -100, category: "portable", chemistry: "li_ion_nmc" },
      ]),
    ).toBe(80);
  });
});

describe("aggregateMaterials", () => {
  it("folds several certificates into one list, heaviest first", () => {
    expect(
      aggregateMaterials([
        [
          { material: "Nickel", recovered_kg: 5 },
          { material: "Cobalt", recovered_kg: 2 },
        ],
        [{ material: "Cobalt", recovered_kg: 4 }],
      ]),
    ).toEqual([
      { material: "Cobalt", kg: 6 },
      { material: "Nickel", kg: 5 },
    ]);
  });

  it("keeps one decimal place", () => {
    expect(
      aggregateMaterials([[{ material: "Lithium", recovered_kg: 1.26 }]]),
    ).toEqual([{ material: "Lithium", kg: 1.3 }]);
  });

  it("skips malformed rows rather than crashing the dashboard", () => {
    // materialSummary is an untyped Json column, so a bad row is a data problem,
    // not a reason for the whole screen to 500.
    expect(
      aggregateMaterials([
        null,
        "not an array",
        [
          null,
          { material: "", recovered_kg: 5 },
          { material: "Copper", recovered_kg: "heavy" },
          { material: "Copper", recovered_kg: 3 },
        ],
      ]),
    ).toEqual([{ material: "Copper", kg: 3 }]);
  });

  it("returns an empty list for a vendor with no certificates", () => {
    expect(aggregateMaterials([])).toEqual([]);
  });
});

describe("formatMaterials", () => {
  it("collapses to one CSV cell", () => {
    expect(
      formatMaterials([
        { material: "Nickel", kg: 5.7 },
        { material: "Cobalt", kg: 2.2 },
      ]),
    ).toBe("Nickel: 5.7 kg; Cobalt: 2.2 kg");
  });

  it("is empty rather than undefined when nothing was recovered", () => {
    expect(formatMaterials([])).toBe("");
  });
});
