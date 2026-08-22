-- ============================================================================
-- CLBIPP — Row Level Security policies (vendor app)
-- ============================================================================
-- Versioned, reproducible source of truth for RLS. Apply by pasting into the
-- Supabase SQL editor (or via a migration). Re-runnable: every policy is dropped
-- before being (re)created.
--
-- Model: a vendor is an authenticated user. Every row is scoped to its owner via
-- `vendor_id = auth.uid()` (or, for the current user's own profile, `id`).
-- `auth.uid()` is wrapped in `(select ...)` so Postgres caches it per-statement
-- (RLS perf guidance), and every policy is restricted `to authenticated` so it
-- never runs for anonymous requests.
--
-- Owner-key columns are already indexed in the Prisma schema
-- (profiles.id PK; pickups/offers/certificates.vendor_id; status_events.pickup_id).
--
-- Out of scope here (future work):
--   * Field-agent / admin writes to offers + status_events happen via the
--     service role (which bypasses RLS) or dedicated policies in a later sprint.
--   * Public certificate verification by `public_token` (anon read) is a
--     separate policy, added when that page is built.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles — a user sees and edits only their own row.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;

drop policy if exists "Vendors can read their own profile" on profiles;
create policy "Vendors can read their own profile"
on profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Vendors can create their own profile" on profiles;
create policy "Vendors can create their own profile"
on profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Vendors can update their own profile" on profiles;
create policy "Vendors can update their own profile"
on profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- pickups — a vendor manages only their own pickup requests.
-- ---------------------------------------------------------------------------
alter table pickups enable row level security;

drop policy if exists "Vendors can read their own pickups" on pickups;
create policy "Vendors can read their own pickups"
on pickups
for select
to authenticated
using ((select auth.uid()) = vendor_id);

drop policy if exists "Vendors can create their own pickups" on pickups;
create policy "Vendors can create their own pickups"
on pickups
for insert
to authenticated
with check ((select auth.uid()) = vendor_id);

-- NOTE: vendors intentionally have NO direct UPDATE policy on pickups. All
-- lifecycle transitions (accept → collected, cancel → cancelled, and later the
-- agent/admin advances) go through service-role server actions, which bypass
-- RLS. With no permissive UPDATE policy, RLS denies any direct pickup update
-- from a vendor session — so a vendor can't self-advance their own status
-- (e.g. jump to certified) by calling the API directly. The UI is not the
-- security boundary; RLS is.
--
-- The bare drop below (no matching create) removes the policy if an earlier
-- version of this file created it, so re-running this file is what closes the
-- hole. INSERT (request-pickup) and SELECT stay in place.
drop policy if exists "Vendors can update their own pickups" on pickups;

-- ---------------------------------------------------------------------------
-- offers — read-only to the vendor; offers are written by the field-agent side.
-- ---------------------------------------------------------------------------
alter table offers enable row level security;

drop policy if exists "Vendors can read their own offers" on offers;
create policy "Vendors can read their own offers"
on offers
for select
to authenticated
using ((select auth.uid()) = vendor_id);

-- ---------------------------------------------------------------------------
-- certificates — read-only to the vendor; written by the compliance side.
-- ---------------------------------------------------------------------------
alter table certificates enable row level security;

drop policy if exists "Vendors can read their own certificates" on certificates;
create policy "Vendors can read their own certificates"
on certificates
for select
to authenticated
using ((select auth.uid()) = vendor_id);

-- ---------------------------------------------------------------------------
-- status_events — no vendor_id column, so scope indirectly through pickups.
-- Written via the field-agent side. Uses IN (...) rather than a join (perf).
-- ---------------------------------------------------------------------------
alter table status_events enable row level security;

drop policy if exists "Vendors can read status events for their pickups" on status_events;
create policy "Vendors can read status events for their pickups"
on status_events
for select
to authenticated
using (
  pickup_id in (
    select id from pickups where vendor_id = (select auth.uid())
  )
);

-- ===========================================================================
-- Schema v2 tables (Batch 0B). Same model throughout: the customer reads what
-- belongs to them; everything that moves money or advances the lifecycle is
-- written by service-role server actions, which bypass RLS. So most of these
-- are SELECT-only, and the absence of an INSERT/UPDATE policy is deliberate.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- addresses — fully owned by the customer: they create and edit their own.
-- This is the one new table the customer writes directly.
-- ---------------------------------------------------------------------------
alter table addresses enable row level security;

drop policy if exists "Users can read their own addresses" on addresses;
create policy "Users can read their own addresses"
on addresses
for select
to authenticated
using ((select auth.uid()) = profile_id);

drop policy if exists "Users can create their own addresses" on addresses;
create policy "Users can create their own addresses"
on addresses
for insert
to authenticated
with check ((select auth.uid()) = profile_id);

drop policy if exists "Users can update their own addresses" on addresses;
create policy "Users can update their own addresses"
on addresses
for update
to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

drop policy if exists "Users can delete their own addresses" on addresses;
create policy "Users can delete their own addresses"
on addresses
for delete
to authenticated
using ((select auth.uid()) = profile_id);

-- ---------------------------------------------------------------------------
-- battery_items — no vendor_id of their own; scope through the parent pickup
-- (same shape as status_events). Read-only: booking writes them server-side in
-- one transaction with the pickup, and the agent confirms them from the Agent
-- app, both via the service role.
-- ---------------------------------------------------------------------------
alter table battery_items enable row level security;

drop policy if exists "Vendors can read items on their pickups" on battery_items;
create policy "Vendors can read items on their pickups"
on battery_items
for select
to authenticated
using (
  pickup_id in (
    select id from pickups where vendor_id = (select auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- pricing_rates — reference data. Every authenticated user may read the active
-- rates (the quote step needs them); nobody but the admin app (service role)
-- writes them.
-- ---------------------------------------------------------------------------
alter table pricing_rates enable row level security;

drop policy if exists "Authenticated users can read active pricing rates" on pricing_rates;
create policy "Authenticated users can read active pricing rates"
on pricing_rates
for select
to authenticated
using (is_active);

-- ---------------------------------------------------------------------------
-- payments — read-only. Money is only ever moved by service-role actions.
-- ---------------------------------------------------------------------------
alter table payments enable row level security;

drop policy if exists "Vendors can read their own payments" on payments;
create policy "Vendors can read their own payments"
on payments
for select
to authenticated
using ((select auth.uid()) = vendor_id);

-- ---------------------------------------------------------------------------
-- wallet_txns — read-only ledger. A writable ledger is not a ledger.
-- ---------------------------------------------------------------------------
alter table wallet_txns enable row level security;

drop policy if exists "Users can read their own wallet transactions" on wallet_txns;
create policy "Users can read their own wallet transactions"
on wallet_txns
for select
to authenticated
using ((select auth.uid()) = profile_id);

-- ---------------------------------------------------------------------------
-- pickup_receipts — scope through the pickup; issued by the agent at collection.
-- ---------------------------------------------------------------------------
alter table pickup_receipts enable row level security;

drop policy if exists "Vendors can read receipts for their pickups" on pickup_receipts;
create policy "Vendors can read receipts for their pickups"
on pickup_receipts
for select
to authenticated
using (
  pickup_id in (
    select id from pickups where vendor_id = (select auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- invoices — read-only; issued server-side.
-- ---------------------------------------------------------------------------
alter table invoices enable row level security;

drop policy if exists "Vendors can read their own invoices" on invoices;
create policy "Vendors can read their own invoices"
on invoices
for select
to authenticated
using ((select auth.uid()) = vendor_id);

-- ---------------------------------------------------------------------------
-- Agent + admin scaffolding tables. RLS is enabled with NO policy, which denies
-- every request from an authenticated session — only the service role reaches
-- them. The Agent and Admin apps add their own policies when they are built;
-- until then "enabled, no policy" is the safe default (RLS is off by default on
-- a new table, which would leave these world-readable to any logged-in user).
-- ---------------------------------------------------------------------------
alter table facilities enable row level security;
alter table recyclers enable row level security;
alter table dispatch_manifests enable row level security;
alter table safety_checklists enable row level security;
alter table custody_batches enable row level security;

-- ---------------------------------------------------------------------------
-- Decision-engine tables. RLS was never enabled on these — they predate the
-- vendor app and were missed when this file was written — which left our
-- pricing internals (market rates, cost factors, every computed P_min/P_max)
-- readable over PostgREST by any authenticated session, including a vendor's.
-- That is the exact inverse of the vendor-visibility rule in CLAUDE.md.
--
-- Enabling RLS with no policy changes NO application behaviour: nothing in
-- either app reads these through a Supabase client. Prisma connects as the
-- table owner and the agent app's server actions use the service role; both
-- bypass RLS. Added 2026-08-21 (Batch 0a) ahead of Batch 4, which starts
-- writing real pathway_decisions rows.
-- ---------------------------------------------------------------------------
alter table market_prices enable row level security;
alter table pathway_factors enable row level security;
alter table pathway_decisions enable row level security;
alter table battery_packs enable row level security;
alter table battery_inspections enable row level security;
alter table battery_diagnostics enable row level security;
