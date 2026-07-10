# Batch A — running flags & deferred items

> Live scratch list of things flagged during Batch A execution (the vendor-demo
> remediation A owns). Kept so nothing gets lost between phases. Not a spec —
> the plan of record is `~/.claude/plans/cheerful-hugging-unicorn.md` +
> `docs/REMEDIATION_PLAN.md`. Last updated: 2026-07-10, after Phase 1.

## Needs testing later (can't verify now — all blocked on B's seed)

- **[T1] Offer screens render untested.** `/offer` + `/offer-breakdown` now read
  the real Offer, but a pickup with no Offer row correctly redirects to
  `/scheduled` (guard 4). So the actual price/pathway/rationale/kg-breakdown
  render **cannot be seen** until B seeds offers against pickups owned by the
  **real auth user** (`business@test`). His current seed attaches the offer to the
  wrong pickup/vendor (see B-2). **Why barred:** the offer is a sub-state of
  `scheduled` — a `requested` pickup with no offer shouldn't be able to view one.
  Re-test once B fixes + expands the seed.

- **[T2] Phase 2 accept/cancel untested (policies.sql applied, seed pending).**
  The RLS drop has been applied in Supabase. These steps still need running once
  B seeds an offer:
  1. **Accept** an offer → pickup goes `collected`, a `collected` row appears in
     the `status_events` table, the tracking realtime ping fires, lands on
     `/track/[id]`.
  2. **Cancel** a `requested`/`scheduled` pickup → status `cancelled`, a
     `cancelled` `status_events` row is written, lands on the cancelled tracking
     view.
  3. **Security:** a direct `pickups` UPDATE from a vendor session (as
     `authenticated`) is denied by RLS (H2 closed).
  4. **"View Offer"** button on `/scheduled` shows only when an offer exists.

- **[T3] Phase 3 seam untested (blocked on B).** Code is in; these need data:
  1. **handover → `/track/[id]`** primary CTA — only reachable *after* accepting
     an offer, so blocked on B's seeded offer ([B-seed]).
  2. **`/track` "View offer" CTA** (requested/scheduled bucket) — shows only when
     an Offer row exists → blocked on [B-seed].
  3. **Certified "View certificate"** button links `/certificates/[id]` — works
     once B ships cert-by-id ([B-cert]) + seeds a certified pickup with a cert.

## Needs a decision

- **[D1] offer vs offer-breakdown differentiation.** `/offer-breakdown` now shows
  a **weight-only (kg)** recoverable-materials list from `materialBreakdown` (no
  ₹ — locked rule permits kg). Kept in per A's call ("easier to remove than
  add"). **Pending intern-head sign-off** — remove the "Recoverable materials"
  card in `offer-breakdown/page.tsx` if rejected.

## Handover to B — updated task list (hand this to B)

> These are B's files — A won't edit them. Ordered by how much they unblock A's
> testing. Some restate items from `REVIEW_findings_2026-07-10.md`; the seed one
> is expanded per a 2026-07-10 decision.

1. **[B-seed] Fix + EXPAND the seed — highest priority (unblocks [T1] and [T2]).**
   - Seed for the **real auth user** `business@test` (`efc87c57-…`), not
     `kaykay@fourier`, and keep one pickup's IDs self-consistent (the current
     function mixes PKP-6099 / PKP-3099 across pickup, statusEvents, offer, cert —
     see review B-2).
   - Seed **multiple offers** — several `scheduled` pickups for the real user,
     each with its own Offer carrying a **distinct** `pathway`, `estimatedPrice`
     (in **paise** — e.g. 18450000 = ₹1,84,500), `rationale`, and a
     `materialBreakdown` (with `weight_kg` per material). A needs more than one so
     the offer / offer-breakdown screens can be verified to change per pickup, not
     just render one hardcoded case.
   - Also seed a `certified` pickup **with** a Certificate row for the real user,
     so A's certified tracking + "View certificate" + profile stats have data.
2. **[B-route] Dashboard row routing by status.** `requested` rows → `/scheduled?id=`
   (that screen shows the timeline, waits for agent assignment, and surfaces the
   offer once it exists); all other statuses → `/track/[id]`. `dashboard/page.tsx`.
3. **[B-req] Request-pickup button** on the dashboard must navigate to
   `/request-pickup` (currently dead). Use a `<Link>`. `dashboard/page.tsx`.
4. **[B-cert] Certificate page** read-by-pickup-ID (currently hardcoded PKP-2031)
   + `await params` (Next 16 makes `params` a Promise — see review B-4). Unblocks
   A's certified "View certificate" seam.
5. **[B-compliance] Compliance link** `/certificate/${id}` → `/certificates/${id}`
   (singular route 404s — review B-3), and the malformed `text-[#0E120E"` class
   (review B-5).

> Contract note for B: none of A's Phase 1/2 changes touch the Offer/Pickup
> table or schema. A only added read-side display helpers (`lib/offer.ts`) and
> service-role transition actions. B seeds via Prisma exactly as before — the two
> lanes are decoupled through the unchanged schema.

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
