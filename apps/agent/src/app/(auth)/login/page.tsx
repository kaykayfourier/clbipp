import { AppShell, PagePadding, Button } from '@clbipp/ui'
import { Field } from '../field'
import { login } from './actions'

// Login — the agent app's only public screen (wireframe S.login, corrected by
// W7/D6).
//
// Deliberately NOT a copy of the customer login:
//   · Email + password only. The wireframe drew Agent ID + OTP; there is no
//     agent-id column and no OTP infrastructure worth demoing (W7).
//   · No "Create account" link, no OAuth. Agents do not self-sign-up (D6) —
//     accounts come from the seed. A signup route here would be the thing D6
//     rules out, so its absence is asserted in scripts/smoke.mjs.
//
// hideNav because AppShell's built-in tab bar is the customer's, and an
// unauthenticated screen should show no nav at all.
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
          <h1 className="text-2xl font-semibold text-text-primary">Field Agent</h1>
          <p className="text-sm text-text-secondary">
            Back2Basics battery recovery
          </p>
        </div>

        {/* Carries two different messages: a Supabase auth failure from the
            action, and "That account cannot access this app." — which is what
            the proxy's role gate sets when a vendor or admin signs in with
            valid credentials and is bounced straight back out. */}
        {error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <form action={login} className="flex flex-col gap-3">
          <Field
            label="Email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="agent@back2basics.in"
          />
          <Field
            label="Password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />

          <Button type="submit" fullWidth className="mt-1">
            Log in
          </Button>
        </form>

        <p className="text-center text-xs text-text-secondary">
          Accounts are issued by your operations team. Contact your supervisor if
          you cannot sign in.
        </p>
      </PagePadding>
    </AppShell>
  )
}
