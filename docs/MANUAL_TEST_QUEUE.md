# Manual test queue — Field Agent sprint

> **What this is.** The batches are verified programmatically as they land
> (`npm run build`, `npm run test`, `npm run smoke`, plus a throwaway script per
> batch). This file collects the things a script **cannot** check — anything
> behind a POST form action, anything needing a camera or a finger, and anything
> where "it renders" isn't the same as "it reads right".
>
> Nobody is expected to work through this per batch. It is one sitting at the
> end, before the HR demo.
>
> **Accounts:** `business@test` / `businesstest` (vendor, :3000) ·
> `agent@test` / `demo1234` (agent, :3001).
> **Reset first:** `npm run reset-demo` — ⚠ announce in the group, it is the
> **shared** Supabase project, and it restores rows but **not** grants or
> policies.

---

## Batch 5b — the cross-app seam (2026-08-24)

The batch's whole point is that accepting an offer no longer collects anything.
Everything here is a POST behind a button, which is exactly what `smoke` cannot
reach.

### The happy path — do this one first

1. As **business@test**, open `PKP-2026-000104` (it is at `offered`) and press
   **Accept offer**.
2. ✅ You land on **"Offer Accepted"** — *not* "Handover Confirmed".
3. ✅ The timeline stops at **Offered**, marked "Accepted". It must **not** show
   Collected — nobody has been to the site yet.
4. ✅ The copy says the agent will collect. No sentence claims the batteries have
   already been picked up.
5. Press **back**, then re-open `/offer?id=PKP-2026-000104` from the URL bar.
   ✅ It bounces to `/handover` — the Accept button must not be offered twice.
6. Same for `/offer-breakdown?id=PKP-2026-000104`. ✅ Also bounces.
7. Open the **dashboard**. ✅ The row for 104 now goes to `/track/…`, not back to
   the offer. Same on `/history`.
8. Open `/track/PKP-2026-000104`. ✅ Banner reads "Offer accepted…", the CTA says
   **View acceptance**, and the custody log has an **"Offer accepted by vendor"**
   entry. ✅ The timeline's *Offered* date is the date the offer was made, not
   today.

### Double-submit

9. On the offer screen, **double-click Accept** (or accept in two tabs at once).
   ✅ Exactly one acceptance, and the timestamp does not move. Check
   `offers.accepted_at` in Prisma Studio if you want to be sure.

### 🔴 The two paths no script covers — `voidOfferAcceptance`

These are the only untested writes in the batch.

10. Accept an offer, then **cancel** that same pickup from `/scheduled`.
    ✅ `offers.accepted_at` goes back to **null** (check in Prisma Studio).
    An acceptance must not outlive its pickup — Batch 6 lets the agent collect
    on the strength of it.
11. Accept an offer, cancel it, then **reschedule** the cancelled pickup (the
    reactivation path — it comes back as `requested`).
    ✅ `accepted_at` is null again.
    ⚠ Known and *not* fixed: the row keeps its old `agentId` and
    `agentFeePaise`. That is expected for now — see `LANE_OWNERSHIP.md`.
12. Reschedule an **active** (not cancelled) pickup that has an accepted offer.
    ✅ `accepted_at` is **untouched** — that path is just a new date.

### Cross-app, once Batch 6 lands

13. Accept as the vendor, then open the same job as **agent@test** on :3001.
    ✅ The Collect button is available. Before accepting, ✅ it is not, and the
    screen says why.
14. ✅ The vendor never sees a way to mark their own battery collected, anywhere.

### Reading, not just rendering

15. Read the "Offer Accepted" screen as if you were the vendor. Does anything on
    it imply the batteries have left your premises? If yes, that is the bug this
    batch exists to fix, come back.

---

## Batch 8 — track, history, profile (2026-08-24)

Three things here genuinely cannot be scripted; the rest of the batch is covered
by 28/28 smoke plus 21 scripted checks.

### The Realtime ping — two devices, the whole point of the batch

