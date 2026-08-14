// ─── Booking write path ──────────────────────────────────────────────────────
// The single place a Pickup is created. Pinned by the A↔B contract in
// BATCH_0B_SCHEMA.md §7, with one deliberate divergence: `vendorId` is part of
// the input rather than resolved from the session in here. Keeping the session
// out of `packages/core` means core never depends on `@clbipp/auth`, and the
// function stays callable from a seed or a test. The customer app wraps this in
// a "use server" action that resolves the logged-in user first.
//
// Three invariants the booking screens depend on:
//   1. all money is integer paise
//   2. the write is ONE transaction — a Pickup with no BatteryItems breaks
//      every downstream screen
//   3. it writes the initial `requested` StatusEvent — the tracking timeline
//      and Realtime both key off that row existing

import { Prisma, prisma } from "@clbipp/database";
import type { BatteryCategory, BatteryCondition } from "@clbipp/database";
import type { BookingLineItem } from "./booking";

export type CreatePickupInput = {
  vendorId: string;
  category: BatteryCategory; // the header category (step 1)
  addressId: string;
  items: BookingLineItem[];
  preferredDate: string | null; // "YYYY-MM-DD"
  scheduledSlot: string | null; // ISO datetime
  notes: string | null;
  indicativeQuotePaise: number | null;
};

export type CreatePickupResult =
  | { ok: true; pickupId: string }
  | { ok: false; error: string };

// PKP-YYYY-XXXXXX. Random rather than sequential: a count-based id races under
// concurrent bookings, and the id is customer-visible so it shouldn't leak how
// many pickups exist. Collisions are retried against the unique primary key.
function generatePickupId(): string {
  const suffix = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `PKP-${new Date().getFullYear()}-${suffix}`;
}

function formatAddress(a: {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
}): string {
  return [a.line1, a.line2, a.city, `${a.state} ${a.pincode}`]
    .filter(Boolean)
    .join(", ");
}

const MAX_ID_ATTEMPTS = 5;

export async function createPickupWithItems(
  input: CreatePickupInput,
): Promise<CreatePickupResult> {
  if (input.items.length === 0) {
    return { ok: false, error: "Add at least one battery to your pickup." };
  }

  // Scoped by vendorId so a booking can never be attached to someone else's
  // address by passing a guessed id.
  const address = await prisma.address.findFirst({
    where: { id: input.addressId, profileId: input.vendorId },
  });
  if (!address) {
    return { ok: false, error: "Pickup address not found." };
  }

  // `Pickup.photoUrls` is kept in sync with the per-item photos so the older
  // screens that read the header field still show something.
  const photoUrls = [...new Set(input.items.flatMap((item) => item.photoUrls))];
  const conditionFlags = [
    ...new Set(
      input.items
        .map((item) => item.condition)
        .filter((c): c is BatteryCondition => c !== "healthy"),
    ),
  ];

  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const pickupId = generatePickupId();
    try {
      await prisma.$transaction(async (tx) => {
        await tx.pickup.create({
          data: {
            id: pickupId,
            vendorId: input.vendorId,
            category: input.category,
            addressId: address.id,
            location: formatAddress(address),
            preferredDate: input.preferredDate
              ? new Date(input.preferredDate)
              : null,
            scheduledSlot: input.scheduledSlot
              ? new Date(input.scheduledSlot)
              : null,
            indicativeQuotePaise: input.indicativeQuotePaise,
            conditionFlags,
            notes: input.notes,
            photoUrls,
            status: "requested",
          },
        });

        await tx.batteryItem.createMany({
          data: input.items.map((item) => ({
            pickupId,
            category: item.category,
            quantity: item.quantity,
            weightKg: item.weightKg,
            condition: item.condition,
            photoUrls: item.photoUrls,
          })),
        });

        await tx.statusEvent.create({
          data: {
            pickupId,
            status: "requested",
            actorId: input.vendorId,
            actorRole: "customer",
            notes: "Pickup requested by customer",
          },
        });
      });

      return { ok: true, pickupId };
    } catch (error) {
      // P2002 = unique constraint: the random id collided, so try another one.
      // Anything else is a real failure and shouldn't be retried.
      const collided =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";
      if (!collided) {
        console.error("createPickupWithItems failed", error);
        return {
          ok: false,
          error: "Could not create your pickup. Please try again.",
        };
      }
    }
  }

  return { ok: false, error: "Could not create your pickup. Please try again." };
}
