import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createAuthMiddleware } from './middleware'

// ─── Why this file exists ────────────────────────────────────────────────────
// The middleware is the app's access boundary, and Batch 11 added a branch to
// it that `npm run smoke` structurally cannot reach: the profile-less session.
// Smoke logs in as a seeded user, and every seeded user HAS a profile row — so
// the one state OAuth actually produces is the one the smoke test can't create.
// These tests cover it, plus the three neighbouring outcomes it must not
// disturb.

const mockGetUser = vi.fn()
const mockSignOut = vi.fn()
const mockSingle = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser, signOut: mockSignOut },
    from: () => ({ select: () => ({ eq: () => ({ single: mockSingle }) }) }),
  })),
}))

const OPTIONS = {
  publicPaths: ['/login', '/signup', '/auth', '/t', '/verify'],
  homePath: '/dashboard',
  allowRoles: ['customer'],
  onboardingPath: '/onboarding',
}

beforeEach(() => {
  mockGetUser.mockReset()
  mockSignOut.mockReset().mockResolvedValue({ error: null })
  mockSingle.mockReset()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
})

function signedIn() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
}
/** What PostgREST returns for `.single()` against zero rows. */
function withNoProfileRow() {
  mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
}
function withProfile(role: string) {
  mockSingle.mockResolvedValue({ data: { role }, error: null })
}

async function run(pathname: string, options = OPTIONS) {
  const middleware = createAuthMiddleware(options)
  const response = await middleware(new NextRequest(`http://localhost:3000${pathname}`))
  return {
    status: response.status,
    location: response.headers.get('location'),
  }
}

describe('profile-less session (what OAuth produces)', () => {
  it('is sent to onboarding rather than signed out', async () => {
    signedIn()
    withNoProfileRow()

    const { location } = await run('/dashboard')

    expect(location).toBe('http://localhost:3000/onboarding')
    // The point of the whole branch: signing out here is what made a Google
    // sign-in an unrecoverable loop, because signOut also clears the refresh
    // token so retrying can't help.
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('is allowed to render the onboarding screen itself', async () => {
    signedIn()
    withNoProfileRow()

    const { location } = await run('/onboarding')

    // No redirect — otherwise the screen could never be reached by the only
    // session that needs it.
    expect(location).toBeNull()
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  // Agent and admin have no onboarding flow, so for them a half-created account
  // is still a dead end and the Batch 6 behaviour must be untouched.
  it('is still signed out in an app with no onboardingPath', async () => {
    signedIn()
    withNoProfileRow()

    const { location } = await run('/dashboard', {
      ...OPTIONS,
      onboardingPath: undefined,
    })

    expect(mockSignOut).toHaveBeenCalled()
    expect(location).toContain('/login')
  })
})

describe('session that already has a profile', () => {
  it('is kept off the onboarding form, so a second insert cannot be posted', async () => {
    signedIn()
    withProfile('customer')

    const { location } = await run('/onboarding')

    expect(location).toBe('http://localhost:3000/dashboard')
  })

  it('reaches app routes normally', async () => {
    signedIn()
    withProfile('customer')

    const { location } = await run('/dashboard')

    expect(location).toBeNull()
  })

  // Batch 6's role gate, re-asserted because Batch 11 restructured the block
  // around it.
  it('is signed out when the role is wrong for this app', async () => {
    signedIn()
    withProfile('agent')

    const { location } = await run('/dashboard')

    expect(mockSignOut).toHaveBeenCalled()
    expect(location).toContain('/login')
  })

  // A wrong-role session must not get a free pass just because onboarding is
  // exempt from the role check.
  it('is signed out on the onboarding path too when the role is wrong', async () => {
    signedIn()
    withProfile('agent')

    const { location } = await run('/onboarding')

    expect(mockSignOut).toHaveBeenCalled()
    expect(location).toContain('/login')
  })
})

describe('no session', () => {
  // /onboarding is deliberately NOT a public path. It needs a session; it just
  // doesn't need a role yet. Asserting this is what stops someone "fixing" a
  // redirect loop by adding it to publicPaths.
  it('cannot reach onboarding', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const { location } = await run('/onboarding')

    expect(location).toContain('/login')
  })
})

describe('infrastructure error on the profile read', () => {
  // Batch 6 decision, re-asserted: a dropped connection must not log the whole
  // app out, and it must not be mistaken for "no profile" and send a perfectly
  // good account to onboarding either.
  it('fails open — no sign-out and no onboarding redirect', async () => {
    signedIn()
    mockSingle.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection failure' } })

    const { location } = await run('/dashboard')

    expect(mockSignOut).not.toHaveBeenCalled()
    expect(location).toBeNull()
  })
})
