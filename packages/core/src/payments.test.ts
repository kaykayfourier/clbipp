import { afterEach, describe, expect, it } from "vitest";
import {
  CUSTOMER_PAYMENT_METHODS,
  isCustomerPaymentMethod,
  nextBalance,
  paymentsMode,
  simulatedGatewayRef,
  PAYMENT_METHOD_LABELS,
} from "./payments";

const original = process.env.PAYMENTS_MODE;
afterEach(() => {
  if (original === undefined) delete process.env.PAYMENTS_MODE;
  else process.env.PAYMENTS_MODE = original;
});

describe("paymentsMode", () => {
  it("defaults to simulated when unset", () => {
    delete process.env.PAYMENTS_MODE;
    expect(paymentsMode()).toBe("simulated");
  });

  it("reads razorpay when explicitly set", () => {
    process.env.PAYMENTS_MODE = "razorpay";
    expect(paymentsMode()).toBe("razorpay");
  });

  it("tolerates surrounding whitespace and case", () => {
    process.env.PAYMENTS_MODE = "  RazorPay ";
    expect(paymentsMode()).toBe("razorpay");
  });

  it("falls back to simulated on an unrecognised value, never to live", () => {
    // The dangerous direction is a typo being read as production. A typo must
    // degrade to the simulation, not to real money.
    process.env.PAYMENTS_MODE = "razorpayy";
    expect(paymentsMode()).toBe("simulated");
  });
});

describe("customer payment methods", () => {
  it("offers upi, bank transfer and wallet", () => {
    expect([...CUSTOMER_PAYMENT_METHODS]).toEqual(["upi", "bank_transfer", "wallet"]);
  });

  it("refuses `cash` — an agent records it, a customer cannot select it", () => {
    // Cash is something that happened on site. If a customer could pick it, they
    // could mark their own payout complete without money moving.
    expect(isCustomerPaymentMethod("cash")).toBe(false);
  });

  it("refuses anything not in the enum", () => {
    expect(isCustomerPaymentMethod("bitcoin")).toBe(false);
    expect(isCustomerPaymentMethod("")).toBe(false);
  });

  it("has a label for every method in the schema enum, including cash", () => {
    // Typed as a Record over PaymentMethod, so this failing means a method was
    // added to the schema without customer-facing wording.
    expect(Object.keys(PAYMENT_METHOD_LABELS).sort()).toEqual([
      "bank_transfer",
      "cash",
      "upi",
      "wallet",
    ]);
  });
});

describe("simulatedGatewayRef", () => {
  it("is prefixed SIM- so it can never be mistaken for a real gateway ref", () => {
    expect(simulatedGatewayRef()).toMatch(/^SIM-/);
  });

  it("does not collide across rapid calls", () => {
    const refs = new Set(Array.from({ length: 200 }, () => simulatedGatewayRef()));
    expect(refs.size).toBe(200);
  });
});

describe("nextBalance", () => {
  it("credits a payout", () => {
    expect(nextBalance(0, 1520400)).toBe(1520400);
    expect(nextBalance(1520400, 500)).toBe(1520900);
  });

  it("debits a redemption", () => {
    expect(nextBalance(1520400, -520400)).toBe(1000000);
  });

  it("allows a debit down to exactly zero", () => {
    expect(nextBalance(500, -500)).toBe(0);
  });

  it("throws rather than clamping when a debit would go negative", () => {
    // Clamping to 0 would silently destroy the evidence that the ledger and the
    // cached balance had already diverged.
    expect(() => nextBalance(400, -500)).toThrow(/negative/i);
  });
});
