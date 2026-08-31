/**
 * Demo staging & rescue: inspect where every pickup sits, and put one back.
 *
 * ─── Why this script exists ─────────────────────────────────────────────────
 * Before a live demo there was exactly one lever — `npm run reset-demo` — and
 * it is an all-or-nothing wipe of the SHARED Supabase project that has to be
 * announced first. So "I just demoed dispatching PKP-2026-000101, put it back
 * so I can run it again" cost a full reseed, which also re-dates every other
 * fixture and consumes anything else already demoed.
 *
 * This gives the demo two things it did not have:
 *   · `--list`  — one screen showing where every pickup is and what is blocking
 *                 it, so you can see the board before you present it.
 *   · `--reset` — return ONE pickup to `requested`, clean, without touching
 *                 anything else in the database.
 *
 * 🔴 THIS IS FOR SETUP AND RESCUE, NEVER FOR THE DEMO ITSELF. Every forward
 * transition in this product is owned by a screen — that is the entire point of
 * Admin Batches 3, 6 and 7, and of the lifecycle being closed. Do not stage a
 * pickup forwards from here to skip a step you are about to claim the app does.
 *
 * ⚠ AND THAT IS WHY THERE IS DELIBERATELY NO `--to=<stage>`.
 * Walking a pickup FORWARD would mean minting offers, payments, custody
 * batches, manifests and certificates outside the actions that own them —
 * re-deriving `lifecycle-units.ts`'s AD5/AD6 rules in a second place, which
 * CLAUDE.md explicitly forbids, and which would drift from the screens the
 * moment either changed. The seed already stages one pickup at every one of the
 * nine stages; that is what a forward jump is for. Use it.
 *
 * Run:
 *   npm run demo-stage                          # same as --list
 *   npm run demo-stage -- --list
 *   npm run demo-stage -- --reset PKP-2026-000101
 *   npm run demo-stage -- --reset PKP-2026-000101 --dry-run
 *
 * `--reset` is idempotent: a pickup already at `requested` with nothing hanging
 * off it is reported as already clean rather than rewritten.
 */
import { prisma } from "../src/client"

const LIFECYCLE = [
  "requested",
  "scheduled",
  "arrived",
  "offered",
  "collected",
  "tested",
  "processed",
  "recovered",
  "certified",
] as const

type Args = { list: boolean; reset: string | null; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const resetFlag = argv.find((a) => a === "--reset" || a.startsWith("--reset="));
  let reset: string | null = null;
  if (resetFlag) {
    reset = resetFlag.includes("=")
      ? resetFlag.split("=")[1]
      : (positional[0] ?? null);
  }
  return {
    list: argv.includes("--list") || !resetFlag,
    reset,
    dryRun: argv.includes("--dry-run"),
  };
}

