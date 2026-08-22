import { describe, expect, it } from "vitest";
import { certificateNumber, invoiceNumber, formatPaise } from "./documents";
import { formatOfferPrice } from "./offer";
import { rupeesToPaise } from "./documents"

describe("certificateNumber", () => {
  it("follows the CERT-{YEAR}-{pickupId}-{CATEGORY} format from Plan v2 §5", () => {
    expect(
      certificateNumber({
        pickupId: "PKP-2026-000109",
        category: "portable",
        certifiedAt: new Date("2026-08-09T10:00:00Z"),
      }),
    ).toBe("CERT-2026-PKP-2026-000109-PORTABLE");
  });

  it("takes the year from the certification date, not the pickup id", () => {
    // A load booked in December and certified in January is certified in the
    // later year — the compliance year is when the certificate was issued.
    expect(
      certificateNumber({
        pickupId: "PKP-2026-000109",
        category: "ev",
        certifiedAt: new Date("2027-01-04T10:00:00Z"),
      }),
    ).toBe("CERT-2027-PKP-2026-000109-EV");
  });
});

describe("invoiceNumber", () => {
  it("reuses the pickup's serial", () => {
    expect(
      invoiceNumber({ pickupId: "PKP-2026-000105", issuedAt: new Date("2026-08-09") }),
    ).toBe("INV-2026-000105");
  });

  it("falls back to the whole id when there is no serial to split off", () => {
    expect(invoiceNumber({ pickupId: "LEGACY", issuedAt: new Date("2026-08-09") })).toBe(
      "INV-2026-LEGACY",
    );
  });
});

describe("formatPaise", () => {
  it("renders paise as Indian-grouped rupees", () => {
    // 1,84,500 not 184,500 — the lakh grouping is the whole reason this uses
    // en-IN rather than a plain toLocaleString.
    expect(formatPaise(18450000)).toBe("₹1,84,500");
  });

  it("renders zero rather than an empty string", () => {
    expect(formatPaise(0)).toBe("₹0");
  });

  it("rounds sub-rupee amounts instead of showing paise", () => {
    expect(formatPaise(150)).toBe("₹2");
    expect(formatPaise(149)).toBe("₹1");
  });

  it("keeps a signed amount signed — wallet debits are negative", () => {
    expect(formatPaise(-50000)).toBe("₹-500");
  });

  it("is what formatOfferPrice now delegates to, so offers and payouts agree", () => {
    expect(formatOfferPrice(18450000)).toBe(formatPaise(18450000));
  });
});


describe("rupeesToPaise", () => {
  it("converts whole rupees exactly", () => {
    expect(rupeesToPaise(100)).toBe(10000)
  })

  it("rounds half-up at paise level", () => {
    expect(rupeesToPaise(1.005)).toBe(101) // not 100
  })

  it("never returns a float", () => {
    expect(Number.isInteger(rupeesToPaise(184500.50))).toBe(true)
  })
})