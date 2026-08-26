-- ============================================================================
-- admin_app_v1 — the Admin console's one consolidated migration.
-- PLAN_ADMIN_APP.md §3. Additive only: every new column is nullable or
-- defaulted, so no existing row is rewritten and nothing needs a backfill.
--
--   engine_configs   NEW — the published pricing config, append-only (W7/AD8)
--   admin_audits     NEW — one table for every admin action (W7)
--   item_exceptions  NEW — engine HOLD/REVIEW flags + their resolution (W4/AD4)
--   ExceptionKind · ExceptionResolution · MarginTier   NEW enums
--   profiles       + margin_tier (W11)
--   market_prices  + fx_rate_usd_inr, source, note, created_by (W6)
--   battery_items  + an index on trace_id (/quotes and /trace look items up
--                    by it; NOT unique — a flat-rate item has no trace at all)
--   market_prices  + an index on updated_at DESC (getMarketData's own read)
--
-- 🔴 NO PickupStatus value is added (AD4). NO per-item status column (AD6).
-- The nine stages stay locked, for the third sprint running.
--
-- 🔴 `profiles.epr_reg_no` is NOT added, though PLAN_ADMIN_APP.md §3 and W11
-- both call for it. `profiles.epr_reg_id` already exists and is wired end to
-- end (fleet signup, onboarding, validation.ts, auth.ts's select list,
-- grants.sql's writable-column allowlist, the vendor profile screen). A second
-- column would start null for every real vendor and drift from day one. The
-- admin Suppliers screen reads `epr_reg_id`. Decision logged in
-- docs/ADMIN_TASKS.md, "Batch 1 — as built".
--
-- 🔴 fx_rate_usd_inr DEFAULTS TO 83.2 deliberately — that is the exact constant
-- packages/core/src/market.ts hardcoded before this migration. The engine only
-- echoes the rate into its audit output (metal_price is already ₹/kg), so this
-- moves no price. Any other default would silently change what every quote
-- says it was priced against.
--
-- ⚠ RLS for the three new tables is NOT here — it lives in supabase/policies.sql
-- with every other policy, per the repo's Prisma-owns-structure / SQL-owns-RLS
-- split. Apply that file straight after this migration: a new table has RLS
-- OFF by default, which leaves it readable by any authenticated session, and
-- engine_configs is the business's whole margin structure. Re-apply
-- supabase/grants.sql first (trap 7) — `alter default privileges` in that file
-- covers these three tables automatically, but only if it ran before they were
-- created, so run the file again rather than assuming.
-- ============================================================================

-- CreateEnum
CREATE TYPE "ExceptionKind" AS ENUM ('hold', 'review');

-- CreateEnum
CREATE TYPE "ExceptionResolution" AS ENUM ('retest', 'override', 'reject');

-- CreateEnum
CREATE TYPE "MarginTier" AS ENUM ('aggressive', 'standard', 'generous');

-- AlterTable
ALTER TABLE "market_prices" ADD COLUMN     "created_by" UUID,
ADD COLUMN     "fx_rate_usd_inr" DECIMAL(10,4) NOT NULL DEFAULT 83.2,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "margin_tier" "MarginTier";

-- CreateTable
CREATE TABLE "engine_configs" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "published_by" UUID,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parent_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engine_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audits" (
    "id" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_exceptions" (
    "id" TEXT NOT NULL,
    "battery_item_id" TEXT NOT NULL,
    "kind" "ExceptionKind" NOT NULL,
    "cause" TEXT NOT NULL,
    "detail" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolution" "ExceptionResolution",
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "item_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "engine_configs_version_key" ON "engine_configs"("version");

-- CreateIndex
CREATE INDEX "engine_configs_is_active_idx" ON "engine_configs"("is_active");

-- CreateIndex
CREATE INDEX "engine_configs_published_at_idx" ON "engine_configs"("published_at" DESC);

-- CreateIndex
CREATE INDEX "admin_audits_created_at_idx" ON "admin_audits"("created_at" DESC);

-- CreateIndex
CREATE INDEX "admin_audits_subject_type_subject_id_idx" ON "admin_audits"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "admin_audits_actor_id_idx" ON "admin_audits"("actor_id");

-- CreateIndex
CREATE INDEX "item_exceptions_battery_item_id_idx" ON "item_exceptions"("battery_item_id");

-- CreateIndex
CREATE INDEX "item_exceptions_resolved_at_idx" ON "item_exceptions"("resolved_at");

-- CreateIndex
CREATE INDEX "battery_items_trace_id_idx" ON "battery_items"("trace_id");

-- CreateIndex
CREATE INDEX "market_prices_updated_at_idx" ON "market_prices"("updated_at" DESC);

-- AddForeignKey
ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engine_configs" ADD CONSTRAINT "engine_configs_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audits" ADD CONSTRAINT "admin_audits_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_exceptions" ADD CONSTRAINT "item_exceptions_battery_item_id_fkey" FOREIGN KEY ("battery_item_id") REFERENCES "battery_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_exceptions" ADD CONSTRAINT "item_exceptions_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

