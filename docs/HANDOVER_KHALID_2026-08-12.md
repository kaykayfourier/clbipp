# Handover to Khalid — deploy + outstanding work

**From:** Aamir · **Written:** 2026-08-12 · **Updated:** 2026-08-15
**State: the deploy is LIVE and verified.** https://clbipp-customer.vercel.app —
smoke 44/44, role gate 44/44. **One item left, and it's yours: Google sign-in
(§3.3 + §3.4).** Everything else in this document is now reference.

**This is the only document you need** — self-contained, follow it top to bottom.
(`docs/DEPLOY.md` is the longer reference behind §3; you shouldn't need it.)

---

## 0. Where things stand. Read this before anything else.

**Your Vercel project is the only one** (decision 2026-08-14). Aamir's second
project was unlinked and deleted. One project, yours, GitHub-synced,
auto-deploying on every merge to `main`. Don't recreate the old setup.

**The deploy is done.** §3.1 (build settings) and §3.2 (env vars) are correct and
the site is live — no more failed-deployment emails. The rest of §3 is kept as
the record of *why* each setting is what it is, not as work to do.

**What's left for you: §3.3 (Google Cloud OAuth) + §3.4 (Supabase provider and
redirect URLs).** One sitting, unhurried, nothing blocking it.

> **How the deploy got fixed, 2026-08-15 — worth 60 seconds of your time.**
> Three bugs, and **all three built green**: the Prisma engine path (code, PR
> #20), then `DATABASE_URL`, then `SUPABASE_SERVICE_ROLE_KEY` — the last two both
> the §2 whitespace trap. Each one masked the next, so every fix looked like it
> had failed until the error was re-read.
>
> The takeaway for anything you touch from here: **a green build says nothing
> about production.** Verify with the §4 smoke suite against the live URL.
> Full trail in `REVAMP_BATCHES_2026-08-09.md` → "Batch 12 — where the deploy
> actually stands".

### What's left — the whole job, in order

1. **§3.3** — Google Cloud: consent screen, then an OAuth client ID. The
   redirect URI is **Supabase's**, not the app's — the most-mistyped value here.
2. **§3.4** — Supabase: enable the Google provider with those credentials, then
   register the redirect URLs. **Same sitting as step 1.**
3. Test the round trip by hand: a fresh Google account must land on
   **`/onboarding`**, not `/dashboard` and not `/login`.

**Not urgent.** Google sign-in currently fails soft with readable copy pointing
users at password and OTP login, both of which work in production. Nothing is
blocked on this — the demo runs today on `business@test` / `businesstest`.

The app needs **no env var** for OAuth; it reads the origin from request headers,
so localhost, production and previews all work off the same code.

| Task | Owner | Status |
|---|---|---|
| **Vercel build settings + env vars** (§3.1–3.2) | you | ✅ **done** 2026-08-15 |
| **Verification** (§4) | Aamir | ✅ **done** — 44/44 + role gate 44/44 against production |
| **Google Cloud OAuth** (§3.3) | **you** | ⬜ **next, and it's the only thing on your plate** |
| **Supabase provider + redirect URLs** (§3.4) | **you** | ⬜ same pass as §3.3 — don't split it |

**Everything else in this document is reference.** §3.3 + §3.4 are the whole
remaining job. They're one sitting, and §3.4 has a trap worth reading twice: the
redirect-URL list is **per-origin**, and a missing entry is why a login lands on
the wrong site.

> **The merge conflict is done.** PRs #17 and #18 resolved it on 2026-08-14 —
> record in §7. Nothing for you to do. Rule going forward: **conflicts about
> which version of a file is right go to whoever wrote the branch**;
> infrastructure goes to the repo owner.

> **§1 (local setup) is optional.** If the deploy just works, skip it. It's there
> for when you need to reproduce something locally.

---

## 1. Get it running locally first

Do this before touching Vercel. If it works here, deploy problems are config, not
code — and you'll know which.

```bash
git clone <repo> && cd clbipp
git checkout main
npm install                    # from the ROOT — it's an npm-workspaces monorepo
```

Then create the two env files from their templates and fill in the values Aamir
gives you (§2):

```bash
cp apps/customer/.env.example apps/customer/.env.local
cp packages/database/.env.example packages/database/.env
```

**Both files are required.** Prisma reads `DATABASE_URL` / `DIRECT_URL` from
`packages/database/.env` via the schema's `env()` calls — the app's `.env.local`
alone is not enough, and the failure looks like an unrelated Prisma error.

```bash
npm run dev                    # http://localhost:3000
```

Log in as `business@test` / `businesstest`.

**If something fails, it is almost always one of these three:**

| Symptom | Cause |
|---|---|
| Missing `@prisma/client` types, or a Prisma error on any page | The generated client is gitignored and not in your clone. `npm run dev` and `npm run build` regenerate it via turbo — but only if you ran them from the **root**. Never run `next build` directly |
| App boots with an undefined Supabase URL | An env value didn't land. See the whitespace warning in §2 |
| Everything 500s, or the DB looks empty | Supabase free tier **pauses after ~7 days idle**. Open the Supabase dashboard to wake it, wait a minute, retry |

Baseline once it's up — all four should pass:

```bash
npm run build                                    # green, 34 routes
npm run test                                     # 142 passing
npm run smoke                                    # 44/44
npm run smoke -- agent@test demo1234 --blocked   # 44/44, all bounce to /login
```

That last one is the role gate: `agent@test` and `admin@test` are *supposed* to
be locked out of the customer app. That's not a broken account.

`npm run reset-demo` re-seeds 10 demo pickups (~2 min, it uploads real photos).

---

## 2. The credentials — you already have these

Aamir has sent you the values. `.env*` is gitignored, so they're not in the repo
and never will be. The `.env.example` files list every key with a comment
explaining what it is:

- `apps/customer/.env.example` → 5 keys
- `packages/database/.env.example` → 2 keys (the same `DATABASE_URL` /
  `DIRECT_URL`; Prisma needs them here too, for migrations and the seed)

You'll also want **Supabase dashboard access** for project
**`xlssgnnrtautldouirkt`** — needed for §3.4, not for the URL.

> ⚠ **This trap bit twice on 2026-08-15 — it is the single most expensive thing
> in this document.** Three of the values are written `KEY = value`, with spaces
> around the `=`. dotenv trims them so they work locally; **Vercel's UI does
> not.** Both `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` landed with a
> leading space and had to be deleted and re-added.
>
> How each one failed — note that **neither produced a build error**:
> - `DATABASE_URL` → `the URL must start with the protocol postgresql://`, and
>   every database-backed screen 500s.
> - `SUPABASE_SERVICE_ROLE_KEY` → **no error at all.** Storage signing fails,
>   `createSignedUrls` logs and drops the URLs, and pages return 200 with images
>   silently missing.
>
> Paste name and value separately, and check that the value's **first character
> is the real one** (no space, no quote, no `KEY=` prefix). **If a deploy builds
> green but the site misbehaves, look here first.**

🔴 `SUPABASE_SERVICE_ROLE_KEY` **bypasses RLS entirely.** Never prefix it with
`NEXT_PUBLIC_`, never use it client-side, never paste it into a chat or a PR.

---

## 3. Deploy

### 3.1 Vercel build settings — ✅ DONE, kept as the record

> Already correct in your project. Don't change these. The table below is what
> they should be, and the ranked list under it is why — useful only if something
> regresses.

**First, read the actual error.** Don't guess: **your** Vercel dashboard →
your project → **Deployments** → newest failed one → **Build Logs**. The last
~20 lines name the cause. Everything below is the likely fix, ranked — but the
log tells you which one in ten seconds. (Aamir cannot see these logs; the project
is in your account, not his.)

Target state. **Settings → Build & Deployment**, one project for `apps/customer`
only (`apps/agent` and `apps/admin` are empty scaffolds — don't deploy them):

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| **Root Directory** | `apps/customer` |
| **Include source files outside of the Root Directory** | **ON** (it imports `packages/*`) |
| Install Command | leave default |
| **Build Command** | `cd ../.. && npx turbo run build --filter=customer` |
| Output Directory | leave default (`.next`) |
| Node version | 20.x or later |

**Most likely causes of the failures, in order:**

1. **Build Command isn't the turbo one.** The generated Prisma client is
   gitignored and therefore absent from the fresh clone Vercel builds from.
   `turbo.json`'s build task declares `dependsOn: ["^db:generate"]` — that's what
   generates it. A bare `next build` dies on missing `@prisma/client` types, and
   **the error does not mention Prisma**, so it reads as a random type error.
   This is the single most likely cause.
2. **Root Directory isn't `apps/customer`**, or **"Include source files outside
   the Root Directory" is OFF** — either breaks every `@clbipp/*` import.
3. **Env vars missing.** `DATABASE_URL` / `DIRECT_URL` are read by Prisma from
   the schema's `env()` calls, not via `process.env` in any TS file, so they
   don't show up in a grep and are the easiest to forget. See §3.2.
4. **Region rejected.** `apps/customer/vercel.json` pins `regions: ["syd1"]` to
   match the Supabase pooler in `aws-1-ap-southeast-2`. If the plan rejects it,
   **delete the `regions` key** rather than fighting it — it's latency, not
   correctness.

After changing settings, **Deployments → ⋯ → Redeploy** (settings changes don't
retrigger a build on their own), and uncheck "use existing build cache".

`apps/customer/vercel.json` pins `regions: ["syd1"]` — deliberate, the Supabase
pooler is in `aws-1-ap-southeast-2` (Sydney). If your plan rejects the region,
delete the key rather than fighting it. It's latency, not correctness.

### 3.2 Environment variables — ✅ DONE, kept as the record

> All five are set and correct. Two of them had to be re-pasted (see the
> whitespace box in §2). Change nothing here unless a key is rotated.

All five, for **Production, Preview and Development**:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public by design; RLS is the boundary, not this key |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔴 secret, bypasses RLS |
| `DATABASE_URL` | the **pooled** string, port 6543 — serverless opens many short-lived connections |
| `DIRECT_URL` | the **direct** string, port 5432 |

**Leave `PAYMENTS_MODE` unset.** Absent → `simulated`, and an unrecognised value
also falls back to simulated, so a typo can never mean "settle real money".

### 3.3 Google Cloud — OAuth credentials ⬅ **YOUR REMAINING WORK STARTS HERE**

Google sign-in is built and merged but **enabled nowhere, including localhost**.
Until §3.3 + §3.4 are done the button fails soft with readable copy pointing at
password and OTP login, both of which work. That's deliberate, not a bug.

**Do §3.3 and §3.4 in one sitting** — §3.4 registers the redirect URLs that §3.3's
credentials depend on, and half-doing the pair is the main way this goes wrong.

1. **APIs & Services → OAuth consent screen** → *External*. App name, support
   email, developer email. Leave it in **Testing** and add your own Google
   account under **Test users** — publishing triggers a verification review you
   don't need. Default scopes are fine. You must do this before step 2 lets you
   create a client.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   Authorised redirect URI — verbatim, no trailing slash:

   ```
   https://xlssgnnrtautldouirkt.supabase.co/auth/v1/callback
   ```

   ⚠ This is **Supabase's** callback, not the app's. It's the most-mistyped
   value in the whole setup — `.../callback/` or the Vercel origin instead both
   give `redirect_uri_mismatch` at the consent screen. Authorised JavaScript
   origins can stay empty. Copy the client ID and secret.

### 3.4 Supabase dashboard — one pass, do it all at once

3. **Authentication → Providers → Google** → enable, paste the client ID +
   secret from 3.3, save.
4. **Authentication → URL Configuration:**
   - **Site URL** → your Vercel production URL
   - **Redirect URLs** → add all of:
     - `http://localhost:3000/**`
     - `https://<project>.vercel.app/**`
     - `https://*-<team>.vercel.app/**` (only if you want previews to log in)

   This list is **per-origin** and governs both Google and the email-OTP magic
   link. A missing entry is why a login redirect silently lands on the wrong
   site. Don't half-do it.

   > Since your project is now the only one, there is exactly **one** production
   > origin to register. If Aamir's old project URL is still in this list,
   > remove it once his project is deleted — a stale origin in the allowlist is
   > how someone ends up demoing a dead URL.

**Test Google on localhost first** — steps 1–3 make it work there immediately,
so any later failure is step 4 rather than the app. A first Google sign-in must
land on **`/onboarding`** (it has a session but no `profiles` row yet), not
`/dashboard` and not `/login`.

The app needs **no env var** for OAuth — it reads the origin from request
headers, so localhost, production and previews all work off the same code.

*Optional, same pass:* **Authentication → Email Templates → Magic Link** —
replace `{{ .ConfirmationURL }}` with `{{ .Token }}` if you want `/verify` (the
6-digit code screen) to be the real path. Login works either way. Note Supabase's
built-in SMTP allows only **~2–4 emails/hour**, which is why password login stays
the demo path — don't remove it.

### 3.5 Database — already applied, don't re-run blind

The live Supabase project already has all 8 Prisma migrations and the four
hand-written SQL files in `supabase/` (`policies.sql`, `grants.sql`,
`storage-policies.sql`, `realtime.sql`) applied. They're guarded/re-runnable, but
you shouldn't need to touch them.

---

## 4. Verify against the live URL

✅ **Passed 2026-08-15** — 44/44, and 44/44 `--blocked` for both `agent@test` and
`admin@test`. Re-run after any deploy or env-var change (Aamir usually runs it):

```bash
SMOKE_BASE_URL=https://clbipp-customer.vercel.app npm run smoke
SMOKE_BASE_URL=https://clbipp-customer.vercel.app npm run smoke -- agent@test demo1234 --blocked
```

44/44 both times — same assertions, no code change. **The second one is the role
gate.** If any app route lets `agent@test` through, stop and fix that before
anything else.

⚠ **Use the `clbipp-customer.vercel.app` alias, not a per-deployment
`clbipp-customer-<hash>-…` URL.** Those sit behind Vercel Deployment Protection
and 302 everyone outside your team to a Vercel login — that looks exactly like
the app being broken, and it isn't.

⚠ **A green build proves nothing about production.** All three deploy bugs on
2026-08-15 built green; this suite is what caught every one of them.

Then click the Google path once by hand: sign in with a fresh Google account →
must land on `/onboarding`. If it works locally but bounces to `/login` on the
deployed origin, it's §3.4 step 4.

---

## 5. Demo

**`docs/DEMO_SCRIPT_HR.md`** — 12 steps, each written as *what you do → what
should appear → what to say*. It doubles as the manual test pass, and it's built
from the actual seeded rows.

Two steps consume demo data (accepting the offer, settling the payout), so run
`npm run reset-demo` before each run. And open the site ten minutes early —
Supabase unpauses slowly enough to look broken.

---

## 6. Backlog — after it's live

Ranked. **Verify before acting** — a few are several batches old.

### P1 — before showing anyone

| # | Item | Notes |
|---|---|---|
| 1 | **Decide the `successText` colour** | Your commit `21cd3bd` bundled `#15803D` → `#0cb349` in with the middleware rename. It auto-merged with no conflict, so it's **live on `main` now**. Contrast on white drops **5.02:1 → 2.78:1**; WCAG AA needs 4.5:1. It's on success banners, status badges and wallet credit amounts, and the comment above the line says *"darker for WCAG contrast"*. Your call — if it was deliberate it needs a different approach than swapping the text shade; if not, it's a one-line revert in `packages/ui/src/tokens.ts:37` |
| 2 | **Batch 13 — the full-app scan** | **Not yours — Aamir is deciding whether to run it himself.** Listed here for visibility only; don't pick it up. Every batch verified *itself*, so nothing has looked across the seams for cross-batch drift |
| 3 | **A real manual pass on a handset** | The one thing no script covers. List in `REVAMP_BATCHES_2026-08-09.md` → "Manual checks owed": Google round trip, an OTP code from a real inbox, GPS over LAN http, how a PDF opens on a phone, phone-width layout on payment/history/invoice/profile, the `cancelled` state against real data |
| 4 | **Fleet vs individual** | A decision, not a sprint — §8 |

### P2 — real, in our control, not blocking

| # | Item | Since | Notes |
|---|---|---|---|
| 5 | **Design tokens duplicated** | — | Every hex lives in **both** `packages/ui/src/tokens.ts` and `apps/customer/src/app/globals.css`. Components using `colors.successText` read the first; `text-success-text` Tailwind classes read the second. **Changing one alone gives a half-applied colour** — which is what `21cd3bd` did |
| 6 | Orphaned booking-draft photos never swept | 7B | `wipeStorage` only cleans on reseed. Needs a real sweep before launch |
| 7 | P5-B: GST / PAN / EPR **format** validation | 6 | Presence-only today, deliberately. Always your half |
| 8 | Forgot-password is still a disabled button | 6 | OTP partly covers it |
| 9 | Role gate costs one `profiles` read per request | 6 | Real fix is a custom access-token hook putting `role` in the JWT — dashboard config, not code |
| 10 | No wallet redemption ("withdraw to bank") | 8 | Needs bank details the app never collects. `WalletTxnKind.redemption` already exists |
| 11 | No "switch account type" flow | 6 | `vendor_type` deliberately not self-updatable. Add it to `grants.sql`'s UPDATE allowlist when that screen exists |
| 12 | No account linking (same email via Google *and* password) | 11 | Supabase identity-linking behaviour, untested |
| 13 | Two B2B-flavoured strings survive the Batch 5 rewrite | — | `book/page.tsx:129` "Add your warehouse or site address"; `book/StepSchedule.tsx:121` placeholder. Cosmetic, only wrong for the individual path |

### P3 — waiting on the company, do not invent answers

Each is a value change in one file once answered.

| Item | Where the answer lands |
|---|---|
| 🔴 **CO₂e factor values are unsourced; citations unverified** | `packages/core/src/impact.ts` + the copy restated in the seed. Only the *relative ordering* is defensible. Open question 7 |
| Exact CPCB column set for the compliance CSV | `COLUMNS` in `apps/customer/src/lib/compliance-export.ts` |
| Whether GST applies to scrap from an unregistered individual, and at what rate | `taxPaise` is 0 today; the column and invoice line already exist |
| Authoritative EPR certificate layout | `packages/pdf/src/templates/certificate.tsx` only |
| Which segment is the go-to-market wedge | §8 |

### Already fixed — don't re-open

- ~~`/handover` mutates on GET~~ — fixed in Batch 12. Accept is a POST form
  action now; the page is a pure read and is in the smoke test (42 → 44).
- ~~`/handover` rendered `null units`~~ — was reading schema-v1 columns nothing
  has written since Batch 5.
- ~~Google button layout~~ — the mark goes through `Button`'s `leftIcon` prop now.

---

## 7. The middleware/proxy collision — resolved, kept as record

Your two commits on `main` (`21cd3bd`, `28a7cca`) renamed `src/middleware.ts` →
`src/proxy.ts` in the **pre-monorepo** layout, while the revamp had moved that
file to `apps/customer/src/`. Two histories renaming the same file in different
directions — git couldn't auto-merge it, which is why the PR was blocked.

- **PR #17** — merged `main` into the revamp branch, deleted the stray
  `apps/customer/src/proxy.ts` that rename detection dragged in, kept the
  revamp's file. `packages/ui/src/tokens.ts` auto-merged and carried your colour
  change through silently (§6, P1 #1).
- **PR #18** — redid the rename properly: `apps/customer/src/proxy.ts` exporting
  `proxy`. Build green with `ƒ Proxy (Middleware)`, deprecation warning gone,
  smoke 44/44 and `--blocked` 44/44 either side.

**Why it mattered who resolved it:** the obvious resolution — keep `proxy.ts`,
delete `middleware.ts` — was wrong. Your `proxy.ts` was the old pre-monorepo
middleware, missing `allowRoles: ['customer']` (the role gate),
`onboardingPath: '/onboarding'` (Google sign-in), `/verify` in `publicPaths`
(email OTP), and the matcher exclusions for the PWA files. Picking correctly
needed knowledge of what the revamp put in that file.

Two constraints that still hold on that file:

- **It must stay under `src/`.** Next's dev bundler silently never registers it
  at the project root when `src/app` is in use, and an unregistered auth guard
  fails **open**. True whatever it's called.
- **`packages/auth/src/middleware.ts` is NOT renamed and must not be** — that's
  the `createAuthMiddleware` factory, an ordinary module, not a Next convention
  file.

---

## 8. Fleet vs individual — where it actually stands

Aamir flagged that he's only ever tested `business@test`, an **individual**
account.

**What's implemented:** `vendorType` is collected at signup and `/onboarding`,
and after that it's read in exactly three places — `profile/page.tsx:98`
(renders the "Business details" card), `lib/documents.ts:102` (prints
`"Fleet / company"` vs `"Individual"` on the EPR certificate), and the forms
that collect it. **Nowhere else does behaviour branch on it.**

**This is not an overlooked requirement.** The company's document §7.1 asks *the
company* to pick a go-to-market wedge — it does not ask for two flows now. That
went out as open question 6 on 2026-08-07 and was never answered. The team
decision was "split the schema now, split the screens later", and the wireframes
contain zero mentions of fleet, recurring, depot or bulk. Nothing designed was
skipped.

**But three things are worth raising:**

1. **The schema split was only half done.** Profile was split (`vendorType`,
   `companyName`, `gstNumber`, `panNumber`, `eprRegId`, `businessAddress` all
   exist and are written). **Pickup was not** — it still encodes one address, one
   date, one site, so a fleet with several depots can't express itself; there is
   **no recurrence entity**; and `Offer`/`Certificate`/`PickupReceipt` are all
   1:1 with `Pickup`, so an invoice covering thirty pickups has nowhere to live.
   If the company picks bulk/fleet as the wedge, that's a migration plus every
   screen that reads `Pickup`. **Price it before they choose, not after.**
2. **No fleet account in the seed, so the fleet path has never been seen.**
   `reset-demo` creates one customer — `business@test`, individual — owning all
   10 pickups. The live DB has three fleet profiles but they're manual test junk
   and none owns a pickup. **This is the cheap one:** add a second seeded account
   with a plausible company + GST/PAN/EPR and a couple of pickups, and the whole
   fleet path becomes demoable. One edit to `reset-demo.ts`. **Recommended
   regardless of what the company decides.**
3. Two B2B-flavoured strings — §6, P2 #13.

**What to do:** nothing structural until open question 6 is answered. Do #2
because it's cheap and removes a blind spot. Put #1 in front of them as the cost
of the bulk answer.

---

## 9. Repo facts worth having

- **Everything is on `main`.** PR #17 (the revamp) then PR #18 (the rename).
  Both feature branches can be deleted.
- **Baseline:** build green (34 routes) · `npm run lint --force` clean ·
  142 tests · smoke 44/44 · `--blocked` 44/44.
- **Accounts:** `business@test` / `businesstest` (customer, owns everything) ·
  `agent@test` and `admin@test` / `demo1234` — both correctly **blocked** from
  the customer app. That's the role gate working, not a broken account.
- **Money is integer paise everywhere.** Format with `formatPaise` from
  `@clbipp/core`, never a local `/100`.
- **Deeper reference, only if you need it:** `DEPLOY.md` (longer deploy notes) ·
  `REVAMP_BATCHES_2026-08-09.md` (batch-by-batch reasoning + the outstanding
  list) · `PLAN_V2_CUSTOMER_APP.md` (decisions D1–D7) ·
  `COMPANY_FLOW_REVIEW_2026-08-07.md` (the company's docs vs what we built).
- ⚠ **Do not read `PROJECT_STATE.md` below its top section** — it describes the
  pre-monorepo app and will actively mislead you on file paths.
