// ─── Active engine config reader ─────────────────────────────────────────────
// Batch 11 (AD9). The quote route calls this instead of trusting body.config —
// that was a live security defect: an agent's browser could POST any config and
// reprice its own quote.
//
// CONTRACT WITH BATCH 11 (Batch 1 note 3): return the config JSON with
// config_version overridden by the row's own version string, so every quote's
// audit trail names the PUBLISHED config, not the engine's internal placeholder.
//
// 🔴 PRICING-SURFACE CHANGE: this function replaces body.config in the quote
// route. Price-neutral on a fresh seed (the active row is byte-identical to
// DEFAULT_CONFIG and version defaults to 83.2 fx), but say so in the commit.

import { prisma } from "@clbipp/database"
import type { Config } from "@clbipp/decision-engine"

export async function getActiveConfig(): Promise<Config> {
  const row = await prisma.engineConfig.findFirst({
    where: { isActive: true },
    orderBy: { publishedAt: "desc" },
  })

  if (!row) {
    throw new Error("No active EngineConfig found — run npm run reset-demo")
  }

  const config = row.config as unknown as Config

  // Override config_version with the row's own version so the quote's audit
  // trail names the published config, not the engine's internal placeholder.
  // See Batch 1 as-built note 3.
  return {
    ...config,
    config_version: row.version,
  }
}