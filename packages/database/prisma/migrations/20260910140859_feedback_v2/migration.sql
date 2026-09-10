-- ============================================================================
-- feedback_v2 — FV2 (2026-09-10). Presentation-feedback set, one migration.
--
--   battery_items + weight_method   (WeightMethod, NULL)   ← FV2, used now
--   battery_items + weight_photo_url (text, NULL)          ← FV2, used now
--   battery_items + pathway_set_by  (uuid, NULL)           ← FV5, not yet read
--   battery_items + pathway_reason  (text, NULL)           ← FV5, not yet read
--   pickups       + inspected_at            (timestamp, NULL) ← FV3
--   pickups       + collection_scheduled_at (timestamp, NULL) ← FV3
--   pickups       + collected_at            (timestamp, NULL) ← FV3
--   new type      WeightMethod
--
-- 🔴 ONE MIGRATION FOR THREE BATCHES, ON PURPOSE. FV3 and FV5 do not write
-- their columns yet. This runs against the SHARED Supabase project all three
-- apps read, and the cost of a migration here is the coordination around it,
-- not the DDL — so the columns land together and the screens catch up.
--
-- Every column is nullable with no default and no backfill, which in Postgres
-- 11+ is a catalogue-only change: an ACCESS EXCLUSIVE lock for the duration of
-- the catalogue update and no table rewrite. Safe to run with the three dev
-- servers up. Every existing row keeps reading exactly as it did.
--
-- 🔴 NO PickupStatus VALUE IS ADDED. The nine stages stay locked, for the
-- fourth sprint running. See the note on `pickups.collection_scheduled_at`
-- below — deferred collection is a DERIVED state, not a tenth stage (FD0).
--
-- 🔴 NO PRICE MOVES. Nothing here is an engine input. `weight_method` records
-- how `confirmed_weight_kg` was obtained; it does not change that number, and
-- the engine reads the number exactly as before.
--
-- ⚠ RLS: none needed, and none added. `battery_items` and `pickups` are reached
-- through Prisma (as table owner) and the service role. The agent app's two
-- SELECT-only Realtime policies are unaffected — neither references these
-- columns, and a policy that does not name a column is not narrowed by one
-- appearing. Nothing in supabase/policies.sql changes.
--
-- ⚠ GRANTS: supabase/grants.sql carries a column allowlist for the paths that
-- write through PostgREST rather than Prisma. Nothing in this migration is
-- written that way — `confirmItem` uses the service role, which bypasses the
-- allowlist — so no grant needs widening. If a future screen writes
-- weight_method through the anon/authenticated role, grants.sql is the file to
-- revisit, and `reset-demo` does NOT restore grants.
--
-- ── WHY EACH COLUMN EXISTS ──────────────────────────────────────────────────
--
-- weight_method / weight_photo_url (FD3)
--   The feedback asks agents to weigh on a portable digital scale and for the
--   app to "distinguish measured weight from any customer-declared or estimated
--   weight". `confirmed_weight_kg` already held the agent's figure and is what
--   the engine prices against — but a calibrated reading and a guess were the
--   same value in the same column, indistinguishable afterwards, including in
--   the price dispute that is the one moment anybody asks. The photo is the
--   battery on the scale with the reading legible.
--
--   `estimated` is a legitimate value, not a failure: an agent facing a 400 kg
--   pallet with a 50 kg scale has no honest alternative. Recorded and flagged,
--   never silently blocked — pending the company's answer to question E2.
--
-- pathway_set_by / pathway_reason (FV5)
--   `battery_items.pathway` is written unattended by the decision engine. The
--   feedback's Second Life vs Recycling split makes it a call a person can
--   take, and a decision with no author is not auditable. NULL keeps meaning
--   "the engine chose this".
--
-- pickups.inspected_at / collection_scheduled_at / collected_at (FD0)
--   Inspection and collection become two events. The app assumed one visit:
--   arrive, assess, offer, accept, collect, all in one stop.
--
--   🔴 `collection_scheduled_at` is why this is NOT a tenth lifecycle stage.
--   The nine stages are asserted independently in enum PickupStatus,
--   LIFECYCLE_STAGES, pickupstatusSchema and reset-demo's LIFECYCLE, and are
--   rendered by one shared buildStages — the same reasoning that made "pending
--   drop-off" derived from custody_batch_id (D5) rather than a stage.
--
--   ⚠ THE CONSEQUENCE: `offered` now carries THREE sub-states.
--       accepted_at NULL                              → awaiting the vendor
--       accepted_at set, collection_scheduled_at NULL → accepted, collect now
--       accepted_at set, collection_scheduled_at set  → accepted, collect later
--   Any screen switching on status = 'offered' must read both timestamps.
--   Reading only the status shows a vendor an Accept button for an offer they
--   accepted last week; reading only accepted_at sends an agent to a job that
--   is not theirs today.
--
--   `collected_at` and `inspected_at` are recorded rather than derived from
--   status_events because that table can legitimately go BACKWARDS — a
--   reactivated pickup writes `requested` after `cancelled` — so "when was this
--   collected" cannot be answered by taking the last matching event.
-- ============================================================================

-- CreateEnum
CREATE TYPE "WeightMethod" AS ENUM ('digital_scale', 'manufacturer_label', 'estimated');

-- AlterTable
ALTER TABLE "battery_items" ADD COLUMN     "pathway_reason" TEXT,
ADD COLUMN     "pathway_set_by" UUID,
ADD COLUMN     "weight_method" "WeightMethod",
ADD COLUMN     "weight_photo_url" TEXT;

-- AlterTable
ALTER TABLE "pickups" ADD COLUMN     "collected_at" TIMESTAMP(3),
ADD COLUMN     "collection_scheduled_at" TIMESTAMP(3),
ADD COLUMN     "inspected_at" TIMESTAMP(3);
