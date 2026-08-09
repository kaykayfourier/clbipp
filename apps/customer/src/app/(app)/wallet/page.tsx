import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@clbipp/auth'
import { prisma } from '@clbipp/database'
import { formatPaise } from '@clbipp/core'
import { AppShell, PagePadding, SectionLabel } from '@clbipp/ui'
import { Banner, Button, Card, EmptyState } from '@clbipp/ui'

// ─── Wallet ──────────────────────────────────────────────────────────────────
// Balance plus the ledger behind it.
//
// `WalletTxn` is the source of truth and `profiles.wallet_balance_paise` is a
// cache of its sum (schema comment, and settlePayment writes both in one
// transaction). This screen shows the CACHE as the headline number and the
// LEDGER underneath, so if they ever disagree it is visible on the screen
// rather than only in a query.
//
// No redemption action this batch — deliberate. "Withdraw to bank" needs bank
// details we don't collect anywhere yet, and a button that takes money out of a
// balance and sends it nowhere is worse than no button. `WalletTxnKind` already
// has `redemption` for when that flow exists.

const KIND_LABELS: Record<string, string> = {
  payout: 'Pickup payout',
  redemption: 'Withdrawal',
  adjustment: 'Adjustment',
}

export default async function WalletPage() {
  const current = await getCurrentProfile()
  if (!current?.profile) redirect('/login')

  const profileId = current.user.id

  const [profile, txns, pendingPayments] = await Promise.all([
    prisma.profile.findUniqueOrThrow({
      where: { id: profileId },
      select: { walletBalancePaise: true },
    }),
    prisma.walletTxn.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    // Surfaced because an unsettled payout is money the customer is owed but
    // can't see in the balance — without this the wallet silently understates
    // what they're due.
    prisma.payment.findMany({
      where: { vendorId: profileId, status: 'pending' },
      select: { pickupId: true, amountPaise: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const pendingTotal = pendingPayments.reduce((sum, p) => sum + p.amountPaise, 0)

  return (
    <AppShell title="Wallet" showBack backHref="/profile" hideNav>
      <PagePadding className="flex flex-col gap-5">
        <Card variant="elevated" className="flex flex-col items-center gap-1 py-6">
          <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">
            Balance
          </span>
          <span className="font-serif text-4xl font-semibold text-text-primary">
            {formatPaise(profile.walletBalancePaise)}
          </span>
        </Card>

        {pendingPayments.length > 0 && (
          <Banner variant="warning">
            {formatPaise(pendingTotal)} is waiting for you to choose how to be
            paid.{' '}
            <Link
              href={`/payment/${pendingPayments[0].pickupId}`}
              className="font-semibold underline"
            >
              Collect it
            </Link>
            .
          </Banner>
        )}

        <div className="flex flex-col">
          <SectionLabel>Activity</SectionLabel>

          {txns.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                heading="Nothing here yet"
                description="Payouts from your pickups will appear here once your batteries are collected and paid for."
              />
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {txns.map((txn) => (
                <TxnRow
                  key={txn.id}
                  kind={KIND_LABELS[txn.kind] ?? txn.kind}
                  note={txn.note}
                  pickupId={txn.pickupId}
                  deltaPaise={txn.deltaPaise}
                  balanceAfterPaise={txn.balanceAfterPaise}
                  createdAt={txn.createdAt}
                />
              ))}
            </div>
          )}
        </div>

        <Banner variant="info">
          Your balance is held against your account. Withdrawals to a bank
          account are coming — for now, payouts can be sent straight to UPI or
          your bank when you accept them.
        </Banner>

        <Link href="/dashboard">
          <Button variant="secondary" fullWidth>
            Back to home
          </Button>
        </Link>
      </PagePadding>
    </AppShell>
  )
}

function TxnRow({
  kind,
  note,
  pickupId,
  deltaPaise,
  balanceAfterPaise,
  createdAt,
}: {
  kind: string
  note: string | null
  pickupId: string | null
  deltaPaise: number
  balanceAfterPaise: number
  createdAt: Date
}) {
  const credit = deltaPaise >= 0

  const body = (
    <Card variant="default" className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-text-primary">{kind}</span>
        <span className="truncate text-xs text-text-secondary">
          {note ?? pickupId ?? ''}
        </span>
        <span className="mt-0.5 text-[11px] text-text-disabled">
          {new Date(createdAt).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span
          className={`text-sm font-semibold ${credit ? 'text-success-text' : 'text-text-primary'}`}
        >
          {/* The sign is carried by the amount itself; formatPaise keeps a
              negative negative, so a debit doesn't read as a credit. */}
          {credit ? `+${formatPaise(deltaPaise)}` : formatPaise(deltaPaise)}
        </span>
        <span className="text-[11px] text-text-disabled">
          Balance {formatPaise(balanceAfterPaise)}
        </span>
      </div>
    </Card>
  )

  return pickupId ? (
    <Link href={`/track/${pickupId}`} className="block">
      {body}
    </Link>
  ) : (
    body
  )
}
