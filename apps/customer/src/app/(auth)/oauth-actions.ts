'use server'

import { redirect } from 'next/navigation'
import { signInWithOAuth } from '@clbipp/auth'
import { authCallbackUrl } from './request-origin'

/**
 * Step 1 of Google sign-in: swap a click for the provider's consent URL.
 *
 * The redirect lands on /auth/callback, which already handles the PKCE `?code=`
 * shape this flow returns and already refuses an off-origin `next`. From there
 * the middleware takes over: a first-time Google user has no profiles row, so
 * it routes them to /onboarding rather than signing them out.
 */
export async function signInWithGoogle() {
  const { url, error } = await signInWithOAuth('google', await authCallbackUrl())

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
