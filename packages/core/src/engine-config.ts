// ─── Active engine config: read, validate, publish ───────────────────────────
// Batch 11 (AD8 + AD9). Three jobs, all of which must run SERVER-side:
//
//   1. getActiveConfig()          — what the engine prices with. The quote
//                                   route calls this instead of trusting
//                                   body.config, which was a live security
//                                   defect: an agent's browser could POST
//                                   margin_tiers: { aggressive: 0 } and
//                                   reprice its own quote (W3b/AD9).
//   2. validateEngineConfig()     — the publish gate. The FORM IS NOT THE
//                                   BOUNDARY (same posture as AD7): a `min=0`
//                                   attribute is a hint to a browser, not a
//                                   rule, so every constraint is re-checked
//                                   here before a row is written.
//   3. mintConfigVersion()        — EngineConfig.version is @unique, so a
//                                   guessed string is a 500. Derived from a
//                                   count, never from the client.
//
// This lives in packages/core rather than apps/admin/src/lib because the
// *agent* app's quote route is getActiveConfig()'s most important caller —
// apps/admin is not importable from apps/agent (AD12).

import { prisma, Prisma } from "@clbipp/database"
import type { Chemistry, Config, Metal } from "@clbipp/decision-engine"

/**
 * Either the singleton or a transaction client. Same shape lifecycle-units.ts
 * uses — a caller already inside `$transaction` MUST pass its own `tx`, or the
 * read runs on a different connection and cannot see the transaction's own
 * uncommitted writes (trap 31).
 */
type Db = Prisma.TransactionClient | typeof prisma

// ─── 1. Reading the active config ────────────────────────────────────────────

/**
 * The per-supplier margin lever (Batch 11 step 3).
 *
 * 🔴 This is the half of Batch 11 that MOVES PRICES. `Profile.marginTier` is
 * written by /suppliers (Batch 9) and read by the engine through
 * `Config.supplier_margin_overrides` in `layers/selection.ts` —
 * `computePricingBand` uses it for `p_recommended`. Until this function
 * existed, nothing built the map between the two, so setting a vendor's tier
 * in the admin console changed their price by exactly zero: a screen that
 * looked like it worked and didn't.
 *
 * Only vendors with a tier explicitly set appear. A vendor with a null tier is
 * absent from the map, and `computePricingBand` falls back to `standard` — the
 * same behaviour as before this function existed, which is what keeps a fresh
 * seed price-neutral.
 */
export async function buildSupplierMarginOverrides(
  db: Db = prisma
): Promise<Record<string, keyof Config["margin_tiers"]>> {
  const overridden = await db.profile.findMany({
    where: { marginTier: { not: null }, role: "customer" },
    select: { id: true, marginTier: true },
  })

  const map: Record<string, keyof Config["margin_tiers"]> = {}
  for (const row of overridden) {
    if (row.marginTier) map[row.id] = row.marginTier
  }
  return map
}

/**
 * The config the engine prices with, right now.
 *
 * CONTRACT WITH BATCH 1 (as-built note 3): return the config JSON with
 * `config_version` overridden by the ROW's version string. There are two
 * version strings and they disagree on a fresh seed, deliberately —
 * `EngineConfig.version` is `v2026-08-26-r1` (the row's publish identity) and
 * `config.config_version` inside the JSON is `v0.1.0-placeholder` (the
 * engine's build stamp). A quote's audit trail must name the PUBLISHED config.
 * 🔴 Do not "fix" the disagreement by editing defaults.ts — that rewrites every
 * existing quote's audit trail.
 *
 * ⚠ DELIBERATE DEVIATION FROM THE TASK SHEET. docs/ADMIN_TASKS.md step 1 says
 * "no active row: fall back to DEFAULT_CONFIG and log loudly". This throws
 * instead, and the reasoning is worth keeping: a fallback here is invisible at
 * exactly the moment it matters. The agent is standing in front of a vendor,
 * the quote comes back, and nobody can tell from the number that it was priced
 * off the engine's placeholder defaults rather than the published commercial
 * config. A 503 the agent can retry is recoverable; a wrong price they have
 * already read aloud is not. The seed always writes an active row, so this
 * throws only when the database is genuinely unseeded.
 */
