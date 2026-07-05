import { createClient } from '@/lib/supabase/server'

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
  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    vendor_type: input.vendorType,
    full_name: input.fullName,
    email: input.email,
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, vendor_type')
    .eq('id', user.id)
    .single()

  return { user, profile }
}
