# Handover to Khalid — deploy + outstanding work

**From:** Aamir · **Date:** 2026-08-12 · **Updated:** 2026-08-14
**Branch:** merged — everything below is on `origin/main`

The customer-app revamp is code-complete and **merged**. Batches 0A–12 are done.
What's left is the **deploy** (§2), a **prioritised backlog** (§3), and **one
product decision** (§4). Everything here has been verified against the running
app and the live database, not read off older docs.

**Read in this order:** §2 to get it live. §3 after. §1 is history now — skip it
unless you want the record.

## Who does what — read this first

The remaining deploy work splits cleanly, and the split matters because the two
halves need different access:

| Task | Owner | Why them |
|---|---|---|
| **Vercel project, build settings, GitHub sync** (§2.2) | **Khalid** | Repo owner. Proper GitHub-integrated deploys instead of Aamir's manual CLI pushes — this is the whole reason it moved to you |
| **Vercel env vars** (§2.3) | **Khalid pastes, Aamir supplies** | Values live only in Aamir's gitignored `.env.local`. Hand them over out-of-band |
| **GCP OAuth consent + credentials** (§2.1 steps 1–2) | **Either** | Standalone. Whoever has a Google account free for 10 minutes |
| **Supabase provider + redirect URLs** (§2.1 steps 3–4, §4 of DEPLOY.md) | **Whoever owns the Supabase project** | One dashboard pass. Don't split it across two people — the redirect-URL list is per-origin and easy to half-do |
| **Post-deploy smoke against the live URL** (§2.5) | **Khalid** | He'll have the URL first |

**Anything that needs judgement about *which* version of a file is correct goes
to the branch author, not the repo owner.** That was the lesson of §1.

---

## 1. The middleware/proxy collision — RESOLVED 2026-08-14

Kept as a record. Nothing here is outstanding.

Your two commits on `main` (`21cd3bd`, `28a7cca`) renamed `src/middleware.ts` →
`src/proxy.ts` in the **pre-monorepo** layout, while the revamp had moved that
file to `apps/customer/src/middleware.ts`. Two histories renaming the same file
in different directions — git could not auto-merge it, which is why PR #17 was
blocked.

**Resolved in two PRs, both merged:**

- **PR #17** — merged `main` into `feat/customer-v2`, deleted the stray
  `apps/customer/src/proxy.ts` that rename detection dragged in (it was the old
  middleware body), kept the revamp's file. `packages/ui/src/tokens.ts`
  auto-merged and carried your colour change through silently — see §1b.
- **PR #18** — redid the rename properly on the revamp's file:
  `apps/customer/src/proxy.ts`, exporting `proxy`. Build green with
  `ƒ Proxy (Middleware)`, deprecation warning gone, smoke 44/44 and `--blocked`
  44/44 either side.

**Why it mattered who resolved it:** the obvious resolution — keep `proxy.ts`,
delete `middleware.ts` — was the wrong one. Your `proxy.ts` was the old
pre-monorepo middleware, missing `allowRoles: ['customer']` (the role gate),
`onboardingPath: '/onboarding'` (Google sign-in), `/verify` in `publicPaths`
(email OTP), and the matcher exclusions for `manifest.webmanifest` / `sw.js` /
`offline.html` / `icons/` (PWA install + offline page). Choosing correctly
required knowing what the revamp had put in that file — so it belonged to the
branch author. **Route file-version conflicts to whoever wrote the branch.**

### 1b. A colour change auto-merged silently — STILL OPEN

`packages/ui/src/tokens.ts` **auto-merges with no conflict**, so nothing will
warn you. Commit `21cd3bd` bundled an unrelated design-token change in with the
rename:

```diff
- successText: "#15803D",
+ successText: "#0cb349",
```

Measured contrast on the app's backgrounds:

| Value | on white | on success tint | WCAG AA (4.5:1) |
|---|---|---|---|
| `#15803D` (current) | **5.02:1** | 4.56:1 | pass |
| `#0cb349` (yours) | **2.78:1** | 2.53:1 | **fail** |

It's used on success banners, status badges, and the wallet credit amounts. The
comment directly above it in the file says *"darker for WCAG contrast"* — so the
original value was chosen deliberately.

