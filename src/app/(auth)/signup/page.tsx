import Link from 'next/link'
import { Card, CardTitle, CardDescription } from '@/components/ui/card'

// Step 1 of the split signup flow: account-type selector. No form fields — each
// card routes to the matching form (step 2). Individual vs Fleet decides which
// business fields we collect and what vendor_type the profile row gets.
export default function SignupTypePage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="text-sm text-text-secondary">
          What kind of account are you setting up?
        </p>
      </div>

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
    </main>
  )
}
