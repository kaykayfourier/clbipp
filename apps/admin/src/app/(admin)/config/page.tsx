// D01 · Engine config — Batch 11 · owner B (Khalid), built by A (Aamir).
//
// 🔴 THE PRICING SURFACE. Every number on this page feeds the next quote the
// agent app computes. There is no staging config and no preview — publish is
// live (AD8).
//
// THREE TIERS, and the split is the whole point of the screen (AD8 / W3):
//   Tier 1 + 2 — editable here. Cost rates, caps, recovery efficiencies,
//                chemistry tables, margin tiers, hurdle rate.
//   Tier 3     — READ-ONLY, and not because the form declines to show an input:
//                those values are literals inside the engine's own code, not
//                `Config` parameters. There is no field for them to arrive in.
//                Changing one is a code change, and the panel names the files.
//
// ⚠ Chemistry rows use the ENGINE's vocabulary (NMC622 | NMC811 | LFP | LCO |
// NCA), which is NOT the operational BatteryType enum (li_ion_nmc…). The two
// are deliberately separate and must never be merged (trap 14, W13). This is
// the one screen in the console that legitimately speaks engine.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.

import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import {
  EDITABLE_CHEMISTRIES,
  MARGIN_TIER_KEYS,
  METALS,
  TIER3_REFERENCE,
} from '@clbipp/core/engine-config'
import type { Config, CostInput } from '@clbipp/decision-engine'

