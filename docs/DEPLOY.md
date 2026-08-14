# Deploying the customer app (Vercel)

> **Not the doc to follow.** `docs/HANDOVER_KHALID_2026-08-12.md` is the single
> self-contained runbook — it covers everything here plus local setup, the
> backlog and the demo. This file is the longer reference behind it.

**Written:** 2026-08-10, Batch 10 (A6). **Updated 2026-08-14.**

> ⚠ **Correction (2026-08-14).** This file used to say "no Vercel project exists
> yet". That is wrong, and so is the assumption that someone needs to create one.
>
> **Khalid's Vercel project is the canonical deploy** — already created, already
> connected to GitHub, already auto-building every push to `main`. It has been
> **failing on build configuration**, which is what the failure emails are. The
> remaining work is **fixing settings, not creating a project**.
>
> Aamir had a second project (`clbipp`, deployed manually from his laptop). It
> was **unlinked on 2026-08-14 and is being deleted** — one project only, and it
> is Khalid's. Don't recreate a local link.
>
> §2 below is still the correct target state; check each row against what
> Khalid's dashboard actually has.

Google sign-in (Batch 11) shipped, so §6 is a required step, not an addendum —
and it is Google-only: Apple was dropped.

Everything in this file is repo-side work that is already done, plus the
dashboard settings that are not. Nothing here needs another code change.

---

## 1. The one thing that will break the build if you skip it

**The generated Prisma client is gitignored** (`.gitignore:42` →
`packages/database/src/generated/`). It is not in the repo, so a fresh clone —
which is exactly what Vercel builds from — has no `@prisma/client` types and no
runtime client.

`turbo.json` already handles this: the `build` task declares
`dependsOn: ["^build", "^db:generate"]`, so running the build **through turbo**
generates the client first.

> **Therefore: the Vercel build command must go through turbo.** A bare
> `next build` in `apps/customer` will fail with missing generated types, and
> the error will not obviously point at Prisma.

---

## 2. Vercel project settings

