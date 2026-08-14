-- ============================================================================
-- CLBIPP — Storage bucket policies
-- ============================================================================
-- All five buckets are PRIVATE (created by packages/database/prisma/create-buckets.ts).
-- Reads therefore go through signed URLs generated server-side, which is why
-- most buckets need no SELECT policy for `authenticated` at all.
--
-- Convention: every object is stored under a first path segment equal to the
-- owning user's uuid — `<uid>/<pickupId>/<filename>`. The policies below enforce
-- that segment, so a user can never write into another user's folder.
-- `storage.foldername(name)` returns the path segments; [1] is the first.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- pickup-photos — the customer uploads battery photos during booking, and can
-- read back their own. The agent's on-site photos are written by the service
-- role from the Agent app.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can upload their own pickup photos" on storage.objects;
create policy "Users can upload their own pickup photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pickup-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can read their own pickup photos" on storage.objects;
create policy "Users can read their own pickup photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pickup-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete their own pickup photos" on storage.objects;
create policy "Users can delete their own pickup photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pickup-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- ---------------------------------------------------------------------------
-- kyc-docs — the customer uploads; only the admin (service role) reads. There
-- is deliberately no SELECT policy: a KYC document should not be re-readable
-- from the browser session that uploaded it.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can upload their own KYC documents" on storage.objects;
create policy "Users can upload their own KYC documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'kyc-docs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- ---------------------------------------------------------------------------
-- certificates · receipts · invoices — written by the service role only, read
-- via server-generated signed URLs. No policy needed for `authenticated`, and
-- adding one would only widen the surface.
-- ---------------------------------------------------------------------------