The RLS half is already proved (an agent JWT reads 44 `status_events` where it
read 0). What is unproven is that the browser channel actually fires.

1. Log in as **agent@test** on :3001, open `/pickups/PKP-2026-000103`. Leave it
   on screen. **Do not touch it.**
2. On a second device (or a private window) as **business@test** on :3000,
   advance that same pickup — accepting an offer or cancelling both write a
   `status_events` row.
3. ✅ Within a second or two the agent's timeline updates **with no reload and no
   tap**. A new entry appears in the chain of custody.
4. ✅ If nothing happens: it is the policies. Check `supabase/policies.sql` has
   **both** the `pickups` and `status_events` agent policies, and that they are
   actually applied to the project — the file being right is not the same as the
   database being right.

### The map — a real handset, a real finger

`MapCanvas` is client-only by design (`next/dynamic`, `ssr: false`), so no
server-side check can see it. Open `/pickups/PKP-2026-000103/map` on a phone.

5. ✅ Tiles actually paint, and the green pin sits on the Okhla warehouse — not
   in the sea, which is what a broken coordinate looks like.
6. ✅ The map does **not** pan, pinch or scroll-zoom. Dragging it should scroll
   the page underneath, not move the map. This is deliberate (D4) — a map that
   pans is a map a gloved thumb pans by accident.
7. ✅ "Open in Google Maps" opens the Maps **app**, already routing to the
   address. ✅ "Call" opens the dialler with the vendor's number.
8. ✅ Nothing sits under the bottom tab bar, and the page doesn't double-pad.

### Log out

9. `/profile` → **Log out** → ✅ lands on `/login`, and pressing **back** does
   not return you to a logged-in screen.

### Reading, not just rendering

10. On `/pickups/[id]` for a job past collection, read the lock banner. ✅ Does it
    make clear the agent's part is finished — without implying they can still do
    something about it? There is deliberately no control on that screen that
    advances anything.
11. On `/profile`, read the earnings copy. ✅ Is it unmistakable that this is the
    **agent's fee**, not what the vendor was paid? The two numbers are easy to
    confuse on site and the copy is the only thing separating them.
12. ✅ The custody log says "Recorded by you" against the agent's own actions and
    "Recorded by the vendor" against the vendor's — **not** the customer app's
    "Recorded by the collection partner".

---

## Carried over from earlier batches

Each batch's "as built" section in `FIELD_AGENT_TASKS.md` ends with its own
by-hand list. **Back-fill them into this file** before the end-of-sprint pass —
the ones already written up are:

- **Batch 1** — day view + job detail, `scheduled → arrived`.
- **Batch 2** — the safety checklist, including the lithium toggle defaulting
  from the declared category.
- **Batch 3** — multi-item intake. Its list is the longest (8 items, at the
  bottom of that section) and includes the gloves-on tap-target check and the
  declared-vs-confirmed disagreement display.
- **Batch 8** — written up in full above rather than left in the task sheet,
  because two of its three items need a second device or a real handset.

## Install / PWA (added 2026-08-24)

Only the last item genuinely needs a handset; the rest are a laptop and Chrome.
**None of this works on `npm run dev`** — the service worker is production-only,
so use `npm run build && npm start` (or the deployed URL).

- **Android / desktop Chrome:** load the app logged in and confirm the "Install
  app" bar appears on the home screen, that tapping **Install app** opens the
  browser's own install dialog, and that accepting produces a windowed app with
  the right icon. Dismissing must keep it dismissed across a reload.
- **Both apps installed side by side** — the whole point of the two icons being
  inverses. Confirm they are tellable apart in the launcher and that each opens
  its own app, not the other.
- **iPhone / Safari:** the bar must show the *Share → Add to Home Screen*
  wording instead of an Install button, and the installed icon must be the "FA"
  / "B2" icon and **not a screenshot of the page** — that was the symptom of the
  proxy bug fixed on 2026-08-24, and it is the fastest way to spot a regression.
