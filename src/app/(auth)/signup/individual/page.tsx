import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Field } from '../field'
import { signupIndividual } from '../actions'

// Step 2a: individual signup form. Collects the auth-complete minimum
// (name/email/password) → signUpWithProfile({ vendorType: 'individual' }).
export default async function SignupIndividualPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-12">
      <div className="mb-1">
        <Link href="/signup" className="text-sm text-text-secondary underline">
          ← Account type
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Individual account</h1>
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form action={signupIndividual} className="flex flex-col gap-3">
        <Field label="Full name" name="fullName" type="text" required autoComplete="name" placeholder="Your name" />
        <Field label="Email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        <Field label="Password" name="password" type="password" required minLength={6} autoComplete="new-password" placeholder="Create a password" />

        <Button type="submit" fullWidth className="mt-1">
          Create account
        </Button>
      </form>
    </main>
  )
}
