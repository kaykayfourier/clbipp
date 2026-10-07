import { describe, expect, it } from "vitest";

import { MAX_PAISE } from "./documents";
import { resolveOfferPrice, vendorOfferRationale } from "./offer";

describe("resolveOfferPrice", () => {
  const recommendedPaise = 5_125_760;

  it("offers the recommendation when no price is typed", () => {
    expect(resolveOfferPrice({ recommendedPaise, agreedRupees: "", note: "" })).toEqual({
      value: { offeredPaise: recommendedPaise, recommendedPaise, note: null },
      error: null,
    });
  });

  it("takes the agreed price, with its note, when one is typed", () => {
    const r = resolveOfferPrice({ recommendedPaise, agreedRupees: "48,000", note: "Agreed with Rahul at the office" });
    expect(r.value).toEqual({
      offeredPaise: 4_800_000,
      recommendedPaise,
      note: "Agreed with Rahul at the office",
    });
  });

  it("needs a note only when the price differs from the recommendation", () => {
    expect(resolveOfferPrice({ recommendedPaise, agreedRupees: "48000", note: "ok" }).error).toMatch(/note/);
    expect(resolveOfferPrice({ recommendedPaise, agreedRupees: "51257.60", note: "" }).error).toBeNull();
  });

  // The tester's overflow, on this screen: a huge typed number must come back as
  // a sentence, never reach the database.
  it("refuses typos and amounts a money column cannot hold", () => {
    expect(resolveOfferPrice({ recommendedPaise, agreedRupees: "abc", note: "x".repeat(20) }).error).toMatch(/rupees/);
    expect(resolveOfferPrice({ recommendedPaise, agreedRupees: "-5", note: "x".repeat(20) }).error).toMatch(/rupees/);
    expect(resolveOfferPrice({ recommendedPaise, agreedRupees: "999999999999", note: "x".repeat(20) }).error).toMatch(
      /too large/,
    );
    expect(resolveOfferPrice({ recommendedPaise, agreedRupees: "600000", note: "x".repeat(20) }).error).toMatch(
      /10 times/,
    );
    expect(resolveOfferPrice({ recommendedPaise: MAX_PAISE + 1, agreedRupees: "", note: "" }).error).toMatch(
      /too large/,
    );
  });
});

describe("vendorOfferRationale", () => {
  it("never mentions the engine, a recommendation or an adjustment", () => {
    for (const text of [vendorOfferRationale(3, 3), vendorOfferRationale(2, 3), vendorOfferRationale(1, 4)]) {
      expect(text).not.toMatch(/engine|recommend|adjust|paise|estimate/i);
    }
  });

  it("says which lines are covered when some are held back", () => {
    expect(vendorOfferRationale(1, 1)).toBe("Based on our on-site inspection of 1 battery line.");
    expect(vendorOfferRationale(2, 3)).toMatch(/Covers 2 of your 3 battery lines; the other line needs a closer look/);
    expect(vendorOfferRationale(1, 4)).toMatch(/the other 3 need a closer look and are not included/);
  });
});
