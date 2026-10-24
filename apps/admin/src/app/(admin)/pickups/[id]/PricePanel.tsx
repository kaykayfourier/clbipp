import { formatPaise } from '@clbipp/core/format'
import { Card, CardContent, DetailRow } from '@clbipp/ui'

import { setOfficePriceAction } from './actions'

// ─── The Price panel (AF5 · FD23, FD24) ──────────────────────────────────────
// Everything about how this pickup's price was arrived at, for the office:
// what the engine recommended, what is offered now, every office price (who,
// why, from what, and whether the agent has presented it), and every round the
// vendor saw. INTERNAL — none of it reaches a vendor screen.
//
// A server component: "Change price" is a plain form posting setOfficePrice,
// which re-checks everything (the form is not the boundary).

export type PricePanelData = {
  pickupId: string
  enginePaise: number
  unpricedLines: number
  offer: { estimatedPrice: number; acceptedAt: Date | null; pathway: string; rationale: string; priceNote: string | null } | null
  officePrices: Array<{
    id: string
    pricePaise: number
    previousPaise: number | null
    enginePaise: number
    reason: string
    setAt: Date
    setterName: string
    acknowledgedAt: Date | null
    acknowledgedByName: string | null
    agentNote: string | null
  }>
  rounds: Array<{
    roundNo: number
    pricePaise: number
    basis: string
    outcome: string | null
    note: string | null
    presentedAt: Date
    presenterName: string | null
  }>
  canSet: boolean
}

const BASIS: Record<string, string> = { engine: 'engine', office: 'office price', agent: 'agent re-offer' }

export function PricePanel({ data, formatDateTime }: { data: PricePanelData; formatDateTime: (d: Date) => string }) {
  const first = data.rounds[0]
  const latest = data.rounds[data.rounds.length - 1]
  const movePct = first && latest && first.pricePaise > 0 ? ((latest.pricePaise - first.pricePaise) / first.pricePaise) * 100 : null
  const state = !data.offer
    ? 'Not presented yet'
    : data.offer.acceptedAt
      ? `Accepted ${formatDateTime(data.offer.acceptedAt)}`
      : latest?.outcome === 'declined'
        ? 'Declined by the vendor'
        : 'Awaiting the vendor'

  return (
    <Card variant="outline">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col">
          <DetailRow
            label="Engine recommended"
            value={`${formatPaise(data.enginePaise)}${data.unpricedLines > 0 ? ` · ${data.unpricedLines} line${data.unpricedLines === 1 ? '' : 's'} not priced yet` : ''}`}
          />
          <DetailRow label="Offered now" value={data.offer ? formatPaise(data.offer.estimatedPrice) : '—'} strong />
          <DetailRow label="Vendor response" value={state} />
          {first && latest && data.rounds.length > 1 ? (
            <DetailRow
              label="First offer → now"
              value={`${formatPaise(first.pricePaise)} → ${formatPaise(latest.pricePaise)}${movePct !== null ? ` (${movePct >= 0 ? '+' : ''}${movePct.toFixed(1)}%)` : ''}`}
            />
          ) : null}
          {data.offer?.priceNote ? <DetailRow label="Note on the offer" value={data.offer.priceNote} /> : null}
          {data.offer ? <DetailRow label="Pathway" value={data.offer.pathway} last /> : null}
        </div>

        {data.officePrices.length > 0 ? (
          <div className="border-t border-console-line pt-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-text-disabled">Office prices</p>
            <ul className="mt-1.5 flex flex-col gap-2">
              {data.officePrices.map((o) => (
                <li key={o.id} className="text-xs leading-relaxed">
                  <span className="font-bold text-text-primary">
                    {o.previousPaise !== null ? `${formatPaise(o.previousPaise)} → ` : ''}
                    {formatPaise(o.pricePaise)}
                  </span>
                  <span className="text-text-secondary">{` · ${o.setterName} · ${formatDateTime(o.setAt)} — “${o.reason}”`}</span>
                  <span className="block text-text-secondary">
                    {o.acknowledgedAt
                      ? `Presented by ${o.acknowledgedByName ?? 'the agent'} ${formatDateTime(o.acknowledgedAt)}${o.agentNote ? ` — “${o.agentNote}”` : ''}`
                      : 'Not presented to the vendor yet'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {data.rounds.length > 0 ? (
          <div className="border-t border-console-line pt-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-text-disabled">Negotiation rounds</p>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {data.rounds.map((r) => (
                <li key={r.roundNo} className="text-xs leading-relaxed text-text-primary">
                  {`Round ${r.roundNo} · ${formatPaise(r.pricePaise)} · ${BASIS[r.basis] ?? r.basis} · ${r.outcome ?? 'with the vendor'}`}
                  <span className="text-text-secondary">
                    {` · ${r.presenterName ?? '—'} · ${formatDateTime(r.presentedAt)}${r.note ? ` — “${r.note}”` : ''}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {data.offer ? (
          <div className="border-t border-console-line pt-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-text-disabled">Shown to the vendor</p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{data.offer.rationale}</p>
          </div>
        ) : null}

        {data.canSet ? (
          <form action={setOfficePriceAction} className="flex flex-col gap-2 border-t border-console-line pt-2.5">
            <input type="hidden" name="pickupId" value={data.pickupId} />
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-text-disabled">Change price</p>
            <div className="flex flex-wrap gap-2">
              <input
                name="rupees"
                type="number"
                min="1"
                step="0.01"
                required
                placeholder="Amount (₹)"
                className="w-[140px] rounded-lg border border-console-line bg-surface px-3 py-1.5 text-xs text-text-primary"
              />
              <input
                name="reason"
                required
                minLength={8}
                placeholder="Reason — the agent reads it"
                className="min-w-[220px] flex-1 rounded-lg border border-console-line bg-surface px-3 py-1.5 text-xs text-text-primary"
              />
              <button type="submit" className="rounded-lg bg-primary-black px-3 py-1.5 text-xs font-bold text-primary-green">
                Change price
              </button>
            </div>
            <p className="text-[11px] text-text-secondary">The agent presents it. The vendor never sees the reason.</p>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}
