import { Document, Page, Text, View } from '@react-pdf/renderer'
import { formatPaise } from '@clbipp/core'
import { styles, formatDocDate } from '../theme'
import { DocHeader, DocFooter, Row } from './brand'
import type { InvoiceDoc } from '../types'

// ─── Invoice ─────────────────────────────────────────────────────────────────
// Direction matters and is easy to get backwards: WE buy the batteries, so this
// is a payout advice to the vendor, not a demand for payment. The wording
// throughout says "payable to you" for that reason.
//
// ⚠ taxPaise is 0 on every invoice we currently issue. Whether GST applies to
// scrap bought from an unregistered individual, and at what rate, is a question
// for the company — inventing a rate on a tax document would be worse than
// showing zero. The column and the line exist so the answer is a value change
// rather than a schema change. Flagged in the Batch 8 notes.

export function InvoiceTemplate({ doc }: { doc: InvoiceDoc }) {
  return (
    <Document
      title={doc.number}
      author="Back2Basics"
      subject={`Payout advice for ${doc.pickupId}`}
    >
      <Page size="A4" style={styles.page}>
        <DocHeader kind="Payout Advice" />

        <Text style={styles.title}>Invoice {doc.number}</Text>
        <Text style={styles.subtitle}>
          Amount payable by Back2Basics to you for batteries collected.
        </Text>

        <Text style={styles.sectionLabel}>PAYABLE TO</Text>
        <Row label="Name" value={doc.vendorName} />
        {doc.vendorAddress && <Row label="Address" value={doc.vendorAddress} />}
        {doc.gstNumber && <Row label="GSTIN" value={doc.gstNumber} />}
        <Row label="Pickup reference" value={doc.pickupId} />
        <Row label="Issued" value={formatDocDate(doc.issuedAt)} last />

        <Text style={styles.sectionLabel}>LINES</Text>
        <View style={styles.th}>
          <Text style={[styles.thText, styles.colGrow]}>DESCRIPTION</Text>
          <Text style={[styles.thText, styles.colNum]}>QTY</Text>
          <Text style={[styles.thText, styles.colNum]}>WEIGHT</Text>
          <Text style={[styles.thText, styles.colNum]}>AMOUNT</Text>
        </View>
        {doc.lines.map((line, i) => (
          <View key={`${line.description}-${i}`} style={styles.td}>
            <Text style={styles.colGrow}>{line.description}</Text>
            <Text style={styles.colNum}>{line.quantity.toLocaleString('en-IN')}</Text>
            <Text style={styles.colNum}>
              {line.weightKg === null ? '—' : `${line.weightKg.toLocaleString('en-IN')} kg`}
            </Text>
            <Text style={[styles.value, styles.colNum]}>{formatPaise(line.amountPaise)}</Text>
          </View>
        ))}

        <View style={{ marginTop: 12 }}>
          <Row label="Subtotal" value={formatPaise(doc.subtotalPaise)} />
          <Row label="Tax" value={formatPaise(doc.taxPaise)} last />
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total payable to you</Text>
          <Text style={styles.totalValue}>{formatPaise(doc.totalPaise)}</Text>
        </View>

        <Text style={styles.sectionLabel}>SETTLEMENT</Text>
        <Row
          label="Status"
          value={doc.paidAt ? `Paid on ${formatDocDate(doc.paidAt)}` : 'Awaiting settlement'}
        />
        <Row label="Method" value={doc.paymentMethod ?? 'Not selected yet'} last />

        <View style={styles.callout}>
          <Text>
            Amounts are based on the weights and condition recorded at
            collection. Where the on-site assessment differed from the booking
            estimate, the on-site figure is the one invoiced.
          </Text>
        </View>

        <DocFooter note={doc.number} />
      </Page>
    </Document>
  )
}
