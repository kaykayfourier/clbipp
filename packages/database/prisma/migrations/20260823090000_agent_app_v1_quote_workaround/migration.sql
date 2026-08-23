-- ============================================================================
-- agent_app_v1_quote_workaround — Batch 5a, Ali, 2026-08-23.
--
-- One additive, nullable column. See the comment on BatteryItem.quoteData in
-- schema.prisma for why this exists: computeQuote() needs BMSData fields no
-- screen in the plan collects, and PathwayDecision's FKs (packId/inspectionId/
-- factorConfigId) point at the old single-pack test harness rather than
-- Pickup -> BatteryItem, with zero rows seeded to attach to. This column is a
-- workaround, flagged for replacement once the admin dashboard defines the
-- real linkage — not a redesign of the audit trail.
-- ============================================================================

-- AlterTable
ALTER TABLE "battery_items" ADD COLUMN     "quote_data" JSONB;
