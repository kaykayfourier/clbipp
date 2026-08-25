import { headers } from 'next/headers'

/**
 * The app's own origin, taken from the request rather than an env var.
 *
 * Redirect URLs are per-origin, but the app doesn't need to be told what it is.
 * Reading it here means localhost and the Vercel origin both work with no
 * NEXT_PUBLIC_SITE_URL to keep in sync (and nothing to get wrong on a preview
 * deployment, which gets a different hostname on every push).
 *
 * x-forwarded-* first: behind Vercel's proxy `host` is the internal hostname.
 *
 * Shared by both flows that hand Supabase a return address — OAuth sign-in
 * (oauth-actions.ts) and the emailed login link (login/verify actions). It was
 * private to oauth-actions until 2026-08-25; a second copy is how one of them
 * ends up pointing somewhere the Redirect URLs allowlist doesn't cover.
 */
export async function requestOrigin() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** Where every Supabase auth redirect comes back to. */
export async function authCallbackUrl(next = '/dashboard') {
  return `${await requestOrigin()}/auth/callback?next=${encodeURIComponent(next)}`
}