- **Offline:** with the app installed, turn the network off and open it. The
  offline card should render rather than the browser's dinosaur.
- **Already-installed state:** opening the installed app must NOT show the
  install bar again.

## Deploy verification — both apps live (2026-08-25)

Both apps are deployed and were checked against production:
**clbipp-customer.vercel.app** and **clbipp-agent.vercel.app**.

`SMOKE_BASE_URL` points the smoke script at a deployed app, which is how this
was done and how it should be re-done after any deploy:

```bash
SMOKE_BASE_URL=https://clbipp-customer.vercel.app npm run smoke
SMOKE_BASE_URL=https://clbipp-agent.vercel.app    npm run smoke -- --app=agent
SMOKE_BASE_URL=https://clbipp-agent.vercel.app    npm run smoke -- --app=agent --blocked business@test businesstest
SMOKE_BASE_URL=https://clbipp-customer.vercel.app npm run smoke -- --blocked agent@test demo1234
```

152/152 route checks passed in production, both directions of the role gate,
PWA assets public, real PDFs streaming, demo data one row per lifecycle stage.
**What follows is only what that run could not reach.**

### 🔴 Nothing below has been exercised by a POST

`scripts/smoke.mjs` is read-only by design — it never POSTs, so it cannot press
a button. **Every form action in both apps is therefore unverified against
production**, not just the items listed elsewhere in this file. The Batch 5b and
Batch 8 lists above are the detailed versions; this is the reminder that the
green smoke run says nothing about them.

1. **Log in for real, on both apps.** The smoke script forges the
   `@supabase/ssr` session cookie directly against the Supabase token endpoint —
   it never touches the login form. So `login()` in each app's
   `(auth)/login/actions.ts` has never been run against production.
   ✅ Both apps, correct credentials → lands on the app.
   ✅ Wrong password → the error renders, and does not leak whether the account
   exists.
   ✅ **Vendor credentials on the agent app** → bounced with "That account cannot
   access this app." (the role gate's own message, not a generic auth error).

### Show / hide password (added 2026-08-25)

The agent app's `(auth)/field.tsx` was a copy of the customer's made *before* the
toggle landed and had drifted. The two files are now identical below the header
comment — **change them together**.

Only verified to *render* (the button is in the served HTML). Clicking it is not
covered by anything:

2. **Agent `/login`** — type a password, press **Show**. ✅ Text becomes visible,
   the label flips to **Hide**, pressing again re-masks it.
3. ✅ Tabbing from the email field goes email → password → **Log in**, skipping
   the toggle (`tabIndex={-1}`, deliberate — a thumb-reachable button that steals
   focus on a phone keyboard is worse than no button).
4. ✅ The toggle does not overlap the text when the password is long — it sits in
   the `pr-14` gutter.
5. ✅ Same three checks on the customer app's `/login`, `/signup/individual` and
   `/signup/fleet`, which share the component.
6. ✅ On a real handset: the button is big enough to hit, and revealing the
   password does not trigger the browser's own password manager to re-fill.

### Security headers (added 2026-08-25)

`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and
`Referrer-Policy: strict-origin-when-cross-origin` are now sent on every
response from both apps (`headers()` in each `next.config.ts`).

There is **deliberately no CSP** — Next injects inline hydration scripts, so a
real one needs nonces threaded through the document and is its own change.

Verified locally against production builds: headers present, PWA assets still
public, 46/46 + 30/30 smoke both directions. Left to check by eye:

7. ✅ After the deploy, confirm on the live URLs:
   `curl -sI https://clbipp-agent.vercel.app/login | grep -i x-frame`
8. ✅ Open both apps in a browser with the **console visible** and click through
   a few screens. Nothing new in the console — `nosniff` is the one that would
   surface as a blocked stylesheet or script if a MIME type were ever wrong.
9. ✅ The Leaflet map still paints tiles (`/pickups/[id]/map`). It loads external
   images; no CSP is set, so this should be unaffected — confirm rather than
   assume.

### Before any live demo

