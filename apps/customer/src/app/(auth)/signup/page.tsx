import Link from 'next/link'
import { AppShell, PagePadding } from '@clbipp/ui'
import { Card, CardTitle, CardDescription } from '@clbipp/ui'
import { OAuthButtons } from '../oauth-buttons'

// Step 1 of the split signup flow: account-type selector. No form fields — each
// card routes to the matching form (step 2). Individual vs Fleet decides which
// business fields we collect and what vendor_type the profile row gets.
// hideNav: the bottom tab bar must not show during onboarding.
export default function SignupTypePage() {
  return (
    <AppShell title="Create account" showBack backHref="/login" hideNav>
      <PagePadding className="flex flex-col gap-5">
        {/* Batch 11. Above the account-type cards, because with OAuth the type
            question moves to /onboarding — the provider answers name, email and
            password, and only vendor_type is still ours to ask. */}
        <OAuthButtons />

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-bold tracking-wide text-text-secondary">OR</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <p className="text-sm text-text-secondary">
          What kind of account are you setting up?
        </p>

        <div className="flex flex-col gap-3">
          <Link href="/signup/individual" className="block">
            <Card variant="outline" className="transition-colors hover:border-primary-green">
              <CardTitle>Individual</CardTitle>
              <CardDescription>
                Offloading batteries on your own behalf.
              </CardDescription>
            </Card>
          </Link>

          <Link href="/signup/fleet" className="block">
            <Card variant="outline" className="transition-colors hover:border-primary-green">
              <CardTitle>Fleet / company</CardTitle>
              <CardDescription>
                A business with GST, PAN and EPR registration.
              </CardDescription>
            </Card>
          </Link>
        </div>

        <Link href="/login" className="text-center text-sm font-medium underline">
          Already have an account? Log in
        </Link>
      </PagePadding>
    </AppShell>
  )
}
