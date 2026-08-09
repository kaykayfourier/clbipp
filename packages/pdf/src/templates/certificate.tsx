import { Document, Page, Text, View } from '@react-pdf/renderer'
import { styles, formatDocDate } from '../theme'
import { DocHeader, DocFooter, Row } from './brand'
import type { CertificateDoc } from '../types'

// ─── EPR certificate ─────────────────────────────────────────────────────────
// The compliance document, issued after recycling — company doc §4 step 8.
//
// ⚠ THIS LAYOUT IS A PLACEHOLDER BY DECISION, not by neglect. The company is
// supplying the authoritative certificate format (flagged 2026-08-09). When it
// arrives, this file is the only thing that changes: the data query lives in
// apps/customer/src/lib/documents.ts and the shape in ../types.ts, so a new
// layout is a rewrite of one component against an unchanged CertificateDoc.
// Do not invest design time here in the meantime.
//
// No ₹ appears anywhere on this document, and that is not the old
// "no value to the vendor" rule — an EPR certificate is a statement of material
// recovered for a regulator, and a purchase price has no place on it. The
// value-facing documents are the receipt and the invoice.

export function CertificateTemplate({ doc }: { doc: CertificateDoc }) {
  const materials = doc.materials.filter((m) => m.recoveredKg > 0)

  return (
    <Document
      title={doc.certificateNumber}
      author="Back2Basics"
      subject={`EPR certificate for ${doc.pickupId}`}
    >
      <Page size="A4" style={styles.page}>
        <DocHeader kind="EPR Certificate" />

        <Text style={styles.title}>Certificate of Recycling</Text>
        <Text style={styles.subtitle}>
          Extended Producer Responsibility · Battery Waste Management Rules
        </Text>

        <Text style={styles.sectionLabel}>CERTIFICATE</Text>
        <Row label="Certificate number" value={doc.certificateNumber} />
        <Row label="Issued to" value={doc.vendorName} />
        <Row label="Account type" value={doc.vendorType} />
        <Row label="Date certified" value={formatDocDate(doc.certifiedAt)} last />

        <Text style={styles.sectionLabel}>CONSIGNMENT</Text>
        <Row label="Pickup reference" value={doc.pickupId} />
        <Row label="Battery category" value={doc.category} />
        <Row
          label="Total weight processed"
          value={`${doc.totalWeightKg.toLocaleString('en-IN')} kg`}
          last={materials.length === 0}
        />

        {materials.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>MATERIALS RECOVERED</Text>
            <View style={styles.th}>
              <Text style={[styles.thText, styles.colGrow]}>MATERIAL</Text>
              <Text style={[styles.thText, styles.colNum]}>RECOVERED</Text>
            </View>
            {materials.map((m) => (
              <View key={m.material} style={styles.td}>
                <Text style={styles.colGrow}>{m.material}</Text>
                <Text style={[styles.value, styles.colNum]}>
                  {m.recoveredKg.toLocaleString('en-IN')} kg
                </Text>
              </View>
            ))}
          </>
        )}

        {doc.co2AvoidedKg !== null && (
          <>
            <Text style={styles.sectionLabel}>ENVIRONMENTAL IMPACT</Text>
            <Row
              label="CO₂e avoided vs virgin material"
              value={`${doc.co2AvoidedKg.toLocaleString('en-IN')} kg`}
              last
            />
          </>
        )}

        <View style={styles.callout}>
          <Text>
            Verification reference: {doc.publicToken}
            {'\n'}
            This certificate confirms that the consignment above was collected,
            processed and recycled through the Back2Basics recovery chain. Each
            stage is recorded with a timestamp, location and handler in the
            platform&apos;s chain-of-custody log.
          </Text>
        </View>

        <DocFooter note={doc.certificateNumber} />
      </Page>
    </Document>
  )
}
