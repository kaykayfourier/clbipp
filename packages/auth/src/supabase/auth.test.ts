import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  describeOtpError,
  sendEmailOtp,
  signIn,
  signUpWithProfile,
  verifyEmailOtp,
} from './auth'

const mockSignInWithPassword = vi.fn()
const mockSignUp = vi.fn()
const mockSignInWithOtp = vi.fn()
const mockVerifyOtp = vi.fn()
const mockInsert = vi.fn()
const mockFrom = vi.fn(() => ({ insert: mockInsert }))

vi.mock('./server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: mockVerifyOtp,
    },
    from: mockFrom,
  })),
}))

beforeEach(() => {
  mockSignInWithPassword.mockReset()
  mockSignUp.mockReset()
  mockSignInWithOtp.mockReset()
  mockVerifyOtp.mockReset()
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

describe('sendEmailOtp', () => {
  // The important one. Defaulting shouldCreateUser to true would let a typo'd
  // address create an auth user with no profiles row — which, with the Batch 6
  // role gate, is an unrecoverable login loop rather than a cosmetic problem.
  it('refuses to create an account from the login screen', async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null })

    await sendEmailOtp('vendor@example.com')

    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'vendor@example.com',
      options: { shouldCreateUser: false },
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
