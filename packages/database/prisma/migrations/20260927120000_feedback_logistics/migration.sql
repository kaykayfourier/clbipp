-- ============================================================================
-- feedback_logistics — FV9–FV15 (2026-09-27). Presentation feedback, completed.
--
--   new type   PartnerKind            (recycler | refurbisher)            ← FV13
--   new type   DutyStatus             (on_duty | off_duty)                ← FV15
--   new type   CollectionRunStatus    (planned | in_progress | …)         ← FV11
--   new type   CustodyCheckOutcome    (received | missing)                ← FV12
--   new type   CustodyCheckMethod     (scan | tagged_at_hub | manual)     ← FV12
--   profiles        + duty_status       NOT NULL DEFAULT 'on_duty'        ← FV15
--   pickups         + collection_run_id, run_sequence   (NULL)            ← FV11
--   battery_items   + untagged_reason   (NULL)                            ← FV10
--   certificates    + second_life_kg    (NULL)                            ← FV13
--   recyclers       + kind              NOT NULL DEFAULT 'recycler'       ← FV13
--   dispatch_manifests + outcome_note   (NULL)                            ← FV13
--   new tables transport_containers · collection_runs · run_containers ·
--              item_tags · custody_item_checks                            ← FV10–12
--
-- Decisions FD12–FD19, docs/PLAN_FEEDBACK_V2.md §9 — OURS and provisional.
--
-- 🔴 ADDITIVE ONLY, so the DEPLOYED apps keep working against this database
-- until the code that reads it is pushed. No column is dropped or retyped, no
-- existing enum gains a value (a row carrying a value an old Prisma client does
-- not know throws on read), and the two NOT NULL columns carry a constant
-- DEFAULT — which in Postgres 11+ is a catalogue-only change: no table rewrite,
-- and every existing profile reads `on_duty`, every existing partner
-- `recycler`, which is exactly what they were before this column existed.
--
-- 🔴 NO PickupStatus VALUE IS ADDED. The nine stages stay locked (FD0), for
-- the fifth sprint running. A run, a box, a tag and a hub check are all FACTS
-- about a pickup, not stages of it.
--
-- 🔴 NO PRICE MOVES. Nothing here is an engine input.
--
-- 🔴 GENERATED WITHOUT A DATABASE. `prisma migrate diff --from-schema-datamodel
-- <HEAD's schema> --to-schema-datamodel prisma/schema.prisma --script` — two
-- files in, SQL out. No shadow database, so the 2026-09-10 wipe cannot repeat.
-- Applied with `prisma db execute`, as every migration here has been
-- (`migrate deploy` fails P3005 on this project; there is no _prisma_migrations).
--
-- ⚠ RLS IS ENABLED AT THE END OF THIS FILE, not left for policies.sql alone.
-- supabase/grants.sql grants `anon` SELECT and `authenticated` full DML on
-- every FUTURE table via `alter default privileges`, so between this migration
-- and the next run of policies.sql the five new tables would be readable by
-- anyone with the anon key. Closing them here leaves no window. policies.sql
-- restates the same five lines so a from-scratch rebuild agrees.
--
-- ── WHY EACH PIECE EXISTS ───────────────────────────────────────────────────
--
-- transport_containers / collection_runs / run_containers (FV11 · FD14, FD16)
--   Feedback §4.1 and §4.3: reusable QR-labelled boxes, and nearby same-day
--   pickups grouped into one run for one agent and vehicle. A box is NOT the
--   custody batch (question J3): a custody batch is a hand-off event, a box is
--   an object that does many runs. run_containers is the load history.
--
-- item_tags / battery_items.untagged_reason (FV10 · FD12, FD13)
--   Feedback §4.2: a tag per battery or lot, linked to pickup, item and box.
--   Pre-issued by the office, bound at collection, one per line. A line that
--   left without one says why, and the hub tags it on receipt.
--
-- custody_item_checks (FV12 · FD15)
--   Feedback §6 step 10: "the facility scans and reconciles the received
--   batteries". Gates collected → tested: a pickup advances only when every
--   line has been checked in. One row per line.
--
-- recyclers.kind / dispatch_manifests.outcome_note / certificates.second_life_kg
--   (FV13 · FD17). Feedback §5: route a second-life battery to a second-life
--   facility. Until now it had no destination, and a pickup holding one could
--   never advance past `tested` (AD6 needs every item on a manifest).
--
-- profiles.duty_status (FV15 · FD19)
--   §8 Step 1 of the feedback plan: the one flag that lets dispatch say
--   "off duty". Read only through availabilityOf().
-- ============================================================================

-- CreateEnum
CREATE TYPE "PartnerKind" AS ENUM ('recycler', 'refurbisher');

-- CreateEnum
CREATE TYPE "DutyStatus" AS ENUM ('on_duty', 'off_duty');