export async function getActiveConfig(): Promise<Config> {
  const row = await prisma.engineConfig.findFirst({
    where: { isActive: true },
    orderBy: { publishedAt: "desc" },
  })

  if (!row) {
    throw new Error(
      "No active EngineConfig row. The engine will not price off defaults — " +
        "publish a config from /config, or run npm run reset-demo."
    )
  }

  const config = row.config as unknown as Config

  return {
    ...config,
    config_version: row.version,
    supplier_margin_overrides: await buildSupplierMarginOverrides(),
  }
}

// ─── 2. The validator ────────────────────────────────────────────────────────

export const EDITABLE_CHEMISTRIES = [
  "NMC622",
  "NMC811",
  "LFP",
  "LCO",
  "NCA",
] as const satisfies readonly Chemistry[]

export const METALS = ["Li", "Co", "Ni", "Mn", "Cu", "Al"] as const satisfies readonly Metal[]

export const MARGIN_TIER_KEYS = ["aggressive", "standard", "generous"] as const

/**
 * Tier 3 — the values a screen CANNOT move, because they are literals in the
 * engine's own code rather than `Config` parameters (AD8).
 *
 * Rendered read-only on /config so an admin can see them and knows where they
 * live. 🔴 This object is a MIRROR for display, never the source: the engine
 * reads its own literals. `engine-config.test.ts` pins the two together by
 * exercising the engine, so this drifting silently is not possible.
 */
export const TIER3_REFERENCE = {
  damageWeights: { visual: 0.4, leakage: 0.35, thermal: 0.25 },
  damageBands: { refurbishOrRecycleAbove: 1.5, forceRecycleAbove: 2.5 },
  sohGates: { reuseAbove: 75, refurbishAbove: 50 },
  files: {
    damage: "packages/decision-engine/src/decisionEngine/layers/damage.ts",
    soh: "packages/decision-engine/src/decisionEngine/layers/sohGating.ts",
  },
} as const

const isFraction = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1

const isNonNegative = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0

/**
 * Every rule from docs/ADMIN_TASKS.md Batch 11 step 6, checked against a
 * candidate config. Returns a list of human-readable problems; empty means
 * publishable.
 *
 * Pure — no Prisma, no I/O — so it is unit-testable and can run in the action
 * before anything is written.
 *
 * 🔴 "damage weights sum to 1.00" is deliberately NOT here. It is a tier-3
 * assertion against literals in damage.ts, and there is no submitted input to
 * check it against. It is asserted by exercising the engine in
 * engine-config.test.ts instead, which is the only form of that check that can
 * actually fail if someone edits the engine.
 */
