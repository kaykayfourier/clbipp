-- ============================================================================
-- agent_app_v1 — the Field Agent app's one consolidated migration.
-- PLAN_FIELD_AGENT_APP.md §3. Additive only: every new column is nullable or
-- defaulted, so no existing row is rewritten and nothing needs a backfill.
--
--   pickups          + agent_fee_paise (D3), + custody_batch_id (D5)
--   offers           + accepted_at (D7 — the cross-app seam)
--   battery_items    + the agent's damage rubric, pathway + trace_id (D1)
--   pathway_decisions+ trace_id, so battery_items.trace_id joins to something
--   WalletTxnKind    + agent_fee (D3)
--   custody_batches  NEW — agent → facility hand-off (NOT DispatchManifest,
--                    which is facility → recycler)
--
-- NO PickupStatus value is added. The nine stages stay locked (D5).
--
-- ⚠ RLS for custody_batches is NOT here — it lives in supabase/policies.sql
-- with every other policy, per the repo's Prisma-owns-structure/SQL-owns-RLS
-- split. Apply that file straight after this migration; a new table has RLS
-- OFF by default, which leaves it readable by any authenticated session.
-- ============================================================================

-- AlterEnum
ALTER TYPE "WalletTxnKind" ADD VALUE 'agent_fee';

-- AlterTable
ALTER TABLE "battery_items" ADD COLUMN     "damage_leakage" INTEGER,
ADD COLUMN     "damage_score" DECIMAL(4,2),
ADD COLUMN     "damage_thermal" INTEGER,
ADD COLUMN     "damage_visual" INTEGER,
ADD COLUMN     "pathway" "RecoveryPathway",
ADD COLUMN     "trace_id" TEXT;

-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "accepted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pathway_decisions" ADD COLUMN     "trace_id" TEXT;

-- AlterTable
ALTER TABLE "pickups" ADD COLUMN     "agent_fee_paise" INTEGER,
ADD COLUMN     "custody_batch_id" TEXT;

-- CreateTable
CREATE TABLE "custody_batches" (
    "id" TEXT NOT NULL,
    "agent_id" UUID NOT NULL,
    "facility_id" TEXT NOT NULL,
    "batch_no" TEXT NOT NULL,
    "total_weight_kg" DECIMAL(10,2) NOT NULL,
    "item_count" INTEGER NOT NULL,
    "receiving_staff_name" TEXT NOT NULL,
    "signature_url" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "pdf_url" TEXT,
    "handed_off_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custody_batches_batch_no_key" ON "custody_batches"("batch_no");

-- CreateIndex
CREATE INDEX "custody_batches_agent_id_handed_off_at_idx" ON "custody_batches"("agent_id", "handed_off_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "pathway_decisions_trace_id_key" ON "pathway_decisions"("trace_id");

-- CreateIndex
CREATE INDEX "pickups_custody_batch_id_idx" ON "pickups"("custody_batch_id");

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_custody_batch_id_fkey" FOREIGN KEY ("custody_batch_id") REFERENCES "custody_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_batches" ADD CONSTRAINT "custody_batches_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_batches" ADD CONSTRAINT "custody_batches_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

