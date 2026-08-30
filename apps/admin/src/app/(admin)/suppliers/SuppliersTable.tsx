'use client'

import { useState, useTransition } from 'react'

import { DataTable, Drawer, type DataTableColumn } from '@/components/console'
import { updateSupplierMarginTier } from './actions'

// ─── SuppliersTable ─────────────────────────────────────────────────────────
// Client half of E01 (/suppliers). The one screen in Batch 9 with a mutation:
// the margin-tier override opens in a Drawer per row rather than an inline
// edit, because @clbipp/core/audit's REASON_REQUIRED_ACTIONS makes a reason
// mandatory for `supplier.margin` — a change that needs a typed explanation
// deserves a form, not a table cell that silently accepts a click.

export interface SupplierRow {
  id: string
  name: string
  contactName: string | null
  vendorType: string
  kycStatus: string
  eprRegId: string | null
  pickupsYtd: number
  marginTier: string | null
}

const TIER_LABEL: Record<string, string> = {
  aggressive: 'Aggressive',
  standard: 'Standard',
  generous: 'Generous',
}

// A small, LOCAL badge — deliberately not <StatusPill>, which is built
// strictly for PickupStatus (it reads @clbipp/ui's STAGE_LABELS, a lifecycle
// vocabulary that has nothing to say about KycStatus). Reusing it here would
// have been the exact kind of "hand-written label drift" trap 13 warns
// against, just aimed at the wrong enum.
const KYC_TONE: Record<string, string> = {
  pending: 'bg-background text-text-secondary',
  submitted: 'bg-info-bg text-info-text',
  verified: 'bg-success-bg text-success-text',
  rejected: 'bg-error-bg text-error-text',
}

function KycPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${KYC_TONE[status] ?? 'bg-background text-text-secondary'}`}>
      {status}
    </span>
  )
}

export function SuppliersTable({ rows }: { rows: readonly SupplierRow[] }) {
  const [drawerRow, setDrawerRow] = useState<SupplierRow | null>(null)

  const columns: DataTableColumn<SupplierRow>[] = [
    {
      key: 'name',
      header: 'Supplier',
      sortValue: (r) => r.name,
      cell: (r) => (
        <div>
          <div className="font-medium text-text-primary">{r.name}</div>
          {r.contactName ? <div className="text-xs text-text-secondary">{r.contactName}</div> : null}
        </div>
      ),
    },
    { key: 'type', header: 'Type', sortValue: (r) => r.vendorType, cell: (r) => <span className="text-xs capitalize text-text-secondary">{r.vendorType}</span> },
    { key: 'epr', header: 'EPR reg.', sortValue: (r) => r.eprRegId ?? '', cell: (r) => <span className="font-mono text-[11px] text-text-secondary">{r.eprRegId ?? '—'}</span> },
    { key: 'kyc', header: 'KYC', sortValue: (r) => r.kycStatus, cell: (r) => <KycPill status={r.kycStatus} /> },
    { key: 'pickups', header: 'Pickups YTD', align: 'right', sortValue: (r) => r.pickupsYtd, cell: (r) => <span className="font-mono text-xs text-text-primary">{r.pickupsYtd}</span> },
    {
      key: 'tier',
      header: 'Margin tier',
      align: 'right',
      sortValue: (r) => r.marginTier ?? '',
      cell: (r) => (
        <button
          type="button"
          onClick={() => setDrawerRow(r)}
          className="rounded-full border border-console-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-primary hover:bg-background"
        >
          {r.marginTier ? TIER_LABEL[r.marginTier] : 'Default'} · Override
        </button>
      ),
    },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        getSearchText={(r) => `${r.name} ${r.contactName ?? ''} ${r.eprRegId ?? ''}`}
        searchPlaceholder="Search supplier, contact, EPR reg…"
        initialSort={{ key: 'pickups', direction: 'desc' }}
        emptyHeading="No suppliers"
        emptyDescription="No vendor accounts match this search."
      />

      <MarginOverrideDrawer row={drawerRow} onClose={() => setDrawerRow(null)} />
    </>
  )
}

function MarginOverrideDrawer({ row, onClose }: { row: SupplierRow | null; onClose: () => void }) {
  const [tier, setTier] = useState<string>('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Reset local form state whenever a different row opens.
  const openRowId = row?.id
  const [lastOpenId, setLastOpenId] = useState<string | undefined>(undefined)
  if (openRowId !== lastOpenId) {
    setLastOpenId(openRowId)
    setTier(row?.marginTier ?? '')
    setReason('')
    setError(null)
  }

  function submit() {
    if (!row) return
    setError(null)
    startTransition(async () => {
      const result = await updateSupplierMarginTier({
        vendorId: row.id,
        tier: tier === '' ? null : (tier as 'aggressive' | 'standard' | 'generous'),
        reason,
      })
      if (result.error) setError(result.error)
      else onClose()
    })
  }

  return (
    <Drawer
      open={row !== null}
      onClose={onClose}
      title={row ? `Margin tier · ${row.name}` : ''}
      description="Overrides the active engine config's default tier for this supplier only. Takes effect on the next quote."
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full border border-console-line px-4 py-2 text-[12.5px] font-semibold text-text-primary" disabled={isPending}>
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || reason.trim() === ''}
            className="rounded-full bg-primary-black px-4 py-2 text-[12.5px] font-semibold text-primary-green disabled:opacity-40"
          >
            {isPending ? 'Saving…' : 'Save override'}
          </button>
        </>
      }
    >
      {row ? (
        <div className="flex flex-col gap-4">
          {error ? <p className="rounded-lg bg-error-bg px-3 py-2 text-xs font-semibold text-error-text">{error}</p> : null}

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-secondary">Tier</label>
            <div className="flex flex-col gap-1.5">
              {(['', 'aggressive', 'standard', 'generous'] as const).map((opt) => (
                <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-lg border border-console-line px-3 py-2 text-sm has-[:checked]:border-primary-black has-[:checked]:bg-background">
                  <input type="radio" name="tier" checked={tier === opt} onChange={() => setTier(opt)} className="accent-primary-black" />
                  {opt === '' ? 'Default (no override)' : TIER_LABEL[opt]}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="margin-reason" className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-secondary">
              Reason — required
            </label>
            <textarea
              id="margin-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this supplier's tier changing?"
              className="rounded-lg border border-console-line bg-surface p-2.5 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none"
            />
          </div>
        </div>
      ) : null}
    </Drawer>
  )
}
