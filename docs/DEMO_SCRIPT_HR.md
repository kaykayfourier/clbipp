# Demo script — showing the revamped customer app to HR

**Written:** 2026-08-10, Batch 12. Doubles as the **manual test pass** the revamp
never had: every step names what you should see, so a step that doesn't match is
a bug found rather than a demo fumbled.

Run it once yourself end to end **before** you run it for anyone. It takes about
20 minutes the first time and about 10 once you know the route.

---

## 0. Before you start (do this every single time)

```bash
npm run reset-demo     # ~2 min — it uploads real photo objects
```

**Why it is not optional.** Two steps in this script are *destructive to the demo
data*, and both are steps you actually want to show:

| Step | What it consumes |
|---|---|
| **Accepting the offer** (step 6) | `PKP-2026-000104` is the **only** pickup at `offered`. Accepting moves it to `collected`, and `/offer` then correctly redirects for every id — the offer screens become unreachable |
| **Settling the payout** (step 7) | `PKP-2026-000105` is the **only** pickup with a `pending` payout. Settling it turns the payment screen into a confirmation screen for the rest of the day |

So: reseed before each run, or accept that the second run is missing its two most
interactive screens.

Then check the site is actually up and correct:

```bash
SMOKE_BASE_URL=https://<your-app>.vercel.app npm run smoke
SMOKE_BASE_URL=https://<your-app>.vercel.app npm run smoke -- agent@test demo1234 --blocked
```

42/42 both times. The second run is the role gate: `agent@test` must be **bounced
out of every customer screen**. If it isn't, stop and fix that before showing
anyone anything.

**Also worth doing:** open the site once, on the real device you'll demo from,
about ten minutes beforehand. Supabase free-tier projects pause after a week of
inactivity and the first request after a pause is slow enough to look broken.

### The accounts

| Account | Password | What it's for |
|---|---|---|
| `business@test` | `businesstest` | **the demo account** — owns all 10 seeded pickups |
| `agent@test` | `demo1234` | only to *prove the role gate* (step 12). Never demo from it |

### The seeded pickups — one per lifecycle stage

Worth having open on a second screen so you never hunt for an id mid-demo.

| Pickup | Stage | Category | Has |
|---|---|---|---|
| `PKP-2026-000101` | requested | portable | — |
| `PKP-2026-000102` | scheduled | automotive | ETA |
| `PKP-2026-000103` | **arrived** | portable | partner card, custody log **with photos** |
| `PKP-2026-000104` | **offered** | automotive | the offer ⚠ *consumed by step 6* |
| `PKP-2026-000105` | **collected** | industrial | receipt + **pending payout** ⚠ *consumed by step 7* |
| `PKP-2026-000106` | tested | portable | paid, invoice |
| `PKP-2026-000107` | processed | ev | paid, invoice |
| `PKP-2026-000108` | recovered | ev | paid, invoice |
| `PKP-2026-000109` | **certified** | portable | EPR certificate + CO₂ |
| `PKP-2026-000110` | cancelled | portable | the cancelled timeline |

Public tracking tokens are derived: `00000000-0000-4000-8000-0000000001NN` where
`NN` is the last two digits of the pickup id (so `…0109` for the certified one).

---

## The walkthrough

Each step is **what you do → what should appear → what to say**. The "should
appear" column is the test; the "say" column is the pitch.

### 1. Log in — the ordinary path first

**Do:** open the site, sign in with `business@test` / `businesstest`.

**Should appear:** the dashboard. Not the profile screen — post-login landing
moved to `/dashboard` in Batch 6.

**Say:** three ways in — password, an emailed login code, and Google. Password
first because it's the one that never depends on an inbox.

> If you get bounced back to `/login` with an error, that is the role gate or a
> bad env var, not a wrong password. Check `NEXT_PUBLIC_SUPABASE_URL` in Vercel.

### 2. Google sign-in — the new one (Batch 11)

