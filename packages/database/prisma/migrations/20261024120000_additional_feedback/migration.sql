-- ============================================================================
-- additional_feedback — AF0 (2026-10-24). The company's additional feedback.
--
--   new type   VehicleStage        (collection | dropoff)                 ← AF2
--   new type   TagExceptionStatus  (pending | approved | rejected | withdrawn) ← AF4
--   new type   OfferRoundBasis     (engine | office | agent)              ← AF5
--   new type   OfferRoundOutcome   (accepted | declined | superseded)     ← AF5
--   new type   AgentNoticeKind     (four kinds)                           ← AF3
--   pickups          + collection_vehicle  (NULL)                         ← AF2
--   custody_batches  + vehicle             (NULL)                         ← AF2
--   new tables vehicle_corrections · tag_exceptions · office_prices ·
--              offer_rounds · agent_notices · ops_settings
--   backfill   offer_rounds round 1 for every existing offer
--   seed row   ops_settings 'default' at a 10% band
--
-- Source: docs/CLBIPP_Additional_Feedback_Changes_Short.docx. Decisions
-- FD20–FD25 in §12 of docs/PLAN_FEEDBACK_V2.md — OURS and provisional.
--
-- 🔴 ADDITIVE ONLY, so the DEPLOYED apps keep working against this database
-- until the code that reads it is pushed. No column is dropped or retyped, no
-- existing enum gains a value, and both new columns are nullable with no
-- default — catalogue-only, safe with the dev servers up.
--
-- 🔴 NO PickupStatus VALUE IS ADDED (FD0). A vehicle correction, an untagged-
-- battery request, an office price, an offer round and a notice are all FACTS
-- about a pickup, not stages of it.
--
-- 🔴 NO PRICE MOVES. Nothing here is an engine input. `offer_rounds` and
-- `office_prices` RECORD prices; `offers.estimated_price` stays the current
-- price (a cache of the latest round, like pickups.status vs status_events).
--
-- 🔴 GENERATED WITHOUT A DATABASE, the way feedback_logistics was:
-- `prisma migrate diff --from-schema-datamodel <HEAD's schema.prisma>
-- --to-schema-datamodel prisma/schema.prisma --script`. (`--from-migrations`
-- refuses to run without a --shadow-database-url, and a shadow URL is the thing
-- that wiped the shared project on 2026-09-10.) Applied with `prisma db
-- execute`; `migrate deploy` fails P3005 here (no _prisma_migrations).
--
-- ⚠ RLS IS ENABLED AT THE END OF THIS FILE. supabase/grants.sql grants `anon`
-- SELECT and `authenticated` full DML on every FUTURE table, so without these
-- lines the six new tables would be readable by anyone with the anon key until
-- policies.sql ran again. policies.sql restates them so a rebuild agrees.
--
-- ── WHY EACH PIECE EXISTS ───────────────────────────────────────────────────
--
-- pickups.collection_vehicle / custody_batches.vehicle / vehicle_corrections
--   (AF2 · FD25). The vehicle number is mandatory at collection and at hub
--   drop-off, prefilled (run vehicle → agent profile; collection vehicle at
--   drop-off). A difference from the prefill is a row here, never an overwrite.
--
-- tag_exceptions (AF4 · FD22). 🔴 Reverses FD13's "never a hard stop": an
--   untagged line blocks collection until an admin approves the agent's
--   request. Approval writes battery_items.untagged_reason, so every reader
--   downstream of collection is unchanged. One pending row per line, enforced
--   in the action (no partial index — Prisma cannot express one).
--
-- office_prices (AF5 · FD23). Only the office enters a changed price; the
--   agent's typed "Agreed price" field goes. Append-only, latest row = current.
--
-- offer_rounds (AF5 · FD24). A decline is not final; the agent may re-offer
--   within an admin-set band, and every round is recorded first to final.
--
-- agent_notices (AF3 · FD21). In-app notice to an agent (reassignment, an
--   office price, a tag decision). No push — §12.5.
--
-- ops_settings (AF5 · FD24). One typed row. A missing row fails CLOSED to a
--   0% band in code; the row inserted below is the decided 10% default.
-- ============================================================================

