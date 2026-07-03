-- ============================================================================
-- CLBIPP — Schema/table grants (run BEFORE policies.sql)
-- ============================================================================
-- Why this file exists: when Supabase's own dashboard creates a table, it
-- auto-grants the `anon`/`authenticated`/`service_role` Postgres roles access
-- to it. Prisma's migrations only run `CREATE TABLE` — they skip those grants
-- entirely. Without them, every request fails with
-- "permission denied for schema public" (a raw Postgres grant error, distinct
-- from an RLS violation) before RLS is ever evaluated.
--
-- This does NOT weaken security: GRANT controls whether a role may attempt an
-- operation at all; RLS (supabase/policies.sql) controls which rows it can see
-- or affect. Both layers apply — this is Supabase's standard model, the same
-- grants their dashboard sets up automatically for dashboard-created tables.
--
-- Re-runnable: GRANT/ALTER DEFAULT PRIVILEGES are idempotent.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- Apply the same grants automatically to any table created after this point
-- (e.g. the next `prisma migrate dev`), so this doesn't need re-running per table.
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
