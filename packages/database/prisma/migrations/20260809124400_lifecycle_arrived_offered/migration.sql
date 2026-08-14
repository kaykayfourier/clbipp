-- migration: add `arrived` and `offered` to the pickup lifecycle
--
-- purpose:
--   the locked status contract was
--     requested -> scheduled -> collected -> tested -> processed -> recovered -> certified
--   which had no status for "the agent is on site" or "an offer has been made".
--   the offer was an *implicit* sub-state of `scheduled` (an offers row exists),
--   which is why the /offer and /offer-breakdown screens were unreachable in the
--   demo until the seed was patched in batch 6.5. the company flow document puts
--   assessment and quoting on site, so `arrived` sorts before `offered`.
--
--   new contract:
--     requested -> scheduled -> arrived -> offered -> collected -> tested
--       -> processed -> recovered -> certified   (+ cancelled)
--
-- affected objects: type "PickupStatus" only.
--   used by public.pickups.status and public.status_events.status.
--
-- special considerations:
--   * NON-DESTRUCTIVE. this only adds enum labels. no column is altered, no row
--     is rewritten, and no existing value can become invalid.
--   * no backfill is needed: neither label existed before, so no row can already
--     hold one.
--   * `before`/`after` is used rather than a plain append so the physical enum
--     sort order matches the logical lifecycle order. nothing in the app orders
--     by status today, so this is for anyone reading the type later.
--   * `alter type ... add value` is allowed inside a transaction on postgres 12+
--     (supabase is well past that) so long as the new label is not *used* in the
--     same transaction. this migration only adds labels, so it is safe under
--     prisma's transactional migration runner.
--   * `if not exists` keeps the file re-runnable.

alter type "PickupStatus" add value if not exists 'arrived' after 'scheduled';

alter type "PickupStatus" add value if not exists 'offered' after 'arrived';
