'use server'

// D01 · Engine config publish — Batch 11 (AD8).
//
// 🔴 THE ONE PLACE IN THIS SPRINT WHERE A BUG MOVES MONEY SILENTLY (risk R3).
// Every value written here feeds the next quote. There is no "preview" state
// and no staging config: publish is live.
//
// APPEND-ONLY. Nothing is updated in place. A publish deactivates the current
// row and INSERTS a new one, so every price the company ever quoted can be
// traced back to a config row that still exists. `parentVersion` chains them.
//
// Follows dispatch/actions.ts, the reference admin lifecycle write: identity
// from the session (never a form field), validation server-side, the row and
// its audit trail in ONE transaction, and redirect-after-POST with the error in
// the query string so a failed publish does not lose the form.

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import type { AdminAuditAction, AdminAuditSubject } from '@clbipp/core/audit'
import {
  EDITABLE_CHEMISTRIES,
  MARGIN_TIER_KEYS,
  METALS,
  mintConfigVersion,
  validateEngineConfig,
} from '@clbipp/core/engine-config'
import type { Chemistry, Config, CostInput, Metal } from '@clbipp/decision-engine'

import { requireAdmin } from '@/lib/admin-identity'

const AUDIT_ACTION: AdminAuditAction = 'config.publish'
const AUDIT_SUBJECT: AdminAuditSubject = 'engine_config'

/** Scalar fields the form owns, each a plain number input. */
const SCALAR_FIELDS = [
  'flat_repackaging_fee',
  'cell_replacement_rate',
  'soh_restoration_delta',
  'refining_rate_pct',
  'yield_loss_pct',
  'logistics_rate_per_km',
  'overhead_rate_pct',
  'cycle_cap',
  'age_cap',
  'hurdle_rate',
] as const

/** Fields that are a CostInput — a mode plus one number. */
const COST_FIELDS = ['processing', 'qa_reuse', 'qa_refurb', 'refurb_labor', 'hydromet'] as const

/** Per-chemistry scalar tables. */
const CHEMISTRY_TABLES = [
  'second_life_rate_per_kWh',
  'refurb_pack_rate_per_kWh',
  'chemistry_mult',
] as const

class FieldError extends Error {}

function num(form: FormData, key: string): number {
  const raw = String(form.get(key) ?? '').trim()
  if (raw === '') throw new FieldError(`${key} is required.`)
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new FieldError(`${key} must be a number.`)
  return value
}

/**
 * Builds the candidate config by OVERLAYING the form onto the currently active
 * one, rather than constructing a config from scratch.
 *
 * 🔴 This is what makes "tier 3 cannot be submitted" structurally true rather
 * than a promise (AD8). The tier-3 values are not `Config` keys at all — they
 * are literals inside the engine's damage.ts and sohGating.ts — so there is no
 * field for a crafted POST to land in. The same overlay is also why the
 * `unknown` chemistry sentinel survives untouched: it forces RECYCLE via Layer
 * 3 and must never acquire a price.
 */
function readConfigFromForm(form: FormData, base: Config): Config {
  const next: Config = structuredClone(base)

  for (const key of SCALAR_FIELDS) {
    next[key] = num(form, key)
  }

  for (const key of COST_FIELDS) {
    const mode = String(form.get(`${key}.mode`) ?? '')
    if (mode !== 'lump_sum' && mode !== 'component') {
      throw new FieldError(`${key} must be a lump sum or a component rate.`)
    }
    const value = num(form, `${key}.value`)
    next[key] = (
      mode === 'lump_sum' ? { mode, amount: value } : { mode, rate: value }
    ) satisfies CostInput
  }

  // Driven off MARGIN_TIER_KEYS rather than three literals, so the form, the
  // validator and this parser cannot drift apart if a fourth tier is ever added.
  const tiers = { ...next.margin_tiers }
  for (const key of MARGIN_TIER_KEYS) {
    tiers[key] = num(form, `margin_tiers.${key}`)
  }
  next.margin_tiers = tiers

  const recovery = { ...next.recovery_efficiency } as Record<Metal, number>
  for (const metal of METALS) {
    recovery[metal] = num(form, `recovery_efficiency.${metal}`)
  }
  next.recovery_efficiency = recovery

  for (const table of CHEMISTRY_TABLES) {
    const updated = { ...next[table] } as Record<Chemistry, number>
    for (const chem of EDITABLE_CHEMISTRIES) {
      updated[chem] = num(form, `${table}.${chem}`)
    }
    next[table] = updated
  }

  const composition = { ...next.chemistry_composition }
  for (const chem of EDITABLE_CHEMISTRIES) {
    const row: Partial<Record<Metal, number>> = {}
    for (const metal of METALS) {
      const raw = String(form.get(`chemistry_composition.${chem}.${metal}`) ?? '').trim()
      // A BLANK cell means "this chemistry does not contain this metal" — LFP
      // genuinely has no Co, Ni or Mn. That is not the same as 0.0, and writing
      // a zero instead would put empty rows in every recycle revenue breakdown.
      if (raw === '') continue
      const value = Number(raw)
      if (!Number.isFinite(value)) {
        throw new FieldError(`chemistry_composition.${chem}.${metal} must be a number.`)
      }
      row[metal] = value
    }
    composition[chem] = row
  }
  next.chemistry_composition = composition

  return next
}