// ─── --list ──────────────────────────────────────────────────────────────────
//
// Deliberately reports the things that decide whether a demo step will WORK,
// not just the status: whether an offer has been accepted (the `offered` stage
// is two states separated only by `Offer.acceptedAt`), whether a `collected`
// pickup has a custody batch yet (D5's "pending drop-off"), and whether the
// items carry `quoteData` (without it the agent's result screen — and so the
// Escalate button — cannot be reached at all).
async function list() {
  const pickups = await prisma.pickup.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      status: true,
      agentId: true,
      custodyBatchId: true,
      scheduledSlot: true,
      offer: { select: { acceptedAt: true } },
      certificate: { select: { id: true } },
      payment: { select: { status: true } },
      items: { select: { id: true, chemistry: true, quoteData: true } },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(
    "\nid                status      agent offer      pay      batch cert items  note",
  );
  console.log("-".repeat(104));

  for (const p of pickups) {
    const offer = p.offer
      ? p.offer.acceptedAt
        ? "accepted"
        : "pending"
      : "—";
    const assessed = p.items.filter((i) => i.quoteData !== null).length;

    const notes: string[] = [];
    if (p.status === "collected" && !p.custodyBatchId)
      notes.push("pending drop-off — agent must hand off at the hub");
    if (p.status === "requested" && p.agentId)
      notes.push("🔴 stale agent (reactivated) — dispatch clears it");
    if (p.status === "offered" && !p.offer?.acceptedAt)
      notes.push("awaiting vendor acceptance");
    if (p.status === "offered" && p.offer?.acceptedAt)
      notes.push("accepted — agent may collect");
    // Only worth saying where the agent still HAS an assessment to do. On a
    // pickup past `offered` the quote already happened (the offer proves it);
    // `quoteData` being empty there is a fact about the seed, not a blocker.
    if (
      assessed === 0 &&
      p.items.length > 0 &&
      (p.status === "scheduled" || p.status === "arrived")
    )
      notes.push("not yet assessed — agent walks the rubric here");

    console.log(
      `${p.id}  ${p.status.padEnd(11)} ${(p.agentId ? "Y" : "-").padEnd(5)} ` +
        `${offer.padEnd(10)} ${(p.payment?.status ?? "—").padEnd(8)} ` +
        `${(p.custodyBatchId ? "Y" : "-").padEnd(5)} ${(p.certificate ? "Y" : "-").padEnd(4)} ` +
        `${String(assessed) + "/" + String(p.items.length)}    ${notes.join(" · ")}`,
    );
  }

  // The agent day view's three tiles, recomputed exactly as that screen does —
  // this is the number that reads as broken when the seed is stale, so it is
  // worth seeing before a demo rather than during one.
  const agent = await prisma.profile.findFirst({
    where: { email: "agent@test" },
    select: { id: true },
  });
  if (agent) {
    const endToday = new Date();
    endToday.setHours(23, 59, 59, 999);
    const assignedToday = await prisma.pickup.count({
      where: { agentId: agent.id, scheduledSlot: { gte: today, lte: endToday } },
    });
    const collectedToday = await prisma.statusEvent.findMany({
      where: { status: "collected", actorId: agent.id, occurredAt: { gte: today } },
      select: { pickup: { select: { agentFeePaise: true } } },
    });
    const earned = collectedToday.reduce(
      (t, c) => t + (c.pickup.agentFeePaise ?? 0),
      0,
    );
    console.log(
      `\nAgent day view today: ${assignedToday} assigned · ${collectedToday.length} collected · ₹${(earned / 100).toFixed(2)} earned`,
    );
    if (assignedToday === 0) {
      console.log(
        "  ⚠ 0 assigned today means the SEED IS STALE, not that anything is broken —\n" +
          "    `scheduledSlot` is set to day(0) at seed time. Re-run `npm run reset-demo`\n" +
          "    (announce first — shared project) and this reads 2 · 1 · ₹2592.00.",
      );
    }
  }

  const openExceptions = await prisma.itemException.count({
    where: { resolvedAt: null },
  });
  console.log(`Open item exceptions: ${openExceptions}\n`);
}

