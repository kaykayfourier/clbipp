// /profile  —  Batch 8 · Aamir
//
// The agent's own account: who they are, what they have done, what they have
// earned, and the way out of the app.
//
// The inverse of the vendor's profile rule. An agent sees their own money in
// full — balance, per-job fees, the ledger behind them (D3). What they do NOT
// see is anything about the BUSINESS's economics: no margin, no recovery rate,
// no material-by-material valuation. Those are the admin app's, and the
// wireframe's "Avg recovery rate" row is stale on both sides.

import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { formatPaise } from '@clbipp/core/format'
import {
  AppShell,
  Banner,
  Card,
  CardContent,
  DetailRow,
  PagePadding,
  SectionLabel,
} from '@clbipp/ui'

import { logout } from './actions'

// Up-to-two-letter monogram for the avatar. Same shape as the customer
// profile's — the two screens should look like the same product.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

function formatWeight(kg: number): string {
  if (kg <= 0) return '0 kg'
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`
  return `${Math.round(kg)} kg`
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card variant="elevated">
      <CardContent>
        <div className="font-serif text-xl font-semibold text-text-primary">{value}</div>
        <div className="mt-1 text-[10px] uppercase tracking-widest text-text-secondary">
          {label}
        </div>
      </CardContent>
    </Card>
  )
}

export default async function Page() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profile, collectedJobs, ledger, ledgerTotal] = await Promise.all([
    prisma.profile.findUnique({
      where: { id: user.id },
      select: {
        fullName: true,
        email: true,
        phone: true,
        agentZone: true,
        agentVehicle: true,
        agentRating: true,
        safetyTrainedAt: true,
        walletBalancePaise: true,
      },
    }),

    // Jobs this agent actually collected, with the weight they went out with.
    // `collected` is the agent's own milestone — a job that reached it is one
    // they finished, whatever the hub has done with it since.
    prisma.pickup.findMany({
      where: {
        agentId: user.id,
        status: { in: ['collected', 'tested', 'processed', 'recovered', 'certified'] },
      },
      select: {
        items: { select: { confirmedWeightKg: true, weightKg: true } },
      },
    }),

    // The agent's OWN ledger rows. ⚠ `wallet_txns` holds both parties' money —
    // the vendor's `payout` rows and the agent's `agent_fee` rows live in the
    // same table — so filtering by profileId is not optional here.
    prisma.walletTxn.findMany({
      where: { profileId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, deltaPaise: true, kind: true, pickupId: true, createdAt: true },
    }),

    prisma.walletTxn.aggregate({
      where: { profileId: user.id },
      _sum: { deltaPaise: true },
    }),
  ])

  const displayName = profile?.fullName ?? user.email ?? 'Agent'

  // The agent's confirmed weight where they recorded one, the customer's
  // declaration where they didn't. The two halves of a BatteryItem are allowed
  // to disagree and neither overwrites the other — this prefers the more
  // accurate number for a summary, it does not merge them.
  const collectedKg = collectedJobs.reduce(
    (sum, job) =>
      sum +
      job.items.reduce((n, item) => n + Number(item.confirmedWeightKg ?? item.weightKg ?? 0), 0),
    0,
  )

  // 🔴 The ledger is the source of truth; `profiles.wallet_balance_paise` is a
  // denormalised cache of exactly this sum. They are shown reconciled rather
  // than trusted: if they ever disagree, a writer somewhere updated one without
  // the other, and this is the screen where that becomes visible.
  const ledgerBalance = ledgerTotal._sum.deltaPaise ?? 0
  const cachedBalance = profile?.walletBalancePaise ?? 0
  const balanceMismatch = ledgerBalance !== cachedBalance

  return (
    <AppShell title="Profile" hideNav>
      <PagePadding className="flex flex-col gap-4">
        {/* Identity */}
        <Card className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[13px] bg-primary-black text-[17px] font-extrabold text-primary-green">
            {initials(displayName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-text-primary">{displayName}</p>
            <p className="truncate text-xs text-text-secondary">
              {profile?.agentZone ?? 'Field agent'}
            </p>
          </div>
          {profile?.agentRating && (
            <div className="ml-auto shrink-0 text-right">
              <p className="font-serif text-lg font-semibold text-text-primary">
                {Number(profile.agentRating).toFixed(1)}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-text-secondary">Rating</p>
            </div>
          )}
        </Card>

        {/* Work done. Counts and weight only — no margin, no recovery rate. */}
        <div className="grid grid-cols-2 gap-2">
          <Stat value={String(collectedJobs.length)} label="Jobs collected" />
          <Stat value={formatWeight(collectedKg)} label="Weight collected" />
        </div>

        {/* ── Earnings ─────────────────────────────────────────────────────
            No "Cash out" button. There is no redemption flow behind it —
            `WalletTxnKind.redemption` is an enum value nothing writes — and the
            task sheet is explicit that a dead button is worse than no button.
            Same for "Notifications": there is no notification pipeline in this
            build, so a toggle would control nothing. */}
        <Card>
          <SectionLabel className="mb-3">Earnings</SectionLabel>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-text-secondary">Balance</span>
            <span className="font-serif text-2xl font-semibold text-text-primary">
              {formatPaise(ledgerBalance)}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
            Your collection fees (D3) — what you earn for the job, not what the
            vendor is paid for their batteries.
          </p>

          {balanceMismatch && (
            <Banner variant="error" className="mt-3">
              This balance doesn&rsquo;t match the stored total ({formatPaise(cachedBalance)}).
              Tell whoever is on the build — a fee was written to one place and
              not the other.
            </Banner>
          )}

          {ledger.length > 0 && (
            <div className="mt-3 flex flex-col">
              {ledger.map((txn, index) => (
                <DetailRow
                  key={String(txn.id)}
                  label={txn.pickupId ?? txn.kind}
                  value={
                    <span className="flex flex-col items-end">
                      <span>{formatPaise(txn.deltaPaise)}</span>
                      <span className="text-[10px] text-text-secondary">
                        {txn.createdAt.toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </span>
                    </span>
                  }
                  last={index === ledger.length - 1}
                />
              ))}
            </div>
          )}
          {ledger.length === 0 && (
            <p className="mt-3 text-xs text-text-secondary">
              Nothing yet. Your fee lands here when you confirm a collection.
            </p>
          )}
        </Card>

        {/* ── Safety training ──────────────────────────────────────────────
            READ-ONLY (D6). Agents don't self-certify: `safetyTrainedAt` is set
            off-app, and there is deliberately no control here to change it.
            It is on this screen because an agent should be able to check their
            own standing without asking anyone. */}
        <Card>
          <SectionLabel className="mb-3">Safety training</SectionLabel>
          {profile?.safetyTrainedAt ? (
            <Banner variant="success">
              Trained{' '}
              {profile.safetyTrainedAt.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
              . Your per-job safety checklist is still required on every pickup.
            </Banner>
          ) : (
            <Banner variant="error">
              No training recorded. Speak to your supervisor — this is required
              before handling lithium-ion.
            </Banner>
          )}
        </Card>

        {/* Account */}
        <Card>
          <SectionLabel className="mb-3">Account</SectionLabel>
          <div className="flex flex-col">
            <DetailRow label="Email" value={profile?.email ?? user.email ?? '—'} />
            <DetailRow label="Phone" value={profile?.phone ?? '—'} />
            <DetailRow label="Zone" value={profile?.agentZone ?? '—'} />
            <DetailRow label="Vehicle" value={profile?.agentVehicle ?? '—'} last />
          </div>
        </Card>

        {/* Sign out — a POST, see actions.ts */}
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
