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

export async function signIn(email: string, password: string) {
  const supabase = await createClient()
  return supabase.auth.signInWithPassword({ email, password })
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

  // Fleet-only columns are left undefined (→ NULL) for individual accounts.
  // Supabase ignores undefined keys, so this one insert serves both flows.
  // `role` is deliberately NOT sent: it defaults to 'customer' in the database
  // and `authenticated` has no INSERT privilege on the column (supabase/grants.sql).
  // Naming it here would both fail and hand the client a say in its own role.
  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    vendor_type: input.vendorType,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone,
    company_name: input.companyName,
    gst_number: input.gstNumber,
    pan_number: input.panNumber,
    business_address: input.businessAddress,
    epr_reg_id: input.eprRegId,
  })
  if (profileError) return { error: profileError }

  return { error: null }
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
 */
export async function sendEmailOtp(email: string) {
  const supabase = await createClient()
  return supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
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