10. 🔴 **Run `npm run assign-job`.** A pickup booked in the customer app during
    the demo lands at `requested` with no `agentId` and is **invisible to the
    agent app** — nothing in either app writes `requested → scheduled`. That is
    the admin app's job and the admin app is a scaffold. If someone books a
    pickup on stage and then switches to the agent phone, this is the step that
    makes it appear.
11. The seeded jobs are dated in the past, so the agent day view's header reads
    **"0 Assigned today · 0 Collected today · ₹0 Earned today"** above four open
    jobs. Correct, but it reads as broken. Decide before the demo whether to
    re-date the seed or just not linger on that header.

---

## Admin console — Batch 0 (scaffold, auth gate, console shell) · 2026-08-26 · A

Everything a `fetch` can check is already checked: 22/22 routes with content
assertions, all six role-gate directions, `ƒ Proxy (Middleware)` in the build.
What is left needs a browser or a human eye.

12. 🔴 **Sign out actually signs you out.** `scripts/smoke.mjs` asserts the
    account-menu *trigger* exists (its `aria-label`), because the `Sign out`
    item lives in a dropdown that only mounts on click and is genuinely not in
    the server HTML — a fetch cannot reach it. **Click the avatar, sign out,
    then press Back.** You must land on `/login`, not on a cached console page.
13. **The sidebar highlights the right item on a detail route.** `isNavItemActive`
    keeps the parent lit via `matchPrefix`, and `/` is deliberately exact-match
    so it does not light up on every route. Check `/dispatch/PKP-2026-000101`
    lights **Dispatch** and *not* **Overview**.
14. **The rail and the header stay put while the body scrolls.** The console is a
    fixed-height frame (`h-full overflow-hidden` on `<body>`, `overflow-y-auto`
    on the body column only). On a nine-column table this is immediately obvious
    if it is wrong. Check at **1280px and at 1440px**.
15. **The topbar search box.** It posts `GET /pickups?q=…`. Until C's Batch 5
    reads `searchParams.q` it will navigate and show an **unfiltered** list —
    expected for now, but re-check it *after* Batch 5 lands, because that is the
    point at which a silent no-op becomes a real bug.
16. **The console does not look like the mobile apps by accident.** The admin app
    keeps the shared token *values* (so `@clbipp/ui`'s Badge/Button/Card render
    on-brand) but the wireframe's dark rail via a separate `--console-*` block.
    Put a phone screen and the console side by side and confirm the greens and
    the paper background genuinely match.
17. **Three dev servers at once.** `npm run dev` · `npm run dev:agent` ·
    `npm run dev:admin` on 3000/3001/3002. Verified individually; confirm the
    three-terminal demo setup once, before the demo, not during it.
18. **The login error copy.** Sign in to `:3002` as `agent@test` / `demo1234`.
    You should be bounced straight back to `/login` reading **"That account
    cannot access this app."** — the proxy sets it, and it is the only feedback a
    wrong-role user ever gets.

19. 🔴 **The reactivated pickup in the AGENT app.** Log in to `:3001` as
    `agent@test`. `PKP-2026-000114` (Peeragarhi) should appear on the day view's
    **active** list reading "In recovery — nothing to do" — a job the agent can
    neither start nor dismiss. That is Admin Batch 1 fixture 8 making a real,
    already-existing bug visible for the first time (a reactivated pickup keeps
    its `agentId`). **Confirm it is ugly but harmless — nothing 500s, nothing
    lies about money.** It should stop appearing once Batch 3's dispatch board
    clears the stale agent on assignment.
    → **Batch 3 shipped (2026-08-27) and this is now fixable from a screen**:
    open `/dispatch/PKP-2026-000114` in the admin console and assign it. Confirm
    the job then reads **SCHEDULED · "Head over and tap Arrived"** on the agent's
    day view instead of "In recovery — nothing to do". ⚠ Doing this **consumes
    the fixture** — `npm run verify-seed` will fail on fixture 8 afterwards until
    a reseed. That is expected.