import { requireAdmin } from '@/lib/admin-identity'
import { formatIstDateTime } from '@/lib/ist'
import { publishConfig } from './actions'

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm text-text-primary'

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {hint && <p className="mt-0.5 mb-3 text-xs text-text-secondary">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

function NumberField({
  name,
  label,
  value,
  step = 'any',
  suffix,
}: {
  name: string
  label: string
  value: number
  step?: string
  suffix?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-text-secondary">
        {label}
        {suffix && <span className="font-normal"> ({suffix})</span>}
      </span>
      <input name={name} type="number" step={step} required defaultValue={value} className={INPUT_CLASS} />
    </label>
  )
}

/** A CostInput is a mode plus one number — the mode decides which key it lands in. */
function CostField({ name, label, value }: { name: string; label: string; value: CostInput }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-text-secondary">{label}</span>
      <div className="flex gap-1.5">
        <select
          name={`${name}.mode`}
          defaultValue={value.mode}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-primary"
        >
          <option value="component">₹/kg</option>
          <option value="lump_sum">flat ₹</option>
        </select>
        <input
          name={`${name}.value`}
          type="number"
          step="any"
          required
          defaultValue={value.mode === 'lump_sum' ? value.amount : value.rate}
          className={INPUT_CLASS}
        />
      </div>
    </label>
  )
}

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; published?: string }>
}) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/login')

  const { error, published } = await searchParams

  const [active, history] = await Promise.all([
    prisma.engineConfig.findFirst({
      where: { isActive: true },
      orderBy: { publishedAt: 'desc' },
      include: { publisher: { select: { fullName: true, email: true } } },
    }),
    prisma.engineConfig.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 15,
      include: { publisher: { select: { fullName: true, email: true } } },
    }),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">
          Engine config
        </h1>
        <p className="mt-1 text-xs text-text-secondary">
          Pricing parameters. Tiers 1 and 2 editable, tier 3 read-only (AD8).
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {published && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          Published. {published} field{published === '1' ? '' : 's'} changed — the next quote uses
          the new config.
        </div>
      )}

      {!active ? (
        <p className="text-sm text-text-secondary">
          No active config row. The engine will not price without one — run{' '}
          <code>npm run reset-demo</code>.
        </p>
      ) : (
        <>
          {/* ── What is live right now ───────────────────────────── */}
          <div className="rounded-lg border border-border bg-surface-muted px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="font-mono text-sm font-semibold text-text-primary">
                {active.version}
              </span>
              <span className="text-xs text-text-secondary">
                published {formatIstDateTime(active.publishedAt)} by{' '}
                {active.publisher?.fullName ?? active.publisher?.email ?? 'the seed'}
              </span>
              {active.parentVersion && (
                <span className="font-mono text-[11px] text-text-secondary">
                  supersedes {active.parentVersion}
                </span>
              )}
            </div>
            {active.note && (
              <p className="mt-1.5 text-xs text-text-secondary">{active.note}</p>
            )}
          </div>

          <ConfigForm config={active.config as unknown as Config} />

          {/* ── Tier 3 — read-only, and structurally unsubmittable ── */}
          <Section
            title="Tier 3 — not configurable"
            hint="These are literals in the engine's own code, not config parameters. There is no field for them here because there is nowhere for a value to go — changing one is a code change and a redeploy."
          >
            <div className="rounded-lg border border-amber-300 bg-amber-50/60 px-4 py-3 text-sm">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold text-text-secondary">Damage weights</dt>
                  <dd className="font-mono text-xs text-text-primary">
                    visual {TIER3_REFERENCE.damageWeights.visual} · leakage{' '}
                    {TIER3_REFERENCE.damageWeights.leakage} · thermal{' '}
                    {TIER3_REFERENCE.damageWeights.thermal}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-text-secondary">Damage bands</dt>
                  <dd className="font-mono text-xs text-text-primary">
                    &gt; {TIER3_REFERENCE.damageBands.refurbishOrRecycleAbove} drops REUSE · &gt;{' '}
                    {TIER3_REFERENCE.damageBands.forceRecycleAbove} forces RECYCLE
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-text-secondary">SoH gates</dt>
                  <dd className="font-mono text-xs text-text-primary">
                    &gt; {TIER3_REFERENCE.sohGates.reuseAbove}% REUSE · &gt;{' '}
                    {TIER3_REFERENCE.sohGates.refurbishAbove}% REFURBISH · else RECYCLE
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-text-secondary">Where they live</dt>
                  <dd className="font-mono text-[11px] leading-relaxed text-text-primary">
                    {TIER3_REFERENCE.files.damage}
                    <br />
                    {TIER3_REFERENCE.files.soh}
                  </dd>
                </div>
              </dl>
            </div>
          </Section>

          {/* ── Simulate — the named cut ─────────────────────────── */}
          <Section
            title="Simulate"
            hint="Replay recent quotes against a candidate config before publishing it."
          >
            {/* TODO: replay the last N quotes off BatteryItem.quoteData.
                Genuinely buildable — computeQuote is pure and quoteData holds a
                complete QuoteInput — but 🔴 quoteData is NOT seeded (Batch 1
                as-built note 6), so on a fresh database there is nothing to
                replay and the panel would show an empty table that reads as a
                bug. It becomes worth building once real quotes accumulate.
                Named as a cut in PLAN_ADMIN_APP.md §2. */}
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
              <p className="text-sm text-text-secondary">Not built.</p>
              <p className="mt-1 text-xs text-text-secondary">
                A replay needs stored quote inputs, and <code>BatteryItem.quoteData</code> is not
                seeded — there is nothing to replay until the app has priced real items.
              </p>
            </div>
          </Section>

          {/* ── Publish history ──────────────────────────────────── */}
          <Section title="Publish history" hint="Append-only. A config is never edited in place.">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface-muted">
                  <tr>
                    {['Version', 'Published', 'By', 'Supersedes', 'Note', ''].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-widest text-text-secondary"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-mono text-xs text-text-primary">
                        {row.version}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-text-secondary">
                        {formatIstDateTime(row.publishedAt)}
                      </td>
                      <td className="px-4 py-2 text-xs text-text-secondary">
                        {row.publisher?.fullName ?? row.publisher?.email ?? 'seed'}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-text-secondary">
                        {row.parentVersion ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-text-secondary">{row.note ?? '—'}</td>
                      <td className="px-4 py-2 text-xs">
                        {row.isActive && (
                          <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-brand-foreground">
                            live
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}

/** Tier 1 + 2 — everything an admin may move without a deploy. */
function ConfigForm({ config }: { config: Config }) {
  return (
    <form action={publishConfig} className="space-y-8">
      <Section
        title="Margin & pricing"
        hint="🔴 Ordered aggressive > standard > generous — the band is anchored on it. p_min uses aggressive, p_max uses generous, and inverting them inverts every quote without erroring. Fractions, not percents: 0.30 means we keep 30%."
      >
        <div className="grid gap-3 sm:grid-cols-4">
          {MARGIN_TIER_KEYS.map((tier) => (
            <NumberField
              key={tier}
              name={`margin_tiers.${tier}`}
              label={tier}
              value={config.margin_tiers[tier]}
              step="0.01"
            />
          ))}
          <NumberField
            name="hurdle_rate"
            label="Hurdle rate"
            value={config.hurdle_rate}
            suffix="₹, below which the winner gets a REVIEW flag"
          />
        </div>
      </Section>

      <Section title="Cost rates" hint="Each is either a per-kg component rate or a flat lump sum.">
        <div className="grid gap-3 sm:grid-cols-3">
          <CostField name="processing" label="Processing (intake, all pathways)" value={config.processing} />
          <CostField name="qa_reuse" label="QA — reuse" value={config.qa_reuse} />
          <CostField name="qa_refurb" label="QA — refurbish" value={config.qa_refurb} />
          <CostField name="refurb_labor" label="Refurb labour" value={config.refurb_labor} />
          <CostField name="hydromet" label="Hydromet (recycle)" value={config.hydromet} />
          <NumberField
            name="flat_repackaging_fee"
            label="Flat repackaging fee"
            value={config.flat_repackaging_fee}
            suffix="₹, reuse only"
          />
          <NumberField
            name="cell_replacement_rate"
            label="Cell replacement"
            value={config.cell_replacement_rate}
            suffix="₹/cell"
          />
          <NumberField
            name="soh_restoration_delta"
            label="SoH restoration delta"
            value={config.soh_restoration_delta}
            suffix="percentage points regained by a refurb"
          />
          <NumberField
            name="logistics_rate_per_km"
            label="Logistics"
            value={config.logistics_rate_per_km}
            suffix="₹/km"
          />
        </div>
      </Section>

      <Section
        title="Percentages"
        hint="All three are FRACTIONS. 0.08 is 8%; entering 8 charges 800% and drives every net value negative — the validator rejects it."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField name="overhead_rate_pct" label="Overhead" value={config.overhead_rate_pct} step="0.01" suffix="of revenue" />
          <NumberField name="refining_rate_pct" label="Refining" value={config.refining_rate_pct} step="0.01" suffix="of recycle revenue" />
          <NumberField name="yield_loss_pct" label="Yield loss" value={config.yield_loss_pct} step="0.01" suffix="process loss" />
        </div>
      </Section>

      <Section title="Eligibility caps" hint="Above either of these, REUSE is removed from the eligible set.">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField name="cycle_cap" label="Cycle cap" value={config.cycle_cap} step="1" suffix="cycles" />
          <NumberField name="age_cap" label="Age cap" value={config.age_cap} step="1" suffix="years" />
        </div>
      </Section>

      <Section title="Recovery efficiency" hint="Fraction of each metal actually recovered by the process. 0..1.">
        <div className="grid gap-3 sm:grid-cols-6">
          {METALS.map((metal) => (
            <NumberField
              key={metal}
              name={`recovery_efficiency.${metal}`}
              label={metal}
              value={config.recovery_efficiency[metal]}
              step="0.01"
            />
          ))}
        </div>
      </Section>

      <Section
        title="Chemistry composition"
        hint="kg of metal per kg of pack. Leave a cell BLANK where the chemistry does not contain that metal — LFP genuinely has no Co, Ni or Mn, and a 0 there is not the same thing. Each row must sum to ≤ 1.0."
      >
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-widest text-text-secondary">
                  Chemistry
                </th>
                {METALS.map((m) => (
                  <th
                    key={m}
                    className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-widest text-text-secondary"
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EDITABLE_CHEMISTRIES.map((chem) => (
                <tr key={chem} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-text-primary">
                    {chem}
                  </td>
                  {METALS.map((metal) => (
                    <td key={metal} className="px-2 py-1.5">
                      <input
                        name={`chemistry_composition.${chem}.${metal}`}
                        type="number"
                        step="0.001"
                        min="0"
                        max="1"
                        placeholder="—"
                        defaultValue={config.chemistry_composition[chem]?.[metal] ?? ''}
                        className={INPUT_CLASS}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Revenue rates per chemistry" hint="₹/kWh for the two resale pathways, plus the application multiplier.">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted">
              <tr>
                {['Chemistry', 'Second life (₹/kWh)', 'Refurb pack (₹/kWh)', 'Multiplier'].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-widest text-text-secondary"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EDITABLE_CHEMISTRIES.map((chem) => (
                <tr key={chem} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-text-primary">
                    {chem}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      name={`second_life_rate_per_kWh.${chem}`}
                      type="number"
                      step="any"
                      required
                      defaultValue={config.second_life_rate_per_kWh[chem]}
                      className={INPUT_CLASS}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      name={`refurb_pack_rate_per_kWh.${chem}`}
                      type="number"
                      step="any"
                      required
                      defaultValue={config.refurb_pack_rate_per_kWh[chem]}
                      className={INPUT_CLASS}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      name={`chemistry_mult.${chem}`}
                      type="number"
                      step="0.01"
                      required
                      defaultValue={config.chemistry_mult[chem]}
                      className={INPUT_CLASS}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-text-secondary">
          The <code>unknown</code> chemistry is deliberately absent: it is the sentinel that forces
          RECYCLE via Layer 3, and it must never acquire a price. It is carried through a publish
          untouched.
        </p>
      </Section>

      <Section
        title="Publish"
        hint="Appends a new version and deactivates the current one. The audit log records which fields moved."
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-text-secondary">
              Note (recorded on the audit row)
            </span>
            <input
              name="note"
              type="text"
              placeholder="Why is this config changing?"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-xs font-semibold text-brand-foreground hover:opacity-90"
          >
            Publish new config
          </button>
          <p className="text-xs text-text-secondary">
            🔴 This takes effect immediately. The next quote the agent app computes uses these
            numbers.
          </p>
        </div>
      </Section>
    </form>
  )
}
