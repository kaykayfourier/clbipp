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

## Standing checks for the end-of-sprint pass

- **Every agent screen passes `hideNav`.** `npm run smoke` fails on anything but
  exactly one `aria-label="Main navigation"`, so this is mostly covered — but
  eyeball the bottom of each screen for double padding.
- **Every ₹ figure** uses `formatPaise`. Look for a stray `/100` anywhere.
- **No agent-side number on a vendor screen** — no margin, no recovery rate %,
  no material-by-material ₹. The inverse rule is deliberate; the leak is not.
- **Camera and gallery fallback** on a real phone, not a desktop browser.
- The **offline / flaky-connection** behaviour of anything that writes.
