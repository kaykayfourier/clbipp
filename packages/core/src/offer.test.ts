import { describe, expect, it } from "vitest";

import { MAX_PAISE } from "./documents";
import { checkOfficePrice, parsePriceRupees, recommendedOfferTotal, vendorOfferRationale } from "./offer";

describe("parsePriceRupees", () => {
  it("reads rupees with commas and decimals into paise", () => {
    expect(parsePriceRupees("48,000")).toEqual({ paise: 4_800_000, error: null });
    expect(parsePriceRupees("51257.60")).toEqual({ paise: 5_125_760, error: null });
  });

  // The tester's overflow: a huge typed number must come back as a sentence,
  // never reach the database.
  it("refuses blanks, typos and amounts a money column cannot hold", () => {
    expect(parsePriceRupees("").error).toMatch(/rupees/);
    expect(parsePriceRupees("abc").error).toMatch(/rupees/);
    expect(parsePriceRupees("-5").error).toMatch(/rupees/);
    expect(parsePriceRupees("999999999999").error).toMatch(/too large/);
  });
});

describe("checkOfficePrice", () => {
  it("allows anything up to the typo guard", () => {
    expect(checkOfficePrice({ pricePaise: 4_000_000, enginePaise: 5_125_760 })).toBeNull();
    expect(checkOfficePrice({ pricePaise: 51_257_600, enginePaise: 5_125_760 })).toBeNull();
  });
  it("refuses more than 10× the recommendation, and unstorable amounts", () => {
    expect(checkOfficePrice({ pricePaise: 60_000_000, enginePaise: 5_125_760 })).toMatch(/10 times/);
    expect(checkOfficePrice({ pricePaise: MAX_PAISE + 1, enginePaise: 0 })).toMatch(/too large/);
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

describe('recommendedOfferTotal (AF5)', () => {
  const held = { output: { decision: { flags: ['HOLD'] } } }
  const line = (id: string, chemistry: string | null, price: number | null, quoteData: unknown = null) => ({
    id,
    chemistry,
    unitPricePaise: price,
    linePricePaise: price,
    quoteData,
  })

  it('sums the included lines', () => {
    const r = recommendedOfferTotal([line('a', 'li_ion_nmc', 300_000), line('b', 'lead_acid', 50_000)])
    expect(r.totalPaise).toBe(350_000)
    expect(r.canPresent).toBe(true)
  })

  it('leaves out a lithium line on HOLD', () => {
    const r = recommendedOfferTotal([line('a', 'li_ion_nmc', 300_000, held), line('b', 'lead_acid', 50_000)])
    expect(r.totalPaise).toBe(50_000)
    expect(r.held.map((i) => i.id)).toEqual(['a'])
  })

  it('🔴 keeps a non-lithium line even if it carries a stale engine HOLD', () => {
    const r = recommendedOfferTotal([line('b', 'lead_acid', 50_000, held)])
    expect(r.totalPaise).toBe(50_000)
    expect(r.held).toHaveLength(0)
  })

  it('cannot present with an unpriced line, or with everything held', () => {
    expect(recommendedOfferTotal([line('a', 'li_ion_nmc', null)]).canPresent).toBe(false)
    expect(recommendedOfferTotal([line('a', 'li_ion_lfp', 1, held)]).canPresent).toBe(false)
  })
})
