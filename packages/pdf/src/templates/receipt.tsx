import { Document, Page, Text, View } from '@react-pdf/renderer'
import { formatPaise } from '@clbipp/core'
import { styles, formatDocDate } from '../theme'
import { DocHeader, DocFooter, Row } from './brand'
import type { ReceiptDoc } from '../types'

// ─── Pickup receipt ──────────────────────────────────────────────────────────
// Company doc §4 step 4: handed over AT COLLECTION. It says "we took this many
// kilos of these batteries, at this time, at this place, and this person took
// them". It is deliberately NOT the EPR certificate (step 8), which can only be
// issued once recycling has actually happened — conflating the two would let a
// customer claim compliance for material still sitting in a van.
//
// The ₹ amount is the agreed payout and IS shown: Plan v2 D6 relaxed the
// "no value to the vendor" default for exactly these documents.

export function ReceiptTemplate({ doc }: { doc: ReceiptDoc }) {
  const hasGps = doc.capturedLat !== null && doc.capturedLng !== null

  return (
    <Document
      title={doc.receiptNo}
      author="Back2Basics"
      subject={`Collection receipt for ${doc.pickupId}`}
    >
      <Page size="A4" style={styles.page}>
        <DocHeader kind="Collection Receipt" />

        <Text style={styles.title}>Pickup Receipt</Text>
        <Text style={styles.subtitle}>
          Acknowledgement of batteries collected. Not an EPR certificate — your
          certificate is issued once recycling is complete.
        </Text>

        <Text style={styles.sectionLabel}>RECEIPT</Text>
        <Row label="Receipt number" value={doc.receiptNo} />
        <Row label="Collected from" value={doc.vendorName} />
        <Row label="Collected on" value={formatDocDate(doc.collectedAt)} last />

        <Text style={styles.sectionLabel}>CONSIGNMENT</Text>
        <Row label="Pickup reference" value={doc.pickupId} />
        <Row label="Battery category" value={doc.category} />
        <Row label="Units collected" value={doc.itemCount.toLocaleString('en-IN')} />
        <Row
          label="Total weight"
          value={`${doc.totalWeightKg.toLocaleString('en-IN')} kg`}
          last={doc.amountPaise === null}
        />
        {doc.amountPaise !== null && (
          <Row label="Agreed payout" value={formatPaise(doc.amountPaise)} last />
        )}

        <Text style={styles.sectionLabel}>HANDOVER</Text>
        <Row
          label="Collected by"
          value={doc.agentName ?? 'Back2Basics collection partner'}
          last={!hasGps}
        />
        {hasGps && (
          <Row
            label="Location recorded"
            // 5 dp ≈ 1 m. Enough to place a gate; not so much precision that
            // the number reads as a survey coordinate.
            value={`${doc.capturedLat!.toFixed(5)}, ${doc.capturedLng!.toFixed(5)}`}
            last
          />
        )}

        <View style={styles.callout}>
          <Text>
            Verification reference: {doc.publicToken}
            {'\n'}
            Weights recorded at collection are the collection partner&apos;s
            on-site measurement. Final recovered quantities are confirmed after
            testing and appear on your EPR certificate.
          </Text>
        </View>

        <DocFooter note={doc.receiptNo} />
      </Page>
    </Document>
  )
}