-- CreateEnum
CREATE TYPE "VehicleStage" AS ENUM ('collection', 'dropoff');

-- CreateEnum
CREATE TYPE "TagExceptionStatus" AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "OfferRoundBasis" AS ENUM ('engine', 'office', 'agent');

-- CreateEnum
CREATE TYPE "OfferRoundOutcome" AS ENUM ('accepted', 'declined', 'superseded');

-- CreateEnum
CREATE TYPE "AgentNoticeKind" AS ENUM ('job_reassigned_to_you', 'job_reassigned_away', 'office_price_set', 'tag_exception_decided');

-- AlterTable
ALTER TABLE "pickups" ADD COLUMN     "collection_vehicle" TEXT;

-- AlterTable
ALTER TABLE "custody_batches" ADD COLUMN     "vehicle" TEXT;

-- CreateTable
CREATE TABLE "vehicle_corrections" (
    "id" TEXT NOT NULL,
    "pickup_id" TEXT NOT NULL,
    "custody_batch_id" TEXT,
    "stage" "VehicleStage" NOT NULL,
    "from_reg" TEXT NOT NULL,
    "to_reg" TEXT NOT NULL,
    "corrected_by" UUID NOT NULL,
    "corrected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_exceptions" (
    "id" TEXT NOT NULL,
    "battery_item_id" TEXT NOT NULL,
    "pickup_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TagExceptionStatus" NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,

    CONSTRAINT "tag_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_prices" (
    "id" TEXT NOT NULL,
    "pickup_id" TEXT NOT NULL,
    "engine_paise" INTEGER NOT NULL,
    "previous_paise" INTEGER,
    "price_paise" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "set_by" UUID NOT NULL,
    "set_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_by" UUID,
    "acknowledged_at" TIMESTAMP(3),
    "agent_note" TEXT,

    CONSTRAINT "office_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_rounds" (
    "id" TEXT NOT NULL,
    "pickup_id" TEXT NOT NULL,
    "round_no" INTEGER NOT NULL,
    "price_paise" INTEGER NOT NULL,
    "basis" "OfferRoundBasis" NOT NULL,
    "office_price_id" TEXT,
    "note" TEXT,
    "presented_by" UUID,
    "presented_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "OfferRoundOutcome",
    "outcome_at" TIMESTAMP(3),

    CONSTRAINT "offer_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_notices" (
    "id" TEXT NOT NULL,
    "agent_id" UUID NOT NULL,
    "pickup_id" TEXT,
    "kind" "AgentNoticeKind" NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "agent_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "negotiation_band_bp" INTEGER NOT NULL DEFAULT 1000,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_corrections_pickup_id_idx" ON "vehicle_corrections"("pickup_id");

-- CreateIndex
CREATE INDEX "tag_exceptions_battery_item_id_idx" ON "tag_exceptions"("battery_item_id");

-- CreateIndex
CREATE INDEX "tag_exceptions_pickup_id_idx" ON "tag_exceptions"("pickup_id");

-- CreateIndex
CREATE INDEX "tag_exceptions_status_idx" ON "tag_exceptions"("status");

-- CreateIndex
CREATE INDEX "office_prices_pickup_id_set_at_idx" ON "office_prices"("pickup_id", "set_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "offer_rounds_pickup_id_round_no_key" ON "offer_rounds"("pickup_id", "round_no");

-- CreateIndex
CREATE INDEX "agent_notices_agent_id_read_at_idx" ON "agent_notices"("agent_id", "read_at");

-- AddForeignKey
ALTER TABLE "vehicle_corrections" ADD CONSTRAINT "vehicle_corrections_pickup_id_fkey" FOREIGN KEY ("pickup_id") REFERENCES "pickups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_corrections" ADD CONSTRAINT "vehicle_corrections_custody_batch_id_fkey" FOREIGN KEY ("custody_batch_id") REFERENCES "custody_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_exceptions" ADD CONSTRAINT "tag_exceptions_battery_item_id_fkey" FOREIGN KEY ("battery_item_id") REFERENCES "battery_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_exceptions" ADD CONSTRAINT "tag_exceptions_pickup_id_fkey" FOREIGN KEY ("pickup_id") REFERENCES "pickups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_exceptions" ADD CONSTRAINT "tag_exceptions_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_exceptions" ADD CONSTRAINT "tag_exceptions_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_prices" ADD CONSTRAINT "office_prices_pickup_id_fkey" FOREIGN KEY ("pickup_id") REFERENCES "pickups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_prices" ADD CONSTRAINT "office_prices_set_by_fkey" FOREIGN KEY ("set_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_rounds" ADD CONSTRAINT "offer_rounds_pickup_id_fkey" FOREIGN KEY ("pickup_id") REFERENCES "pickups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_rounds" ADD CONSTRAINT "offer_rounds_office_price_id_fkey" FOREIGN KEY ("office_price_id") REFERENCES "office_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_notices" ADD CONSTRAINT "agent_notices_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_notices" ADD CONSTRAINT "agent_notices_pickup_id_fkey" FOREIGN KEY ("pickup_id") REFERENCES "pickups"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ── Backfill: round 1 for every existing offer ──────────────────────────────
-- Every offer so far was presented once. Basis `engine` when the offered price
-- IS the recommendation (or the offer predates recommended_price_paise), else
-- `agent` — before AF5 the agent typed the agreed price. Presenter = the agent
-- on the first `offered` status event. Outcome: `accepted` when accepted_at is
-- set; `declined` when the vendor's decline event exists (declineOffer writes
-- that note and leaves the pickup at `offered`); otherwise open.
INSERT INTO "offer_rounds" (
    "id", "pickup_id", "round_no", "price_paise", "basis", "note",
    "presented_by", "presented_at", "outcome", "outcome_at"
)
SELECT
    gen_random_uuid()::text,
    o."pickup_id",
    1,
    o."estimated_price",
    (CASE
        WHEN o."recommended_price_paise" IS NULL
          OR o."estimated_price" = o."recommended_price_paise" THEN 'engine'
        ELSE 'agent'
     END)::"OfferRoundBasis",
    o."price_note",
    (SELECT se."actor_id" FROM "status_events" se
      WHERE se."pickup_id" = o."pickup_id" AND se."status" = 'offered'
        AND se."actor_role" = 'agent'
      ORDER BY se."occurred_at" ASC LIMIT 1),
    o."created_at",
    (CASE
        WHEN o."accepted_at" IS NOT NULL THEN 'accepted'
        WHEN d."at" IS NOT NULL THEN 'declined'
     END)::"OfferRoundOutcome",
    COALESCE(o."accepted_at", d."at")
FROM "offers" o
LEFT JOIN LATERAL (
    SELECT max(se."occurred_at") AS "at" FROM "status_events" se
     WHERE se."pickup_id" = o."pickup_id"
       AND se."notes" LIKE 'Vendor declined the offer%'
) d ON TRUE
ON CONFLICT ("pickup_id", "round_no") DO NOTHING;

-- ── The one settings row, at the decided default (FD24: 10%) ────────────────
INSERT INTO "ops_settings" ("id", "negotiation_band_bp", "updated_at")
VALUES ('default', 1000, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- ── RLS: closed, zero policies (AD3). See the header. ──────────────────────
ALTER TABLE "vehicle_corrections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tag_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "office_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offer_rounds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_notices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ops_settings" ENABLE ROW LEVEL SECURITY;
