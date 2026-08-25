# Distribution & the native-app question

**Written 2026-08-25.** For the company, and for whoever picks this codebase up
after the internship.

This answers one question: *the apps we were shown were installed from the App
Store and Play Store — is what we built able to become that?*

**Short answer: Android yes, and the package is a half-day away. iOS is a real
project, and this document says exactly how big and what it would reuse.**

---

## 1. What was built, and how it installs today

Two apps — a **Customer/Vendor app** and a **Field Agent app** — plus a shared
backend (Postgres via Supabase, auth, storage, a pricing engine, PDF
generation). They are **Progressive Web Apps**: real installable apps that run
full-screen with their own home-screen icon and no browser interface, but which
are delivered over the web rather than through a store.

What that means per platform, accurately:

| | Install experience | Full-screen app | Offline shell | Own icon |
|---|---|---|---|---|
| **Android (Chrome)** | One tap — the app shows an "Install app" button that opens Android's own install dialog | ✅ | ✅ | ✅ |
| **Desktop (Chrome/Edge)** | One tap, same | ✅ | ✅ | ✅ |
| **iPhone (Safari)** | Share → **Add to Home Screen** — two extra taps, once | ✅ | ✅ | ✅ |

**The only difference on iPhone is the install gesture.** Apple does not
implement the web install-prompt API, so no website on iOS can offer a one-tap
install — this is an Apple platform decision and applies to every PWA in the
world, not to anything specific about this build. Once installed, an iOS PWA
behaves the same as on Android, and is also exempt from Safari's 7-day data
eviction (which browser tabs are not).

### One thing PWAs do better than store apps

**Updates are instant.** A push to `main` deploys, and every user has the new
version the next time they open the app. No store review queue, no waiting for
users to tap "Update", no fragmentation across old versions — which for a
field-operations tool, where the agent app and the vendor app must agree on a
shared pickup lifecycle, is a genuine operational advantage rather than a
consolation. **A Play Store wrapper (§2) keeps this property.**

---

## 2. Play Store — supported, ~half a day

Android has an official path for exactly this: a **Trusted Web Activity (TWA)**.
Google's own tool, [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap),
wraps the deployed PWA into a signed Android package (`.aab`) that:

- is uploaded to and installed from the **Play Store** like any other app,
- has its own icon, launcher entry and app-switcher card,
- runs **with no browser UI at all** — no address bar, no "running in Chrome",
- **still updates instantly**, because the content is still the web app.

This is not a workaround; it is Google's supported way to ship a PWA to Play.

**What it needs:** both apps deployed to HTTPS (in progress — Batch 9), a Play
Console account, and a signing key. **The repo side is already done** — see
`docs/ANDROID_TWA_BUILD.md` for the exact commands, and §4 below for the one env
var that has to be set.

**Publishing caveat, worth knowing early:** Google now requires brand-new
*personal* developer accounts to run a closed test (roughly 12 testers for 2
weeks) before they can publish to production. **Organisation accounts are
exempt.** If the company publishes under their own Play Console organisation
this does not apply. If a student account is used, budget for it.

---

## 3. App Store — the honest answer

**Apple is the real constraint, and we would be misleading you to say otherwise.**

Apple's review guideline **4.2 (Minimum Functionality)** rejects apps that are
essentially a website in a wrapper. There is no Apple equivalent of a TWA. So
the options are:

1. **Ship the PWA on iOS** (what we have). Works today, installs via the Share
   sheet, no store listing.
2. **Rebuild the client as a native app** — React Native/Expo, or a Capacitor
   app whose screens are bundled locally rather than loaded from our server.

Option 2 is a real project, and the reason is architectural rather than
cosmetic: **these are server-rendered apps.** Screens are rendered on the server
and business logic is invoked through Next.js server actions called directly
from forms. A native client cannot call a server action; it needs HTTP
endpoints.

So a native iOS build means two pieces of work:

- **Expose the existing logic as an API.** Mechanical, not conceptual — the
  logic inside each action does not change, it gains an HTTP wrapper.
- **Rebuild the screens** in the native framework.

---

## 4. What survives a native rebuild — and what doesn't

This is the part that matters for judging whether the foundation is real.

### Carries over unchanged

| | |
|---|---|
| **Database schema + migrations** | `packages/database` — the whole data model |
| **Pricing / decision engine** | `packages/decision-engine` — pure TypeScript, 22 tests |
| **Core business logic** | `packages/core` — validation, offer, booking, agent fee, market data, document numbering, ₹ formatting, CO₂e factors (152 tests) |
| **PDF documents** | `packages/pdf` — EPR certificate, pickup receipt, invoice, chain-of-custody |
| **Auth, RLS policies, grants, storage** | Supabase config + `supabase/*.sql` |
| **The domain rules** | The nine-stage pickup lifecycle, the cross-app write seam (who may write which transition), the vendor-visibility rules, the mandatory safety gate |

### Gets rebuilt

The screens and the navigation between them.

### Why that split favours the foundation

The screens are the visible layer, not the expensive one. What costs judgement —
and what is genuinely hard to get right a second time — is a pricing engine that
is correct, a lifecycle contract that two separate apps agree on, a chain of
custody that would survive an audit, and an access model where a field agent
provably cannot see a vendor's screen and vice versa. **All of that is in shared
packages and SQL, not in the screens**, and all of it is reusable by any client
— web, Android or iOS.

### The one coupling to be aware of

Business logic is invoked through `'use server'` functions. Making it callable
by a native client means turning those into API routes. **We deliberately did
not do this during the internship**: it touches every write path in both apps,
and doing it in the final week would have risked the working system for a
benefit nobody had asked for yet. It is the first thing to do if a native client
is ever commissioned, and it is a contained, well-understood piece of work.

---

## 5. Recommendation

1. **Deploy both apps as PWAs.** They are installable today, on every platform.
2. **Produce the Android package** (`docs/ANDROID_TWA_BUILD.md`) so there is a
   real Play Store app to show, with instant updates retained.
3. **Decide on iOS deliberately, not by default.** For a tool used by your own
   field agents and vendor businesses, PWA distribution is often *preferred* —
   no review latency, instant rollout, no version fragmentation. A store listing
   matters most when you need consumer discovery, which a B2B recovery platform
   may not.

**If a native iOS app is expected, we need to know** — it changes the client
architecture and is not a one-week task. This is logged as **open question 14**
in `COMPANY_FLOW_REVIEW_2026-08-07.md`.

---

## 6. Repo-side status

Already done, in this codebase:

- Both apps are installable PWAs — manifest, service worker, icons, offline page.
- A shared `<InstallPrompt />` gives Chromium a one-tap install and iOS the
  Share-sheet instructions.
- `/.well-known/assetlinks.json` is served by both apps, driven by env vars, so
  the Android signing fingerprint can be set at deploy time with **no code
  change**:

  ```
  ANDROID_PACKAGE_NAME=in.clbipp.agent
  ANDROID_CERT_FINGERPRINTS=AA:BB:...:99            # comma-separate multiple keys
  ```

  Unset, it correctly returns `[]` — "no Android app is associated with this
  domain". Both apps exclude `/.well-known` from the auth guard, because Android
  fetches it anonymously at install time.

Remaining: deploy (Batch 9), then run the Bubblewrap steps.
