// D02 · Market feed — Batch 16 · B (Khalid)
// Current prices, freshness, fx rate, override form, and snapshot history.
// 🔴 An override inserts a NEW row — see actions.ts.

import { prisma } from '@clbipp/database'
import { requireAdmin } from '@/lib/admin-identity'
import { redirect } from 'next/navigation'
import { overrideMarketPrices } from './actions'

const METALS = ['Li', 'Co', 'Ni', 'Mn', 'Cu', 'Al'] as const

// Freshness is measured at REQUEST time, which is the correct semantics here:
// this page is dynamic (requireAdmin() reads cookies), so it is never statically
// rendered and there is no cached render for the clock read to go stale inside.
// Lifted out of the component body so `react-hooks/purity` can see that.
function hoursSince(t: Date): number {
  return (Date.now() - t.getTime()) / 3_600_000
}

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/login')

  const { error, saved } = await searchParams

  const snapshots = await prisma.marketPrices.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 20,
    include: { author: { select: { fullName: true, email: true } } },
  })

  const current = snapshots[0]

  const ageHours = current ? hoursSince(current.updatedAt) : null

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">
          Market feed
        </h1>
        <p className="mt-1 text-xs text-text-secondary">
          Metal prices, freshness, fx rate, and audited manual overrides.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          Override saved. A new snapshot is now live.
        </div>
      )}

      {!current ? (
        <p className="text-sm text-text-secondary">
          No market snapshot exists. Run <code>npm run reset-demo</code>.
        </p>
      ) : (
        <>
          {/* ── Current snapshot ─────────────────────────────────── */}
          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-text-primary">
                Live snapshot
              </h2>
              <span className="font-mono text-xs text-text-secondary">
                {current.source ?? 'unknown source'} ·{' '}
                {ageHours !== null && ageHours > 24
                  ? `${Math.floor(ageHours)}h old — stale`
                  : `${Math.floor(ageHours ?? 0)}h old`}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-3">
              {METALS.map((metal) => (
                <div
                  key={metal}
                  className="rounded-lg border border-border bg-surface p-3"
                >
                  <div className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
                    {metal}
                  </div>
                  <div className="mt-1 font-mono text-lg text-text-primary">
                    ₹{Number(current[metal]).toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-text-secondary">per kg</div>
                </div>
              ))}
              <div className="rounded-lg border border-border bg-surface p-3">
                <div className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
                  USD/INR
                </div>
                <div className="mt-1 font-mono text-lg text-text-primary">
                  {Number(current.fxRateUsdInr).toFixed(2)}
                </div>
                <div className="text-[10px] text-text-secondary">fx rate</div>
              </div>
            </div>
          </div>

          {/* ── Override form ────────────────────────────────────── */}
          <div>
            <h2 className="mb-1 text-sm font-semibold text-text-primary">
              Manual override
            </h2>
            <p className="mb-3 text-xs text-text-secondary">
              Writes a new snapshot; the current one is kept as history. A reason
              is required and is recorded in the audit log.
            </p>

            <form action={overrideMarketPrices} className="space-y-4">
              <div className="grid grid-cols-7 gap-3">
                {METALS.map((metal) => (
                  <label key={metal} className="block">
                    <span className="mb-1 block text-xs font-semibold text-text-secondary">
                      {metal} (₹/kg)
                    </span>
                    <input
                      name={metal}
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      defaultValue={Number(current[metal])}
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm text-text-primary"
                    />
                  </label>
                ))}
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-text-secondary">
                    USD/INR
                  </span>
                  <input
                    name="fxRateUsdInr"
                    type="number"
                    step="0.0001"
                    min="0"
                    required
                    defaultValue={Number(current.fxRateUsdInr)}
                    className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm text-text-primary"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-text-secondary">
                  Reason (required)
                </span>
                <input
                  name="note"
                  type="text"
                  required
                  placeholder="Why is this override being made?"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                />
              </label>

              <button
                type="submit"
                className="rounded-md bg-brand px-4 py-2 text-xs font-semibold text-brand-foreground hover:opacity-90"
              >
                Publish new snapshot
              </button>
            </form>
          </div>

          {/* ── Snapshot history ─────────────────────────────────── */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-primary">
              Snapshot history
            </h2>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface-muted">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-widest text-text-secondary">
                      When
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-widest text-text-secondary">
                      Source
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-widest text-text-secondary">
                      By
                    </th>
                    {METALS.map((m) => (
                      <th
                        key={m}
                        className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-widest text-text-secondary"
                      >
                        {m}
                      </th>
                    ))}
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-widest text-text-secondary">
                      Reason
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snap) => (
                    <tr
                      key={snap.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-2 font-mono text-xs text-text-secondary">
                        {snap.updatedAt.toISOString().slice(0, 16).replace('T', ' ')}
                      </td>
                      <td className="px-4 py-2 text-xs text-text-primary">
                        {snap.source ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-text-secondary">
                        {snap.author?.fullName ?? snap.author?.email ?? 'system'}
                      </td>
                      {METALS.map((m) => (
                        <td
                          key={m}
                          className="px-3 py-2 text-right font-mono text-xs text-text-primary"
                        >
                          {Number(snap[m]).toLocaleString('en-IN')}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-xs text-text-secondary">
                        {snap.note ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}