import Link from 'next/link'
import { AppShell, PagePadding } from '@clbipp/ui'
import { Button } from '@clbipp/ui'
import { Field } from '../field'
import { login, requestOtp } from './actions'

// Login (wireframe S.login): the auth entry point. No top bar/back — it's the
// root auth screen — and hideNav so the tab bar stays hidden until logged in.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <AppShell hideNav>
      <PagePadding className="flex flex-col gap-5 py-10">
        <div className="mb-1 text-center">
          <div className="mx-auto mb-3 flex h-13 w-13 items-center justify-center rounded-xl bg-primary-black px-3 py-3 text-lg font-extrabold text-primary-green">
            B2
          </div>
          <h1 className="text-2xl font-semibold text-text-primary">Back2Basics</h1>
          <p className="text-sm text-text-secondary">
            Battery recovery &amp; EPR compliance
          </p>
        </div>

        {error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <form action={login} className="flex flex-col gap-3">
          <Field label="Email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
          <Field label="Password" name="password" type="password" required autoComplete="current-password" placeholder="••••••••" />

          <Button type="submit" fullWidth className="mt-1">
            Log in
          </Button>
        </form>

        {/* Email OTP (Plan v2 D2) sits BELOW the password form on purpose.
            Supabase's built-in SMTP allows only ~2–4 mails/hour, so on demo day
            the password path is the one that reliably works. */}
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-bold tracking-wide text-text-secondary">OR</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <form action={requestOtp} className="flex flex-col gap-3">
          <Field
            label="Email me a login code"
            name="otpEmail"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
          />
          <Button type="submit" variant="secondary" fullWidth>
            Send code
          </Button>
        </form>

        <Link href="/signup" className="text-center text-sm font-medium underline">
          Create account
        </Link>
        {/* TODO: wire forgot-password flow (out of scope this session) */}
        <button type="button" className="text-center text-sm text-text-secondary" disabled>
          Forgot password?
        </button>
      </PagePadding>
    </AppShell>
  )
}
