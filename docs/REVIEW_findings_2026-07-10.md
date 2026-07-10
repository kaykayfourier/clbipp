# Review findings — 2026-07-10 (A verifying B's blocker-removal)

Context: A verified the last 3 commits (`db1cfb5`, `d0dbf30`, `f786d18`) and ran
tests + a live smoke test. The P0 `pickups.updated_at` default is genuinely
fixed. The "removed B blockers" commit does the right refactors (dashboard /
compliance / certificate off mock data onto real Prisma) but ships several bugs.
This note is a flag-only handoff — A did not change any code.

**Status snapshot from A's run:**
- `npm test` → 23 passed.
- `npm run build` → RED (fails at `design-system/page.tsx`; see C-2).
- Full typecheck past that → 2 errors (see C-1).
- Live: `/login` 200; `/t/<bad>` & `/t/<missing-uuid>` 404 (A's guards OK); all
  authed routes 307 → `/login`.

---

## For B

### B-1 (P0) — `cancelled` added to `LIFECYCLE_STAGES` breaks A's timelines + the build
- File: `src/lib/tokens.ts` (last line of `LIFECYCLE_STAGES`).
- `LIFECYCLE_STAGES` is the *ordered* lifecycle array and is iterated directly by
  `src/components/ui/timeline.tsx` (L138–144). None of A's `<Timeline>` calls pass
  `endStage`, so **every tracking timeline now renders a phantom 8th "cancelled"
  row** (empty label — `STAGE_LABELS["cancelled"]` is undefined — + grey dot) on
  `/track/[id]` and public `/t/[token]`, in all status branches.
- Same change causes **2 build-breaking type errors**: `badge.tsx:12` and
  `timeline.tsx:39` build `Record<LifecycleStage, …>` maps that now miss a
  `cancelled` key.
- `cancelled` is a terminal side-state, not a linear stage. Suggested fix: **revert
  it out of `LIFECYCLE_STAGES`** and represent `cancelled` separately wherever a
  status union is needed (it should not appear in the ordered progression). If it
  was added to satisfy a `ListRow`/status type somewhere, fix that consumer's type
  instead of mutating the ordered array. Per CLAUDE.md: shared shapes have stable
  keys — a change here must update every consumer.

### B-2 (P0) — seed for PKP-3099 is inconsistent; A's recovered/certified test data still missing
- File: `prisma/seed.ts`, `seedForExistingUser()`.
- Creates pickup **PKP-6099**, but statusEvents + certificate reference **PKP-3099**
  (L260, L287) while the offer references **PKP-6099**. Mixed IDs.
- Seeds for **`kaykay@fourier`** (B's account), not A's `business@test` /
  `efc87c57-…` who owns PKP-3099.
- Consequences:
  - The Offer + `materialBreakdown` A needs for the **recovered/certified
    RecoverySummary on PKP-3099** is still **not** attached to PKP-3099 → A's
    blocker "seed Offer with materialBreakdown for PKP-3099" is **not done**.
  - Against a fresh DB, the PKP-3099 statusEvent/certificate inserts will FK-violate
    (PKP-3099 isn't created by this function).
  - A certificate row would claim one vendor owns another vendor's pickup.
- Fix: make the function self-consistent for a single pickup+vendor, and seed the
  offer/cert against **PKP-3099 owned by the real Aamir auth user** so A can test.

### B-3 (P1) — compliance → certificate link points at a non-existent route
- File: `src/app/(app)/compliance/ComplianceClient.tsx`.
- Links to `/certificate/${pickupId}` (singular). Route is `/certificates/[id]`
  (plural); no singular route exists → 404. Change to `/certificates/`.

### B-4 (P1) — certificate page params not awaited (Next 16)
- File: `src/app/(app)/certificates/[id]/page.tsx`.
- Typed `{ params: { id: string } }` and reads `params.id` synchronously. Next
  16.2.6 makes `params` a `Promise` — must be `params: Promise<{ id: string }>`
  then `const { id } = await params` (see A's `track/[id]` and `t/[token]` pages
  for the pattern). Will error at runtime / fail `next build`. This is the exact
  page A's certified "View certificate" button links to.

### B-5 (P2) — minor
- `ComplianceClient.tsx`: malformed class `text-[#0E120E"` (missing `]`) — colour
  never applies.
- `dashboard/page.tsx`: "Recovered" sums `materialBreakdown` weight across **all**
  offers regardless of pickup status, and renders with no `kg` unit. (Weight-only
  is fine re: the locked no-value rule — this is a correctness/label nit.)

---

## For C

### C-1 (P0) — `npm run build` fails at `design-system/page.tsx`
- File: `src/app/design-system/page.tsx` imports `Input, Select, Textarea, Field`
  from `src/components/ui/input.tsx`, but that file only exports `Card*`
  components (looks like Card content was pasted into `input.tsx`). Pre-existing,
  not from B's commit, but it makes the prod build red — blocks deploy.

---

## For A (self)

- Once B-1 lands (cancelled out of `LIFECYCLE_STAGES`), re-verify the tracking
  timelines have no phantom row and the cancelled branch still renders correctly.
- Still can't verify recovered/certified RecoverySummary until B-2 seeds a real
  offer on PKP-3099.
