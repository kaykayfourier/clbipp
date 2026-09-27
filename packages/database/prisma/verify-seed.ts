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

  // 3 — three recyclers, non-overlapping chemistries. FV13: the partner table
  // now also holds refurbishers, which are a different journey and are
  // deliberately excluded from the segregation check.
  const partners = await prisma.recycler.findMany({ select: { name: true, acceptedChemistries: true, kind: true } })
  const recyclers = partners.filter((r) => r.kind === "recycler")
  const all = recyclers.flatMap((r) => r.acceptedChemistries)
  check("3 recyclers", recyclers.length === 3)
  check("recycler chemistries do not overlap", new Set(all).size === all.length, all.join(","))
  check("FV13: ≥1 refurbisher for Second Life", partners.some((p) => p.kind === "refurbisher"))

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
    ["pickup.assign","config.publish","market.override","exception.resolve","custody.advance","manifest.dispatch","manifest.confirm","pickup.certify","lifecycle.override","supplier.margin","item.pathway",
     // feedback_logistics (FV10–FV15)
     "tag.issue","container.register","container.status","run.create","run.cancel","custody.reconcile","agent.duty"].includes(a.action)),
    `${audits.length} rows`)

  // 12 — FV2/FV1 evidence rules, made a fixture rather than a hope.
  //
  // 🔴 These two are the seed's half of rules the SCREENS enforce. A screen can
  // demand a photo and a weight method all it likes; if the demo data disagrees
  // the first thing anyone sees is a contradiction. `smoke` proves a route
  // renders and `test` proves pure logic — neither notices this.
  const confirmed = await prisma.batteryItem.findMany({
    where: { recordedAt: { not: null } },
    select: { id: true, weightMethod: true, confirmedWeightKg: true },
  })
  check(
    "FV2: every agent-confirmed item records HOW it was weighed",
    confirmed.length > 0 && confirmed.every((i) => i.weightMethod !== null),
    `${confirmed.filter((i) => i.weightMethod === null).length} of ${confirmed.length} missing a method`,
  )
  check(
    "FV2: more than one weight method in the seed (a one-value column reads as broken)",
    new Set(confirmed.map((i) => i.weightMethod)).size > 1,
    [...new Set(confirmed.map((i) => i.weightMethod))].join(", "),
  )

  const noPhoto = await prisma.batteryItem.count({ where: { photoUrls: { isEmpty: true } } })
  check(
    "FV1: every seeded battery line carries a customer photo",
    noPhoto === 0,
    `${noPhoto} lines with no photo`,
  )

  // 13 — feedback_logistics (FV10–FV15, 2026-09-27). Each of these is a
  // fixture a screen or a rule depends on; a reseed that loses one lets a
  // regression through with every other check green.

  // FV10 · FD12/FD13 — every collected line carries a tag OR a recorded reason.
  const collectedLines = await prisma.batteryItem.findMany({
    where: { pickup: { status: { in: ["collected", "tested", "processed", "recovered", "certified"] } } },
    select: { id: true, untaggedReason: true, tag: { select: { code: true } } },
  })
  check(
    "FV10: every collected line is tagged or says why not",
    collectedLines.length > 0 && collectedLines.every((l) => l.tag || l.untaggedReason),
    `${collectedLines.filter((l) => !l.tag && !l.untaggedReason).length} of ${collectedLines.length} unaccounted`,
  )
  check(
    "FV10: one line left untagged with a reason (the hub's tag-at-receipt path)",
    collectedLines.some((l) => !l.tag && (l.untaggedReason ?? "").length > 0),
  )
  const unusedTags = await prisma.itemTag.count({ where: { batteryItemId: null } })
  check("FV10: ≥20 unused tags in circulation (the demo scans some)", unusedTags >= 20, `${unusedTags} unused`)

  // FV12 · FD15 — nothing past `collected` without every line checked in.
  const pastHub = await prisma.batteryItem.findMany({
    where: { pickup: { status: { in: ["tested", "processed", "recovered", "certified"] } } },
    select: { custodyCheck: { select: { outcome: true } } },
  })
  check(
    "FV12: every line past `tested` was checked in at the hub as received",
    pastHub.length > 0 && pastHub.every((l) => l.custodyCheck?.outcome === "received"),
    `${pastHub.filter((l) => l.custodyCheck?.outcome !== "received").length} of ${pastHub.length} not`,
  )

  // FV11 · FD14/FD16 — an open run with a box, and no box on two open runs.
  const openRuns = await prisma.collectionRun.findMany({
    where: { status: { in: ["planned", "in_progress"] } },
    select: { runNo: true, containers: { where: { unloadedAt: null }, select: { containerId: true } }, _count: { select: { pickups: true } } },
  })
  check(
    "FV11: an open run with a box loaded and ≥2 stops",
    openRuns.some((r) => r.containers.length > 0 && r._count.pickups >= 2),
    openRuns.map((r) => `${r.runNo}:${r._count.pickups} stops/${r.containers.length} box`).join(" "),
  )
  const loadedBoxes = openRuns.flatMap((r) => r.containers.map((c) => c.containerId))
  check("FV11: no box is loaded on two open runs", new Set(loadedBoxes).size === loadedBoxes.length)
  check("FV11: ≥1 box free for a new run", (await prisma.transportContainer.count({ where: { isActive: true } })) > loadedBoxes.length)

  // FV11 — fixture 9: the same-day pair dispatch must suggest, and the far one it must not.
  const sites = await prisma.pickup.findMany({
    where: { id: { in: ["PKP-2026-000101", "PKP-2026-000115", "PKP-2026-000111"] } },
    select: { id: true, preferredDate: true, address: { select: { lat: true, lng: true } } },
  })
  const at = (id: string) => sites.find((p) => p.id === id)
  const km = (a?: { lat: unknown; lng: unknown } | null, b?: { lat: unknown; lng: unknown } | null) => {
    if (!a || !b) return Infinity
    const R = 6371, rad = (d: number) => (d * Math.PI) / 180
    const [la1, lo1, la2, lo2] = [Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng)]
    const h = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
  }
  const pairKm = km(at("PKP-2026-000101")?.address, at("PKP-2026-000115")?.address)
  const farKm = km(at("PKP-2026-000101")?.address, at("PKP-2026-000111")?.address)
  check(
    "fixture 9: 101 + 115 share a preferred day and sit within 8 km; 111 is far",
    at("PKP-2026-000101")?.preferredDate?.getTime() === at("PKP-2026-000115")?.preferredDate?.getTime() && pairKm <= 8 && farKm > 8,
    `pair ${pairKm.toFixed(1)} km, far ${farKm.toFixed(1)} km`,
  )

  // FV13 · FD17 — fixture 10: second-life stock, on no manifest.
  const secondLife = await prisma.batteryItem.findMany({
    where: { pathway: { in: ["refurbish", "reuse"] }, pickup: { status: "tested" } },
    select: { id: true },
  })
  const manifested = new Set(
    (await prisma.dispatchManifest.findMany({ select: { itemIds: true } })).flatMap((m) =>
      Array.isArray(m.itemIds) ? (m.itemIds as unknown[]).filter((x): x is string => typeof x === "string") : [],
    ),
  )
  check(
    "fixture 10: ≥1 tested second-life line, on NO manifest",
    secondLife.length > 0 && secondLife.every((i) => !manifested.has(i.id)),
    `${secondLife.length} lines`,
  )

  // FV15 · FD19 — an off-duty agent exists, and the demo agent is on duty.
  const agents = await prisma.profile.findMany({ where: { role: "agent" }, select: { email: true, dutyStatus: true } })
  check(
    "FV15: agent@test on duty, ≥1 other agent off duty",
    agents.some((a) => a.email === "agent@test" && a.dutyStatus === "on_duty") && agents.some((a) => a.dutyStatus === "off_duty"),
    agents.map((a) => `${a.email}=${a.dutyStatus}`).join(" "),
  )

  console.log("")
  console.log(fails.length ? `🔴 ${fails.length} FAILED: ${fails.join("; ")}` : "✅ all fixture checks passed")
  await prisma.$disconnect()
  process.exit(fails.length ? 1 : 0)
}
main()
