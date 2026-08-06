# CLBIPP — Lane Ownership: Policy & Change Log

> How lane ownership works this sprint, and a record of every shift to it.
> The canonical ownership map lives in `../CLAUDE.md` (and `PROJECT_STATE.md`
> for the live version). This file holds the *policy* for changing lanes and
> the *log* of changes made. Update the log whenever a lane shifts.

---

## Policy: strict by default, flexible by agreement

Lanes exist so we don't scatter edits across each other's work and trip over
half-built foundations. The default rule stands: **work inside your lane; don't
edit another lane's area just because it's faster.**

But the lane map was drawn up front and won't be perfectly carved. When a task
genuinely straddles two lanes, or sits more naturally with a different owner:

1. **Flag it** — raise it (standup / group chat) before building across the
   line. Don't silently absorb it, and don't silently skip it either.
2. **Get the other owner's OK** — whoever loses or gains scope agrees first.
3. **Log it here** — add an entry to the change log below, and update the
   ownership map in `CLAUDE.md` + `PROJECT_STATE.md` so the canonical map stays
   true.

What this is *not*: a licence to drift. **Phase sequencing is still fixed**, and
"flag it" is a real step, not a formality to skip. The goal is a clean seam when
reality doesn't match the original split — not free-for-all editing.

---

## Change log

### 2026-07-10 — Netting-up: seam + flow/component crash-fixes + PWA/deploy → A
- **Moved to A (Aamir):** the cross-lane navigation seam (dashboard↔flow↔track
  routing), the flow-screen + component-library crash-fixes (`badge.tsx`,
  `timeline.tsx`, `tokens.ts`, `scheduled/`, `offer/`, `offer-breakdown/`,
  `handover/` incl. `handover/actions.ts`, `design-system/page.tsx`), and
  **PWA + deploy**.
- **Why:** manual testing showed the app was two half-connected pickup stacks
  (C's query-param flow + A's state-driven `/track`) with no guards. The
  connecting work spans all three lanes and needs whole-repo visibility;
  screen-by-screen edits without it kept re-introducing seam bugs. PWA/deploy is
  repo-wide config, a poor fit for anyone without full-repo sight. A is on Claude
  Code (whole-repo view).
- **B (Khalid) keeps:** all data/schema + his own screens — seed fix, cert-by-id,
  compliance link, dashboard wiring (row routing + request-button link, done to
  A's spec in `REMEDIATION_PLAN.md`). Unchanged lane otherwise.
- **C (Mohammed) keeps:** component-library ownership generally; scoped this
  round to **visual polish on his own flow screens** (no wiring/DB), done after
  A's crash-fixes land. A's crash-fixes to C's component files are flagged here.
- **A also owns (own lane):** `supabase/policies.sql` RLS tightening (H2) +
  service-role client (`src/lib/supabase/admin.ts`) + the `acceptOffer`/
  `cancelPickup` service-role rewrite (H1).
- **One hard interaction (A↔B only):** B seeds the Offer that A's offer screen
  reads; A+B share the `service_role` key + applying the RLS change on the DB.
- **Agreed by:** flagged in GC 2026-07-10; plan in `docs/REMEDIATION_PLAN.md`,
  findings in `docs/REVIEW_findings_2026-07-10.md`.

### 2026-07-05 — `(app)/layout.tsx` tab-bar wiring: C → A
- **Moved to A (was implicitly C):** wiring `BottomTabBar` into
  `src/app/(app)/layout.tsx` so all authenticated screens get shared nav.
- **Why:** the layout stub was created by A; `BottomTabBar` is built but unwired.
  Doing it here in Task 2 (tracking screen) rather than waiting for Phase 3 is a
  Phase 2 prerequisite (P1 in PROJECT_STATE.md). A's screens need the nav; so do
  B's existing screens. Doing it now prevents a Phase 3 merge scramble.
- **C keeps:** `BottomTabBar` component ownership, PWA/offline, deployment
  (*superseded 2026-07-10 — PWA/offline + deployment moved to A, see entry
  above*). Also
  retains the Phase 3 task of adding a max-width mobile container to AppShell.
- **Agreed by:** flagged to C. C to acknowledge; A proceeding as P1 blocker.

### 2026-06-27 — Signup / account-creation flow: B → A
- **Moved to A (was B):** the account-type selector, the individual & fleet
  signup forms, and the initial `profiles` row insert that happens at signup.
- **Why:** account creation should be one atomic unit — `auth.signUp` *and* the
  `profiles` insert together — to avoid a half-created account (an `auth.users`
  record with no matching `profiles` row, which breaks RLS and every
  profile-dependent screen). That whole path is auth's concern, which is A's
  lane.
- **B keeps:** KYC document upload + verification (`kyc_status`, `kyc_doc_urls`,
  Supabase Storage) as a *post-signup* onboarding step. Fleet accounts sign up
  first, then complete KYC.
- **Agreed by:** B. Flagged + recorded per the policy above.
