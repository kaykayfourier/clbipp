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
