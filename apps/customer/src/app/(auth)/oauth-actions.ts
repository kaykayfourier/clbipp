'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { signInWithOAuth } from '@clbipp/auth'

/**
 * The app's own origin, taken from the request rather than an env var.
 *
 * OAuth redirect URLs are per-origin, which is the whole reason Batch 12's
 * deploy waited for this batch — but the app doesn't need to be told what it is.
 * Reading it here means localhost and the Vercel origin both work with no
 * NEXT_PUBLIC_SITE_URL to keep in sync (and nothing to get wrong on a preview
 * deployment, which gets a different hostname on every push).
 *
 * x-forwarded-* first: behind Vercel's proxy `host` is the internal hostname.
 */
async function requestOrigin() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/**
 * Step 1 of Google sign-in: swap a click for the provider's consent URL.
 *
 * The redirect lands on /auth/callback, which already handles the PKCE `?code=`
 * shape this flow returns and already refuses an off-origin `next`. From there
 * the middleware takes over: a first-time Google user has no profiles row, so
 * it routes them to /onboarding rather than signing them out.
 */
export async function signInWithGoogle() {
  const origin = await requestOrigin()
  const { url, error } = await signInWithOAuth(
    'google',
    `${origin}/auth/callback?next=/dashboard`,
  )

  if (error || !url) {
    // The likely cause by far is that the provider isn't enabled in the
    // Supabase dashboard yet (docs/DEPLOY.md §6). Say something a person can
    // act on and point at the paths that definitely work, rather than
    // forwarding "Unsupported provider: provider is not enabled".
    redirect(
      '/login?error=' +
        encodeURIComponent(
          "Google sign-in isn't available right now. Use your email and password, or request a login code.",
        ),
    )
  }

  redirect(url)
}