20. **Its timeline reads forwards even though the log runs backwards.** Open
    `/pickups/PKP-2026-000114` in the agent app, or `/track/PKP-2026-000114` in
    the customer app as `business@test`. The `status_events` rows genuinely go
    requested → scheduled → arrived → offered → **cancelled** → **requested**,
    with that last one dated most recently. `buildStages` is first-wins, so the
    timeline should still show each stage at the date it was FIRST reached.
    Confirm it does not render a second "Requested" row or relabel anything.

21. **`/offer` and `/handover` do not loop for it.** Same pickup, customer app.
    Its `Offer` row survives with `acceptedAt` **null** (voided by
    `reschedulePickup`) while the pickup is back at `requested`. Confirm neither
    screen redirects into the other — the two guards redirect off that one
    field and a wrong read makes them ping-pong forever.

22. **The seeded manifests read sensibly once C's screens land.** `/manifests`
    should show 7 rows: 1 draft, 2 dispatched, 2 received, 2 reconciled. The
    draft one (`MFT-2026-000402`, Sunrise Lead) is the deliberate gap that keeps
    `PKP-2026-000113` from advancing. ⚠ **Do not read the seeded manifest
    timestamps as a reconstructed audit** — they are indicative.

23. **A demo reads three fabricated recycler names.** Meridian Metals Recovery,
    Sunrise Lead Recyclers, Verdant Cell Recovery, with invented CPCB numbers.
    They deliberately are **not** real companies (the previous seed named a real
    one). Before showing this to the company, decide whether to say so out loud
    or ask them for real partner names.

24. 🎯 **THE ROUND TRIP, from a real booking form.** *(Batch 3.)* The half of
    the demo path a script cannot drive. As `business@test` on `:3000`, book a
    pickup through the request form. Then as `admin@test` on `:3002`: it should
    appear at the **bottom** of `/dispatch` (newest = longest still to wait —
    the board is oldest-first), with the right vendor, address, declared lines
    and preferred date. Assign it. Then as `agent@test` on `:3001`: it is on the
    day view as SCHEDULED. Back as the vendor: `/track/[id]` shows the agent, the
    ETA and the custody entry. *(Everything from "a `requested` pickup" onwards
    is already verified programmatically; the booking form is the untested link.)*

25. **The collection-slot time is the time you picked.** *(Batch 3.)* Pick
    something distinctive — 07:15 — and confirm the vendor's tracking screen and
    the agent's job screen both say **07:15**, not 12:45. The console treats a
    submitted local time as IST deliberately (`apps/admin/src/lib/ist.ts`); this
    is the check that the assumption holds end to end, on a machine whose clock
    is not IST.

26. **The dispatch board's empty state.** *(Batch 3.)* Assign every waiting
    request and confirm `/dispatch` reads *"Nothing waiting"* with the three KPI
    tiles still rendering, rather than an empty table with headers.

27. **The stale-agent banner reads right to a person.** *(Batch 3.)* On
    `/dispatch/PKP-2026-000114`, the amber panel should name the previous agent
    **and** their carried-over fee (₹714). Confirm it reads as an explanation,
    not an accusation — a vendor rescheduling is normal, and the fee is data
    residue, not a payment.

28. 🎯 **THE PAYOUT, from real screens.** *(Batch 4.)* The other half of the
    demo path. As `business@test` on `:3000`, accept an offer. As `agent@test`
    on `:3001`, complete the collection **with a real drawn signature** (the
    scripted verification faked the signature path — `confirmCollection` checks
    only that the path is prefixed with the agent's user id, never that the file
    exists, so the canvas → upload → submit chain is genuinely untested). Back
    as the vendor: `/track/[id]` should offer **"Choose how you get paid"**,
    `/payment/[id]` should show the amount, and settling should land the wallet
    credit and the invoice. *(Everything except the signature capture is already
    verified programmatically — 26 assertions.)*

