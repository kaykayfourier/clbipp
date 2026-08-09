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

-- ============================================================================
-- profiles — column-level clawback (Batch 6)
-- ============================================================================
-- The blanket grant above hands `authenticated` INSERT/UPDATE on EVERY column,
-- and policies.sql lets a user update their own profile row. Together that let
-- any logged-in customer PATCH their own row and set:
--
--   role                 → 'admin'     (from Batch 6 this is the app-access
--                                       boundary the middleware reads — it would
--                                       be a straight privilege escalation)
--   kyc_status           → 'verified'  (self-clearing compliance verification)
--   wallet_balance_paise → anything    (inventing money)
--   phone_verified       → true        (pre-defeats the later SMS OTP)
--
-- RLS cannot express "this row, but not these columns" — row policies are all
-- or nothing per statement. Column privileges are the layer that can, so the
-- fix belongs here rather than in policies.sql.
--
-- ALLOWLIST, not a denylist: a column added later is non-writable until someone
-- deliberately adds it below. That is the safe direction to fail.
--
-- Note a table-level grant is NOT reduced by revoking a column from it — the
-- table-level privilege has to be revoked first, then re-granted per column.
-- That is why each block below is revoke-then-grant, and why this section must
-- stay AFTER the blanket grant above (re-running this file is still idempotent).

-- Writable at signup by signUpWithProfile's insert. Everything omitted here has
-- a database default (role→customer, kyc_status→pending, wallet→0,
-- phone_verified→false, created_at/updated_at→now()), so the insert still works
-- while a hand-rolled PostgREST signup cannot name a privileged column.
revoke insert on profiles from authenticated;
grant insert (
  id, vendor_type, full_name, email, phone,
  company_name, gst_number, pan_number, business_address, epr_reg_id
) on profiles to authenticated;

-- Editable later by the owner. vendor_type is deliberately absent: switching
-- individual↔fleet changes which business fields and KYC apply, so it should be
-- a supported flow, not a silent PATCH. Add it here when that screen exists.
revoke update on profiles from authenticated;
grant update (
  full_name, email, phone,
  company_name, gst_number, pan_number, business_address, epr_reg_id,
  updated_at
) on profiles to authenticated;

-- No DELETE: an account deletion has to cascade auth.users, storage objects and
-- the compliance trail, so it goes through a service-role action, not a PATCH.
revoke delete on profiles from authenticated;