One project, for `apps/customer`. (`apps/agent` and `apps/admin` are scaffolds —
don't deploy them yet.)

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| **Root Directory** | `apps/customer` |
| **Include source files outside of the Root Directory** | **ON** (required — the app imports `packages/*`) |
| Install Command | *(leave default)* — Vercel installs npm workspaces from the repo root |
| **Build Command** | `cd ../.. && npx turbo run build --filter=customer` |
| Output Directory | *(leave default — `.next`)* |
| Node version | 20.x or later (22.x locally) |

Vercel usually detects the Turborepo and proposes most of this. Verify the build
command explicitly anyway — it is the one that matters (§1).

### `apps/customer/vercel.json` — the region is deliberate

```json
{ "regions": ["syd1"] }
```

The Supabase database is in **`aws-1-ap-southeast-2`** (Sydney) — read off the
pooler host in `DATABASE_URL`. `syd1` puts the serverless functions in the same
region, so a page that makes several sequential Prisma calls doesn't pay a
cross-Pacific round trip on each one. Keep them matched: if the Supabase project
ever moves, this moves with it.

⚠ If Vercel rejects the region on your plan, **delete the `regions` key** rather
than fighting it. The app deploys and works either way — it is a latency
setting, not a correctness one.

---

## 3. Environment variables

Set all of these for **Production, Preview and Development**. Values come from
`apps/customer/.env.local` (gitignored — copy them across; do not commit them,
and do not paste the service-role key into a PR or a chat).

> ⚠ **Three keys in `.env.local` are written `KEY = value`, with spaces around
> the `=`.** dotenv trims them, so it works locally. Vercel's UI does **not** —
> a trailing space in the *name* field creates a different variable that nothing
> reads, and the app boots with an undefined Supabase URL. Paste the name and the
> value separately and check for stray whitespace on both.

| Variable | Where it's used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server Supabase clients | public by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server Supabase clients | public by design; RLS is the boundary, not this key |
| `SUPABASE_SERVICE_ROLE_KEY` | `@clbipp/auth/admin` — signed photo URLs, PDF storage, seed | 🔴 **secret. Bypasses RLS entirely.** Never `NEXT_PUBLIC_`, never client-side |
| `DATABASE_URL` | Prisma runtime | use the **pooled** (pgBouncer, port 6543) connection string — serverless functions open many short-lived connections |
| `DIRECT_URL` | Prisma migrations | the **direct** (port 5432) string; migrations can't run through the pooler |
| `PAYMENTS_MODE` | `paymentsMode()` in `@clbipp/core` | **leave unset.** Absent → `simulated`, and an unrecognised value also falls back to simulated. A typo can never be read as "settle real money" |

`DATABASE_URL` and `DIRECT_URL` are read by Prisma **from the schema's
`env()` calls**, not through `process.env` in any TypeScript file — so they
don't appear in a grep of the source and are easy to forget. They are also
listed in `turbo.json`'s `globalEnv`, which is what stops turbo caching a build
across different databases.

---

## 4. Supabase dashboard — redirect URLs

**Authentication → URL Configuration**:

- **Site URL** → the production Vercel URL (e.g. `https://<project>.vercel.app`).
- **Redirect URLs** → add all of:
  - `http://localhost:3000/**`
  - `https://<project>.vercel.app/**`
  - `https://*-<team>.vercel.app/**` if you want preview deployments to log in

This governs the email-OTP magic link and `/auth/callback`. Without the
production origin on the allowlist, the login link in an email bounces.

### Also worth doing at the same time

**Authentication → Email Templates → Magic Link**: replace
`{{ .ConfirmationURL }}` with `{{ .Token }}` if you want `/verify` (the 6-digit
code screen) to be the real path. Login works either way — `/auth/callback`
handles the link form — so this is a preference, not a blocker. Long-standing
item; it is dashboard config and cannot live in the repo.

⚠ Supabase's built-in SMTP allows only **~2–4 emails/hour**. Password login
stays the demo path for that reason. Don't remove it.

---

## 5. PWA — checked, nothing to change

Verified as part of this batch:

- `public/manifest.webmanifest` — name, `start_url: "/"`, `scope: "/"`,
  `display: "standalone"`, 192/512 PNG (`any maskable`) + SVG icons. Linked from
  `app/layout.tsx` via the Next `metadata.manifest` field.
- `public/sw.js` — network-first for navigations, offline fallback to
  `offline.html`, precaches the shell only. **Deliberately caches no Supabase
  data and no authed pages**, so nothing sensitive is served from disk offline.
- `app/ServiceWorkerRegister.tsx` registers it client-side.
- `src/middleware.ts`'s matcher **excludes** `manifest.webmanifest`, `sw.js`,
  `offline.html` and the icons, so they load logged-out — which install and the
  offline page both require.

Nothing was changed here. Install + offline still need one pass **on a real
handset** — it is on the end-of-revamp manual list and cannot be automated.

---

## 6. Google sign-in (Batch 11) — required, and not only for the deploy

Google sign-in is **built and merged, and not yet enabled anywhere** — including
on localhost. Until these three steps are done, the button on `/login` and
`/signup` redirects back with *"Google sign-in isn't available right now"* and
points the user at the password and OTP paths, which both work. That is a
deliberate soft failure, not a bug to chase.

1. **GCP** → APIs & Services → Credentials → OAuth 2.0 Client ID (Web
   application). The authorised redirect URI is **Supabase's** callback, not the
   app's — for this project, verbatim and with no trailing slash:

   ```
   https://xlssgnnrtautldouirkt.supabase.co/auth/v1/callback
   ```

   This is the single most-mistyped value in the whole setup. Google matches it
   as an exact string; `.../callback/` or the Vercel origin instead of the
   Supabase one both produce `redirect_uri_mismatch` at the consent screen.
   You will also have to fill in the **OAuth consent screen** first (External,
   app name, support email, developer email) — a new GCP project won't let you
   create the client without it. Leave it in **Testing** and add your own Google
   account under **Test users**; publishing invites a verification review you
   don't need for a demo.
2. **Supabase** → Authentication → Providers → **Google**: enable, paste the
   client id + secret from step 1.
3. **Supabase** → Authentication → URL Configuration → **Redirect URLs**: add
   `http://localhost:3000/**` *and* the Vercel origin. This is the per-origin
   list — a missing entry is why an OAuth redirect silently lands on the wrong
   site.

The app itself needs **no env var for this**: `oauth-actions.ts` derives its
origin from the request headers, so localhost, production and every preview
deployment work off the same code. Only the Supabase list above has to know the
origins.

Doing this together with §4 is one dashboard pass instead of two.

> **Apple is dropped, not pending** (Aamir, 2026-08-10). It needs a paid Apple
> Developer account ($99/yr) before the provider can be enabled at all.
> `signInWithOAuth` in `@clbipp/auth` is already typed `'google' | 'apple'`, so
> if that changes it is a `<form>` in `(auth)/oauth-buttons.tsx` plus steps 1–3
> above against Apple instead of Google.

### After the deploy, check the OAuth path specifically

A first Google sign-in produces a session with **no `profiles` row** and must
land on `/onboarding`, not `/login`. If it bounces to `/login` on the deployed
origin but works locally, the cause is almost certainly step 3 above rather than
anything in the app.

---

## 7. `middleware` → `proxy` — DONE (2026-08-14, PR #18)

Next 16.2.6 used to print `⚠ The "middleware" file convention is deprecated` on
every dev and build run. **Resolved and merged.** The file is now
`apps/customer/src/proxy.ts`, exporting `proxy`; the warning is gone. Build green
with `ƒ Proxy (Middleware)`, smoke 44/44 and `--blocked` 44/44 either side.

Two constraints still hold on that file:

- **It must stay under `src/`** — Next's dev bundler silently never registers it
  at the project root when `src/app` is in use, and an unregistered auth guard
  fails **open**. True whatever it's called.
- **`packages/auth/src/middleware.ts` is NOT renamed and must not be** — that's
  the `createAuthMiddleware` factory, an ordinary module, not a convention file.

Background on the cross-branch conflict this caused: handover §7.

---

## 8. After the first deploy — verify against the real origin

```bash
SMOKE_BASE_URL=https://<project>.vercel.app npm run smoke
SMOKE_BASE_URL=https://<project>.vercel.app npm run smoke -- agent@test demo1234 --blocked
```

`scripts/smoke.mjs` already reads `SMOKE_BASE_URL`, so the same **44** assertions
run against production with no change.

One thing that needs **no** change: the compliance CSV's `verification_link`
column is built from the **request's own origin**, so it will point at the
Vercel URL automatically rather than at localhost.
