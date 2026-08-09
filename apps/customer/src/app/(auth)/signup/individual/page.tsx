import { AppShell, PagePadding } from '@clbipp/ui'
import { Button } from '@clbipp/ui'
import { Field } from '../../field'
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
    <AppShell title="Individual account" showBack backHref="/signup" hideNav>
      <PagePadding className="flex flex-col gap-4">
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
      </PagePadding>
    </AppShell>
  )
}