export function validateEngineConfig(config: Config): string[] {
  const errors: string[] = []

  // ── Margin tiers: ordered, and each a fraction ──
  const tiers = config.margin_tiers
  for (const key of MARGIN_TIER_KEYS) {
    if (!isFraction(tiers?.[key])) {
      errors.push(`margin_tiers.${key} must be a number between 0 and 1.`)
    }
  }
  if (
    isFraction(tiers?.aggressive) &&
    isFraction(tiers?.standard) &&
    isFraction(tiers?.generous)
  ) {
    // The band is anchored on this ordering: p_min uses aggressive and p_max
    // uses generous, so inverting them inverts the band and every quote reads
    // backwards without erroring.
    if (!(tiers.aggressive > tiers.standard && tiers.standard > tiers.generous)) {
      errors.push(
        "margin_tiers must be ordered aggressive > standard > generous — " +
          `got ${tiers.aggressive} / ${tiers.standard} / ${tiers.generous}.`
      )
    }
  }

  // ── Percentages ──
  for (const key of ["overhead_rate_pct", "refining_rate_pct", "yield_loss_pct"] as const) {
    if (!isFraction(config[key])) {
      errors.push(`${key} must be a number between 0 and 1 (a fraction, not a percent).`)
    }
  }

  // ── Recovery efficiencies ──
  for (const metal of METALS) {
    if (!isFraction(config.recovery_efficiency?.[metal])) {
      errors.push(`recovery_efficiency.${metal} must be between 0 and 1.`)
    }
  }

  // ── Flat rates: non-negative ──
  for (const key of [
    "flat_repackaging_fee",
    "cell_replacement_rate",
    "soh_restoration_delta",
    "logistics_rate_per_km",
    "hurdle_rate",
  ] as const) {
    if (!isNonNegative(config[key])) {
      errors.push(`${key} must be zero or greater.`)
    }
  }

  // ── CostInputs: whichever branch, the number is non-negative ──
  for (const key of ["processing", "qa_reuse", "qa_refurb", "refurb_labor", "hydromet"] as const) {
    const cost = config[key]
    if (!cost || (cost.mode !== "lump_sum" && cost.mode !== "component")) {
      errors.push(`${key}.mode must be either lump_sum or component.`)
      continue
    }
    const value = cost.mode === "lump_sum" ? cost.amount : cost.rate
    if (!isNonNegative(value)) {
      errors.push(`${key} must be zero or greater.`)
    }
  }

  // ── Caps: strictly positive ──
  for (const key of ["cycle_cap", "age_cap"] as const) {
    const value = config[key]
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      errors.push(`${key} must be greater than zero.`)
    }
  }

  // ── Per-chemistry tables ──
  for (const chem of EDITABLE_CHEMISTRIES) {
    for (const key of [
      "second_life_rate_per_kWh",
      "refurb_pack_rate_per_kWh",
      "chemistry_mult",
    ] as const) {
      if (!isNonNegative(config[key]?.[chem])) {
        errors.push(`${key}.${chem} must be zero or greater.`)
      }
    }

    // A composition is kg-of-metal per kg-of-pack. Summing above 1.0 means the
    // pack contains more metal than it weighs, which produces a recycle revenue
    // the physical battery cannot back.
    const composition = config.chemistry_composition?.[chem] ?? {}
    let sum = 0
    for (const metal of METALS) {
      const fraction = composition[metal]
      if (fraction === undefined) continue
      if (!isFraction(fraction)) {
        errors.push(`chemistry_composition.${chem}.${metal} must be between 0 and 1.`)
        continue
      }
      sum += fraction
    }
    // Tolerance for float addition — 0.07 + 0.05 + 0.15 … does not land exactly.
    if (sum > 1 + 1e-9) {
      errors.push(
        `chemistry_composition.${chem} sums to ${sum.toFixed(4)} — it cannot exceed 1.0 kg per kg of pack.`
      )
    }
  }

  return errors
}

// ─── 3. Version minting ──────────────────────────────────────────────────────

/**
 * `v<YYYY-MM-DD>-r<n>`, n incrementing within the day.
 *
 * 🔴 Derived from a COUNT of the day's existing rows, not guessed and not
 * supplied by the client: `EngineConfig.version` is `@unique`, so a collision
 * is a 500 in the middle of a publish.
 *
 * The date is IST-shifted to match the console's timezone (apps/admin's
 * lib/ist.ts owns that decision for screens; this is its one server-side echo,
 * and it is here rather than imported because packages/core cannot reach into
 * an app).
 */
export async function mintConfigVersion(db: Db = prisma, now: Date = new Date()): Promise<string> {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
  const istDay = new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
  const prefix = `v${istDay}-r`

  const sameDay = await db.engineConfig.findMany({
    where: { version: { startsWith: prefix } },
    select: { version: true },
  })

  // Parse the highest existing revision rather than counting rows: a deleted
  // row would otherwise make the next mint collide with a surviving one.
  let highest = 0
  for (const row of sameDay) {
    const n = Number.parseInt(row.version.slice(prefix.length), 10)
    if (Number.isFinite(n) && n > highest) highest = n
  }

  return `${prefix}${highest + 1}`
}