**It merged. `#0cb349` is live on `main` right now** — the auto-merge was not
caught before PR #17 went in. If the lighter green was intentional, fine, but it
needs a different approach than swapping the text shade. If it wasn't, it's a
one-line revert:

```bash
# packages/ui/src/tokens.ts:37
-  successText: "#0cb349",
+  successText: "#15803D",
```

**Khalid's call — it's his change.** Decide before showing anyone (§3, P1 #5).

> **Related, and worth knowing either way:** the palette is duplicated. Every hex
> lives in **both** `packages/ui/src/tokens.ts` (TS object) and
> `apps/customer/src/app/globals.css` (CSS custom properties). Components using
> `colors.successText` read the first; components using the `text-success-text`
> Tailwind class read the second. **Changing one alone gives you a half-applied
> colour** — which is exactly what commit `21cd3bd` would have done. See §3, P2.

### 1c. Current state of `main`

```
5b73954  Merge pull request #18 (middleware → proxy rename)
c240186  Merge pull request #17 (the customer-app revamp)
```

Both merged. `main` builds green, smoke 44/44 both runs. Clone it and start at §2.

---

## 2. Deploying

Full runbook: **`docs/DEPLOY.md`**. Condensed here, in order.

### 2.0 What you need from Aamir (not in the repo)

`.env*` is gitignored, so a fresh clone has no credentials. Get these
**out-of-band — not in the PR, not in a chat channel that logs**:

- `apps/customer/.env.local` — 6 values
- `packages/database/.env` — `DATABASE_URL`, `DIRECT_URL`
- Supabase dashboard access for project **`xlssgnnrtautldouirkt`**

> ⚠ Three keys in `.env.local` are written `KEY = value`, **with spaces around
> the `=`**. dotenv trims them, so it works locally. Vercel's UI does not — a
> trailing space in the *name* field creates a variable nothing reads, and the
> app boots with an undefined Supabase URL. Paste name and value separately.

Also not in the clone: `packages/database/src/generated/` (the Prisma client) —
regenerated by the build, see 2.2.

### 2.1 Google OAuth — required, and not only for production

Google sign-in is **built and merged but enabled nowhere, including localhost**.
Until this is done the button fails soft with readable copy pointing at password
and OTP. That's deliberate, not a bug to chase.

**Google Cloud Console:**
1. **APIs & Services → OAuth consent screen** → *External*. App name, support
   email, developer email. Leave it in **Testing** and add your own Google
   account under **Test users** — publishing triggers a verification review you
   don't need. Default scopes are enough.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   Authorised redirect URI, verbatim, no trailing slash:
   ```
   https://xlssgnnrtautldouirkt.supabase.co/auth/v1/callback
   ```
   ⚠ This is **Supabase's** callback, not the app's. It's the most-mistyped value
   in the whole setup; `.../callback/` or the Vercel origin instead both give
   `redirect_uri_mismatch` at the consent screen. Authorised JavaScript origins
   can stay empty. Copy the client ID + secret.

**Supabase:**
3. **Authentication → Providers → Google** → enable, paste both, save.
4. **Authentication → URL Configuration** → Site URL = the Vercel URL. Redirect
   URLs: `http://localhost:3000/**`, `https://<project>.vercel.app/**`, and
   `https://*-<team>.vercel.app/**` for previews.

**Test on localhost first.** Steps 1–3 make it work there immediately, so any
later failure is step 4 rather than the app. The app needs **no env var** for
this — `oauth-actions.ts` reads the origin from request headers, so localhost,
production and previews all work off one codebase.

First Google sign-in must land on **`/onboarding`**, not `/dashboard`. If it
bounces to `/login` on the deployed origin but works locally, it's step 4.

### 2.2 Vercel project

One project, for `apps/customer` only (`apps/agent` and `apps/admin` are empty
scaffolds — don't deploy them).

| Setting | Value |
|---|---|
| Root Directory | `apps/customer` |
| Include source files outside Root Directory | **ON** (it imports `packages/*`) |
| **Build Command** | `cd ../.. && npx turbo run build --filter=customer` |
| Install / Output | leave default |
| Node | 20.x+ (22.x locally) |

⚠ **The build command must go through turbo.** The generated Prisma client is
gitignored, and `turbo.json`'s build task declares `dependsOn: ["^db:generate"]`,
which is what generates it. A bare `next build` fails with missing types and the
error does not obviously point at Prisma.

`apps/customer/vercel.json` pins `regions: ["syd1"]` — deliberate, the Supabase
pooler is in `aws-1-ap-southeast-2`. If your Vercel plan rejects it, delete the
key; it's latency, not correctness.

### 2.3 Environment variables

Set for Production, Preview and Development. Full table in `DEPLOY.md` §3.
`SUPABASE_SERVICE_ROLE_KEY` is 🔴 secret — bypasses RLS entirely, never
`NEXT_PUBLIC_`. Leave `PAYMENTS_MODE` **unset** (absent → simulated; an
unrecognised value also falls back to simulated, so a typo can never mean "settle
real money").

`DATABASE_URL` must be the **pooled** string (port 6543); `DIRECT_URL` the direct
one (5432). Both are read by Prisma from the schema's `env()` calls, not through
`process.env` in any TS file — so they don't show up in a grep and are easy to
forget.

### 2.4 Database — already applied, don't re-run blind

The live Supabase project already has all 8 Prisma migrations and the four
hand-written SQL files in `supabase/` (`policies.sql`, `grants.sql`,
`storage-policies.sql`, `realtime.sql`) applied. They're re-runnable/guarded, but
you shouldn't need to touch them. `npm run reset-demo` re-seeds 10 demo pickups
and takes ~2 min (it uploads real photo objects).

### 2.5 Verify against the real origin

```bash
SMOKE_BASE_URL=https://<project>.vercel.app npm run smoke
SMOKE_BASE_URL=https://<project>.vercel.app npm run smoke -- agent@test demo1234 --blocked
```

44/44 both times. The second is the role gate — every app route must bounce
`agent@test` to `/login`. If it doesn't, stop and fix that before anything else.

`scripts/smoke.mjs` reads `SMOKE_BASE_URL`, so it's the same 44 assertions with
no change. Baseline before you start: build green (34 routes), lint clean, 142
tests, smoke 44/44.

### 2.6 Demo script

**`docs/DEMO_SCRIPT_HR.md`** — 12 steps, each as *what you do → what should
appear → what to say*. It doubles as the manual test pass. Two steps consume demo
data (accepting the offer, settling the payout), so `npm run reset-demo` before
each run. It's built from the actual seeded rows, not from memory.

---

## 3. Prioritised backlog

Everything known to be outstanding, ranked. **Verify before acting** — a few are
several batches old.

### P0 — blocks the deploy

| # | Item | Owner | Notes |
|---|---|---|---|
| ~~1~~ | ~~Resolve the middleware/proxy collision~~ | — | **Done 2026-08-14**, PRs #17 + #18. §1 |
| 2 | **Enable Google OAuth** (GCP + Supabase) | GCP: either · Supabase: project owner | §2.1. Nothing works on any origin until this is done |
| 3 | **Vercel project + env vars** | Khalid (values from Aamir) | §2.2–2.3. The turbo build command is the one that matters |
| 4 | **Supabase redirect URLs** | same person as #2 | §2.1 step 4. Do it in the same pass as OAuth |

### P1 — before showing anyone

| # | Item | Notes |
|---|---|---|
| 5 | **Decide the `successText` colour** | §1b. Currently a silent WCAG AA regression if merged as-is |
| 6 | **Batch 13 — the full-app scan** | Never done, and **it's yours now**. Brief in `REVAMP_BATCHES_2026-08-09.md`. Every batch verified *itself*; nothing has looked across the seams for cross-batch drift, dead ends, or the two locked rules holding app-wide. **Cheapest high-value slice: `/code-review high` over the branch diff** (or `/code-review ultra` — it's a large diff). Do it *after* the §1 merge, so the review sees the resolved tree rather than the collision |
| 7 | **A real manual pass on a handset** | The one thing no script covers. Accumulated list in `REVAMP_BATCHES` → "Manual checks owed": Google round trip, an OTP code from a real inbox, GPS over LAN http, how a PDF opens on a phone, phone-width layout on payment/history/invoice/profile, and the `cancelled` state against real data |
| 8 | **Fleet vs individual — a decision, not code** | §4. Needs the company's answer, not a sprint |

### P2 — real, in our control, not blocking

| # | Item | Since | Notes |
|---|---|---|---|
| 9 | **Design tokens duplicated** — `packages/ui/src/tokens.ts` vs `apps/customer/src/app/globals.css` | — | Two sources for every hex. Changing one gives a half-applied colour. Found while checking §1b |
| 10 | Orphaned booking-draft photos are never swept | 7B | `wipeStorage` only cleans on reseed. Needs a real sweep before launch |
| 11 | P5-B: GST / PAN / EPR **format** validation | 6 | Presence-only today, deliberately. This was always your half |
| 12 | Forgot-password is still a disabled button | 6 | OTP partly covers it, so it dropped in priority |
| 13 | Role gate costs one `profiles` read per request | 6 | Real fix is a custom access-token hook putting `role` in the JWT — dashboard config, not code |
| 14 | No wallet redemption ("withdraw to bank") | 8 | Needs bank details the app never collects. `WalletTxnKind.redemption` already exists |
| 15 | No "switch account type" flow | 6 | `vendor_type` deliberately not self-updatable. Add it to the `grants.sql` UPDATE allowlist when that screen exists |
| 16 | No account linking (same email via Google *and* password) | 11 | Supabase identity-linking behaviour, untested |
| 17 | `draftFromPickup` has no unit test | 10 | App-local, and apps hold no tests. Covered end-to-end by a smoke assertion instead |
| 18 | Two B2B-flavoured strings survive the Batch 5 rewrite | — | §4. Cosmetic |

### P3 — waiting on the company, do not invent answers

Each is a value change in one file once answered.

| Item | Where the answer lands |
|---|---|
| 🔴 **CO₂e factor values are unsourced; the citations are unverified** | `packages/core/src/impact.ts`, plus the copy restated in the seed. Only the *relative ordering* is defensible. Open question 7 |
| Exact CPCB column set for the compliance CSV | `COLUMNS` in `apps/customer/src/lib/compliance-export.ts` |
| Whether GST applies to scrap from an unregistered individual, and at what rate | `taxPaise` is 0 today; the column and the invoice line already exist |
| Authoritative EPR certificate layout | `packages/pdf/src/templates/certificate.tsx` only — the query and `CertificateDoc` are separate from it |
| Which segment is the go-to-market wedge | §4 |

### Already fixed — don't re-open

- ~~`/handover` mutates on GET~~ — fixed in Batch 12. Accept is now a POST form
  action; the page is a pure read and is finally in the smoke test (42 → 44).
- ~~`/handover` rendered `null units`~~ — it was reading schema-v1 columns
  (`battery_type`, `approx_quantity`) that nothing has written since Batch 5.
- ~~Google button layout~~ — the mark now goes through `Button`'s `leftIcon`
  prop instead of being a child, so it can't ride the text baseline or wrap.

---

## 4. Fleet vs individual — where it actually stands

Aamir flagged that he's only ever tested `business@test`, which is an
**individual** account. Here's what I found.

### What's implemented

`vendorType` is collected at signup and at `/onboarding`, and after that it is
read in **exactly three places** in the whole codebase:

| Where | What it does |
|---|---|
| `profile/page.tsx:98` | `isFleet` → renders the "Business details" card (company, GST, PAN, EPR reg ID, business address) |
| `lib/documents.ts:102` | prints `"Fleet / company"` vs `"Individual"` as a string on the EPR certificate PDF |
| the signup / onboarding forms | *collecting* it |

**Nowhere else does behaviour branch on it.** Not the dashboard, booking,
pricing, tracking, compliance, invoices, or the wallet.

### The honest verdict: this is not an overlooked requirement

Worth being precise, because it changes what to do about it.

The company's document (**§7.1**) says: *"Decide your primary go-to-market
wedge… Many successful battery-recycling platforms in India end up doing both,
but usually start with one."* **It asks the company to pick one — it does not ask
for two flows now.** "Which segment is the wedge" went out as **open question 6**
on 2026-08-07 and was never answered.

The team decision on 2026-08-07 was **"split the schema now, split the screens
later"** — screens are cheap to rewrite, a live data model isn't. Judged against
that, the outcome is roughly what was intended. The wireframes contain **zero**
mentions of fleet, recurring, depot or bulk, so nothing designed was skipped.

### But three things are genuinely worth raising

**1. The schema split was only half done.** The recommendation was to split the
schema *now* precisely because it's expensive later. The **Profile** side was
split (`vendorType`, `companyName`, `gstNumber`, `panNumber`, `eprRegId`,
`businessAddress` all exist and are written). The **Pickup** side was not:

- `Pickup` still encodes one address (`addressId`), one date (`preferredDate`),
  one site (`location`). A fleet with several depots can't express itself.
- There is **no recurrence entity** — I checked every model in the schema. Bulk
  collection is contracted and repeating; individual is on-demand.
- `Offer`, `Certificate` and `PickupReceipt` are all 1:1 with `Pickup`, so an
  invoice covering thirty pickups has nowhere to live. (`Invoice.pickupId` *is*
  nullable for a future period-level invoice — a partial nod, nothing writes one.)

If the company picks **bulk/fleet** as the wedge, that's a migration plus every
screen that reads `Pickup`. Worth saying out loud before the answer arrives.

**2. There is no fleet account in the seed, so the fleet path has never been
seen.** `npm run reset-demo` creates one customer — `business@test`, individual —
and all 10 demo pickups belong to it. The live database does contain three fleet
profiles (`tanveer@back`, `sadasd@ss`, `firm@aaron`), but they're manual test
junk with placeholder values, and **none of them owns a single pickup**.

So the fleet half of what *is* built — the business-details card, the
`Fleet / company` line on the certificate — has never been rendered with real
data by anyone. **This is the cheap one:** adding a second seeded account with a
plausible company, GST/PAN/EPR and a couple of pickups makes the whole fleet path
demoable and testable, and costs one edit to `reset-demo.ts`. Recommended
regardless of what the company decides.

**3. Two B2B-flavoured strings survive the Batch 5 rewrite.** The 2026-08-07
review found the old form was written for warehouses throughout. The wizard was
rewritten and that's now mostly fixed — `CATEGORY_HINTS` explicitly serves
non-experts (*"Phone, laptop, power-tool and e-bike cells"*). Two leftovers:

- `book/page.tsx:129` — *"Add your warehouse or site address"*
- `book/StepSchedule.tsx:121` — placeholder *"Access via gate B, ask for Ravi on
  arrival, loading bay closes at 5pm…"*

Cosmetic, and only wrong for the individual path. (`AddressForm.tsx:99`'s
*"Warehouse, Home, Depot 2"* is fine — it covers both.)

### What to do

Nothing structural until the company answers open question 6. Do **#2** — the
seeded fleet account — because it's cheap and it removes a blind spot. Put **#1**
in front of them as the cost of the bulk answer, so it's priced before it's
chosen rather than after.

---

## 5. Repo facts worth having

- **Branch:** merged. `feat/customer-v2` → PR #17, then the rename → PR #18. Work
  from `main`; both feature branches can be deleted.
- **Baseline:** `npm run build` green (34 routes) · `npm run lint --force` clean ·
  142 tests · `npm run smoke` 44/44 · `--blocked` 44/44.
- **Accounts:** `business@test` / `businesstest` (customer, owns everything) ·
  `agent@test` and `admin@test` / `demo1234` (both correctly *blocked* from the
  customer app — that's the role gate, not a broken account).
- **Docs, in reading order:** `REVAMP_BATCHES_2026-08-09.md` (live status +
  batch-by-batch reasoning) → `DEPLOY.md` → `DEMO_SCRIPT_HR.md` →
  `PLAN_V2_CUSTOMER_APP.md` (decisions D1–D7) → `COMPANY_FLOW_REVIEW_2026-08-07.md`
  (the company's documents analysed against what we built).
- ⚠ **Do not read `PROJECT_STATE.md` below its top section** — it describes the
  pre-monorepo app and will actively mislead on file paths.
- **Supabase free tier pauses after ~7 days idle.** The first request after a
  pause is slow enough to look broken — open the site ten minutes before any
  demo.
