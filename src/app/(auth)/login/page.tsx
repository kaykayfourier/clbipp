import Link from 'next/link'
import { login } from './actions'

// Minimal, unstyled-ish login screen (wireframe S.login). Plain Tailwind for now.
// TODO: swap inputs/buttons for Person C's <Field/> / <Button/> once shipped.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-12">
      <div className="mb-2 text-center">
        <div className="mx-auto mb-3 flex h-13 w-13 items-center justify-center rounded-xl bg-black px-3 py-3 text-lg font-extrabold text-lime-400">
          B2
        </div>
        <h1 className="text-2xl font-semibold">Back2Basics</h1>
        <p className="text-sm text-zinc-500">Battery recovery &amp; EPR compliance</p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <form action={login} className="flex flex-col gap-3">
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
            autoComplete="current-password"
            placeholder="••••••••"
            className="rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="mt-1 rounded-md bg-black py-2 font-medium text-white"
        >
          Log in
        </button>
      </form>

      <Link href="/signup" className="text-center text-sm font-medium underline">
        Create account
      </Link>
      {/* TODO: wire forgot-password flow (out of scope this session) */}
      <button
        type="button"
        className="text-center text-sm text-zinc-500"
        disabled
      >
        Forgot password?
      </button>
    </main>
  )
}
