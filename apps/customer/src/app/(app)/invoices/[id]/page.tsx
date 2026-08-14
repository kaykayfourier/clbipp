import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { getCurrentProfile } from '@clbipp/auth'
import { prisma } from '@clbipp/database'
import { formatPaise } from '@clbipp/core'
import { AppShell, PagePadding, SectionLabel } from '@clbipp/ui'
import { Banner, Button, Card, DetailRow } from '@clbipp/ui'
import { getInvoiceDoc } from '@/lib/documents'

// ─── Invoice detail ──────────────────────────────────────────────────────────
// Rendered from `getInvoiceDoc` — the SAME mapper @clbipp/pdf's invoice
// template consumes. That is the whole design of this screen: an invoice page
// showing a different line split or a different total from the PDF it links to
// would be the worst bug this surface could have, and there is no second
// implementation here that could drift.
//
// Keyed by PICKUP id, like every other detail screen in the app
// (/track/[id], /receipt/[id], /payment/[id], /certificates/[id]) and like the
// document route it downloads from.
//
// Ownership: getInvoiceDoc scopes its query by vendorId in code, because Prisma
// bypasses RLS. A foreign id and a missing invoice both return null and both
// render the same 404 — a distinct error would confirm that a guessed id exists.

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const current = await getCurrentProfile()
  if (!current?.profile) redirect('/login')

  const invoice = await getInvoiceDoc(id, current.user.id)
  if (!invoice) notFound()

  // Existence only, for the cross-links. Both target screens re-read and
  // re-scope their own rows, so there is nothing to gain by pulling the detail
  // into this page's payload.
  const pickup = await prisma.pickup.findFirst({
    where: { id, vendorId: current.user.id },
    select: {
      receipt: { select: { receiptNo: true } },
      payment: { select: { status: true } },
    },
  })

  return (
    <AppShell title="Invoice" showBack backHref="/invoices" hideNav>
      <PagePadding className="flex flex-col gap-5">
        <div>
          <h1 className="font-mono text-lg font-semibold text-text-primary">{invoice.number}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            For the batteries collected under {invoice.pickupId}.
          </p>
        </div>

        <Card variant="elevated" className="flex flex-col items-center gap-1 py-6">
          <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">
            {invoice.paidAt ? 'Paid to you' : 'Payable to you'}
          </span>
          <span className="font-serif text-4xl font-semibold text-text-primary">
            {formatPaise(invoice.totalPaise)}
          </span>
        </Card>

        {invoice.paidAt ? (
          <Banner variant="success">
            Settled on {formatDate(invoice.paidAt)}
            {invoice.paymentMethod ? ` via ${invoice.paymentMethod}` : ''}.
          </Banner>
        ) : (
          <Banner variant="info">
            This invoice is raised. It settles once you choose how to be paid.
          </Banner>
        )}

        {/* ── Lines ──────────────────────────────────────────────────────── */}
        <Card variant="elevated" className="flex flex-col">
          <SectionLabel>Items</SectionLabel>
          <div className="mt-2 flex flex-col">
            {invoice.lines.map((line, index) => (
              <DetailRow
                key={`${line.description}-${index}`}
                label={lineLabel(line.description, line.quantity, line.weightKg)}
                value={formatPaise(line.amountPaise)}
                last={index === invoice.lines.length - 1}
              />
            ))}
          </div>
        </Card>

        {/* ── Totals ─────────────────────────────────────────────────────── */}
        <Card variant="elevated" className="flex flex-col">
          <SectionLabel>Total</SectionLabel>
          <div className="mt-2 flex flex-col">
            <DetailRow label="Subtotal" value={formatPaise(invoice.subtotalPaise)} />
            {/* Always rendered, even at zero. Whether GST applies to scrap
                bought from an unregistered individual is an open question for
                the company — showing the line means their answer is a value
                change rather than a layout change. */}
            <DetailRow label="Tax" value={formatPaise(invoice.taxPaise)} />
            <DetailRow label="Total" value={formatPaise(invoice.totalPaise)} strong last />
          </div>
        </Card>

        {/* ── Billed to ──────────────────────────────────────────────────── */}
        <Card variant="elevated" className="flex flex-col">
          <SectionLabel>Billed to</SectionLabel>
          <div className="mt-2 flex flex-col">
            <DetailRow label="Name" value={invoice.vendorName} />
            {invoice.vendorAddress && (
              <DetailRow label="Address" value={invoice.vendorAddress} />
            )}
            {invoice.gstNumber && <DetailRow label="GST" value={invoice.gstNumber} />}
            <DetailRow label="Issued" value={formatDate(invoice.issuedAt)} last />
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          {/* A plain <a>, not a fetch: the route already sends its own
              Content-Disposition, so the browser's download handling does the
              work — same as /payment/[id] and the compliance export. */}
          <a
            href={`/api/documents/invoice/${invoice.pickupId}`}
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="primary" fullWidth>
              Download invoice (PDF)
            </Button>
          </a>

          {pickup?.payment && (
            <Link href={`/payment/${invoice.pickupId}`}>
              <Button variant="secondary" fullWidth>
                {pickup.payment.status === 'paid' ? 'View payout' : 'Choose how you get paid'}
              </Button>
            </Link>
          )}

          {pickup?.receipt && (
            <Link href={`/receipt/${invoice.pickupId}`}>
              <Button variant="secondary" fullWidth>
                View collection receipt
              </Button>
            </Link>
          )}

          <Link href={`/track/${invoice.pickupId}`}>
            <Button variant="ghost" fullWidth>
              Track this pickup
            </Button>
          </Link>
        </div>
      </PagePadding>
    </AppShell>
  )
}

/**
 * "Portable batteries — 12 units · 34 kg". Quantity and weight belong with the
 * description rather than in columns of their own: three numeric columns do not
 * fit a phone, and the PDF is where the tabular version lives.
 */
function lineLabel(description: string, quantity: number, weightKg: number | null): string {
  const parts = [`${quantity} unit${quantity === 1 ? '' : 's'}`]
  if (weightKg !== null && weightKg > 0) parts.push(`${weightKg} kg`)
  return `${description} — ${parts.join(' · ')}`
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
