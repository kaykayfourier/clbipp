/**
 * Seed fixture verification — Admin Batch 1, 2026-08-26.
 *
 * Run: `npm run verify-seed` (from the repo root), straight after
 * `npm run reset-demo`.
 *
 * WHY THIS EXISTS. `npm run smoke` proves a route renders; `npm run test`
 * proves pure logic. Neither can say "the seeded data still has the shape the
 * next batch is going to be built against" — and the Admin sprint's fixtures
 * are not decoration: fixture 4 is the row that catches the wrong AD6
 * implementation and fixture 8 is the row that catches dispatch ignoring a
 * stale agent. A reseed that silently drops one of them would let a bug through
 * Batch 3 and Batch 7 with every check green.
 *
 * So this asserts the FIXTURES, by number, against the live database. It is
 * read-only. Add a check here whenever a batch adds a fixture some later batch
 * depends on.
 *
 * ⚠ Exits non-zero on any failure, so it can go in a pre-push chain.
 */
import { prisma } from "../src/client"
import { DEFAULT_CONFIG } from "@clbipp/decision-engine"

const ok = (b: boolean) => (b ? "PASS" : "🔴 FAIL")

async function main() {
  const fails: string[] = []
  const check = (label: string, pass: boolean, detail = "") => {
    if (!pass) fails.push(label)
    console.log(`${ok(pass)}  ${label}${detail ? ` — ${detail}` : ""}`)
  }

  // 1 — EngineConfig, byte-identical to DEFAULT_CONFIG
  const cfg = await prisma.engineConfig.findFirstOrThrow({ where: { isActive: true } })
  // NOT a string compare: Postgres `jsonb` does not preserve key order.
  const deepEqual = (a: unknown, b: unknown): boolean => {
    if (a === b) return true
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
    const ka = Object.keys(a as object), kb = Object.keys(b as object)
    if (ka.length !== kb.length) return false
    return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  check(
    "EngineConfig row deep-equals DEFAULT_CONFIG (by value; jsonb reorders keys)",
    deepEqual(cfg.config, JSON.parse(JSON.stringify(DEFAULT_CONFIG))),
    `version=${cfg.version}`,
  )
  check("exactly one active EngineConfig", (await prisma.engineConfig.count({ where: { isActive: true } })) === 1)

  // 2 — /dispatch has >= 3 UNASSIGNED requested pickups
  const unassigned = await prisma.pickup.count({ where: { status: "requested", agentId: null } })
  check("≥3 unassigned `requested` pickups for /dispatch", unassigned >= 3, `${unassigned} rows`)

  // 3 — three recyclers, non-overlapping chemistries
  const recyclers = await prisma.recycler.findMany({ select: { name: true, acceptedChemistries: true } })
  const all = recyclers.flatMap((r) => r.acceptedChemistries)
  check("3 recyclers", recyclers.length === 3)
  check("recycler chemistries do not overlap", new Set(all).size === all.length, all.join(","))

  // 4 — AD6: a pickup whose items go to two different recyclers, on manifests
  //     at DIFFERENT statuses
  const split = await prisma.pickup.findUniqueOrThrow({
    where: { id: "PKP-2026-000113" },
    include: { items: { select: { id: true, chemistry: true, traceId: true } } },
  })
  const manifests = await prisma.dispatchManifest.findMany({ select: { id: true, manifestNo: true, status: true, itemIds: true } })
  const statusesFor = split.items.map((i) => {
    const m = manifests.find((mm) => (mm.itemIds as string[]).includes(i.id))
    return m ? m.status : "none"
  })
  check("fixture 4: PKP-2026-000113 spans two manifest statuses", new Set(statusesFor).size === 2, statusesFor.join(" + "))
  check("fixture 4: one of its items is flat-rate with NO traceId", split.items.some((i) => i.traceId === null), split.items.map((i) => `${i.chemistry}=${i.traceId ?? "null"}`).join(" "))

  // 5 — one dispatched + one draft manifest exist
  const byStatus = Object.fromEntries(
    (["draft", "dispatched", "received", "reconciled"] as const).map((s) => [s, manifests.filter((m) => m.status === s).length]),
  )
  check("≥1 draft and ≥1 dispatched manifest", byStatus.draft >= 1 && byStatus.dispatched >= 1, JSON.stringify(byStatus))

  // 5b — Admin Batch 7. 🔴 EVERY reconciled manifest carries recovery figures,
  //      and nothing before `reconciled` does. `buildCertificatePayload` prefers
  //      this MEASURED figure over the offer's engine estimate, so a reconciled
  //      manifest with a null column silently sends every certificate from that
  //      load back to the estimate — which looks identical on the screen.
  const recon = await prisma.dispatchManifest.findMany({
    select: { manifestNo: true, status: true, recoveryData: true, totalWeightKg: true },
  })
  const reconciledRows = recon.filter((m) => m.status === "reconciled")
  const lines = (raw: unknown) =>
    Array.isArray(raw)
      ? raw.filter((e): e is { material: string; recovered_kg: number } =>
          typeof e === "object" && e !== null &&
          typeof (e as Record<string, unknown>).material === "string" &&
          Number.isFinite(Number((e as Record<string, unknown>).recovered_kg)))
      : []
  check("every reconciled manifest has recovery figures",
    reconciledRows.length > 0 && reconciledRows.every((m) => lines(m.recoveryData).length > 0),
    reconciledRows.map((m) => `${m.manifestNo}=${lines(m.recoveryData).length}`).join(" "))
  check("nothing before reconciled has recovery figures",
    recon.filter((m) => m.status !== "reconciled").every((m) => m.recoveryData === null),
    recon.filter((m) => m.status !== "reconciled" && m.recoveryData !== null).map((m) => m.manifestNo).join(",") || "none")
  // 🔴 Mass conservation, the same rule `reconcileManifest` enforces at the
  // action. A seed that violated it would be a fixture the app would refuse to
  // create.
  check("recovered mass never exceeds shipped mass",
    reconciledRows.every((m) => lines(m.recoveryData).reduce((s, l) => s + Number(l.recovered_kg), 0) <= Number(m.totalWeightKg ?? 0)),
    reconciledRows.map((m) => `${m.manifestNo}: ${lines(m.recoveryData).reduce((s, l) => s + Number(l.recovered_kg), 0).toFixed(1)}/${m.totalWeightKg}kg`).join(" "))

  // 6 — open exceptions, incl. one on an item with no trace
  const open = await prisma.itemException.findMany({ where: { resolvedAt: null }, include: { batteryItem: { select: { traceId: true } } } })
  check("≥2 OPEN ItemExceptions", open.length >= 2, `${open.length} open`)
  check("one open exception is on a NO-TRACE item", open.some((e) => e.batteryItem.traceId === null))
  check("≥1 RESOLVED ItemException", (await prisma.itemException.count({ where: { resolvedAt: { not: null } } })) >= 1)

  // 7 — margin tier on the vendor profile
  const vendor = await prisma.profile.findFirstOrThrow({ where: { email: "business@test" }, select: { marginTier: true, eprRegId: true } })
  check("vendor has a marginTier", vendor.marginTier !== null, String(vendor.marginTier))
  check("vendor's eprRegId is still populated (no eprRegNo added)", !!vendor.eprRegId, vendor.eprRegId ?? "")

  // 8 — the reactivated pickup, carrying a stale agent
  const react = await prisma.pickup.findUniqueOrThrow({
    where: { id: "PKP-2026-000114" },
    include: { statusEvents: { orderBy: { occurredAt: "asc" }, select: { status: true, occurredAt: true, actorRole: true } }, offer: true },
  })
  check("fixture 8: status is `requested`", react.status === "requested")
  check("fixture 8: 🔴 carries a STALE agentId", react.agentId !== null)
  check("fixture 8: 🔴 carries a STALE agentFeePaise", react.agentFeePaise !== null, String(react.agentFeePaise))
  check("fixture 8: offer exists with acceptedAt VOIDED", !!react.offer && react.offer.acceptedAt === null)
  const seq = react.statusEvents.map((e) => e.status)
  check("fixture 8: 🔴 audit log runs backwards (requested AFTER cancelled)", seq.lastIndexOf("requested") > seq.indexOf("cancelled"), seq.join(" → "))

  // 9 — market prices fx column
  const mp = await prisma.marketPrices.findFirstOrThrow({ orderBy: { updatedAt: "desc" } })
  check("MarketPrices.fxRateUsdInr === 83.2 (no price moves)", mp.fxRateUsdInr.toNumber() === 83.2, `${mp.fxRateUsdInr} source=${mp.source}`)

  // 10 — AD4/AD6 negative checks
  check("no new PickupStatus value in use", (await prisma.pickup.groupBy({ by: ["status"] })).every((g) =>
    ["requested","scheduled","arrived","offered","collected","tested","processed","recovered","certified","cancelled"].includes(g.status)))

  // 11 — audit trail is consistent with the seeded world
  const audits = await prisma.adminAudit.findMany({ select: { action: true } })
  check("AdminAudit rows exist and use the closed vocabulary", audits.length > 0 && audits.every((a) =>
    // 🔴 Mirror of ADMIN_AUDIT_ACTIONS in packages/core/src/audit.ts, which is
    // canonical. Restated rather than imported for the same reason the CO₂e
    // factors are: packages/database must not depend on packages/core (core
    // depends on database, and the cycle breaks the generated client).
    // ⚠ Adding a verb there means adding it here, or the first real use of it
    // fails this check after a demo. `custody.advance` (Admin Batch 6) is the
    // first one that happened to.
    ["pickup.assign","config.publish","market.override","exception.resolve","custody.advance","manifest.dispatch","manifest.confirm","pickup.certify","lifecycle.override","supplier.margin"].includes(a.action)),
    `${audits.length} rows`)

  console.log("")
  console.log(fails.length ? `🔴 ${fails.length} FAILED: ${fails.join("; ")}` : "✅ all fixture checks passed")
  await prisma.$disconnect()
  process.exit(fails.length ? 1 : 0)
}
main()
