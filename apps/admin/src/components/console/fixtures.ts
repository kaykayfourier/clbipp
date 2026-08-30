// ─── Fixtures ───────────────────────────────────────────────────────────────
// Sample data for every component in this kit, in the same shapes and id
// formats real data takes (PKP-2026-NNNNNN pickup ids, the nine real
// PickupStatus values, real vendor/agent-shaped names) — so a component can be
// exercised and reviewed without a database, and so a screen wiring these
// components up for the first time has a working example of the exact prop
// shape to pass. Batch 2's own "done when": every component renders from this
// file.
//
// Pure data. No React, no DB import — safe to import from anywhere, including
// a future test file.

export interface FixturePickupRow {
  id: string
  vendorName: string
  agentName: string | null
  status: string
  offerAccepted: boolean
  itemCount: number
  totalWeightKg: number
  createdAt: string
}

export const FIXTURE_PICKUPS: readonly FixturePickupRow[] = [
  { id: 'PKP-2026-000101', vendorName: 'Patel Battery', agentName: 'Ramesh Kumar', status: 'requested', offerAccepted: false, itemCount: 3, totalWeightKg: 42.5, createdAt: '2026-08-22T09:14:00+05:30' },
  { id: 'PKP-2026-000102', vendorName: 'Greenway Recyclers', agentName: 'Sunita Yadav', status: 'scheduled', offerAccepted: false, itemCount: 2, totalWeightKg: 18.0, createdAt: '2026-08-23T11:02:00+05:30' },
  { id: 'PKP-2026-000103', vendorName: 'Dwarka E-Rick', agentName: 'Imran Sheikh', status: 'arrived', offerAccepted: false, itemCount: 5, totalWeightKg: 96.2, createdAt: '2026-08-24T08:40:00+05:30' },
  { id: 'PKP-2026-000104', vendorName: 'Sarita Vihar Auto', agentName: 'Ramesh Kumar', status: 'offered', offerAccepted: false, itemCount: 1, totalWeightKg: 12.4, createdAt: '2026-08-24T10:15:00+05:30' },
  { id: 'PKP-2026-000105', vendorName: 'Anand Traders', agentName: 'Sunita Yadav', status: 'offered', offerAccepted: true, itemCount: 4, totalWeightKg: 61.8, createdAt: '2026-08-25T09:30:00+05:30' },
  { id: 'PKP-2026-000106', vendorName: 'Patel Battery', agentName: 'Imran Sheikh', status: 'collected', offerAccepted: true, itemCount: 2, totalWeightKg: 30.0, createdAt: '2026-08-25T14:00:00+05:30' },
  { id: 'PKP-2026-000107', vendorName: 'Greenway Recyclers', agentName: 'Ramesh Kumar', status: 'tested', offerAccepted: true, itemCount: 6, totalWeightKg: 108.4, createdAt: '2026-08-20T09:00:00+05:30' },
  { id: 'PKP-2026-000108', vendorName: 'Dwarka E-Rick', agentName: 'Sunita Yadav', status: 'processed', offerAccepted: true, itemCount: 3, totalWeightKg: 44.0, createdAt: '2026-08-19T09:00:00+05:30' },
  { id: 'PKP-2026-000109', vendorName: 'Sarita Vihar Auto', agentName: 'Imran Sheikh', status: 'recovered', offerAccepted: true, itemCount: 1, totalWeightKg: 9.6, createdAt: '2026-08-18T09:00:00+05:30' },
  { id: 'PKP-2026-000110', vendorName: 'Anand Traders', agentName: 'Ramesh Kumar', status: 'certified', offerAccepted: true, itemCount: 2, totalWeightKg: 27.0, createdAt: '2026-08-10T09:00:00+05:30' },
  { id: 'PKP-2026-000111', vendorName: 'Patel Battery', agentName: null, status: 'cancelled', offerAccepted: false, itemCount: 1, totalWeightKg: 8.0, createdAt: '2026-08-21T09:00:00+05:30' },
]

export const FIXTURE_KPIS = [
  { label: 'Quotes today', value: '87', delta: '▲ 12% vs yesterday', deltaTone: 'up' as const },
  { label: 'Throughput', value: '2.4t', delta: '▲ 18%', deltaTone: 'up' as const },
  { label: 'Avg margin', value: '21.4%', delta: '▼ 0.8 pts', deltaTone: 'down' as const },
  { label: 'Net value', value: '₹3.2L', delta: '▲ ₹42k', deltaTone: 'up' as const },
  { label: 'In exception', value: '7', delta: 'requires review', tone: 'exception' as const },
]

export const FIXTURE_CAPACITY = [
  { label: 'Bhiwadi Hub', percent: 68, sublabel: '8,160 / 12,000 kg' },
  { label: 'Indore Hub', percent: 41, sublabel: '3,280 / 8,000 kg' },
]

export const FIXTURE_TREND = [
  { label: '22', value: 2.0 },
  { label: '23', value: 2.15 },
  { label: '24', value: 2.05 },
  { label: '25', value: 2.3 },
  { label: '26', value: 2.28 },
  { label: '27', value: 2.4 },
  { label: '28', value: 2.42 },
]

export const FIXTURE_PATHWAY_SPLIT = [
  { key: 'reuse', label: 'Reuse', value: 24 },
  { key: 'refurbish', label: 'Refurbish', value: 43 },
  { key: 'recycle', label: 'Recycle', value: 33 },
]
