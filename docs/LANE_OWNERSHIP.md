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

### 2026-07-05 — `(app)/layout.tsx` tab-bar wiring: C → A
- **Moved to A (was implicitly C):** wiring `BottomTabBar` into
  `src/app/(app)/layout.tsx` so all authenticated screens get shared nav.
- **Why:** the layout stub was created by A; `BottomTabBar` is built but unwired.
  Doing it here in Task 2 (tracking screen) rather than waiting for Phase 3 is a
  Phase 2 prerequisite (P1 in PROJECT_STATE.md). A's screens need the nav; so do
  B's existing screens. Doing it now prevents a Phase 3 merge scramble.
- **C keeps:** `BottomTabBar` component ownership, PWA/offline, deployment. Also
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
