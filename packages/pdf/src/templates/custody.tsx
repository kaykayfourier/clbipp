import { Document, Page, Text, View } from '@react-pdf/renderer'
import { styles, pdfColors, formatDocDate } from '../theme'
import { DocHeader, DocFooter, Row } from './brand'
import type { CustodyDoc } from '../types'

// ─── Chain-of-custody receipt ─────────────────────────────────────────────────
// Issued when the agent hands a batch of collected pickups to a processing
// facility. This is agent-attested only — there is no hub-staff app, so the
// receiving staff name is typed by the agent, not authenticated. That limitation
// is stated plainly on the document itself (see callout below).
//
// One CustodyBatch → one PDF. The batch number is derived from the batch's
// own serial (CB-{YEAR}-{serial}) — no new column needed.

export function CustodyTemplate({ doc }: { doc: CustodyDoc }) {
  const hasGps = doc.lat !== null && doc.lng !== null

  return (
    <Document
      title={doc.batchNo}
      author="Back2Basics"
      subject={`Chain-of-custody receipt for batch ${doc.batchNo}`}
    >
      <Page size="A4" style={styles.page}>
        <DocHeader kind="Chain-of-Custody Receipt" />

        <Text style={styles.title}>Custody Receipt</Text>
        <Text style={styles.subtitle}>
          Agent-to-facility hand-off record. Issued at drop-off; not an EPR
          certificate.
        </Text>

        {/* ── Batch details ───────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>BATCH</Text>
        <Row label="Batch number"   value={doc.batchNo} />
        <Row label="Handed off on"  value={formatDocDate(doc.handedOffAt)} />
        <Row label="Agent"          value={doc.agentName} />
        <Row label="Facility"       value={doc.facilityName} last={!hasGps} />
        {hasGps && (
          <Row
            label="GPS at hand-off"
            value={`${doc.lat!.toFixed(5)}, ${doc.lng!.toFixed(5)}`}
            last
          />
        )}

        {/* ── Totals ──────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>SUMMARY</Text>
        <Row label="Pickups in batch" value={doc.itemCount.toLocaleString('en-IN')} />
        <Row
          label="Total weight"
          value={`${doc.totalWeightKg.toLocaleString('en-IN')} kg`}
          last
        />

        {/* ── Per-pickup lines ────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>PICKUPS</Text>

        {/* Table header */}
        <View style={styles.th}>
          <Text style={[styles.thText, styles.colGrow]}>PICKUP REF</Text>
          <Text style={[styles.thText, styles.colGrow]}>VENDOR</Text>
          <Text style={[styles.thText, styles.colNum]}>WEIGHT (KG)</Text>
        </View>

        {doc.pickups.map((p, i) => (
          <View
            key={p.pickupId}
            style={[
              styles.td,
              i === doc.pickups.length - 1
                ? { borderBottomWidth: 0 }
                : {},
            ]}
          >
            <Text style={styles.colGrow}>{p.pickupId}</Text>
            <Text style={styles.colGrow}>{p.vendorName}</Text>
            <Text style={styles.colNum}>
              {p.weightKg !== null
                ? p.weightKg.toLocaleString('en-IN')
                : '—'}
            </Text>
          </View>
        ))}

        {/* Total row */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            {doc.totalWeightKg.toLocaleString('en-IN')} kg
          </Text>
        </View>

        {/* ── Receiving staff ─────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>RECEIVING STAFF</Text>
        <Row label="Name (agent-recorded)" value={doc.receivingStaffName} last />

        {/* ── Attestation callout ─────────────────────────────────────── */}
        <View style={styles.callout}>
          <Text>
            This hand-off is agent-attested only. The receiving staff name above
            was entered by the collection agent and has not been independently
            verified — there is no hub-staff authentication in this version of
            the platform. Weights are the agent&apos;s on-site measurement;
            final quantities are confirmed after testing.
          </Text>
        </View>

        <DocFooter note={doc.batchNo} />
      </Page>
    </Document>
  )
}