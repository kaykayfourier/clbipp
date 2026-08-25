import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createProfileForCurrentUser,
  describeOtpError,
  sendEmailOtp,
  signIn,
  signInWithOAuth,
  signUpWithProfile,
  verifyEmailOtp,
} from './auth'

const mockSignInWithPassword = vi.fn()
const mockSignUp = vi.fn()
const mockSignInWithOtp = vi.fn()
const mockVerifyOtp = vi.fn()
const mockSignInWithOAuth = vi.fn()
const mockGetUser = vi.fn()
const mockInsert = vi.fn()
const mockFrom = vi.fn(() => ({ insert: mockInsert }))

vi.mock('./server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: mockVerifyOtp,
      signInWithOAuth: mockSignInWithOAuth,
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}))

beforeEach(() => {
  mockSignInWithPassword.mockReset()
  mockSignUp.mockReset()
  mockSignInWithOtp.mockReset()
  mockVerifyOtp.mockReset()
  mockSignInWithOAuth.mockReset()
  mockGetUser.mockReset()
  mockInsert.mockReset()
  mockFrom.mockClear()
})

describe('signIn', () => {
  it('passes the given email/password straight through to Supabase', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: {}, error: null })

    await signIn('vendor@example.com', 'hunter2')

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'vendor@example.com',
      password: 'hunter2',
    })
  })
})

describe('signUpWithProfile', () => {
  const input = {
    email: 'vendor@example.com',
    password: 'hunter2',
    fullName: 'Vendor One',
    vendorType: 'fleet' as const,
  }

  it('inserts a profile row mapped from the new auth user on success', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockInsert.mockResolvedValue({ error: null })

    const result = await signUpWithProfile(input)

    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(mockInsert).toHaveBeenCalledWith({
      id: 'user-123',
      vendor_type: 'fleet',
      full_name: 'Vendor One',
      email: 'vendor@example.com',
    })
    expect(result.error).toBeNull()
  })

  it('returns the auth error and never inserts a profile row when signUp fails', async () => {
    const authError = new Error('Email already registered')
    mockSignUp.mockResolvedValue({ data: { user: null }, error: authError })

    const result = await signUpWithProfile(input)

    expect(result.error).toBe(authError)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('signUpWithProfile — Batch 6 columns', () => {
  const base = {
    email: 'vendor@example.com',
    password: 'hunter2',
    fullName: 'Vendor One',
    vendorType: 'individual' as const,
  }

  it('writes the collected phone onto the profile row', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockInsert.mockResolvedValue({ error: null })

    await signUpWithProfile({ ...base, phone: '+919876543210' })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+919876543210' }),
    )
  })

  // The database defaults role to 'customer' and `authenticated` has no INSERT
  // privilege on the column (supabase/grants.sql) — so naming it here would both
  // fail the insert and hand the client a say in its own role. This test is the
  // regression guard for someone "helpfully" adding it back.
  it('never sends a role, letting the database default decide it', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockInsert.mockResolvedValue({ error: null })

    await signUpWithProfile(base)

    const [payload] = mockInsert.mock.calls[0]
    expect(payload).not.toHaveProperty('role')
    expect(payload).not.toHaveProperty('kyc_status')
    expect(payload).not.toHaveProperty('wallet_balance_paise')
    expect(payload).not.toHaveProperty('phone_verified')
  })
})

// ─── Batch 11 — OAuth + onboarding ──────────────────────────────────────────

describe('signInWithOAuth', () => {
  it('asks Supabase for the provider URL and hands it back for the caller to redirect to', async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.google.com/o/oauth2/auth?…' },
      error: null,
    })

    const { url, error } = await signInWithOAuth(
      'google',
      'http://localhost:3000/auth/callback?next=/dashboard',
    )

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'http://localhost:3000/auth/callback?next=/dashboard' },
    })
    expect(url).toBe('https://accounts.google.com/o/oauth2/auth?…')
    expect(error).toBeNull()
  })

  // The provider isn't enabled in the Supabase dashboard until Aamir does
  // docs/DEPLOY.md §6, so this is the state the button is in today. `url` must
  // be null rather than undefined — the action branches on it.
  it('returns a null url when the provider is not configured', async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: null,
      error: { message: 'Unsupported provider: provider is not enabled' },
    })

    const { url, error } = await signInWithOAuth('google', 'http://localhost:3000/auth/callback')

    expect(url).toBeNull()
    expect(error).not.toBeNull()
  })
})

