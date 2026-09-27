import { Document, Page, Text, View } from '@react-pdf/renderer'
import { styles, formatDocDate } from '../theme'
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
//
// FV12 (2026-09-27): lists every battery LINE with the tag it carries and the
// box it travelled in (feedback §4.2), so the hub can reconcile against this
// sheet on paper as well as on the console. Until then it printed one weight
// per pickup from a superseded column and labelled an item count "Pickups".

export function CustodyTemplate({ doc }: { doc: CustodyDoc }) {
  const hasGps = doc.lat !== null && doc.lng !== null
  const lineCount = doc.pickups.reduce((n, p) => n + p.lines.length, 0)
  const untagged = doc.pickups.reduce((n, p) => n + p.lines.filter((l) => !l.tagCode).length, 0)

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
        <Row label="Facility"       value={doc.facilityName} last={!hasGps && doc.runNos.length === 0} />
        {doc.runNos.length > 0 && (
          <Row label="Collection run" value={doc.runNos.join(', ')} last={!hasGps} />
        )}
        {hasGps && (
          <Row
            label="GPS at hand-off"
            value={`${doc.lat!.toFixed(5)}, ${doc.lng!.toFixed(5)}`}
            last
          />
        )}

        {/* ── Totals ──────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>SUMMARY</Text>
        <Row label="Pickups in batch" value={doc.pickups.length.toLocaleString('en-IN')} />
        <Row label="Battery lines" value={lineCount.toLocaleString('en-IN')} />
        <Row
          label="Transport boxes"
          value={doc.containers.length > 0 ? doc.containers.map((c) => `${c.code} (${c.label})`).join(', ') : '—'}
        />
        <Row
          label="Total weight"
          value={`${doc.totalWeightKg.toLocaleString('en-IN')} kg`}
          last
        />

        {/* ── Per-line table ──────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>BATTERY LINES</Text>

        <View style={styles.th}>
          <Text style={[styles.thText, { width: 92 }]}>PICKUP</Text>
          <Text style={[styles.thText, styles.colGrow]}>LINE</Text>
          <Text style={[styles.thText, { width: 78 }]}>TAG</Text>
          <Text style={[styles.thText, { width: 58 }]}>BOX</Text>
          <Text style={[styles.thText, { width: 56, textAlign: 'right' }]}>KG</Text>
        </View>

        {doc.pickups.flatMap((p) =>
          p.lines.map((line, i) => (
            <View key={`${p.pickupId}-${i}`} style={styles.td} wrap={false}>
              <Text style={{ width: 92, fontSize: 8.5 }}>{i === 0 ? p.pickupId : ''}</Text>
              <Text style={[styles.colGrow, { fontSize: 8.5 }]}>
                {i === 0 ? `${p.vendorName} — ` : ''}
                {line.description}
              </Text>
              <Text style={{ width: 78, fontSize: 8.5, fontFamily: line.tagCode ? 'Helvetica-Bold' : 'Helvetica' }}>
                {line.tagCode ?? 'untagged'}
              </Text>
              <Text style={{ width: 58, fontSize: 8.5 }}>{line.containerCode ?? '—'}</Text>
              <Text style={{ width: 56, fontSize: 8.5, textAlign: 'right' }}>
                {line.weightKg.toLocaleString('en-IN')}
              </Text>
            </View>
          )),
        )}

        {/* Total row */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            {doc.totalWeightKg.toLocaleString('en-IN')} kg
          </Text>
        </View>

        {untagged > 0 && (
          <View style={styles.callout}>
            <Text>
              {untagged} line{untagged === 1 ? '' : 's'} left the vendor&apos;s site without a tag, with a
              reason recorded at collection. The receiving hub tags {untagged === 1 ? 'it' : 'them'} on
              check-in before the batch can be tested.
            </Text>
          </View>
        )}

        {/* ── Receiving staff ─────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>RECEIVING STAFF</Text>
        <Row label="Name (agent-recorded)" value={doc.receivingStaffName} last />

        {/* ── Attestation callout ─────────────────────────────────────── */}
        <View style={styles.callout}>
          <Text>
            This hand-off is agent-attested only. The receiving staff name above
            was entered by the collection agent and has not been independently
            verified — there is no hub-staff authentication in this version of
            the platform. The hub&apos;s own count is its check-in scan of each
            tag, recorded separately. Weights are the agent&apos;s on-site
            measurement; final quantities are confirmed after testing.
          </Text>
        </View>

        <DocFooter note={doc.batchNo} />
      </Page>
    </Document>
  )
}
