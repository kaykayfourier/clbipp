import Link from 'next/link'
import { signup } from './actions'

// Minimal-but-atomic signup: enough to create the auth user AND its profiles row
// in one go (see signUpWithProfile). The full styled flow — a dedicated
// account-type selector screen and the Fleet business/KYC fields — is the
// follow-up; KYC upload + verification stays Person B's post-signup step
// (docs/LANE_OWNERSHIP.md).
// TODO: swap inputs/buttons for Person C's <Field/> / <Button/> once shipped.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-12">
      <div className="mb-1">
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="text-sm text-zinc-500">
          Start offloading batteries and earning EPR certificates.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <form action={signup} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>Full name</span>
          <input
            type="text"
            name="fullName"
            required
            autoComplete="name"
            placeholder="Full name"
            className="rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            className="rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Password</span>
          <input
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Create a password"
            className="rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1">Account type</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="vendorType" value="individual" defaultChecked />
            <span>Individual</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="vendorType" value="fleet" />
            <span>Fleet / company</span>
          </label>
          <p className="text-xs text-zinc-500">
            Fleet accounts complete business details &amp; KYC after signing up.
          </p>
        </fieldset>

        <button
          type="submit"
          className="mt-1 rounded-md bg-black py-2 font-medium text-white"
        >
          Create account
        </button>
      </form>

      <Link href="/login" className="text-center text-sm font-medium underline">
        Already have an account? Log in
      </Link>
    </main>
  )
}
