import { describe, expect, it } from "vitest";
import {
  destinationOf,
  isShippableTo,
  partnerKindFor,
  isPathwayValue,
  isShippableToRecycler,
  splitByDestination,
  PATHWAY_OPTIONS,
} from "./pathway";

// FV5 · FD4. The four engine pathways are PRESENTED as two destinations, never
// replaced by them — these tests pin the mapping and, more importantly, the
// routing rule that keeps a reusable battery off a shredder's manifest.

describe("destinationOf", () => {
  it("maps reuse and refurbish to second life", () => {
    expect(destinationOf("reuse")).toBe("second_life");
    expect(destinationOf("refurbish")).toBe("second_life");
  });

  it("maps recycle AND dispose to recycling", () => {
    // `dispose` is the same physical journey with a worse yield — it goes to a
    // registered recycler, not to a destination we don't have.
    expect(destinationOf("recycle")).toBe("recycling");
    expect(destinationOf("dispose")).toBe("recycling");
  });

  it("returns null for an item the engine never ran on", () => {
    // Flat-rate lines have no pathway. Defaulting them to recycling here would
    // have a table claim a decision nobody made.
    expect(destinationOf(null)).toBeNull();
    expect(destinationOf(undefined)).toBeNull();
    expect(destinationOf("")).toBeNull();
  });

  it("every option in PATHWAY_OPTIONS agrees with the mapping", () => {
    for (const o of PATHWAY_OPTIONS) {
      expect(destinationOf(o.value)).toBe(o.destination);
    }
  });
});

describe("isShippableToRecycler", () => {
  it("🔴 holds back a second-life battery", () => {
    // The failure this rule prevents: a reusable pack shredded because a
    // manifest treated every collected item as recycling material.
    expect(isShippableToRecycler("reuse")).toBe(false);
    expect(isShippableToRecycler("refurbish")).toBe(false);
  });

  it("ships recycling and disposal", () => {
    expect(isShippableToRecycler("recycle")).toBe(true);
    expect(isShippableToRecycler("dispose")).toBe(true);
  });

  it("ships an unrouted flat-rate item — those always went to a recycler", () => {
    expect(isShippableToRecycler(null)).toBe(true);
  });
});

describe("splitByDestination", () => {
  it("separates all three groups", () => {
    const items = [
      { id: "a", pathway: "reuse" },
      { id: "b", pathway: "recycle" },
      { id: "c", pathway: null },
      { id: "d", pathway: "refurbish" },
      { id: "e", pathway: "dispose" },
    ];
    const out = splitByDestination(items, (i) => i.pathway);
    expect(out.secondLife.map((i) => i.id)).toEqual(["a", "d"]);
    expect(out.recycling.map((i) => i.id)).toEqual(["b", "e"]);
    expect(out.unrouted.map((i) => i.id)).toEqual(["c"]);
  });

  it("loses nothing", () => {
    const items = [{ p: "reuse" }, { p: "recycle" }, { p: null }];
    const out = splitByDestination(items, (i) => i.p);
    expect(out.secondLife.length + out.recycling.length + out.unrouted.length).toBe(items.length);
  });
});

describe("isPathwayValue", () => {
  it("accepts the four enum values and nothing else", () => {
    expect(isPathwayValue("reuse")).toBe(true);
    expect(isPathwayValue("dispose")).toBe(true);
    expect(isPathwayValue("second_life")).toBe(false);
    expect(isPathwayValue(null)).toBe(false);
  });
});


describe("isShippableTo (FV13 · FD17)", () => {
    it("a recycler takes recycling and unrouted items, never second life", () => {
        expect(isShippableTo("recycler", "recycle")).toBe(true);
        expect(isShippableTo("recycler", "dispose")).toBe(true);
        expect(isShippableTo("recycler", null)).toBe(true);
        expect(isShippableTo("recycler", "reuse")).toBe(false);
        expect(isShippableTo("recycler", "refurbish")).toBe(false);
    });

    it("🔴 a refurbisher takes ONLY second life — an unrouted line is not quietly refurbished", () => {
        expect(isShippableTo("refurbisher", "reuse")).toBe(true);
        expect(isShippableTo("refurbisher", "refurbish")).toBe(true);
        expect(isShippableTo("refurbisher", "recycle")).toBe(false);
        expect(isShippableTo("refurbisher", null)).toBe(false);
    });

    it("every item has exactly one kind of partner that can take it", () => {
        for (const p of ["reuse", "refurbish", "recycle", "dispose", null]) {
            const takers = (["recycler", "refurbisher"] as const).filter((k) => isShippableTo(k, p));
            expect(takers, String(p)).toHaveLength(1);
        }
    });

    it("maps a destination to the partner kind that receives it", () => {
        expect(partnerKindFor("second_life")).toBe("refurbisher");
        expect(partnerKindFor("recycling")).toBe("recycler");
        expect(partnerKindFor(null)).toBe("recycler");
    });
});
