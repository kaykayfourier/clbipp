import { categoryLabel } from '@clbipp/core/intake'
import { MIN_UNTAGGED_REASON_CHARS } from '@clbipp/core/tags'
import { Card, CardContent, SectionLabel } from '@clbipp/ui'

import { CodeField } from '@/components/qr-scanner'

import { bindItemTagAction, skipItemTagAction, unbindItemTagAction } from './tag-actions'

// ─── "Tag the load" (FV10 · FD12, FD13) ──────────────────────────────────────
// One card per battery line: scan a tag from the sheet onto it, or say why it
// has none. A server component — every control is a plain form posting to
// ./tag-actions — with only the scan field on the client.
//
// 🔴 Mandatory before the vendor signs: `confirmCollection` refuses a load with
// a line that is neither tagged nor explained. The explanation is the escape
// hatch (FD13) — never a hard stop in front of a waiting vendor — and the hub
// tags that line on receipt.

export type TagLine = {
  id: string
  category: string
  quantity: number
  chemistryLabel: string | null
  weightKg: number
  tagCode: string | null
  boxCode: string | null
  untaggedReason: string | null
}

export type LoadedBox = { id: string; code: string; label: string }

export function TagLoad({
  pickupId,
  lines,
  boxes,
  runNo,
  returnTo,
}: {
  pickupId: string
  lines: TagLine[]
  /** Boxes loaded on this job's run right now (FV11). Empty for a standalone job. */
  boxes: LoadedBox[]
  runNo: string | null
  /** Where the forms come back to — the collect screen, or the receipt after it. */
  returnTo: string
}) {
  const done = lines.filter((l) => l.tagCode || l.untaggedReason).length

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>{`Tag the load — ${done} of ${lines.length} lines done`}</SectionLabel>
      <p className="px-1 text-[11px] leading-relaxed text-text-secondary">
        One tag from your sheet on every line — on the battery, or on the bag or crate holding a lot of small
        cells.{' '}
        {runNo
          ? boxes.length > 0
            ? `Loading into ${boxes.map((b) => b.code).join(', ')} on ${runNo}.`
            : `This job is on ${runNo} — scan a box on the run screen to record which box it goes in.`
          : ''}
      </p>

      {lines.map((line, idx) => (
        <Card key={line.id} variant="elevated">
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {`Line ${idx + 1} · ${categoryLabel(line.category)}`}
                </p>
                <p className="text-[11px] text-text-secondary">
                  {`${line.quantity} unit${line.quantity === 1 ? '' : 's'}${line.chemistryLabel ? ` · ${line.chemistryLabel}` : ''} · ${line.weightKg.toFixed(1)} kg`}
                </p>
              </div>
              {line.tagCode ? (
                <span className="rounded-full bg-primary-black px-2.5 py-1 font-mono text-[11px] font-bold text-primary-green">
                  {line.tagCode}
                </span>
              ) : line.untaggedReason ? (
                <span className="rounded-full bg-background px-2.5 py-1 text-[10px] font-semibold text-text-secondary">
                  No tag
                </span>
              ) : null}
            </div>

            {line.tagCode ? (
              <div className="flex items-center justify-between gap-2 text-[11px] text-text-secondary">
                <span>{line.boxCode ? `In box ${line.boxCode}` : 'Not in a tracked box'}</span>
                <form action={unbindItemTagAction}>
                  <input type="hidden" name="pickupId" value={pickupId} />
                  <input type="hidden" name="itemId" value={line.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button type="submit" className="font-semibold text-text-primary underline underline-offset-2">
                    Remove tag
                  </button>
                </form>
              </div>
            ) : (
              <>
                {line.untaggedReason ? (
                  <p className="rounded-[10px] bg-background px-3 py-2 text-[11px] text-text-secondary">
                    {`No tag: “${line.untaggedReason}”. The hub tags it on receipt — or scan one now if you have it.`}
                  </p>
                ) : null}
                <form action={bindItemTagAction} className="flex flex-col gap-2">
                  <input type="hidden" name="pickupId" value={pickupId} />
                  <input type="hidden" name="itemId" value={line.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  {boxes.length > 1 ? (
                    <select
                      name="containerId"
                      defaultValue={boxes[boxes.length - 1].id}
                      aria-label="Which box this line goes into"
                      className="h-10 rounded-[10px] border border-border bg-background px-2 text-sm text-text-primary"
                    >
                      {boxes.map((b) => (
                        <option key={b.id} value={b.id}>
                          {`${b.code} · ${b.label}`}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <CodeField placeholder="TG-…" scanLabel="Scan tag" submitLabel="Bind tag to this line" />
                </form>
                {!line.untaggedReason ? (
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-text-secondary underline underline-offset-2">
                      No tag available?
                    </summary>
                    <form action={skipItemTagAction} className="mt-2 flex flex-col gap-2">
                      <input type="hidden" name="pickupId" value={pickupId} />
                      <input type="hidden" name="itemId" value={line.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <input
                        name="reason"
                        required
                        minLength={MIN_UNTAGGED_REASON_CHARS}
                        placeholder="e.g. sheet ran out, label won't stick"
                        className="h-10 rounded-[10px] border border-border bg-background px-3 text-sm text-text-primary"
                      />
                      <button
                        type="submit"
                        className="h-10 rounded-[10px] border border-border text-sm font-semibold text-text-primary"
                      >
                        Collect this line without a tag
                      </button>
                    </form>
                  </details>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