29. **The ₹ figure on `/payment/[id]` is the offer the vendor accepted.**
    *(Batch 4.)* Not the recommended price, not a rounded band — the exact
    `Offer.estimatedPrice`. Check it against what `/offer` showed them, and note
    that `formatPaise` rounds to whole rupees for display (₹13,744.50 → ₹13,745)
    while the stored paise are exact. If those two ever look inconsistent to a
    person, it is a wording problem, not an arithmetic one.

30. 🟠 **A ₹0 payout, if one can be produced.** *(Batch 4.)* `raisePayment`
    deliberately allows a zero payable — a load where every item is rejected
    owes nothing, and the row is what lets a screen say so. But nobody has
    designed that screen: today `/payment/[id]` would render ₹0 with a Confirm
    button. Decide what it should say before the company sees it.

31. **The agent's own "earned today" figure still agrees with their ledger.**
    *(Batch 4.)* The collection transaction now writes one more row than it did.
    Confirm the day view's tile, `/profile`, and the `agent_fee` `WalletTxn`
    still tell the same story after a real collection.

32. 🔴 **The whole hand-off, starting in the AGENT app.** *(Batch 6.)* This is
    the one that cannot be shortcut: on a fresh seed the admin console has
    **nothing to advance**, because the only `collected` pickup
    (`PKP-2026-000105`) deliberately has no custody batch. So: agent app →
    complete a hub drop-off for it → admin `/lifecycle` → the batch appears →
    Advance → the pickups read `tested` → `/manifests/new` now offers those
    items. Every programmatic check in Batch 6 stubbed that first step by
    creating the `CustodyBatch` directly; **the agent → admin seam itself has
    never been driven end to end by a person.**

33. **The manifest builder, with a mouse.** *(Batch 6.)* Everything about
    `/manifests/new` that is not a server check is untested by a fetch-based
    script: switching facility clears the selection, Select all / Clear all,
    the running weight and chemistry totals, and — the one worth watching —
    **the recycler dropdown greying out options as the selection changes**.
    The AD7 rejection behind it is proven programmatically; the *greying* is not.

34. **Read the four `/lifecycle` sections as a person.** *(Batch 6.)* The screen
    deliberately refuses to show a uniform "next stage" button, because the unit
    of advance differs per stage (AD5). Does that read as considered, or as
    inconsistent? Especially: does the amber **"pending drop-off"** panel make
    it clear that an admin can do nothing about those pickups, rather than
    looking like a broken action?

35. **A pickup split across two recyclers, on screen.** *(Batch 6.)*
    `/lifecycle` shows `PKP-2026-000113` with one item on `MFT-2026-000401`
    (dispatched) and one **"Still at the hub"**. That is AD6 made visible and it
    is the hardest idea in the console. Check a person can tell from the row
    alone *why* that pickup is not moving.

36. ⚠ **`/manifests/<id>` after a reseed.** *(Batch 6.)* The seed was minting
    malformed manifest uuids and is fixed, but a database seeded **before**
    2026-08-31 still has the old ids and that smoke line stays red. After the
    next `npm run reset-demo`, confirm `npm run smoke -- --app=admin` is 22/22.

---

## Standing checks for the end-of-sprint pass

- **Every agent screen passes `hideNav`.** `npm run smoke` fails on anything but
  exactly one `aria-label="Main navigation"`, so this is mostly covered — but
  eyeball the bottom of each screen for double padding.
- **Every ₹ figure** uses `formatPaise`. Look for a stray `/100` anywhere.
- **No agent-side number on a vendor screen** — no margin, no recovery rate %,
  no material-by-material ₹. The inverse rule is deliberate; the leak is not.
- **Camera and gallery fallback** on a real phone, not a desktop browser.
- The **offline / flaky-connection** behaviour of anything that writes.
- **`npm run verify-seed` after any reseed** (added Admin Batch 1). 21 assertions
  over the §3 fixtures, read-only, non-zero exit. It catches "the row the next
  batch is built against quietly stopped existing", which no other check can.
