# CLBIPP — Context & Decisions

> **Stable reference.** The things that don't change often: what the project is,
> the stack, decisions made and *why*, conventions. For live status see
> `PROJECT_STATE.md`. Update this only when a real decision changes.

---

## What the project is

**Closed-Loop Battery Intelligence & Pricing Platform (CLBIPP).** A platform for
battery recovery + EPR compliance. A vendor offloads used batteries; a field agent
assesses and quotes them; an admin oversees pricing rules and compliance. A
deterministic engine picks the pathway (Reuse / Refurbish / Recycle) and a price.

Three-person internship build. Three surfaces, built in sequence:
1. **Vendor / Client app** — ✅ built, merged to `main` 2026-08-15.
2. **Field Agent app** (**current sprint**, from 2026-08-20) — on-site intake →
   assessment → quote → collect → hub drop-off.
3. **Admin dashboard** (later) — config, oversight, compliance reporting.

---

## Stack

- **Next.js** (TypeScript, App Router)
- **Prisma** → **Supabase Postgres** (Prisma manages table structure)
- **Supabase Auth / Realtime / Storage**
- **Tailwind + shadcn/ui**
- **Vercel** (deploy; preview URL per PR)
- **Vitest** (tests)
- PWA via app manifest + service worker

One repo, three apps separated by route folders. Shared code at root.

---

## Decisions made (and why)

**Field Agent app decisions D0–D10 live in `PLAN_FIELD_AGENT_APP.md` §1**, not
here — they are sprint-scoped and settled. This section holds the decisions that
outlive a single sprint.

- **Vendor app built first.** It was the surface guaranteed to ship and the one
  the lead circulates for feedback. Done; field agent is now current.
- **Decision engine is NOT in the vendor app.** The vendor side never shows
  internal pricing mechanics. On the vendor side, offers + status changes come
  from the seed/sim surface, not the engine.
  **The Field Agent app is where the engine actually runs** — and as of
  2026-08-18 (D0) it is **live code, not a parked artifact**: it may be corrected
  or extended, and where it and the HR documents disagree, **the HR documents
  win**. It carries 20 tests and a live pricing surface, so fix defects rather
  than refactoring, and any change that moves a price says so in its PR.
- **The agent sees everything the vendor doesn't.** Full revenue, every cost
  line, net value, margin %, and the price band. This is the deliberate inverse
  of the vendor-visibility rules below, not an exception to them — nothing
  agent-side may leak onto a vendor screen.
- **No recovery rate % shown to the vendor — hard rule.** Lead's explicit
  instruction; the company's flow document doesn't ask for it either.
- **No recovered value shown to the vendor — a default, not a hard rule**
  (corrected 2026-08-07; it had been recorded here as "ever"). Offer carries price
  + qualitative rationale only; material weights appear on the EPR certificate (a
  compliance doc), not on offer/tracking.
  **Scoped, not lifted, in Batch 8 (2026-08-09):** Plan v2 **D6** relaxes the rule
  for the money surfaces the company explicitly asks for, and those now exist —
  `/payment/[id]`, `/wallet`, `/receipt/[id]` and the invoice PDF all show ₹,
  because a payout you cannot see the amount of is not a payout. **`/offer`,
  `/offer-breakdown` and `/track` are untouched and stay weight-only**, and the
  separate **no recovery-rate %** rule is unaffected everywhere. What is still
  withheld is the *material-by-material valuation* (`Offer.materialBreakdown`'s
  `value_paise` / `Offer.deductions`) — that is the internal pricing mechanics,
  and it is a different question from "what were you paid".
- **Battery *category* is the customer's question; *chemistry* is the field
  agent's** (from the company flow document, 2026-08-07 — proposed, not yet
  built). The doc's §3.A gives the customer a category (portable / automotive /
  industrial / EV) and its §4 step 3 has the on-site partner tag chemistry. They
  are near-independent axes — an EV pack may be NMC or LFP — so our `BatteryType`
  enum can't answer "kg collected by category", which is how EPR reporting is
  aggregated. Our booking form currently asks the customer for chemistry, i.e. the
  field agent's question.
