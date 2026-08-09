import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@clbipp/auth/server'

/**
 * Magic-link landing route — the safety net for email login.
 *
 * Whether a customer gets a 6-digit code or a clickable link depends on the
 * Supabase email template, which is dashboard config we don't hold in this repo:
 *
 *   - template contains `{{ .Token }}`            → code  → /verify handles it
 *   - template contains `{{ .ConfirmationURL }}`  → link  → lands here
 *
 * The default is the link. Without this route, turning on OTP against an
 * unconfigured project produces emails whose only affordance is a link that
 * 404s. Supporting both means login works either way and the template becomes a
 * preference rather than a prerequisite.
 *
 * Two link shapes exist depending on the template's age, so handle both:
 *   ?token_hash=…&type=…   (current templates, verifyOtp)
 *   ?code=…                (PKCE flow, exchangeCodeForSession)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')

  // Only ever redirect to a path on this origin — `next` comes from a URL a
  // user can edit, and an unchecked value turns the login flow into an open
  // redirect that phishes a freshly-issued session.
  const requested = searchParams.get('next') ?? '/dashboard'
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard'

  const supabase = await createClient()

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(new URL(next, origin))
    return failed(origin, error.message)
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, origin))
    return failed(origin, error.message)
  }

  return failed(origin, 'That login link is incomplete. Request a new code.')
}

function failed(origin: string, message: string) {
  const url = new URL('/login', origin)
  url.searchParams.set('error', message)
  return NextResponse.redirect(url)
}
