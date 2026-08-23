# Before You Push — the second glance

> **Read this before every push.** Not a style guide — every item below has
> already cost someone on this team an hour, or would have reached a demo.
>
> `CLAUDE.md` links here from the top, so it loads every session. Keep it short:
> if something stops being a live trap, delete it.

---

## 1. A push to `main` is a deploy

No branches, no PRs, **and no CI** — there are no GitHub Actions in this repo.
Both Vercel projects build off `main`. Your laptop is the only gate between a
commit and the live site.

Run what matches what you touched:

| You changed | Run before pushing |
|---|---|
| only `docs/` | nothing |
| anything in `packages/` | `npm run build` + `npm run test` |
| a route or a server action | `npm run build` + `npm run smoke -- --app=agent` |
| schema, seed, or auth | all three, both apps |

**`npm run build` is never optional** — it type-checks every app and package,
and a type error is a red deploy.

⚠ **`npm run build` never renders a page with a session.** A server component
that throws at request time builds green and 500s in the browser. `npm run smoke`
is the only thing that catches it. Add every new route to `ROUTES` in
`scripts/smoke.mjs` as it lands.

---

## 2. Git, minus the ceremony

Set once, then never think about it again:

```bash
git config --global pull.rebase true      # no merge-message editor
git config --global rebase.autoStash true # no complaints about dirty files
```

Then the whole workflow is `commit` → `pull` → `push`.

- **Commit whenever something works** — that's free and local. One feature per
  commit; don't bundle unrelated changes.
- **Push at natural stopping points**, a few times a day. Conflicts scale with
  how long you sit on unpushed work, not with how often you push.
- `scripts/smoke.mjs` is the one file all three of us edit. Expect the occasional
  conflict there and nowhere else — keep both sides' routes.
- Stuck mid-rebase? `git rebase --abort` puts everything back. Nothing is lost.

---

## 3. Shared-database rules — these have already bitten us

All three of us point at **one Supabase project**. The two apps are separated by
`profiles.role` at the proxy, not by project.

- **Announce before `npm run reset-demo`.** It wipes the data the other two are
  mid-test on.
- **`reset-demo` is not recovery.** It restores rows — not grants, not policies.
- **Missing grants don't look like an outage.** The app *half*-works: Prisma
  pages render, Supabase-client pages render **empty with a 200**, API routes
  401, and `/onboarding` lets an onboarded session through — because the auth
  guard deliberately fails **open** on an infrastructure error. If `npm run smoke`
  reads a weird fraction with no single obvious cause, **check grants first**,
  then re-apply in this order:
  `grants.sql` → `policies.sql` → `storage-policies.sql` → `realtime.sql`.
- **Only one person runs migrations.** `agent_app_v1` is meant to be this
  sprint's only one. History is baselined now, so the next one is an ordinary
  `migrate deploy` — but two people applying migrations to a shared DB loses an
  afternoon.

---

## 4. The traps that pass code review

**Auth**
- **The guard must stay at `apps/<app>/src/proxy.ts`.** At the project root with
  `src/app` in use, Next's dev bundler silently never registers it — and an
  unregistered auth guard fails **OPEN**.
- Every agent lifecycle write is a `"use server"` action using
  `createAdminClient()` that **re-verifies `pickup.agentId === user.id` in code**,
  because the service role bypasses RLS. Read the session identity from
  `createClient().auth.getUser()` — **never trust an id that came from the form.**
  Reference implementation: `apps/customer/src/app/(app)/handover/actions.ts`.

**Imports**
- **Never import from `@prisma/client`** — use `@clbipp/database`, which
  re-exports the client and every model type and enum.
- Shared code is never reached with `@/`. Inside an app, `@/*` is that app's
  `./src/*`; anything shared comes from `@clbipp/<pkg>`.
- **`formatPaise` in a *client* component comes from `@clbipp/core/format`**, not
  the barrel. The barrel re-exports `booking-actions` / `payment-actions`, so a
  value import from it drags Prisma into the browser bundle.

