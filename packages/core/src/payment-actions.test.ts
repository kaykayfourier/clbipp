import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked before the module under test is imported, the same way market.test.ts
// does it. `payment-actions` imports the real prisma client at module scope for
// settlePayment's sake; raisePayment never touches it (it takes a transaction
// client as an argument), but the import still runs, and a unit test should not
// be instantiating a database client to find that out.
vi.mock("@clbipp/database", () => ({ prisma: {} }));

import { raisePayment } from "./payment-actions";

// A stand-in for Prisma.TransactionClient, narrowed to the one model
// raisePayment touches. Hand-rolled rather than mocked off the real client so
// the call counts below are the assertion — "did it write twice" is the whole
// idempotency question, and a spy answers it directly.
function fakeTx(existing: unknown | null) {
  const findUnique = vi.fn().mockResolvedValue(existing);
  const create = vi.fn().mockResolvedValue({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = { payment: { findUnique, create } } as any;
  return { tx, findUnique, create };
}

const INPUT = {
  pickupId: "PKP-2026-000104",
  vendorId: "11111111-1111-1111-1111-111111111111",
  amountPaise: 1_845_000,
};

describe("raisePayment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates one pending payment for the amount it was given", async () => {
    const { tx, create } = fakeTx(null);

    const result = await raisePayment(tx, INPUT);

    expect(result).toEqual({ created: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual({
      data: {
        pickupId: INPUT.pickupId,
        vendorId: INPUT.vendorId,
        amountPaise: 1_845_000,
        status: "pending",
      },
    });
  });

  it("leaves paidAt, gatewayRef and method unset", async () => {
    // Nothing has been chosen or paid at the moment a payable is raised. A
    // gatewayRef here would look like money that moved; a `method` would look
    // like the vendor picked one. Both are settlePayment's to write.
    const { tx, create } = fakeTx(null);
    await raisePayment(tx, INPUT);

    const data = create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("paidAt");
    expect(data).not.toHaveProperty("gatewayRef");
    expect(data).not.toHaveProperty("method");
  });

  it("is idempotent — a second call writes nothing", async () => {
    // The failure this prevents: confirmCollection re-submitted from a slow
    // network retry raising a second payable, and the vendor being paid twice.
    const { tx, create } = fakeTx({ id: "p1", status: "pending" });

    const result = await raisePayment(tx, INPUT);

    expect(result).toEqual({ created: false });
    expect(create).not.toHaveBeenCalled();
  });

  it("never resets an already-settled payment back to pending", async () => {
    // Worse than a duplicate: it would make paid money look unpaid, and the
    // vendor could settle the same payout a second time.
    const { tx, create } = fakeTx({ id: "p1", status: "paid" });

    const result = await raisePayment(tx, INPUT);

    expect(result).toEqual({ created: false });
    expect(create).not.toHaveBeenCalled();
  });

  it("looks the payment up by pickupId, the column that is unique", async () => {
    // Payment.pickupId is @unique in the schema. Guarding on anything else
    // would let two rows exist for one pickup until the database refused.
    const { tx, findUnique } = fakeTx(null);
    await raisePayment(tx, INPUT);

    expect(findUnique).toHaveBeenCalledWith({ where: { pickupId: INPUT.pickupId } });
  });

  it("allows a zero payable", async () => {
    // A load where every item is rejected owes the vendor nothing. That is an
    // outcome, not a bug, and it still deserves a row so the screen can say so.
    const { tx, create } = fakeTx(null);

    await expect(raisePayment(tx, { ...INPUT, amountPaise: 0 })).resolves.toEqual({
      created: true,
    });
    expect(create.mock.calls[0][0].data.amountPaise).toBe(0);
  });

  it("refuses a negative amount, and writes nothing", async () => {
    const { tx, create } = fakeTx(null);

    await expect(raisePayment(tx, { ...INPUT, amountPaise: -1 })).rejects.toThrow(
      /non-negative integer/,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a float — that is rupees leaking in where paise belong", async () => {
    const { tx, create } = fakeTx(null);

    await expect(raisePayment(tx, { ...INPUT, amountPaise: 1845.5 })).rejects.toThrow(
      /non-negative integer/,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses NaN", async () => {
    // Number(formData.get(...)) on a missing field is NaN, and NaN < 0 is
    // false — so a bare range check would have let this through.
    const { tx, create } = fakeTx(null);

    await expect(raisePayment(tx, { ...INPUT, amountPaise: NaN })).rejects.toThrow(
      /non-negative integer/,
    );
    expect(create).not.toHaveBeenCalled();
  });
});
