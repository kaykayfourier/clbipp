import { AppShell, PagePadding } from '@clbipp/ui'
import { Button } from '@clbipp/ui'
import { Field } from '../../field'
import { signupFleet } from '../actions'

// Step 2b: fleet signup form. Collects business text fields (company/GST/PAN/
// EPR/address) alongside the auth basics; they're written to the profile row in
// signUpWithProfile. "Contact name" maps to full_name (no separate column).
// KYC *document upload* is Person B's post-signup step — not collected here.
export default async function SignupFleetPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <AppShell title="Fleet account" showBack backHref="/signup" hideNav>
      <PagePadding className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          Business details now; KYC documents after you sign up.
        </p>

        {error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <form action={signupFleet} className="flex flex-col gap-3">
          <Field label="Company name" name="companyName" type="text" required placeholder="Acme Batteries Pvt Ltd" />
          <Field label="Contact name" name="fullName" type="text" required autoComplete="name" placeholder="Primary contact person" />
          <Field label="Email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
          <Field label="Password" name="password" type="password" required minLength={6} autoComplete="new-password" placeholder="Create a password" />
          <Field label="EPR registration ID" name="eprRegId" type="text" required placeholder="EPR/…" />
          <Field label="GST number" name="gstNumber" type="text" required placeholder="22AAAAA0000A1Z5" />
          <Field label="PAN number" name="panNumber" type="text" required placeholder="AAAAA0000A" />
          <Field label="Business address" name="businessAddress" type="text" required placeholder="Registered address" />

          <Button type="submit" fullWidth className="mt-1">
            Create account
          </Button>
        </form>
      </PagePadding>
    </AppShell>
  )
}