**Money**
- Integer paise everywhere. Never a float, never rupees, never a local `/100`.
- The decision engine returns **rupee floats** — convert at the boundary with
  `rupeesToPaise`, and nowhere else.

**Lifecycle**
- Nine stages, locked. No migration adds one. Never re-declare the stage array in
  a screen — use `isLifecycleStage` / `isStageBefore` / `STAGE_LABELS` from
  `@clbipp/ui`.

**Agent screens**
- **Every agent screen passes `hideNav` to `AppShell`** and adds **no** bottom
  padding. `(agent)/layout.tsx` renders `<AgentTabBar />` and owns the clearance;
  `AppShell`'s built-in bar is the *customer's*. Forget `hideNav` and you render
  two navs; add your own padding and you double-pad. `npm run smoke` fails on
  anything but exactly one `aria-label="Main navigation"`.

**Vendor visibility (customer app — the agent app is its inverse)**
- **No recovery-rate % shown to the vendor, anywhere.** Hard rule.
- Material-by-material valuation stays off vendor offer and tracking screens.
  What the customer was *paid* is visible; how we *valued* it is not.
- Nothing from an agent screen may leak onto a vendor screen.

**Decision engine**
- 🔴 **A change that moves a price must say so explicitly in its commit message.**
  Silent economics drift is the one failure nobody notices until a demo.
- Fix defects; don't refactor it because it could be nicer. Where the engine and
  the HR documents disagree, **the HR documents win.**

**RLS (added 2026-08-24, Batch 8)**
- 🔴 **A policy that sub-selects from another table is filtered by *that*
  table's policies.** So a perfectly-written policy can match zero rows because
  the table it joins to has no policy for that role — and it fails **silently**:
  the query succeeds, returns nothing, and a Realtime channel still reports
  `SUBSCRIBED`. Measured on the agent app: 44 rows vs 0.
- **Verify every new policy under a real JWT for that role.** A `service_role`
  query proves nothing — it bypasses the exact layer you are testing.

**Smoke assertions (added 2026-08-24, Batch 8)**
- ⚠ **React splits adjacent text nodes with `<!-- -->` in server HTML.** So
  `{n} load to drop off` written as JSX text is never a contiguous string and
  `body.includes(...)` silently never matches. Any string `scripts/smoke.mjs`
  asserts on must be **one template literal inside a single `{}`**.

**Dev server (added 2026-08-24, Batch 8)**
- ⚠ **`npm run build` then `npm run dev` on the same app 404s every dynamic
  route** (`/job/[id]`, `/pickups/[id]`, …) while static routes serve 200, with
  no Prisma query logged. It looks exactly like a seed or ownership bug and is
  neither: it is a stale `.next`. `rm -rf apps/<app>/.next` and restart. This
  bites hardest when you run `build` and `smoke` back to back — which is the
  pre-push sequence.

---

## 5. Ordering that actually matters

Everything else runs in parallel — the seam table in §4 of
`PLAN_FIELD_AGENT_APP.md` exists so no one waits.

- **Batch 5b before Batch 6.** Collect reads `Offer.acceptedAt`; 5b is what stops
  the customer app writing `collected`. Wrong order = a double write on the
  lifecycle. This is the highest-risk correctness item in the plan (D7/W9).
- **Batch 5a does *not* wait on Batch 4.** Build the quote screens against the
  mock `QuoteOutput` in `packages/core/src/mock-data.ts`; swapping to the real
  `POST /api/quote` is a one-line import change.
- **Batch 1 sets the service-role write pattern** every later agent write copies.
  Read it rather than inventing one.

---

## 6. Lanes are not a gate

If something blocks you, **do it — then log it** in `docs/LANE_OWNERSHIP.md`.
Waiting is the expensive failure this sprint, not stepping on toes. Attribute
work to whoever actually did it. Phase *sequencing* is still fixed; ownership
isn't.
