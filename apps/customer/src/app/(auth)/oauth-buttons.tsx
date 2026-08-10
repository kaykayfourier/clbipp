import { Button } from '@clbipp/ui'
import { signInWithGoogle } from './oauth-actions'

/**
 * Provider sign-in, shared by /login and /signup (Batch 11).
 *
 * One component for both screens on purpose: with OAuth there is no difference
 * between signing in and signing up — the same button does both, and the
 * profile row that used to be signup's job is written at /onboarding after the
 * provider comes back.
 *
 * Apple is deliberately absent. It needs a paid Apple Developer account before
 * the provider can be enabled in Supabase, so a button would only ever return
 * "provider is not enabled" (Aamir's call, 2026-08-10). `signInWithOAuth` in
 * @clbipp/auth already takes the provider, so adding it is a form and a
 * dashboard toggle.
 */
export function OAuthButtons() {
  return (
    <form action={signInWithGoogle}>
      <Button type="submit" variant="secondary" fullWidth>
        <GoogleMark />
        Continue with Google
      </Button>
    </form>
  )
}

/** Inline so the mark ships with the bundle — the buckets are private and an
 *  external logo URL is one more thing that can fail on a slow connection. */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.02-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.02 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
