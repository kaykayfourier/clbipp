import { Field } from './field'
import { login } from './actions'

// Login — the admin console's only public screen (wireframe A01, corrected by
// W10 and AD2).
//
// 🔴 Deliberately NOT built on <AppShell> or <PhoneFrame>. Those are the mobile
// kit's primitives and this is a desktop app (AD11, trap 15) — importing one
// out of habit is the failure mode R5 names. The centred card below is the
// whole layout; there is no shell to share, because ConsoleShell needs a
// session and this screen runs without one.
//
// Also deliberately NOT a copy of the customer login:
//   · Email + password only. No "Create account", no OAuth, no email code.
//     Admins do not self-sign-up (AD2) — accounts come from the seed. Each of
//     those absent doors is asserted in scripts/smoke.mjs, so a copy-paste from
//     apps/customer fails the run rather than quietly shipping a signup route
//     into the console that sees every price in the business.
//   · No "ADMIN · OPS" role line from the wireframe's sidebar footer: `ops` is
//     not a UserRole and is not being added (W10 / AD2).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="flex h-full items-center justify-center overflow-auto bg-console-app px-6 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[9px] bg-primary-black text-sm font-extrabold text-primary-green">
            B2
          </div>
          <h1 className="font-display text-2xl font-medium tracking-[-0.01em] text-text-primary">
            Admin Console
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Back2Basics battery recovery
          </p>
        </div>

        <div className="rounded-xl border border-console-line bg-surface p-6 shadow-sm">
          {/* Carries two different messages: a Supabase auth failure from the
              action, and "That account cannot access this app." — which is what
              the proxy's role gate sets when a vendor or agent signs in with
              valid credentials and is bounced straight back out. */}
          {error ? (
            <p
              role="alert"
              className="mb-4 rounded-md bg-error-bg px-3 py-2 text-sm text-error-text"
            >
              {error}
            </p>
          ) : null}

          <form action={login} className="flex flex-col gap-4">
            <Field
              label="Email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="admin@back2basics.in"
            />
            <Field
              label="Password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />

            <button
              type="submit"
              className="mt-1 w-full rounded-lg bg-primary-black px-4 py-3 text-sm font-bold text-primary-green transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green focus-visible:ring-offset-2"
            >
              Sign in
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-text-secondary">
          Console accounts are issued internally. There is no self-service
          sign-up.
        </p>
      </div>
    </main>
  )
}
