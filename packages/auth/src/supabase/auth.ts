import { createClient } from './server'

// Account-creation input. Fleet business text fields (company/GST/PAN/EPR/
// address) are collected in the fleet signup form and written to the profile
// row here — that's the initial profile-row insert, Person A's lane. KYC
// *document upload + verification* stays Person B's post-signup step
// (docs/LANE_OWNERSHIP.md). Fleet fields are optional so the individual flow
// can omit them.
export type SignUpInput = {
  email: string
  password: string
  fullName: string
  vendorType: 'individual' | 'fleet'
  // Stored now, verified later: phone_verified stays false until SMS OTP ships
  // (that needs a paid provider + Indian DLT registration — Plan v2 D2).
  phone?: string
  // For a fleet account, fullName holds the contact person's name and
  // companyName the business — the profiles table has no separate contact_name.
  companyName?: string
  eprRegId?: string
  gstNumber?: string
  panNumber?: string
  businessAddress?: string
}

// The profile details collected AFTER an OAuth sign-in (Batch 11). Same shape
// as SignUpInput minus the two things OAuth already settled: there is no
// password, and the email is whatever the provider verified — taking it from a
// form would let the profile row and the auth identity disagree.
export type ProfileDetailsInput = Omit<SignUpInput, 'email' | 'password'>

export async function signIn(email: string, password: string) {
  const supabase = await createClient()
  return supabase.auth.signInWithPassword({ email, password })
}

// ─── OAuth (Batch 11) ───────────────────────────────────────────────────────

/** Providers configured in the Supabase dashboard. Apple is deferred — it needs
 *  a paid Apple Developer account, so nothing about it is testable yet. The
 *  union is here so adding it later is a button, not a signature change. */
export type OAuthProvider = 'google' | 'apple'

/**
 * Starts an OAuth sign-in and returns the provider URL to send the user to.
 *
 * The redirect itself is the caller's job, the same way signIn and sendEmailOtp
 * leave it to theirs — this package stays free of next/navigation so it can be
 * used from a route handler or an action equally.
 *
 * `redirectTo` must be an origin registered in Supabase's Redirect URLs, and
 * points at /auth/callback, which already handles the PKCE `?code=` shape this
 * flow comes back with.
 *
 * ⚠ Unlike password sign-in, this creates an auth.users row with NO profiles
 * row on first use. The middleware's onboardingPath is what catches that.
 */
export async function signInWithOAuth(provider: OAuthProvider, redirectTo: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  })
  return { url: data?.url ?? null, error }
}

// Atomic account creation: the auth user and the profiles row are created
// together so we never leave a half-created account (an auth.users record with
// no matching profiles row, which would break RLS and every profile read).
// The insert runs through the same authenticated client, so RLS's
// "id = auth.uid()" INSERT policy is satisfied. Email confirmation is off this
// sprint, so signUp returns a session immediately.
export async function signUpWithProfile(input: SignUpInput) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
  })
  if (error) return { error }

  const userId = data.user?.id
  if (!userId) return { error: new Error('Sign-up did not return a user.') }

  const { error: profileError } = await supabase
    .from('profiles')
    .insert(profileInsertPayload(userId, input.email, input))
  if (profileError) return { error: profileError }

  return { error: null }
}

/**
 * The one place the profile-insert column list lives.
 *
 * Two callers write a profile row now — signUpWithProfile (email/password) and
 * createProfileForCurrentUser (OAuth → /onboarding) — and the columns they may
 * name are constrained by supabase/grants.sql's INSERT allowlist. Two copies of
 * this object is how one of them ends up naming a column the database refuses.
 *
 * Fleet-only columns are left undefined (→ NULL) for individual accounts;
 * Supabase ignores undefined keys, so this one payload serves both flows.
 *
 * `role` is deliberately NOT here: it defaults to 'customer' in the database and
 * `authenticated` has no INSERT privilege on the column (supabase/grants.sql).
 * Naming it would both fail and hand the client a say in its own role.
 */
function profileInsertPayload(userId: string, email: string, input: ProfileDetailsInput) {
  return {
    id: userId,
    vendor_type: input.vendorType,
    full_name: input.fullName,
    email,
    phone: input.phone,
    company_name: input.companyName,
    gst_number: input.gstNumber,
    pan_number: input.panNumber,
    business_address: input.businessAddress,
    epr_reg_id: input.eprRegId,
  }
}

