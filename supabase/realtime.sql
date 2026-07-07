-- ============================================================================
-- CLBIPP — Realtime publication (vendor app)
-- ============================================================================
-- Supabase broadcasts Postgres change events only for tables in the
-- `supabase_realtime` publication. The tracking screen subscribes to INSERTs on
-- `status_events` (see src/lib/supabase-realtime.ts), so that table must be a
-- member. Prisma migrations create the table but never touch this publication,
-- so we add it here.
--
-- This does NOT weaken security: the publication controls whether changes are
-- broadcast at all; RLS on status_events (supabase/policies.sql) still gates
-- which subscriber receives which rows. A vendor only hears about their own
-- pickups' events.
--
-- Run once in the Supabase SQL editor (or via a migration).
-- Re-runnable: guarded so re-running is a no-op (a bare
-- `ALTER PUBLICATION ... ADD TABLE` errors if the table is already a member).
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'status_events'
  ) then
    alter publication supabase_realtime add table status_events;
  end if;
end $$;
