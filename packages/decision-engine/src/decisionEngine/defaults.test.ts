/**
 * DEFAULT_CONFIG drift guard — Admin Batch 1, 2026-08-26.
 *
 * 🔴 WHY THIS FILE EXISTS. `reset-demo.ts` seeds the active `EngineConfig` row
 * from `DEFAULT_CONFIG` **by importing it**, so "the seeded row equals
 * DEFAULT_CONFIG" is true by construction and there is nothing left to test
 * about that edge. The edge that CAN break is the other one: somebody edits
 * `defaults.ts`, every seeded quote quietly reprices, and nobody notices until
 * a demo. AD8 makes tiers 1 and 2 editable through a screen precisely so that
 * this file never has to change to move a price.
 *
 * So the snapshot below is the whole point. If a change here is DELIBERATE:
 * update the literal, and 🔴 **say in the commit message that it moves a
 * price** (CLAUDE.md's standing rule). If it is not deliberate, this test just
 * saved a demo.
 *
 * The snapshot was generated from `DEFAULT_CONFIG` itself rather than typed by
 * hand — a hand-copied 100-line literal is a second place for a typo to live.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, ENGINE_VERSION } from "./defaults";
import type { Config } from "./types";

/**
 * Frozen as of 2026-08-26 (Admin Batch 1). Byte-for-byte what the seeded
 * `engine_configs` row holds.
 */
const FROZEN: Config =
  {
    "config_version": "v0.1.0-placeholder",
    "processing": {
      "mode": "component",
      "rate": 40
    },
    "qa_reuse": {
      "mode": "component",
      "rate": 50
    },
    "qa_refurb": {
      "mode": "component",
      "rate": 40
    },
    "flat_repackaging_fee": 0,
    "refurb_labor": {
      "mode": "component",
      "rate": 180
    },
    "cell_replacement_rate": 400,
    "soh_restoration_delta": 15,
    "hydromet": {
      "mode": "component",
      "rate": 60
    },
    "refining_rate_pct": 0.05,
    "yield_loss_pct": 0.05,
    "logistics_rate_per_km": 8,
    "overhead_rate_pct": 0.08,
    "cycle_cap": 3000,
    "age_cap": 8,
    "recovery_efficiency": {
      "Li": 0.85,
      "Co": 0.95,
      "Ni": 0.95,
      "Mn": 0.9,
      "Cu": 0.95,
      "Al": 0.92
    },
    "chemistry_composition": {
      "NMC622": {
        "Li": 0.07,
        "Co": 0.05,
        "Ni": 0.15,
        "Mn": 0.05,
        "Cu": 0.12,
        "Al": 0.15
      },
      "NMC811": {
        "Li": 0.07,
        "Co": 0.03,
        "Ni": 0.2,
        "Mn": 0.03,
        "Cu": 0.12,
        "Al": 0.15
      },
      "LFP": {
        "Li": 0.05,
        "Cu": 0.12,
        "Al": 0.15
      },
      "LCO": {
        "Li": 0.07,
        "Co": 0.18,
        "Cu": 0.12,
        "Al": 0.15
      },
      "NCA": {
        "Li": 0.07,
        "Co": 0.04,
        "Ni": 0.18,
        "Cu": 0.12,
        "Al": 0.15
      },
      "unknown": {}
    },
    "second_life_rate_per_kWh": {
      "NMC622": 8500,
      "NMC811": 9200,
      "LFP": 6000,
      "LCO": 7400,
      "NCA": 8800,
      "unknown": 0
    },
    "refurb_pack_rate_per_kWh": {
      "NMC622": 6000,
      "NMC811": 6800,
      "LFP": 4200,
      "LCO": 5400,
      "NCA": 6400,
      "unknown": 0
    },
    "chemistry_mult": {
      "LFP": 1.1,
      "NMC622": 1,
      "NMC811": 1,
      "LCO": 0.95,
      "NCA": 1,
      "unknown": 0
    },
    "margin_tiers": {
      "aggressive": 0.3,
      "standard": 0.2,
      "generous": 0.1
    },
    "hurdle_rate": 500
  };

describe("DEFAULT_CONFIG — drift guard", () => {
  it("has not changed since the seeded EngineConfig was published", () => {
    // `toEqual`, not `toStrictEqual`: `Config` has two OPTIONAL fields
    // (`marketFreshnessMaxHours`, `supplier_margin_overrides`) that
    // DEFAULT_CONFIG leaves undefined, and `toStrictEqual` distinguishes an
    // undefined property from a missing one. JSON.stringify drops both, so the
    // stored row cannot round-trip that distinction anyway — see the next test.
    expect(DEFAULT_CONFIG).toEqual(FROZEN);
  });

  it("survives a JSONB round-trip unchanged", () => {
    // This is the assertion that actually protects the DATABASE copy.
    // `EngineConfig.config` is a Prisma `Json` column: the value is serialised
    // on write and parsed on read. Anything JSON cannot carry — a Date, a
    // Map, NaN, Infinity, an explicit undefined — would be silently dropped or
    // mangled between the seed and `getActiveConfig()`, and the engine would
    // then price against a config nobody ever wrote.
    const roundTripped = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Config;
    expect(roundTripped).toEqual(DEFAULT_CONFIG);
  });

  it("keeps exactly the three margin tiers the MarginTier enum names", () => {
    // 🔴 CONTRACT WITH schema.prisma. `enum MarginTier` and
    // `Profile.marginTier` (W11) exist to persist a per-supplier override into
    // `Config.supplier_margin_overrides`, which selection.ts already honours.
    // This package must not import @clbipp/database — database depends on this
    // one, and the cycle would break the generated client — so the enum's
    // values are restated here and `reset-demo.ts` asserts the real agreement
    // at seed time, where both are genuinely in scope.
    expect(Object.keys(DEFAULT_CONFIG.margin_tiers).sort()).toEqual([
      "aggressive",
      "generous",
      "standard",
    ]);
  });

  it("still declares the engine version the seeded row records", () => {
    expect(ENGINE_VERSION).toBe("0.1.0");
  });

  it("leaves config_version as the ENGINE's stamp, not a publish identity", () => {
    // ⚠ TWO VERSION STRINGS. `EngineConfig.version` is the row's publish
    // identity ("v2026-08-26-r1"); this is the engine's own build stamp, and
    // they deliberately disagree on a fresh seed. Batch 11's getActiveConfig()
    // decides which one the engine's audit output should name — see
    // "Batch 1 — as built" in docs/ADMIN_TASKS.md. Do not reconcile them by
    // editing this value; that would move every quote's audit trail.
    expect(DEFAULT_CONFIG.config_version).toBe("v0.1.0-placeholder");
  });
});