/**
 * Writes the profile row for a session that already exists — the second half of
 * OAuth sign-in (Batch 11).
 *
 * signUpWithProfile can't serve this: the auth user is already created by the
 * provider, so there is nothing to sign up, and there is no password to send.
 *
 * The uid and email come from the SESSION, never from the caller. The uid is
 * what profiles' RLS INSERT policy checks against auth.uid(), and the email is
 * the one the provider verified — accepting either from a form would let a
 * profile row be written for someone else, or under an address nobody proved
 * they own.
 */
export async function createProfileForCurrentUser(input: ProfileDetailsInput) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: new Error('You need to be signed in to finish setting up your account.') }

  const { error } = await supabase
    .from('profiles')
    .insert(profileInsertPayload(user.id, user.email ?? '', input))

  return { error }
}

export async function signOut() {
  const supabase = await createClient()
  return supabase.auth.signOut()
}

// ─── Email OTP (Plan v2 D2) ─────────────────────────────────────────────────
// Passwordless login for real users. Phone SMS would need a paid provider plus
// Indian DLT template registration, so email carries this sprint.
//
// This is ADDITIVE — password login stays. Supabase's built-in SMTP rate-limits
// at roughly 2–4 mails/hour, which is not enough to demo through, so the
// password path is the reliable one and must not be removed.

/**
 * Sends a login code to an existing account.
 *
 * `shouldCreateUser: false` is the important flag. Left at its default (true),
 * a typo'd address silently creates an auth.users row with no matching profiles
 * row — the half-created account signUpWithProfile exists to prevent. With the
 * Batch 6 role gate that is no longer a cosmetic problem: the middleware finds
 * no profile, signs the session out and bounces to /login, so the user loops
 * forever and can never sign up with their real address either. Account
 * creation goes through /signup, which writes both rows.
 *
 * `emailRedirectTo` is where a LINK-shaped mail comes back to. Whether the mail
 * carries a 6-digit code or a clickable link is a dashboard template setting we
 * don't hold in this repo ({{ .Token }} vs {{ .ConfirmationURL }}), so this has
 * to be right for both. Omit it and Supabase falls back to the project's Site
 * URL — a single global value shared with two other apps, and one that silently
 * sent every emailed link to a dead address until 2026-08-25 because it had
 * been saved without its https:// scheme. Passing the origin explicitly means
 * the login link no longer depends on that field being correct.
 */
export async function sendEmailOtp(email: string, emailRedirectTo?: string) {
  const supabase = await createClient()
  return supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo },
  })
}

/**
 * Exchanges an emailed code for a session. `type: 'email'` covers both the
 * signup-confirmation and the magic-link/OTP token kinds Supabase issues here.
 * On success the SSR client writes the session cookies via createClient's
 * cookie adapter, so the caller only has to redirect.
 */
export async function verifyEmailOtp(email: string, token: string) {
  const supabase = await createClient()
  return supabase.auth.verifyOtp({ email, token, type: 'email' })
}

/**
 * Turns a Supabase auth error into copy a customer can act on. The raw strings
 * leak implementation detail ("Token has expired or is invalid") and, for the
 * rate limit, give no hint that the password form right there still works.
 */
export function describeOtpError(message: string): string {
  const m = message.toLowerCase()

  if (m.includes('rate limit') || m.includes('only request this after')) {
    return 'Too many code requests. Wait a few minutes, or log in with your password instead.'
  }
  if (m.includes('signups not allowed') || m.includes('user not found')) {
    return "We couldn't find an account with that email. Create one instead?"
  }
  if (m.includes('expired') || m.includes('invalid')) {
    return 'That code is wrong or has expired. Request a new one.'
  }
  return message
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

// Current user's identity + basic profile, for the profile screen. Returns null
// when not authenticated. RLS scopes the profiles read to the caller's own row.
export async function getCurrentProfile() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Fleet-only columns (company_name … business_address) are NULL for individual
  // accounts; the profile screen renders that section only when vendor_type is
  // 'fleet'. Selecting them here keeps getCurrentProfile the single profile read.
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'full_name, email, phone, phone_verified, role, vendor_type, company_name, gst_number, pan_number, epr_reg_id, business_address'
    )
    .eq('id', user.id)
    .single()

  return { user, profile }
}