- **Prisma stays** (already set up). B extends the existing Prisma schema with the
  vendor tables. RLS is written separately as raw SQL (Prisma has no RLS concept) —
  no conflict, different layers of the same database.
- **Individual vs Fleet split at signup.** Individual = minimal fields. Fleet =
  GST + PAN + business address + EPR ID + KYC document upload.
- **Email confirmation OFF for now.** This sprint's build is evaluated by the
  team only (lead circulates it for feedback), so requiring every tester to
  confirm an email adds friction with no anti-abuse payoff. Auth stays secure —
  passwords, sessions, and RLS all still apply. Flip ON (Supabase dashboard
  toggle + add `src/app/auth/confirm/route.ts` for the callback) when promoting
  toward production.
- **Single repo, not three.** All apps share schema, auth, components — splitting
  would duplicate the foundation or add packaging overhead. Separate by route folder.
- **Phase sequencing is fixed; lane ownership is strict-by-default but shiftable;
  the technical "how" is open.** Claude Code (or anyone) can propose a better
  implementation approach for a task. Phase *order* stays fixed. Lane *ownership*
  holds by default but can move when a task straddles lanes — by agreement,
  flagged, and logged in `LANE_OWNERSHIP.md`. The "who" is a team decision, not a
  silent one.

## Decisions explicitly deferred (do not build yet)

- Green points / coupon / rewards system (future phase). **Update 2026-08-07:** the
  company flow document lists a wallet with cash payout or redeemable rewards
  (green coins, gold/silver, coupons) as a Customer App capability, and scopes
  gamification to the *individual* segment. Asked them whether it's in this round
  and for which customer type — still deferred until they answer.