/** Flattens a config to dotted leaf paths, so a publish can diff two of them. */
function flatten(value: unknown, prefix = ''): Record<string, unknown> {
  if (value === null || typeof value !== 'object') return { [prefix]: value }
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    Object.assign(out, flatten(child, prefix ? `${prefix}.${key}` : key))
  }
  return out
}

/**
 * The CHANGED FIELDS ONLY, both sides.
 *
 * 🔴 The schema comment on AdminAudit.before/.after is explicit that a config
 * publish must store the parent version and the new one, not two 4KB blobs. A
 * reviewer opening /audit wants to see what moved, and a full config on both
 * sides makes that unreadable — and makes the audit table grow by ~8KB per
 * publish for no gain.
 */
function diffConfigs(before: Config, after: Config) {
  const a = flatten(before)
  const b = flatten(after)
  const beforeChanged: Record<string, unknown> = {}
  const afterChanged: Record<string, unknown> = {}

  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    // config_version always differs (it is the row identity) and is carried
    // separately as parent/new — listing it as a "changed field" is noise.
    if (key === 'config_version') continue
    if (JSON.stringify(a[key]) === JSON.stringify(b[key])) continue
    beforeChanged[key] = a[key] ?? null
    afterChanged[key] = b[key] ?? null
  }

  return { beforeChanged, afterChanged, count: Object.keys(afterChanged).length }
}

export async function publishConfig(formData: FormData) {
  const fail = (message: string): never =>
    redirect(`/config?error=${encodeURIComponent(message)}`)

  const auth = await requireAdmin()
  if (!auth.ok) return fail(auth.error)

  const current = await prisma.engineConfig.findFirst({
    where: { isActive: true },
    orderBy: { publishedAt: 'desc' },
  })
  if (!current) return fail('There is no active config to publish from. Run npm run reset-demo.')

  // The stored JSON, NOT getActiveConfig(): that helper overlays the row's
  // version string and the live supplier-margin map onto what it returns, and
  // neither belongs in a row being written back. Publishing what getActiveConfig
  // returned would bake today's supplier overrides into the config permanently.
  const base = current.config as unknown as Config

  let candidate: Config
  try {
    candidate = readConfigFromForm(formData, base)
  } catch (error) {
    if (error instanceof FieldError) return fail(error.message)
    throw error
  }

  // The form is not the boundary (AD7's posture). Re-check every rule here.
  const problems = validateEngineConfig(candidate)
  if (problems.length > 0) {
    return fail(
      problems.length === 1
        ? problems[0]
        : `${problems.length} problems: ${problems.join(' ')}`
    )
  }

  const diff = diffConfigs(base, candidate)
  if (diff.count === 0) {
    return fail('Nothing changed — no new config was published.')
  }

  const note = String(formData.get('note') ?? '').trim()

  try {
    await prisma.$transaction(async (tx) => {
      // Minted INSIDE the transaction so two concurrent publishes cannot read
      // the same highest revision and collide on the @unique column.
      const version = await mintConfigVersion(tx)

      // 🔴 Exactly one row is isActive, enforced HERE and not by a partial
      // unique index — Prisma cannot express one, and a raw index would not
      // survive a schema reset (see the schema comment on the column).
      await tx.engineConfig.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })

      const created = await tx.engineConfig.create({
        data: {
          // 🔴 @default(uuid()) does not apply to a service-role write — the
          // id has to be generated here (trap 3).
          id: crypto.randomUUID(),
          version,
          // config_version inside the JSON stays the engine's build stamp.
          // getActiveConfig() overlays the row's version at read time; baking
          // it in here would rewrite the meaning of the field (Batch 1 note 3).
          config: candidate as unknown as object,
          isActive: true,
          note: note || null,
          publishedBy: auth.admin.id,
          parentVersion: current.version,
        },
      })

      await tx.adminAudit.create({
        data: {
          actorId: auth.admin.id,
          action: AUDIT_ACTION,
          subjectType: AUDIT_SUBJECT,
          subjectId: created.id,
          // ⚠ Never a bare `null` in a Json? column — Prisma distinguishes SQL
          // NULL from the JSON value null and `null` is a type error (trap 21).
          // These are always objects, so the question does not arise.
          before: { version: current.version, ...diff.beforeChanged },
          after: { version, ...diff.afterChanged },
          reason: note || null,
        },
      })
    })
  } catch (error) {
    console.error('[publishConfig] failed:', error)
    return fail('Could not publish. Nothing was changed.')
  }

  revalidatePath('/config')
  // /audit reads the row this just wrote, and the agent's quote route reads the
  // new active config on its next call — no cache to bust there.
  revalidatePath('/audit')
  redirect(`/config?published=${diff.count}`)
}