**Do:** log out. On `/login`, press **Continue with Google** and use a Google
account that has *never* signed into this app.

**Should appear:** Google's consent screen → back to the app → **`/onboarding`**,
asking individual vs fleet. Fill it in and submit → dashboard, **empty state**,
no pickups.

**Say:** Google gives us an authenticated user but no business details, so
there's a one-screen step that collects them. It's enforced in the middleware,
not just on the callback — so refreshing or bookmarking mid-way lands you back on
it rather than in a half-created account.

**Also worth showing:** the empty dashboard *is* the new-customer experience.
Then log back in as `business@test` for the rest.

> If this bounces to `/login` on the deployed URL but works on localhost, the
> cause is almost always a missing origin in Supabase → Redirect URLs
> (`DEPLOY.md` §6 step 3), not the app.

### 3. Book a pickup — the centrepiece

**Do:** dashboard → **Request pickup** → walk the 4 steps. Pick a category, add
two lines with different weights, tick a condition flag (leaking/swollen/dead),
**upload a photo**, pick an address, submit.

**Should appear:** an **indicative quote in ₹ before you submit**, then the
`/submitted` confirmation, then the new pickup at the top of the dashboard at
`requested`.

**Say:** this is the piece the company's flow document asked for that the first
draft didn't have — category first (chemistry is the field agent's job, not the
customer's), photos at booking, condition flags, and a price indication up front
so nobody submits blind.

### 4. Tracking — where the work shows

**Do:** open `PKP-2026-000103` (the one at `arrived`).

**Should appear:**
- the lifecycle timeline, nine stages, current one pulsing;
- an **assigned collection partner card** — name, tappable phone number, vehicle,
  rating — and **"On site now."** rather than an ETA;
- a **chain of custody** log below it: real timestamps, who recorded each event,
  a **View location** GPS link, and **real photo thumbnails**.

**Say:** the timeline answers "how far along"; the custody log answers "what was
actually recorded, by whom, where". Those are different questions and EPR
compliance cares about the second one. The photos are in a private bucket — the
page mints a short-lived signed URL per request; there is no public image URL.

**Then open `PKP-2026-000102`** (scheduled) to show the ETA wording change, and
**`PKP-2026-000110`** (cancelled) to show the timeline stopping at the last known
stage instead of pretending to progress.

### 5. The public tracking link

**Do:** open an **incognito window** and go to
`/t/00000000-0000-4000-8000-000000000103`.

**Should appear:** the same lifecycle layout, logged out. **No photos, no partner
card, no login prompt.**

**Say:** one shareable link the customer can forward to their own compliance team
without giving anyone an account. It's a bearer token, so it deliberately shows
less: stage timestamps and recovered weights, but not the agent's personal phone
number and not the site photos. Same component as the logged-in screen — one
implementation, two data sets.

### 6. The offer ⚠ destructive

**Do:** open `PKP-2026-000104` → **View offer** → **See breakdown** → **Accept**.

**Should appear:** a price and a plain-language rationale. **No material-by-
material valuation and no recovery-rate percentage** — anywhere. Accepting lands
on the handover confirmation.

**Say:** deliberate — the customer sees what they're being offered and why, not
our internal recovery economics. That rule holds across every screen.

> ⚠ This consumes the only `offered` pickup. Do it near the end, or reseed after.

### 7. Getting paid ⚠ destructive

**Do:** open `PKP-2026-000105` (collected) → **View collection receipt**, then
back → **Choose how you get paid** → pick a method → confirm.

**Should appear:** the receipt (which says out loud that it is *not* the EPR
certificate), then a payout confirmation, then links to the **invoice** and the
**wallet**.

**Then:** open **Wallet** and show the ledger — every credit, with a running
balance. Open **Invoices** and show that the on-screen invoice and its PDF come
from the same mapper, so they can't disagree.