- Blockchain / crypto rewards idea (future, lead's long-term vision).
- CPCB "return" export logic (flagged a vulnerable spot; lead to finalize ~July 1).
- Decision-engine input tuning (waits on real feedback).
- ~~Bulk-sell flow for fleets (unconfirmed — may just be repeated requests).~~
  **Confirmed real, 2026-08-07.** The company flow document (§5.4) asks for two
  segments with genuinely different flows: individuals get a lightweight
  high-frequency flow with rewards; bulk generators (societies, EV fleets,
  retailers, telecom towers, UPS operators) get a B2B flow with scheduled/recurring
  pickups, invoicing and EPR reporting. It is **not** just repeated requests — our
  `Pickup` row encodes one vendor / one address / one date / one battery type, and
  `Offer` and `Certificate` are both 1:1 with `Pickup`, so recurring collections
  and one-invoice-many-pickups have nowhere to live. A's position: **split the
  schema now, split the screens later**. Note §7.1 of the same document says to
  pick one go-to-market wedge first — we've asked which. Still not started;
  awaiting the company's reply.

---

## Conventions

- Next.js App Router: pages at `src/app/[route]/page.tsx`, APIs at `src/app/api/[route]/route.ts`.
- Pure logic in `src/lib/`. Tests next to source as `*.test.ts`, run with `npm test`.
- Branch naming: `feat/<scope>`. No direct pushes to `main` — branch → PR → 1 review → merge.
- Supabase setup (Storage policies, Realtime, RLS) written as SQL in a versioned file,
  not configured via dashboard clicks (reproducible + reviewable).
- Wrap Supabase calls in helpers in `src/lib/supabase-*.ts` rather than scattering
  client calls across pages.
- **Bottom-nav clearance belongs to `(app)/layout.tsx`, never to a page** (Batch
  6.5). That layout renders the fixed `BottomTabBar`, so it also owns the padding
  that keeps content clear of it. A new authenticated screen passes `hideNav` to
  `AppShell` (so a second bar isn't rendered) and adds **no bottom padding of its
  own** — adding some double-pads. This was previously each page's job and four
  screens forgot, which put their bottom-most control underneath the bar where it
  was only reachable by over-scrolling. `npm run smoke` asserts exactly one
  `aria-label="Main navigation"` per authenticated page.
- **Don't mutate on a GET render.** A server component that performs a write when
  the page loads (as `handover/page.tsx` still does) can't be smoke-tested,
  double-fires on refresh, and can be triggered by a link prefetch. Writes go in
  a `"use server"` action invoked by a form or a POST.

## Git workflow (learned 2026-07-06 — do not repeat these mistakes)

**Simple rule for every feature:** one branch, finish work, commit, push, open one
PR targeting `main`, merge, done. Don't stack PRs.

**If you must stack PRs** (rare): merge each PR in order AND tick "Delete branch"
on GitHub's merge confirmation for each one. GitHub only auto-retargets the next PR
to `main` when the base branch is deleted. If you don't delete it, PRs merge
sideways into their base branch instead of landing on `main`.

**Stacked PRs are not worth it at this team's pace.** One PR per feature targeting
`main` directly is simpler and safer. Granularity lives in individual commits, not
in the PR structure.

**Merge conflicts on `prisma/schema.prisma`:** schema is B's file. If you hit a
conflict, always resolve by keeping `main`'s version:
`git checkout origin/main -- prisma/schema.prisma`

## Status lifecycle (locked contract)

`requested → scheduled → arrived → offered → collected → tested → processed →
recovered → certified` (plus `cancelled`). This is the shared state machine the
whole app codes against.

**Changed 2026-08-09 (Batch 7A) — `arrived` and `offered` added.** Agreed,
migrated (`20260809124400_lifecycle_arrived_offered`), and locked again at nine
stages.

- **Why:** the company flow document has the agent assess and quote *on site*,
  which is two events, not one. And before this, "an offer exists" was an
  implicit sub-state of `scheduled` (an `Offer` row existing) rather than a
  status — the mismatch between that and the `/offer` status guard is exactly
  what made both offer screens unreachable in the demo until Batch 6.5 patched
  the seed. `offered` makes an offer addressable instead of inferred.
- **Why `arrived` before `offered`:** assessment precedes quoting. The indicative
  quote the customer sees at booking is a different thing — it lives on
  `Pickup.indicativeQuotePaise`, not on an `Offer` row — so the two coexist.
- **Enum order is explicit in the migration** (`ADD VALUE … AFTER …`, not a plain
  append), so the Postgres sort order matches the logical order.
- **Adding a stage later touches four lists, not fourteen screens.** Screens ask
  `isLifecycleStage` / `isStageBefore` from `@clbipp/ui` instead of re-declaring
  the array — `track/[id]` and `t/[token]` each carried a private duplicate
  before 7A, and those were the drift risk.

---

## Key project files (in project knowledge)

- `markdown-preview.pdf` — **the company's flow document**, sent by HR after they
  reviewed our first vendor draft. Their intended flow for the app. Image-only PDF
  (6 pages, no text layer — render it to read it).
- `COMPANY_FLOW_REVIEW_2026-08-07.md` — that document reviewed against what we
  built: gaps by area and owner, plus open questions sent back to the company.
- `CLBIPP_Vendor_Wireframes_1.html` — current vendor UI, 17 screens. Source of truth for layout.
- `CLBIPP_Vendor_Flows_v3.docx` — vendor-side process flows (V1–V6) behind the wireframe.
- `CLBIPP_Vendor_Build_Plan.pdf` — the 2-week vendor build plan with lanes + phases.
- `CLBIPP_Process_Map_v2.docx` — three-sided process map (vendor / agent / admin).
- `DecisionSystemBreakdown.pdf` — engine spec (relevant to the LATER field-agent app, not this sprint).
- `Price_Discovery_Platform.docx` — original platform brief.
- `team_tasks_v2.pdf` — older full-project task breakdown (superseded for vendor scope by the build plan).

## Ground rules

- Daily 10-min standup, voice, no agenda.
- Blocked > 2 hours → say so in group chat immediately.
- Finished something others wait on → announce it explicitly.
- Contracts (offer shape, status lifecycle) locked in tracker before deep coding.
- Last two days are for fixing, not new features.