-- CreateEnum
CREATE TYPE "CollectionRunStatus" AS ENUM ('planned', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "CustodyCheckOutcome" AS ENUM ('received', 'missing');

-- CreateEnum
CREATE TYPE "CustodyCheckMethod" AS ENUM ('scan', 'tagged_at_hub', 'manual');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "duty_status" "DutyStatus" NOT NULL DEFAULT 'on_duty';

-- AlterTable
ALTER TABLE "pickups" ADD COLUMN     "collection_run_id" TEXT,
ADD COLUMN     "run_sequence" INTEGER;

-- AlterTable
ALTER TABLE "battery_items" ADD COLUMN     "untagged_reason" TEXT;

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "second_life_kg" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "recyclers" ADD COLUMN     "kind" "PartnerKind" NOT NULL DEFAULT 'recycler';

-- AlterTable
ALTER TABLE "dispatch_manifests" ADD COLUMN     "outcome_note" TEXT;

-- CreateTable
CREATE TABLE "transport_containers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "capacity_kg" DECIMAL(8,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_runs" (
    "id" TEXT NOT NULL,
    "run_no" TEXT NOT NULL,
    "agent_id" UUID NOT NULL,
    "run_date" DATE NOT NULL,
    "vehicle" TEXT,
    "status" "CollectionRunStatus" NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_containers" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "loaded_by" UUID NOT NULL,
    "loaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unloaded_at" TIMESTAMP(3),

    CONSTRAINT "run_containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_tags" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "issue_batch" TEXT NOT NULL,
    "issued_by" UUID NOT NULL,
    "battery_item_id" TEXT,
    "container_id" TEXT,
    "bound_by" UUID,
    "bound_at" TIMESTAMP(3),
    "bound_at_hub" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_item_checks" (
    "id" TEXT NOT NULL,
    "custody_batch_id" TEXT NOT NULL,
    "battery_item_id" TEXT NOT NULL,
    "outcome" "CustodyCheckOutcome" NOT NULL,
    "method" "CustodyCheckMethod" NOT NULL,
    "tag_code" TEXT,
    "note" TEXT,
    "checked_by" UUID NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_item_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transport_containers_code_key" ON "transport_containers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "collection_runs_run_no_key" ON "collection_runs"("run_no");

-- CreateIndex
CREATE INDEX "collection_runs_agent_id_run_date_idx" ON "collection_runs"("agent_id", "run_date");

-- CreateIndex
CREATE INDEX "collection_runs_status_idx" ON "collection_runs"("status");

-- CreateIndex
CREATE INDEX "run_containers_container_id_unloaded_at_idx" ON "run_containers"("container_id", "unloaded_at");

-- CreateIndex
CREATE UNIQUE INDEX "run_containers_run_id_container_id_key" ON "run_containers"("run_id", "container_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_tags_code_key" ON "item_tags"("code");

-- CreateIndex
CREATE UNIQUE INDEX "item_tags_battery_item_id_key" ON "item_tags"("battery_item_id");

-- CreateIndex
CREATE INDEX "item_tags_issue_batch_idx" ON "item_tags"("issue_batch");

-- CreateIndex
CREATE INDEX "item_tags_container_id_idx" ON "item_tags"("container_id");

-- CreateIndex
CREATE UNIQUE INDEX "custody_item_checks_battery_item_id_key" ON "custody_item_checks"("battery_item_id");

-- CreateIndex
CREATE INDEX "custody_item_checks_custody_batch_id_idx" ON "custody_item_checks"("custody_batch_id");

-- CreateIndex
CREATE INDEX "pickups_collection_run_id_idx" ON "pickups"("collection_run_id");

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_collection_run_id_fkey" FOREIGN KEY ("collection_run_id") REFERENCES "collection_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_runs" ADD CONSTRAINT "collection_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_containers" ADD CONSTRAINT "run_containers_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "collection_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_containers" ADD CONSTRAINT "run_containers_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "transport_containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_tags" ADD CONSTRAINT "item_tags_battery_item_id_fkey" FOREIGN KEY ("battery_item_id") REFERENCES "battery_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_tags" ADD CONSTRAINT "item_tags_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "transport_containers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_item_checks" ADD CONSTRAINT "custody_item_checks_custody_batch_id_fkey" FOREIGN KEY ("custody_batch_id") REFERENCES "custody_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_item_checks" ADD CONSTRAINT "custody_item_checks_battery_item_id_fkey" FOREIGN KEY ("battery_item_id") REFERENCES "battery_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── RLS: closed, zero policies (AD3). See the header. ──────────────────────
ALTER TABLE "transport_containers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collection_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "run_containers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custody_item_checks" ENABLE ROW LEVEL SECURITY;