describe('createProfileForCurrentUser', () => {
  const details = { fullName: 'Vendor One', vendorType: 'individual' as const }

  function signedInAs(user: unknown) {
    mockGetUser.mockResolvedValue({ data: { user } })
    mockInsert.mockResolvedValue({ error: null })
  }

  // The uid and email are the two fields a caller must NOT be able to choose:
  // the uid is what profiles' RLS INSERT policy checks against auth.uid(), and
  // the email is the one the provider actually verified.
  it('writes the row under the session uid and the session email', async () => {
    signedInAs({ id: 'oauth-user-1', email: 'someone@gmail.com' })

    await createProfileForCurrentUser(details)

    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'oauth-user-1',
        email: 'someone@gmail.com',
        vendor_type: 'individual',
        full_name: 'Vendor One',
      }),
    )
  })

  it('maps the fleet business fields onto their columns', async () => {
    signedInAs({ id: 'oauth-user-2', email: 'ops@acme.com' })

    await createProfileForCurrentUser({
      fullName: 'Riya Sharma',
      vendorType: 'fleet',
      companyName: 'Acme Batteries',
      gstNumber: '22AAAAA0000A1Z5',
      panNumber: 'AAAAA0000A',
      eprRegId: 'EPR/123',
      businessAddress: '1 Industrial Estate',
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_type: 'fleet',
        company_name: 'Acme Batteries',
        gst_number: '22AAAAA0000A1Z5',
        pan_number: 'AAAAA0000A',
        epr_reg_id: 'EPR/123',
        business_address: '1 Industrial Estate',
      }),
    )
  })

  // The twin of the signUpWithProfile guard above. Both paths write a profile
  // row and both are constrained by the same grants.sql allowlist, so both need
  // the regression test — this is the one an OAuth user would come through.
  it('never sends a role, letting the database default decide it', async () => {
    signedInAs({ id: 'oauth-user-3', email: 'someone@gmail.com' })

    await createProfileForCurrentUser(details)

    const [payload] = mockInsert.mock.calls[0]
    expect(payload).not.toHaveProperty('role')
    expect(payload).not.toHaveProperty('kyc_status')
    expect(payload).not.toHaveProperty('wallet_balance_paise')
    expect(payload).not.toHaveProperty('phone_verified')
  })

  it('refuses and writes nothing when there is no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const { error } = await createProfileForCurrentUser(details)

    expect(error).toBeInstanceOf(Error)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('sendEmailOtp', () => {
  // The important one. Defaulting shouldCreateUser to true would let a typo'd
  // address create an auth user with no profiles row — which, with the Batch 6
  // role gate, is an unrecoverable login loop rather than a cosmetic problem.
  it('refuses to create an account from the login screen', async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null })

    await sendEmailOtp('vendor@example.com')

    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'vendor@example.com',
      options: { shouldCreateUser: false, emailRedirectTo: undefined },
    })
  })

  // A link-shaped mail with no emailRedirectTo falls back to the project's
  // global Site URL, which is shared with two other apps and was saved without
  // its scheme once already (2026-08-25). Passing it explicitly is what stops
  // an emailed login link depending on that one dashboard field.
  it('passes the return address through for link-shaped mails', async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null })

    await sendEmailOtp('vendor@example.com', 'https://example.test/auth/callback?next=%2Fdashboard')

    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'vendor@example.com',
      options: {
        shouldCreateUser: false,
        emailRedirectTo: 'https://example.test/auth/callback?next=%2Fdashboard',
      },
    })
  })
})

describe('verifyEmailOtp', () => {
  it('verifies the code against the email as an email-type token', async () => {
    mockVerifyOtp.mockResolvedValue({ data: {}, error: null })

    await verifyEmailOtp('vendor@example.com', '123456')

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: 'vendor@example.com',
      token: '123456',
      type: 'email',
    })
  })
})

describe('describeOtpError', () => {
  it('points a rate-limited user at the password form that still works', () => {
    expect(describeOtpError('Email rate limit exceeded')).toMatch(/password/i)
    expect(
      describeOtpError('For security purposes, you can only request this after 51 seconds'),
    ).toMatch(/password/i)
  })

  it('explains a missing account instead of leaking "signups not allowed"', () => {
    expect(describeOtpError('Signups not allowed for otp')).toMatch(/couldn't find an account/i)
  })

  it('treats an expired or invalid token as "request a new one"', () => {
    expect(describeOtpError('Token has expired or is invalid')).toMatch(/request a new one/i)
  })

  it('passes an unrecognised message through unchanged', () => {
    expect(describeOtpError('Something else entirely')).toBe('Something else entirely')
  })
})
