import { describe, expect, it } from "vitest";
import {
  bookingLineItemSchema,
  bookingSubmissionSchema,
  normaliseIndianPhone,
  signupFleetSchema,
  signupIndividualSchema,
} from "./validation";

// The booking payload is the one thing in this sprint that arrives from the
// browser as free-form JSON, so these tests cover the guard rather than the
// happy path the wizard already enforces in its own UI.

const ADDRESS_ID = "3f1c9d2e-5a4b-4c8d-9e0f-1a2b3c4d5e6f";

function submission(overrides: Record<string, unknown> = {}) {
  return {
    category: "automotive",
    addressId: ADDRESS_ID,
    items: [
      {
        category: "automotive",
        quantity: 14,
        weightKg: 196,
        condition: "healthy",
        photoUrls: [],
      },
    ],
    preferredDate: "2026-08-20",
    notes: null,
    ...overrides,
  };
}

describe("bookingLineItemSchema", () => {
  it("accepts a weighed line", () => {
    const parsed = bookingLineItemSchema.parse({
      category: "portable",
      quantity: 10,
      weightKg: 6,
      condition: "dead",
      photoUrls: [],
    });

    expect(parsed.weightKg).toBe(6);
  });

  it("accepts a null weight — 'I can't weigh these' is a real answer", () => {
    const parsed = bookingLineItemSchema.parse({
      category: "portable",
      quantity: 10,
      weightKg: null,
      condition: "healthy",
    });

    expect(parsed.weightKg).toBeNull();
    expect(parsed.photoUrls).toEqual([]);
  });

  it("rejects a zero or fractional quantity", () => {
    expect(
      bookingLineItemSchema.safeParse({
        category: "portable",
        quantity: 0,
        weightKg: null,
        condition: "healthy",
      }).success,
    ).toBe(false);

    expect(
      bookingLineItemSchema.safeParse({
        category: "portable",
        quantity: 2.5,
        weightKg: null,
        condition: "healthy",
      }).success,
    ).toBe(false);
  });

  it("rejects a zero weight — null means unknown, 0 means nothing to collect", () => {
    expect(
      bookingLineItemSchema.safeParse({
        category: "portable",
        quantity: 1,
        weightKg: 0,
        condition: "healthy",
      }).success,
    ).toBe(false);
  });

  it("accepts a storage object path but rejects traversal", () => {
    expect(
      bookingLineItemSchema.safeParse({
        category: "portable",
        quantity: 1,
        weightKg: null,
        condition: "healthy",
        photoUrls: ["abc-123/bookings/1754-x9/img_0001.jpg"],
      }).success,
    ).toBe(true);

    expect(
      bookingLineItemSchema.safeParse({
        category: "portable",
        quantity: 1,
        weightKg: null,
        condition: "healthy",
        photoUrls: ["abc-123/../other-user/secret.jpg"],
      }).success,
    ).toBe(false);
  });
});

describe("bookingSubmissionSchema", () => {
  it("accepts a well-formed booking", () => {
    const parsed = bookingSubmissionSchema.parse(submission());
    expect(parsed.items).toHaveLength(1);
    expect(parsed.preferredDate).toBe("2026-08-20");
  });

  it("rejects an empty basket", () => {
    expect(bookingSubmissionSchema.safeParse(submission({ items: [] })).success).toBe(false);
  });

  it("rejects a line whose category differs from the pickup category", () => {
    const result = bookingSubmissionSchema.safeParse(
      submission({
        items: [
          {
            category: "ev",
            quantity: 1,
            weightKg: 250,
            condition: "healthy",
            photoUrls: [],
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid address id", () => {
    expect(bookingSubmissionSchema.safeParse(submission({ addressId: "nope" })).success).toBe(
      false,
    );
  });

  it("accepts a null preferred date but not a malformed one", () => {
    expect(bookingSubmissionSchema.safeParse(submission({ preferredDate: null })).success).toBe(
      true,
    );
    expect(
      bookingSubmissionSchema.safeParse(submission({ preferredDate: "20-08-2026" })).success,
    ).toBe(false);
  });

  it("normalises blank notes to undefined rather than storing an empty string", () => {
    const parsed = bookingSubmissionSchema.parse(submission({ notes: "   " }));
    expect(parsed.notes).toBeUndefined();
  });
});

describe("normaliseIndianPhone", () => {
  it("accepts the shapes people actually type", () => {
    for (const input of [
      "9876543210",
      "98765 43210",
      "98765-43210",
      "+91 98765 43210",
      "+919876543210",
      "919876543210",
      "09876543210",
    ]) {
      expect(normaliseIndianPhone(input)).toBe("+919876543210");
    }
  });

  it("rejects numbers that aren't Indian mobiles", () => {
    // Indian mobiles start 6–9; landlines and short codes do not, and this
    // number is what the field agent calls at the door.
    expect(normaliseIndianPhone("1234567890")).toBeNull();
    expect(normaliseIndianPhone("5876543210")).toBeNull();
    expect(normaliseIndianPhone("987654321")).toBeNull();   // 9 digits
    expect(normaliseIndianPhone("98765432101")).toBeNull(); // 11 digits
    expect(normaliseIndianPhone("")).toBeNull();
    expect(normaliseIndianPhone("not a phone")).toBeNull();
  });

  it("does not mistake a 12-digit non-91 number for a prefixed one", () => {
    expect(normaliseIndianPhone("129876543210")).toBeNull();
  });
});

describe("signup schemas", () => {
  const individual = {
    email: "vendor@example.com",
    password: "hunter2",
    fullName: "Vendor One",
  };

  it("accepts an individual signup with no phone at all", () => {
    const result = signupIndividualSchema.safeParse(individual);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBeUndefined();
  });

  it("treats a blank phone field as absent, not invalid", () => {
    // An untouched optional input posts "" through FormData, which must not
    // read as a failed validation.
    const result = signupIndividualSchema.safeParse({ ...individual, phone: "   " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBeUndefined();
  });

  it("normalises a supplied phone rather than storing it as typed", () => {
    const result = signupIndividualSchema.safeParse({ ...individual, phone: "98765 43210" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("+919876543210");
  });

  it("rejects a malformed phone", () => {
    expect(signupIndividualSchema.safeParse({ ...individual, phone: "123" }).success).toBe(false);
  });

  it("rejects a password shorter than Supabase's own minimum", () => {
    expect(signupIndividualSchema.safeParse({ ...individual, password: "abc" }).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(signupIndividualSchema.safeParse({ ...individual, email: "nope" }).success).toBe(false);
  });

  it("requires the business fields on a fleet signup", () => {
    expect(signupFleetSchema.safeParse(individual).success).toBe(false);
  });

  it("accepts a complete fleet signup", () => {
    const result = signupFleetSchema.safeParse({
      ...individual,
      companyName: "Acme Batteries Pvt Ltd",
      eprRegId: "EPR/123",
      gstNumber: "22AAAAA0000A1Z5",
      panNumber: "AAAAA0000A",
      businessAddress: "12 Industrial Area, New Delhi",
    });
    expect(result.success).toBe(true);
  });
});
