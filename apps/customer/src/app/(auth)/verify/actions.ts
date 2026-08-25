'use server'

import { redirect } from 'next/navigation'
import { describeOtpError, sendEmailOtp, verifyEmailOtp } from '@clbipp/auth'
import { authCallbackUrl } from '../request-origin'

// Codes are 6 digits; Supabase sends them as a plain numeric string.
const CODE_PATTERN = /^\d{6}$/

function backToVerify(email: string, opts: { error?: string; sent?: boolean } = {}): never {
  const params = new URLSearchParams({ email })
  if (opts.error) params.set('error', opts.error)
  if (opts.sent) params.set('sent', '1')
  redirect(`/verify?${params.toString()}`)
}

/** Step 2 of OTP login: exchange the emailed code for a session. */
export async function verifyCode(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  // Users paste codes with spaces ("123 456") from the mail client — strip
  // anything that isn't a digit before validating rather than rejecting them.
  const code = String(formData.get('code') ?? '').replace(/\D/g, '')

  if (!email) redirect('/login?error=Start+again+—+we+lost+track+of+your+email.')
  if (!CODE_PATTERN.test(code)) {
    backToVerify(email, { error: 'Enter the 6-digit code from your email.' })
  }

  const { error } = await verifyEmailOtp(email, code)
  if (error) backToVerify(email, { error: describeOtpError(error.message) })

  // verifyOtp wrote the session cookies through the SSR client, so the caller
  // is authenticated from here on. Middleware re-checks the role on the way in.
  redirect('/dashboard')
}

/** Re-send a code from the verify screen (a mail can be slow or land in spam). */
export async function resendCode(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) redirect('/login?error=Start+again+—+we+lost+track+of+your+email.')

  const { error } = await sendEmailOtp(email, await authCallbackUrl())
  if (error) backToVerify(email, { error: describeOtpError(error.message) })

  backToVerify(email, { sent: true })
}
