import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@clbipp/auth'
import { prisma } from '@clbipp/database'
import {
  CUSTOMER_PAYMENT_METHODS,
  PAYMENT_METHOD_HINTS,
  PAYMENT_METHOD_LABELS,
  formatPaise,
  paymentsMode,
} from '@clbipp/core'
import { AppShell, PagePadding, SectionLabel } from '@clbipp/ui'
import { Banner, Button, Card, DetailRow, ErrorState } from '@clbipp/ui'
import { PayoutForm, type PayoutMethodOption } from './PayoutForm'

// ─── Payment ─────────────────────────────────────────────────────────────────
// Money going OUT of Back2Basics and INTO the customer's hands — we buy the
// batteries, so this screen is "receive your payout", never "pay us".
//
// Two states that matter:
//   pending → choose a destination and confirm (a POST, see ./actions)
//   paid    → the confirmation, plus the two documents that back it up
//
// The ₹ figures are shown per Plan v2 D6. The offer and tracking screens are
// untouched and stay weight-only.

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const current = await getCurrentProfile()
  if (!current?.profile) redirect('/login')

  const payment = await prisma.payment.findFirst({
    where: { pickupId: id, vendorId: current.user.id },
    include: {
      pickup: {
        select: {
          id: true,
          status: true,
          receipt: { select: { receiptNo: true } },
          invoice: { select: { number: true } },
        },
      },
    },
  })

  if (!payment) {
    return (
      <AppShell title="Payment" showBack backHref="/dashboard" hideNav>
        <PagePadding>
          <ErrorState
            heading="No payment yet"
            message="A payout is raised once your batteries have been collected and weighed."
          />
        </PagePadding>
      </AppShell>
    )
  }

  const amount = formatPaise(payment.amountPaise)
  const simulated = paymentsMode() === 'simulated'

  // Built here, in the server component, so the client form never imports
  // @clbipp/core — see the note in PayoutForm.
  const methodOptions: PayoutMethodOption[] = CUSTOMER_PAYMENT_METHODS.map((method) => ({
    value: method,
    label: PAYMENT_METHOD_LABELS[method],
    hint: PAYMENT_METHOD_HINTS[method],
  }))

  return (
    <AppShell title="Payout" showBack backHref={`/track/${payment.pickupId}`} hideNav>
      <PagePadding className="flex flex-col gap-5">
        <div>
          <h1 className="font-serif text-2xl font-medium text-text-primary">
            {payment.status === 'paid' ? 'You were paid' : 'Your payout'}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            For the batteries collected under {payment.pickupId}.
          </p>
        </div>

        <Card variant="elevated" className="flex flex-col items-center gap-1 py-6">
          <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">
            {payment.status === 'paid' ? 'Paid to you' : 'Payable to you'}
          </span>
          <span className="font-serif text-4xl font-semibold text-text-primary">{amount}</span>
        </Card>

        {payment.status === 'paid' && (
          <>
            <Banner variant="success">
              Payout sent
              {payment.paidAt ? ` on ${formatDateTime(payment.paidAt)}` : ''} via{' '}
              {PAYMENT_METHOD_LABELS[payment.method]}.
            </Banner>

            <Card variant="elevated" className="flex flex-col">
              <SectionLabel>Settlement</SectionLabel>
              <div className="mt-2 flex flex-col">
                <DetailRow label="Method" value={PAYMENT_METHOD_LABELS[payment.method]} />
                <DetailRow
                  label="Reference"
                  value={
                    <span className="font-mono text-xs">{payment.gatewayRef ?? '—'}</span>
                  }
                />
                <DetailRow label="Pickup" value={payment.pickupId} last />
              </div>
            </Card>

            <div className="flex flex-col gap-3">
              {payment.pickup.invoice && (
                <a
                  href={`/api/documents/invoice/${payment.pickupId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button variant="primary" fullWidth>
                    Download invoice (PDF)
                  </Button>
                </a>
              )}
              {payment.pickup.receipt && (
                <Link href={`/receipt/${payment.pickupId}`}>
                  <Button variant="secondary" fullWidth>
                    View collection receipt
                  </Button>
                </Link>
              )}
              <Link href="/wallet">
                <Button variant="secondary" fullWidth>
                  Go to wallet
                </Button>
              </Link>
            </div>
          </>
        )}

        {payment.status === 'pending' && (
          <>
            <PayoutForm pickupId={payment.pickupId} amount={amount} methods={methodOptions} />

            {simulated && (
              // Said plainly rather than hidden. On demo week someone will ask
              // whether real money moved, and the honest answer belongs on the
              // screen, not in a README.
              <Banner variant="warning">
                Payments are running in simulation for now — confirming settles
                the payout in the app and credits your wallet, but no money
                leaves a bank.
              </Banner>
            )}
          </>
        )}

        {payment.status === 'processing' && (
          <Banner variant="info">
            This payout is being processed. It will show as paid here once it
            settles.
          </Banner>
        )}

        {payment.status === 'failed' && (
          <>
            <Banner variant="error">
              {payment.failureNote ?? 'That payout did not go through.'}
            </Banner>
            <PayoutForm pickupId={payment.pickupId} amount={amount} methods={methodOptions} />
          </>
        )}
      </PagePadding>
    </AppShell>
  )
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
