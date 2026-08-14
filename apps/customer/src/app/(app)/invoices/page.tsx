import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@clbipp/auth'
import { prisma } from '@clbipp/database'
import { formatPaise } from '@clbipp/core'
import { AppShell, PagePadding } from '@clbipp/ui'
import { Badge, Card, EmptyState } from '@clbipp/ui'

// ─── Invoices ────────────────────────────────────────────────────────────────
// The list half of the P2 invoices screen (Plan v2 §4). Additive: `Invoice` rows
// are written by `settlePayment`, and /api/documents/invoice/[pickupId] has
// streamed the PDF since Batch 8 — /payment/[id] already links straight to it.
// What was missing is a place to find an invoice you didn't arrive at through
// its payout.
//
// No tab of its own — the bottom bar is fixed at four, so this hangs off
// /profile and /wallet, the same way the wallet itself does.
//
// All ₹ through `formatPaise` (@clbipp/core), never a local /100.

export default async function InvoicesPage() {
  const current = await getCurrentProfile()
  if (!current?.profile) redirect('/login')

  const invoices = await prisma.invoice.findMany({
    where: { vendorId: current.user.id },
    orderBy: { issuedAt: 'desc' },
    select: {
      id: true,
      number: true,
      pickupId: true,
      totalPaise: true,
      issuedAt: true,
      // Paid/unpaid is the payment's state, not the invoice's — an Invoice row
      // records what was billed, a Payment records whether money moved.
      pickup: { select: { payment: { select: { status: true } } } },
    },
  })

  return (
    <AppShell title="Invoices" showBack backHref="/profile" hideNav>
      <PagePadding className="flex flex-col gap-4">
        {invoices.length === 0 ? (
          <EmptyState
            heading="No invoices yet"
            description="An invoice is raised each time a payout settles, and appears here with the PDF ready to download."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {invoices.map((invoice) => {
              // `Invoice.pickupId` is nullable in the schema so a future
              // period-level invoice has somewhere to live. Nothing writes one
              // today, and the detail route is keyed by pickup id, so a
              // pickup-less invoice renders as a non-navigable row rather than
              // as a dead link.
              const row = (
                <InvoiceRow
                  number={invoice.number}
                  issuedAt={invoice.issuedAt}
                  totalPaise={invoice.totalPaise}
                  paid={invoice.pickup?.payment?.status === 'paid'}
                  linked={invoice.pickupId !== null}
                />
              )

              return invoice.pickupId ? (
                <Link key={invoice.id} href={`/invoices/${invoice.pickupId}`} className="block">
                  {row}
                </Link>
              ) : (
                <div key={invoice.id}>{row}</div>
              )
            })}
          </div>
        )}
      </PagePadding>
    </AppShell>
  )
}

function InvoiceRow({
  number,
  issuedAt,
  totalPaise,
  paid,
  linked,
}: {
  number: string
  issuedAt: Date
  totalPaise: number
  paid: boolean
  linked: boolean
}) {
  return (
    <Card variant="default" className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-sm font-semibold text-text-primary">{number}</span>
        <span className="text-xs text-text-secondary">
          {issuedAt.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-serif text-base font-semibold text-text-primary">
          {formatPaise(totalPaise)}
        </span>
        <Badge variant={paid ? 'success' : 'warning'}>{paid ? 'Paid' : 'Due'}</Badge>
        {linked && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M6 4l4 4-4 4"
              stroke="var(--color-text-disabled)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </Card>
  )
}
