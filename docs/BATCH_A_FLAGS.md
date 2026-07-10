# Batch A — running flags & deferred items

> Live scratch list of things flagged during Batch A execution (the vendor-demo
> remediation A owns). Kept so nothing gets lost between phases. Not a spec —
> the plan of record is `~/.claude/plans/cheerful-hugging-unicorn.md` +
> `docs/REMEDIATION_PLAN.md`. Last updated: 2026-07-10, after Phase 1.

## Needs testing later (can't verify now)

- **[T1] Offer screens render untested.** `/offer` + `/offer-breakdown` now read
  the real Offer, but a pickup with no Offer row correctly redirects to
  `/scheduled` (guard 4). So the actual price/pathway/rationale/kg-breakdown
  render **cannot be seen** until B seeds an Offer against **PKP-3099 owned by the
  real auth user** (`business@test`). His current seed attaches the offer to the
  wrong pickup/vendor (see B-2). **Why barred:** the offer is a sub-state of
  `scheduled` — a `requested` pickup with no offer shouldn't be able to view one.
  Re-test once B fixes the seed.

## Needs a decision

- **[D1] offer vs offer-breakdown differentiation.** `/offer-breakdown` now shows
  a **weight-only (kg)** recoverable-materials list from `materialBreakdown` (no
  ₹ — locked rule permits kg). Kept in per A's call ("easier to remove than
  add"). **Pending intern-head sign-off** — remove the "Recoverable materials"
  card in `offer-breakdown/page.tsx` if rejected.

## Handover to B (not Batch A — don't edit B's files)

- **[B-route] Dashboard row routing.** Recommend `requested` rows link to
  `/scheduled?id=` (not `/track/`): the scheduled screen already shows a timeline
  + is the natural place to wait for agent assignment and later view the offer.
  `dashboard/page.tsx` is B's file.
- **[B-req] Request-pickup button** on the dashboard still doesn't navigate —
  B's file (`dashboard/page.tsx`).
- **[B-seed] Seed an Offer (+ materialBreakdown) on PKP-3099** owned by the real
  auth user — unblocks [T1]. B does **not** need any of A's Phase 1 changes to do
  this; the Offer table/schema is unchanged (A only added read-side display
  helpers in `lib/offer.ts`).
- **[B-cert] Certificate page** read-by-id + `await params` — unblocks A's
  certified "View certificate" button (Phase 3 seam).

## Parked-app boundary (out of scope this sprint)

- **[P1] `requested → scheduled` transition + offer creation depend on the field
  agent.** The vendor can't self-advance to `scheduled` or create an offer; those
  are field-agent actions. B seeds/simulates them for the demo. Consequence: the
  scheduled screen's "View Offer" CTA is gated on an Offer existing (done), and
  the `scheduled` status itself won't appear until B simulates it.
- **[P2] Reschedule** — no flow this sprint; button is disabled ("coming soon").
- **[P3] Public realtime on `/t/[token]`** — deferred (pre-existing).

## Phase 2 — DONE (code), needs manual SQL apply

- **[Ph2-cancel] ✅ Cancel request** now calls the `cancelPickup` service-role
  action (owner-checked, pre-collection only) → routes to `/track/[id]`.
- **[Ph2-accept] ✅ Accept offer** now persists via the service-role
  `acceptOffer` — writes the `status_events` row (restores audit + realtime
  ping) instead of the RLS-dropped vendor write.
- **[Ph2-rls] ⏳ APPLY REQUIRED:** re-run the updated `supabase/policies.sql` in
  the Supabase SQL editor to drop the broad "Vendors can update their own
  pickups" UPDATE policy (closes H2 — vendor can no longer self-advance status).
  `grants.sql` does NOT need re-running. Also add `SUPABASE_SERVICE_ROLE_KEY` to
  Vercel env before the Phase 4 deploy.

## Cosmetic / low priority

- **[C1] tsconfig `baseUrl` deprecation.** Editor shows a red squiggle (its newer
  bundled TS wants `ignoreDeprecations: "6.0"`); the CLI build (TS 5.9.3) needs
  `"5.0"` and is green. Proper fix = drop `baseUrl`, let `paths` resolve
  tsconfig-relative. Deferred (touches module resolution).
