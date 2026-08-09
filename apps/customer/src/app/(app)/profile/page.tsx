import { getCurrentProfile } from '@clbipp/auth'
import { prisma } from '@clbipp/database'
import { AppShell, PagePadding, SectionLabel } from '@clbipp/ui'
import { Card, CardContent } from '@clbipp/ui'
import { logout } from './actions'

// Vendor profile / account screen. Server component — reads the caller's own
// profile via getCurrentProfile() (RLS-scoped) and renders it. Fleet business
// details are shown only for fleet accounts.
//
// Locked rule: NO recovery rate / recovered value anywhere on vendor screens.
// The wireframe HTML shows an "Avg recovery rate" row — that is stale and is
// intentionally not rendered here.

// The bottom tab bar lives in (app)/layout.tsx, which also owns the clearance
// under it, so AppShell only needs hideNav to avoid rendering a second bar.

// Up-to-two-letter monogram for the avatar, from the account's display name.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

// Weight is shown in kg, switching to tonnes once it's large enough to read
// better that way. Weight/counts only — never a recovery rate or value (locked
// rule), so these aggregates are safe to show the vendor.
function formatWeight(kg: number): string {
  if (kg <= 0) return '0 kg'
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`
  return `${Math.round(kg)} kg`
}

// A single stat box in the summary grid.
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card variant="elevated">
      <CardContent>
        <div className="font-serif text-xl font-semibold text-text-primary">
          {value}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-widest text-text-secondary">
          {label}
        </div>
      </CardContent>
    </Card>
  )
}

// One label/value line inside a details card.
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="shrink-0 text-sm text-text-secondary">{label}</span>
      <span className="text-right text-sm font-medium text-text-primary">
        {value}
      </span>
    </div>
  )
}

export default async function ProfilePage() {
  const data = await getCurrentProfile()

  // Middleware already guards this route; these are defensive fallbacks only.
  const email = data?.user.email ?? 'unknown'
  const profile = data?.profile
  const isFleet = profile?.vendor_type === 'fleet'

  // For a fleet account the company is the headline identity; the contact
  // person's name lives in full_name. For an individual, the person is it.
  const displayName =
    (isFleet ? profile?.company_name : profile?.full_name) ??
    profile?.full_name ??
    email
  const subtitle = isFleet
    ? profile?.epr_reg_id ?? 'Fleet account'
    : 'Individual account'

  // Account summary. vendorId is the profile/auth id and equals Pickup.vendorId.
  // "Recycled" uses certified weight (the verified, closed-loop total), not the
  // vendor's request-time estimate. Three reads, run together.
  const vendorId = data?.user.id
  const [pickupCount, certCount, weightAgg] = vendorId
    ? await Promise.all([
        prisma.pickup.count({ where: { vendorId } }),
        prisma.certificate.count({ where: { vendorId } }),
        prisma.certificate.aggregate({
          _sum: { totalWeightKg: true },
          where: { vendorId },
        }),
      ])
    : [0, 0, { _sum: { totalWeightKg: null } }]
  const recycledKg = Number(weightAgg._sum.totalWeightKg ?? 0)

  return (
    <AppShell title="Profile" hideNav>
      <PagePadding className="flex flex-col gap-4">
        {/* Identity */}
        <Card className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[13px] bg-primary-black text-[17px] font-extrabold text-primary-green">
            {initials(displayName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-text-primary">
              {displayName}
            </p>
            <p className="truncate text-xs text-text-secondary">{subtitle}</p>
          </div>
        </Card>

        {/* Account summary */}
        <div className="grid grid-cols-3 gap-2">
          <Stat value={String(pickupCount)} label="Submitted" />
          <Stat value={formatWeight(recycledKg)} label="Recycled" />
          <Stat value={String(certCount)} label="Certificates" />
        </div>

        {/* Account */}
        <Card>
          <SectionLabel className="mb-3">Account</SectionLabel>
          <div className="divide-y divide-border">
            {!isFleet && profile?.full_name && (
              <Row label="Name" value={profile.full_name} />
            )}
            <Row label="Email" value={email} />
            <Row label="Account type" value={isFleet ? 'Fleet' : 'Individual'} />
          </div>
        </Card>

        {/* Business details — fleet only */}
        {isFleet && (
          <Card>
            <SectionLabel className="mb-3">Business details</SectionLabel>
            <div className="divide-y divide-border">
              {profile?.company_name && (
                <Row label="Company" value={profile.company_name} />
              )}
              {profile?.full_name && (
                <Row label="Contact" value={profile.full_name} />
              )}
              {profile?.gst_number && (
                <Row label="GST number" value={profile.gst_number} />
              )}
              {profile?.pan_number && (
                <Row label="PAN number" value={profile.pan_number} />
              )}
              {profile?.epr_reg_id && (
                <Row label="EPR reg ID" value={profile.epr_reg_id} />
              )}
              {profile?.business_address && (
                <Row label="Address" value={profile.business_address} />
              )}
            </div>
          </Card>
        )}

        {/* Sign out — server action (signOut() is server-bound; see actions.ts) */}
        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-[14px] border border-border bg-surface py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-background-pressed"
          >
            Log out
          </button>
        </form>
      </PagePadding>
    </AppShell>
  )
}
