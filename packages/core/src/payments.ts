// ─── Payments — pure half ────────────────────────────────────────────────────
// Mode switching, method validation and ledger arithmetic. No DB, no clock, no
// randomness that isn't injectable — everything here is unit-tested, and the
// write path (./payment-actions) is the only thing that touches Prisma.
//
// Direction, because it is easy to get backwards: WE pay the vendor. A
// `Payment` row is money going OUT of Back2Basics and INTO the vendor's hands,
// and a `WalletTxn` of kind `payout` is the credit side of that.

import type { PaymentMethod } from "@clbipp/database";

/** Plan v2 D3: full data model + simulated gateway, with a real one swappable in later. */
export type PaymentsMode = "simulated" | "razorpay";

/**
 * Reads `PAYMENTS_MODE` (declared in turbo.json globalEnv so turbo doesn't
 * cache across a change of it).
 *
 * Defaults to `simulated` rather than throwing on an unset variable: the demo,
 * every developer machine and CI all run without a gateway, and a missing env
 * var making the app 500 on the payment screen would be a worse failure than a
 * clearly-labelled simulation. An unrecognised value is treated the same way
 * and warned about, because silently interpreting "razorPay" as production
 * would be the dangerous direction.
 */
export function paymentsMode(): PaymentsMode {
  const raw = process.env.PAYMENTS_MODE?.trim().toLowerCase();
  if (raw === "razorpay") return "razorpay";
  if (raw && raw !== "simulated") {
    console.warn(`[payments] unrecognised PAYMENTS_MODE "${raw}" — falling back to simulated.`);
  }
  return "simulated";
}

/**
 * Payout destinations a customer may choose for themselves.
 *
 * `cash` is deliberately excluded: it exists in the enum because a field agent
 * may settle in cash on site, but it is something that HAPPENED, not something
 * a customer can select from a screen. Letting the payment form set it would
 * let anyone mark their own payout complete without money moving.
 */
export const CUSTOMER_PAYMENT_METHODS = ["upi", "bank_transfer", "wallet"] as const;
export type CustomerPaymentMethod = (typeof CUSTOMER_PAYMENT_METHODS)[number];

export function isCustomerPaymentMethod(value: string): value is CustomerPaymentMethod {
  return (CUSTOMER_PAYMENT_METHODS as readonly string[]).includes(value);
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: "UPI",
  bank_transfer: "Bank transfer",
  wallet: "Back2Basics wallet",
  cash: "Cash",
};

export const PAYMENT_METHOD_HINTS: Record<CustomerPaymentMethod, string> = {
  upi: "Straight to your UPI ID, usually within a few minutes",
  bank_transfer: "To your registered bank account, 1–2 working days",
  wallet: "Held in your Back2Basics balance for future use",
};

/**
 * A simulated gateway reference, shaped like a real one so nothing downstream
 * has to special-case the mode. Prefixed `SIM-` so that a reference in the
 * database is never mistaken for a real gateway transaction when the switch
 * eventually flips.
 */
export function simulatedGatewayRef(): string {
  return `SIM-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

/**
 * Next wallet balance after applying a signed delta.
 *
 * `WalletTxn` is the append-only source of truth and
 * `profiles.wallet_balance_paise` is a cache of its sum — this is the one
 * function that computes the cached value, so the two can't drift through two
 * different additions. Throws rather than clamping on a negative result: a
 * balance below zero means the ledger and the cache have already diverged, and
 * quietly writing 0 would destroy the evidence.
 */
export function nextBalance(currentPaise: number, deltaPaise: number): number {
  const next = currentPaise + deltaPaise;
  if (next < 0) {
    throw new Error(
      `Wallet balance would go negative (${currentPaise} + ${deltaPaise}). Refusing to write.`,
    );
  }
  return next;
}