**Say:** payouts are in simulated mode — there is a full payment model behind it,
but no live gateway is wired, on purpose. Settling is idempotent: a double-tap or
a refresh cannot credit the wallet twice.

> ⚠ This consumes the only `pending` payout.

### 8. The EPR certificate — the compliance payoff

**Do:** open `PKP-2026-000109` (certified) → **View certificate** → **Download
PDF**.

**Should appear:** a real PDF, opening in the phone's own viewer rather than
dropping into Downloads. It carries a derived certificate number
(`CERT-2026-PKP-2026-000109-PORTABLE`), the recovered materials and the CO₂e
figure.

**Say:** this is the document the whole flow exists to produce. Three PDFs are
generated server-side — certificate, collection receipt, invoice — rendered on
first download and cached. **The download streams through an authenticated route;
there is no shareable link to a document that names a customer and what they were
paid.**

**Be honest about the CO₂ number if asked:** it's an *estimate* from published
recycling factors, per chemistry, and the screen says so. We're waiting on the
company to tell us whether CPCB mandates a specific factor set — when they do,
it's a one-file change.

### 9. Dashboard impact + compliance export

**Do:** back to the dashboard — show the **impact card** and the **wallet card**.
Then **Compliance** → change the year filter → **Export for CPCB return**.

**Should appear:** a CSV downloads. Open it: one row per certificate, ISO dates,
a `verification_link` column pointing at the **live site's** `/t/` URL, not
localhost.

**Say:** the impact card counts **issued certificates only** — batteries still in
a truck haven't avoided anything yet, and the same number is printed on the
certificate, so the two must agree. The export's exact column set is an open
question we've sent back to the company.

### 10. History + repeat booking

**Do:** **View all** from the dashboard → filter chips → open a completed pickup
→ **Book again**.

**Should appear:** the booking wizard, pre-filled with the same category, lines
and address — **but no photos**, and step 1 says so on screen.

**Say:** a photo is evidence of one specific consignment. Carrying last month's
pictures onto a new booking would send the agent out expecting goods nobody has
seen.

### 11. Profile + install as an app

**Do:** **Profile** → show the account summary, edit the phone number inline,
show the wallet card. Then use the browser's **Add to Home Screen** and open it
from the home screen.

**Should appear:** it launches standalone, no browser chrome. Turn on aeroplane
mode and reload → the offline page, not a dinosaur.

**Say:** it's a PWA, so it installs without an app store. It deliberately caches
**no** account data offline — nothing sensitive sits on the handset.

### 12. The thing worth showing last: it refuses

**Do:** log out, log in as `agent@test` / `demo1234`.

**Should appear:** signed straight back out to `/login`.

**Say:** the customer app checks role on **every** request in middleware, and the
database enforces it separately — a customer can't promote themselves, because
`authenticated` has no write privilege on the role column at all. The UI is not
the security boundary.

---

## What to say if they ask what's left

Answer these straight; every one is a deliberate open item, not an oversight.

| If asked | Say |
|---|---|
| "Are those CO₂ numbers audited?" | No — estimates from published factors, and the screen labels them as such. We asked whether CPCB mandates a set; that answer is a one-file change |
| "Is there GST on the invoice?" | The line exists and reads zero. Whether GST applies to scrap bought from an unregistered individual is a question we've sent back |
| "Is that the real certificate layout?" | No — a placeholder of the right shape. The company is supplying the format; only the template file changes |
| "Are payments real?" | No. Full payment model, simulated settlement, no gateway keys anywhere. It fails *towards* simulation, never towards real money |
| "Can I withdraw the wallet balance?" | Not yet — that needs bank details the app doesn't collect |
| "Where are the agent and admin apps?" | Scaffolded in the same monorepo, sharing the auth, schema and UI packages. This sprint was the customer app |

---

## After the demo

```bash
npm run reset-demo
```

Puts the offer and the pending payout back. Then write down anything that didn't
match this script — that list is the input to **Batch 13, the full-app scan**.
