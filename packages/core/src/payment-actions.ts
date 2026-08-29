// ─── Payment write path ──────────────────────────────────────────────────────
// Settling a payout touches four things that must agree: the Payment row, the
// WalletTxn ledger, the cached balance on Profile, and the Invoice. This is the
// only place that writes any of them.
//
// Same contract as ./booking-actions: `vendorId` is an INPUT, not something
// resolved from a session, so core never depends on @clbipp/auth and stays
// callable from a seed or a test. The app wraps this in a "use server" action
// that resolves the logged-in user first.

import { prisma } from "@clbipp/database";
import type { PaymentMethod, Prisma } from "@clbipp/database";
import { invoiceNumber } from "./documents";
import { nextBalance, paymentsMode, simulatedGatewayRef } from "./payments";

export type SettlePaymentInput = {
  pickupId: string;
  vendorId: string;
  method: PaymentMethod;
};

export type SettlePaymentResult =
  | { ok: true; alreadySettled: boolean }
  | { ok: false; error: string };

/**
 * Settles a pending payout.
 *
 * Guarantees, in order of how badly each would hurt if broken:
 *
 * 1. **Idempotent.** Called twice — a double-tap, a retried form post, a
 *    replayed request — the second call is a no-op that still returns ok. The
 *    failure this prevents is a duplicate `WalletTxn`, which would credit the
 *    customer twice and put the ledger permanently out of step with reality.
 * 2. **Atomic.** The Payment update, the ledger row, the balance cache and the
 *    Invoice are one transaction. A crash between the ledger write and the
 *    cache update would leave a balance nobody can explain.
 * 3. **Ownership-scoped.** Every read is filtered by `vendorId`, so a guessed
 *    pickup id settles nothing rather than settling someone else's payout.
 */
export async function settlePayment(
  input: SettlePaymentInput,
): Promise<SettlePaymentResult> {
  const { pickupId, vendorId, method } = input;

  if (paymentsMode() === "razorpay") {
    // The switch exists so swapping in a real gateway is one function, per
    // Plan v2 D3 — but nothing is wired to Razorpay yet, and pretending to
    // settle against a gateway that isn't there would mark money as paid that
    // never moved. Fail loudly instead.
    return {
      ok: false,
      error:
        "The live payment gateway is not configured yet. Set PAYMENTS_MODE=simulated.",
    };
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Re-read INSIDE the transaction. The status the screen rendered may be
        // minutes old; this is the read the decision is actually made on.
        const payment = await tx.payment.findFirst({
          where: { pickupId, vendorId },
        });

        if (!payment)
          return {
            ok: false as const,
            error: "No payment found for this pickup.",
          };

        if (payment.status === "paid") {
          // Guarantee 1. Not an error — the caller asked for a settled payment
          // and there is one.
          return { ok: true as const, alreadySettled: true };
        }

        if (payment.status === "processing") {
          return {
            ok: false as const,
            error: "This payout is already being processed. Give it a moment.",
          };
        }

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            method,
            status: "paid",
            paidAt: new Date(),
            gatewayRef: simulatedGatewayRef(),
            failureNote: null,
          },
        });

        await creditWallet(tx, {
          profileId: vendorId,
          pickupId,
          amountPaise: payment.amountPaise,
        });

        await ensureInvoice(tx, {
          pickupId,
          vendorId,
          subtotalPaise: payment.amountPaise,
        });

        return { ok: true as const, alreadySettled: false };
      },
      {
        // Prisma's default interactive-transaction timeout is 5s, and this
        // transaction does eight sequential round trips. Against a REMOTE
        // Supabase Postgres that measured 5.3s and the whole settlement rolled
        // back — found by the Batch 8 verification script, not in a review.
        //
        // Atomicity did its job (nothing was half-written), but a customer
        // whose payout fails because their connection was slow is a real
        // failure. Raised rather than split into separate transactions,
        // because the ledger row and the balance cache MUST land together —
        // splitting them to fit a timeout would trade a visible error for a
        // silently wrong balance.
        timeout: 20_000,
        maxWait: 10_000,
      },
    );
  } catch (error) {
    console.error("[settlePayment] failed:", error);
    return {
      ok: false,
      error: "Could not complete the payout. Please try again.",
    };
  }
}

/**
 * Appends a `payout` credit and updates the cached balance in the same
 * transaction.
 *
 * The `findFirst` guard makes this idempotent independently of the caller: even
 * if two settlements somehow got through, only one ledger row lands. Belt and
 * braces on the one operation in this batch that creates money.
 */
async function creditWallet(
  tx: Prisma.TransactionClient,
  input: { profileId: string; pickupId: string; amountPaise: number },
): Promise<void> {
  const existing = await tx.walletTxn.findFirst({
    where: { pickupId: input.pickupId, kind: "payout" },
  });
  if (existing) return;

  const profile = await tx.profile.findUniqueOrThrow({
    where: { id: input.profileId },
    select: { walletBalancePaise: true },
  });

  const balance = nextBalance(profile.walletBalancePaise, input.amountPaise);

  await tx.walletTxn.create({
    data: {
      profileId: input.profileId,
      deltaPaise: input.amountPaise,
      kind: "payout",
      balanceAfterPaise: balance,
      pickupId: input.pickupId,
      note: `Payout for ${input.pickupId}`,
    },
  });

  await tx.profile.update({
    where: { id: input.profileId },
    data: { walletBalancePaise: balance },
  });
}

/**
 * Creates the invoice for a settled pickup if it doesn't exist.
 *
 * Tax is 0 — see the note in packages/pdf/src/templates/invoice.tsx. Whether
 * GST applies to scrap bought from an unregistered individual is a question for
 * the company; a made-up rate on a tax document would be worse than a zero.
 */
async function ensureInvoice(
  tx: Prisma.TransactionClient,
  input: { pickupId: string; vendorId: string; subtotalPaise: number },
): Promise<void> {
  const existing = await tx.invoice.findUnique({
    where: { pickupId: input.pickupId },
  });
  if (existing) return;

  const issuedAt = new Date();

  await tx.invoice.create({
    data: {
      vendorId: input.vendorId,
      pickupId: input.pickupId,
      number: invoiceNumber({ pickupId: input.pickupId, issuedAt }),
      subtotalPaise: input.subtotalPaise,
      taxPaise: 0,
      totalPaise: input.subtotalPaise,
      issuedAt,
    },
  });
}

/**
 * Creates a pending Payment row for the vendor at collection time.
 *
 * Called INSIDE confirmCollection's $transaction — takes a tx client so it
 * composes atomically with the status flip, receipt, and wallet credit.
 * Idempotent: a pickup has at most one Payment row (pickupId is @unique on
 * Payment). A second call is a silent no-op, not an error.
 */
export async function raisePayment(
  tx: Prisma.TransactionClient,
  input: { pickupId: string; vendorId: string; amountPaise: number },
): Promise<void> {
  const existing = await tx.payment.findUnique({
    where: { pickupId: input.pickupId },
  })
  if (existing) return

  await tx.payment.create({
    data: {
      pickupId: input.pickupId,
      vendorId: input.vendorId,
      amountPaise: input.amountPaise,
      status: 'pending',
    },
  })
}