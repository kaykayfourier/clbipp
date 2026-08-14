import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell, Button, Card, CardDescription, CardTitle, PagePadding } from '@clbipp/ui'
import { getCurrentUser } from '@clbipp/auth'
import { Field } from '../field'
import { abandonOnboarding, completeOnboarding } from './actions'

/**
 * Finish setting up an OAuth account (Batch 11).
 *
 * Google gives us an auth.users row and no profile, so this is where the app
 * asks for the one thing no provider can tell us — individual or fleet — plus
 * the fields that answer decides. Until this posts, the middleware sends every
 * other route back here (`onboardingPath` in src/middleware.ts).
 *
 * It mirrors the two-step signup flow deliberately: no `?type` renders the same
 * account-type selector as /signup, and each choice renders the matching form.
 * One mental model, and the local <Field> is shared with both.
 *
 * The middleware also handles the two states this page must never be in: no
 * session at all (→ /login) and a session that ALREADY has a profile
 * (→ /dashboard, so a second insert can't be posted). The guard below is a
 * belt-and-braces for the session case only — a page that reads `user.email`
 * shouldn't assume a middleware ran.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; error?: string }>
}) {
  const { type, error } = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Google sends the display name in user_metadata under one of two keys
  // depending on the provider; prefill it and let them correct it. An empty
  // "Full name" on a screen that already knows the name reads as a broken form.
  const metadata = user.user_metadata ?? {}
  const suggestedName =
    typeof metadata.full_name === 'string'
      ? metadata.full_name
      : typeof metadata.name === 'string'
        ? metadata.name
        : ''

  const vendorType = type === 'fleet' ? 'fleet' : type === 'individual' ? 'individual' : null

  return (
    <AppShell
      title="Finish setting up"
      showBack={vendorType !== null}
      backHref="/onboarding"
      hideNav
    >
      <PagePadding className="flex flex-col gap-5">
        <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
          <p className="text-[11px] font-bold tracking-wide text-text-secondary">SIGNED IN AS</p>
          <p className="text-sm font-medium text-text-primary">{user.email}</p>
        </div>

        {error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {vendorType === null ? (
          <>
            <p className="text-sm text-text-secondary">
              One more step — what kind of account is this? It decides which
              details and which compliance documents we ask you for.
            </p>

            <div className="flex flex-col gap-3">
              <Link href="/onboarding?type=individual" className="block">
                <Card variant="outline" className="transition-colors hover:border-primary-green">
                  <CardTitle>Individual</CardTitle>
                  <CardDescription>Offloading batteries on your own behalf.</CardDescription>
                </Card>
              </Link>

              <Link href="/onboarding?type=fleet" className="block">
                <Card variant="outline" className="transition-colors hover:border-primary-green">
                  <CardTitle>Fleet / company</CardTitle>
                  <CardDescription>
                    A business with GST, PAN and EPR registration.
                  </CardDescription>
                </Card>
              </Link>
            </div>
          </>
        ) : (
          <form action={completeOnboarding} className="flex flex-col gap-3">
            <input type="hidden" name="vendorType" value={vendorType} />

            {vendorType === 'fleet' ? (
              <>
                <p className="text-sm text-text-secondary">
                  Business details now; KYC documents after you finish.
                </p>
                <Field
                  label="Company name"
                  name="companyName"
                  type="text"
                  required
                  placeholder="Acme Batteries Pvt Ltd"
                />
              </>
            ) : null}

            <Field
              label={vendorType === 'fleet' ? 'Contact name' : 'Full name'}
              name="fullName"
              type="text"
              required
              autoComplete="name"
              defaultValue={suggestedName}
              placeholder="Your name"
            />
            {/* Optional and unverified, exactly as at signup — phone_verified
                stays false until SMS OTP ships (Plan v2 D2). Collected so the
                field agent has a number to call on the doorstep. */}
            <Field
              label="Mobile (optional)"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="98765 43210"
            />

            {vendorType === 'fleet' ? (
              <>
                <Field
                  label="EPR registration ID"
                  name="eprRegId"
                  type="text"
                  required
                  placeholder="EPR/…"
                />
                <Field
                  label="GST number"
                  name="gstNumber"
                  type="text"
                  required
                  placeholder="22AAAAA0000A1Z5"
                />
                <Field
                  label="PAN number"
                  name="panNumber"
                  type="text"
                  required
                  placeholder="AAAAA0000A"
                />
                <Field
                  label="Business address"
                  name="businessAddress"
                  type="text"
                  required
                  placeholder="Registered address"
                />
              </>
            ) : null}

            <Button type="submit" fullWidth className="mt-1">
              Finish setup
            </Button>
          </form>
        )}

        {/* Without this a wrong-account sign-in is unrecoverable: every other
            route redirects back here until a profile row exists. */}
        <form action={abandonOnboarding}>
          <button type="submit" className="w-full text-center text-sm text-text-secondary underline">
            Not you? Sign out
          </button>
        </form>
      </PagePadding>
    </AppShell>
  )
}
