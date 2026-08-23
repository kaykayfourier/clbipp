-- ============================================================================
-- agent_app_v1_collect_workaround — Batch 6, Ali, 2026-08-23.
--
-- One additive, nullable column. The collect screen (D7) is specced to
-- capture a vendor signature at the moment of collection, but PickupReceipt
-- had no column for it — only CustodyBatch.signatureUrl exists, and that's
-- the HUB's signature at Batch 7a drop-off, a different signature from a
-- different person at a different stage. Hand-off photos and the collection
-- location do NOT need a new column: StatusEvent already has photoUrls/lat/lng
-- ("where + photo proof per transition") and the `collected` status_events row
-- is where this build writes them.
-- ============================================================================

-- AlterTable
ALTER TABLE "pickup_receipts" ADD COLUMN     "signature_url" TEXT;
