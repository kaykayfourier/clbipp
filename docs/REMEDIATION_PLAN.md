# Remediation plan — 2026-07-10 (get the vendor demo path working, ~1 day)

Companion to `docs/REVIEW_findings_2026-07-10.md` (what's broken). This is the
**what-we-do**, batched by owner to minimise handoffs.

## Target (definition of done for the day)
A coherent, demoable end-to-end vendor happy path, vendor-scoped, no crashes,
with guards that block nonsense transitions:

`dashboard → request → submitted → scheduled → (offer → offer-breakdown →
handover) → track → certificate → compliance`

Explicitly **out of scope today:** full input validation, field-agent
simulation, production hardening, exhaustive edge cases.

## Navigation model (decided)
**Status-routed, both screen sets kept.** Dashboard routes each pickup row by
status; the offer lives as a sub-state of `scheduled` (an Offer row exists):
- `requested` / `scheduled` → `/scheduled?id=` (shows "View offer" CTA **only when
  an Offer row exists**)
- `collected` … `certified` → `/track/[id]`
- `cancelled` → `/track/[id]` (cancelled view)
- `/offer`, `/offer-breakdown`, `/handover` are **mid-flow only**, reached from
  `/scheduled`, and **guarded** (owner + status pre-collection + offer exists,
  else redirect to `/track/[id]`).
- `handover` ends by routing to `/track/[id]`.

## Scope allocation (lane shift — see log entry at bottom)
- **B (Khalid):** stays on his data/schema/his-screens batch below.
- **A (Aamir + Claude Code):** takes the whole cross-lane **seam**, the
  flow/component **crash-fixes**, and **PWA + deploy** (all repo-wide).
- **C (Mohammed Ali Syed):** isolated visual polish on his own screens, off the
  critical path.

---

## Batch B (Khalid) — data + his screens, self-contained
Can be done start-to-finish alone; only hands A the seed to test against.

1. **Seed fix (P0).** `prisma/seed.ts` `seedForExistingUser()` currently creates
   `PKP-6099` but its statusEvents/certificate reference `PKP-3099`, and it seeds
   B's own account. Make it self-consistent **for the real auth user**
   (`business@test` / `efc87c57-1659-4de1-98af-86c2068b65e2`), seeding:
   - one pickup at status `scheduled` **with an Offer** (`materialBreakdown`
     present) → drives the offer flow;
   - one pickup at status `certified` **with a Certificate + recovered Offer** →
     drives the cert button + RecoverySummary.
   All FK refs must point at the pickup actually created.
2. **Certificate page (P1).** `certificates/[id]/page.tsx`: type
   `params: Promise<{ id: string }>` and `const { id } = await params` (Next 16).
3. **Compliance link (P1).** `ComplianceClient.tsx`: `/certificate/${pickupId}` →
   `/certificates/${pickupId}`. Also fix the malformed class `text-[#0E120E"`.
4. **Dashboard wiring (P0).** Wrap both "Request a pickup" buttons in
   `<Link href="/request-pickup">`. Set each row `href` **by status**:
   - `requested|scheduled` → `/scheduled?id=${id}`
   - `collected|tested|processed|recovered|certified|cancelled` → `/track/${id}`

## Batch C (Mohammed Ali Syed) — isolated, off critical path
Do **after** A's crash-fixes land (so screens render). Purely visual, no wiring:
- Design consistency pass on the flow screens he owns (spacing, typography,
  wireframe fidelity) using design tokens. No navigation or DB changes.

## Batch A (Aamir + Claude Code) — the seam + crash-fixes + deploy
Detailed implementation planned separately before editing. Summary:
- **Crash-fixes / build-green:** `cancelled` out of ordered `LIFECYCLE_STAGES`
  (`tokens.ts`); add `cancelled` visual to `badge.tsx` + `timeline.tsx`
  (`PickupStatus = LifecycleStage | "cancelled"`); fix `/scheduled` server-side
  `onClick` crash; fix `design-system/page.tsx` build error.
- **Real offer + guards:** `/offer` + `/offer-breakdown` read the real Offer by
  id, vendor-scoped, gated by status; redirect if missing/foreign/ahead.
- **Persist accept (H1/H2):** service-role server action flips `status→collected`
  and writes the `status_event`; tighten the broad vendor UPDATE RLS policy.
- **Seam:** dashboard/handover routing per the model; `/track` offer CTA + working
  cert button; guard pass across flow screens.
- **PWA + deploy.**

---

## One handoff, testing note
Only cross-batch dependency: A's offer screen needs **B's seeded Offer (#1)** to
test end-to-end. Everything else is independent.

## LANE_OWNERSHIP.md entry (paste after heads-up to B & C)
> 2026-07-10 — Shared "netting-up" work consolidated onto A (Aamir): the
> cross-lane navigation seam, flow-screen + component crash-fixes
> (`badge.tsx`, `timeline.tsx`, `tokens.ts`, `scheduled/`, `offer/`, `handover/`),
> and PWA + deploy. Reason: integration + repo-wide config need whole-repo
> visibility. C scoped to visual polish on his own screens; B unchanged.