// ─── --reset ─────────────────────────────────────────────────────────────────
//
// Returns one pickup to a clean `requested`. Ordered child-first so foreign
// keys never block, and every deletion is scoped to this pickup alone.
//
// ⚠ What it deliberately does NOT do: touch the CustodyBatch or the
// DispatchManifest the pickup may have been part of. Those are shared with
// OTHER pickups — a manifest carries items from several — so deleting one here
// would silently corrupt a fixture this script was supposed to protect. The
// pickup is detached from its batch; the batch itself is left alone.
async function reset(pickupId: string, dryRun: boolean) {
  const pickup = await prisma.pickup.findUnique({
    where: { id: pickupId },
    select: {
      id: true,
      status: true,
      agentId: true,
      agentFeePaise: true,
      custodyBatchId: true,
      offer: { select: { id: true } },
      payment: { select: { id: true } },
      certificate: { select: { id: true } },
      items: { select: { id: true } },
    },
  });

  if (!pickup) {
    console.error(`No such pickup: ${pickupId}`);
    process.exit(1);
  }

  const itemIds = pickup.items.map((i) => i.id);
  const [events, exceptions] = await Promise.all([
    prisma.statusEvent.count({
      where: { pickupId, status: { not: "requested" } },
    }),
    prisma.itemException.count({ where: { batteryItemId: { in: itemIds } } }),
  ]);

  const alreadyClean =
    pickup.status === "requested" &&
    !pickup.agentId &&
    !pickup.custodyBatchId &&
    !pickup.offer &&
    !pickup.payment &&
    !pickup.certificate &&
    events === 0 &&
    exceptions === 0;

  console.log(`\n${pickupId} — currently \`${pickup.status}\``);
  console.log(`  agent            ${pickup.agentId ? "assigned" : "—"}`);
  console.log(`  agentFeePaise    ${pickup.agentFeePaise ?? "—"}`);
  console.log(`  offer            ${pickup.offer ? "yes" : "—"}`);
  console.log(`  payment          ${pickup.payment ? "yes" : "—"}`);
  console.log(`  certificate      ${pickup.certificate ? "yes" : "—"}`);
  console.log(`  custody batch    ${pickup.custodyBatchId ? "attached" : "—"}`);
  console.log(`  status events    ${events} past \`requested\``);
  console.log(`  item exceptions  ${exceptions} across ${itemIds.length} items`);

  if (alreadyClean) {
    console.log("\n✅ Already clean — nothing to do.\n");
    return;
  }
  if (dryRun) {
    console.log("\n--dry-run: nothing written.\n");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      if (pickup.certificate)
        await tx.certificate.deleteMany({ where: { pickupId } });
      await tx.payment.deleteMany({ where: { pickupId } });
      await tx.invoice.deleteMany({ where: { pickupId } });
      await tx.offer.deleteMany({ where: { pickupId } });
      await tx.itemException.deleteMany({
        where: { batteryItemId: { in: itemIds } },
      });

      // Every status event except the original `requested` one. Keeping that
      // one means the pickup still has a real booking moment on its timeline
      // rather than appearing to have sprung into existence.
      await tx.statusEvent.deleteMany({
        where: { pickupId, status: { not: "requested" } },
      });

      // The agent's half of every item (schema: the customer's declaration and
      // the agent's confirmation are two halves and neither overwrites the
      // other). Reset only the agent's half; the vendor's declaration stands.
      await tx.batteryItem.updateMany({
        where: { pickupId },
        data: {
          chemistry: null,
          confirmedWeightKg: null,
          confirmedCondition: null,
          agentPhotoUrls: [],
          recordedBy: null,
          recordedAt: null,
          damageVisual: null,
          damageLeakage: null,
          damageThermal: null,
          damageScore: null,
          pathway: null,
          unitPricePaise: null,
          linePricePaise: null,
          quoteData: undefined,
          traceId: null,
        },
      });

      await tx.safetyChecklist.deleteMany({ where: { pickupId } });

      await tx.pickup.update({
        where: { id: pickupId },
        data: {
          status: "requested",
          agentId: null,
          agentFeePaise: null,
          custodyBatchId: null,
          etaMinutes: null,
        },
      });
    },
    // Well over a dozen sequential round trips — far past the 8 measured at
    // 5.3s against remote Supabase, so the default 5s would not survive this.
    { timeout: 60_000, maxWait: 10_000 },
  );

  console.log(`\n✅ ${pickupId} reset to \`requested\`, clean.`);
  console.log(
    "   ⚠ `npm run verify-seed` will now fail on any fixture that named this\n" +
      "     pickup — expected. Reseed before reading that as a bug.\n",
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.reset) {
    await reset(args.reset, args.dryRun);
  } else if (!args.reset && process.argv.slice(2).some((a) => a.startsWith("--reset"))) {
    console.error("--reset needs a pickup id, e.g. --reset PKP-2026-000101");
    process.exit(1);
  } else {
    await list();
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
