'use server'

import { redirect } from 'next/navigation'
import { signIn } from '@clbipp/auth'

// Password login, and the only way into this app.
//
// No OTP and no OAuth, same as the agent app: admins do not self-sign-up (AD2
// + the agent app's D6), accounts come from the seed, and Supabase's built-in
// SMTP rate-limits at roughly 2–4 mails/hour — not something to put in front of
// the one screen that has to work during a demo.
export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const { error } = await signIn(email, password)
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  // The dashboard. Matches `homePath` in src/proxy.ts — if one moves, move both.
  //
  // ⚠ This redirect fires for a valid vendor or agent credential too: signIn
  // only checks the password, not the role. The proxy's allowRoles gate catches
  // it on the very next request and signs them back out to
  // /login?error=That account cannot access this app. Doing the role check here
  // as well would duplicate the boundary in a second place that could drift —
  // and the proxy is the one that has to be right, because it is what guards
  // every other route.
  redirect('/')
}
