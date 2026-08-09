import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signIn, signUpWithProfile } from './auth'

const mockSignInWithPassword = vi.fn()
const mockSignUp = vi.fn()
const mockInsert = vi.fn()
const mockFrom = vi.fn(() => ({ insert: mockInsert }))

vi.mock('./server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
    },
    from: mockFrom,
  })),
}))

beforeEach(() => {
  mockSignInWithPassword.mockReset()
  mockSignUp.mockReset()
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
