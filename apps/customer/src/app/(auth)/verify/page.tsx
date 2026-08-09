import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell, Button, PagePadding } from '@clbipp/ui'
import { resendCode, verifyCode } from './actions'

// Step 2 of email-OTP login (Plan v2 D2). The email arrives as a query param
// from /login rather than a cookie — it isn't a secret, and the code from the
// inbox is what actually authenticates. Landing here without one means the user
// deep-linked or refreshed across a lost redirect, so we send them back.
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string; sent?: string }>
}) {
  const { email, error, sent } = await searchParams
  if (!email) redirect('/login')

  return (
    <AppShell title="Check your email" showBack backHref="/login" hideNav>
      <PagePadding className="flex flex-col gap-5 py-6">
        <div>
          <p className="text-sm text-text-secondary">
            We sent a 6-digit code to
          </p>
          <p className="text-sm font-semibold text-text-primary">{email}</p>
        </div>

        {error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {sent && !error ? (
          <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            New code sent.
          </p>
        ) : null}

        <form action={verifyCode} className="flex flex-col gap-3">
          <input type="hidden" name="email" value={email} />
          <label htmlFor="code" className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-wide text-text-secondary">
              6-digit code
            </span>
            <input
              id="code"
              name="code"
              // inputMode + autoComplete let iOS/Android offer the code straight
              // from the notification instead of making the user switch apps.
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9\s]*"
              maxLength={7}
              required
              autoFocus
              placeholder="123456"
              className="rounded-lg border border-border bg-surface px-3 py-2.5 text-center text-lg tracking-[0.4em] text-text-primary placeholder:tracking-normal placeholder:text-text-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green"
            />
          </label>

          <Button type="submit" fullWidth className="mt-1">
            Log in
          </Button>
        </form>

        <form action={resendCode}>
          <input type="hidden" name="email" value={email} />
          <button type="submit" className="w-full text-center text-sm font-medium underline">
            Send a new code
          </button>
        </form>

        <p className="text-center text-xs text-text-secondary">
          Codes can take a minute and sometimes land in spam. You can always{' '}
          <Link href="/login" className="font-medium underline">
            log in with your password
          </Link>{' '}
          instead.
        </p>
      </PagePadding>
    </AppShell>
  )
}
