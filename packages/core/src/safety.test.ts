import { describe, expect, it } from 'vitest'

import {
  ALWAYS_REQUIRED,
  SAFETY_CHECKLIST_VERSION,
  SAFETY_ITEMS,
  buildChecklistJson,
  evaluateChecklist,
  hasDamagedUnits,
  labelsFor,
  lithiumLikelyFromCategories,
  readStoredAnswers,
  readStoredLithiumPresent,
  requiredItemKeys,
  type SafetyAnswers,
  type SafetyItemKey,
} from './safety'

/** Every key required for a given job, ticked. */
function allTicked(keys: readonly SafetyItemKey[]): SafetyAnswers {
  return Object.fromEntries(keys.map((k) => [k, true]))
}

describe('the HR-mandated five', () => {
  it('are required on a plain lead-acid job with nothing declared damaged', () => {
    const required = requiredItemKeys({ lithiumPresent: false, damagedUnitsPresent: false })
    expect(required).toEqual([...ALWAYS_REQUIRED])
  })

  // 🔴 The load-bearing test of this module. The lithium toggle and the category
  // guess may only ever ADD items — if a future edit lets either of them narrow
  // the required set, an HR-mandated safety item can vanish from a live job.
  it('survive every combination of the conditional flags', () => {
    for (const lithiumPresent of [true, false]) {
      for (const damagedUnitsPresent of [true, false]) {
        const required = requiredItemKeys({ lithiumPresent, damagedUnitsPresent })
        for (const key of ALWAYS_REQUIRED) expect(required).toContain(key)
      }
    }
  })
})

describe('requiredItemKeys', () => {
  it('adds the two lithium items when lithium is present, and nothing else', () => {
    const without = requiredItemKeys({ lithiumPresent: false, damagedUnitsPresent: false })
    const with_ = requiredItemKeys({ lithiumPresent: true, damagedUnitsPresent: false })

    expect(with_).toContain('lithiumStateOfCharge')
    expect(with_).toContain('lithiumDamagedCellsIsolated')
    expect(with_.length).toBe(without.length + 2)
  })

  it('adds the containment item only when damaged units were declared', () => {
    const without = requiredItemKeys({ lithiumPresent: true, damagedUnitsPresent: false })
    const with_ = requiredItemKeys({ lithiumPresent: true, damagedUnitsPresent: true })

    expect(without).not.toContain('damagedUnitsContained')
    expect(with_).toContain('damagedUnitsContained')
  })

  it('returns keys in catalogue order so the screen and the audit row agree', () => {
    const required = requiredItemKeys({ lithiumPresent: true, damagedUnitsPresent: true })
    const catalogueOrder = SAFETY_ITEMS.map((i) => i.key)
    expect(required).toEqual(catalogueOrder.filter((k) => required.includes(k)))
  })
})

describe('lithiumLikelyFromCategories', () => {
  it('is false only when every declared line is automotive', () => {
    expect(lithiumLikelyFromCategories(['automotive', 'automotive'])).toBe(false)
  })

  it('is true as soon as one line is not automotive', () => {
    // PKP-2026-000102's real shape: two automotive lines plus one industrial.
    expect(lithiumLikelyFromCategories(['automotive', 'automotive', 'industrial'])).toBe(true)
    expect(lithiumLikelyFromCategories(['portable'])).toBe(true)
    expect(lithiumLikelyFromCategories(['ev'])).toBe(true)
  })

  // Biased toward showing: no data is not evidence of no lithium.
  it('is true for an empty or unrecognised load', () => {
    expect(lithiumLikelyFromCategories([])).toBe(true)
    expect(lithiumLikelyFromCategories(['something-new'])).toBe(true)
  })
})

describe('hasDamagedUnits', () => {
  it('fires on swollen or leaking and on nothing else', () => {
    expect(hasDamagedUnits(['healthy', 'healthy'])).toBe(false)
    expect(hasDamagedUnits(['healthy', 'leaking'])).toBe(true)
    expect(hasDamagedUnits(['swollen'])).toBe(true)
    // `dead` is a value question, not a handling hazard.
    expect(hasDamagedUnits(['dead'])).toBe(false)
  })
})

describe('evaluateChecklist', () => {
  it('passes only when every required key is ticked', () => {
    const required = requiredItemKeys({ lithiumPresent: false, damagedUnitsPresent: false })
    expect(evaluateChecklist(allTicked(required), required).passed).toBe(true)
  })

  it('reports precisely which items are outstanding', () => {
    const required = requiredItemKeys({ lithiumPresent: false, damagedUnitsPresent: false })
    const answers = { ...allTicked(required), fireSafeCrate: false, ppeWorn: undefined }

    const { passed, missing } = evaluateChecklist(answers, required)
    expect(passed).toBe(false)
    expect(missing).toEqual(['fireSafeCrate', 'ppeWorn'])
  })

  it('does not let an unticked lithium item pass on a lithium job', () => {
    const required = requiredItemKeys({ lithiumPresent: true, damagedUnitsPresent: false })
    const answers = allTicked(ALWAYS_REQUIRED)

    const { passed, missing } = evaluateChecklist(answers, required)
    expect(passed).toBe(false)
    expect(missing).toEqual(['lithiumStateOfCharge', 'lithiumDamagedCellsIsolated'])
  })

  // Only `true` counts. A checkbox that never rendered arrives as undefined, and
  // "not answered" must never read as "confirmed safe".
  it('treats a missing answer as unticked, not as a pass', () => {
    const required: SafetyItemKey[] = ['terminalsInsulated']
    expect(evaluateChecklist({}, required).passed).toBe(false)
  })
})

describe('buildChecklistJson', () => {
  it('produces a passing row with no missing items', () => {
    const required = requiredItemKeys({ lithiumPresent: true, damagedUnitsPresent: true })
    const { json, passed } = buildChecklistJson({
      answers: allTicked(required),
      lithiumPresent: true,
      lithiumBasis: 'agent',
      damagedUnitsPresent: true,
    })

    expect(passed).toBe(true)
    expect(json.missing).toEqual([])
    expect(json.version).toBe(SAFETY_CHECKLIST_VERSION)
    expect(json.lithiumBasis).toBe('agent')
  })

  // `passed` is a column and `missing` lives in the JSON; they are computed
  // together here so a row can never claim to have passed while listing
  // outstanding items.
  it('keeps passed and missing consistent on a partial submission', () => {
    const { json, passed } = buildChecklistJson({
      answers: { terminalsInsulated: true, ppeWorn: true },
      lithiumPresent: false,
      lithiumBasis: 'agent',
      damagedUnitsPresent: false,
    })

    expect(passed).toBe(false)
    expect(json.missing.length).toBeGreaterThan(0)
    expect(passed).toBe(json.missing.length === 0)
  })

  // The answers come off a form, and a form is attacker-controlled. Arbitrary
  // keys must not reach a compliance record.
  it('drops keys that are not in the catalogue', () => {
    const { json } = buildChecklistJson({
      answers: { terminalsInsulated: true, __proto__: true, admin: true } as SafetyAnswers,
      lithiumPresent: false,
      lithiumBasis: 'agent',
      damagedUnitsPresent: false,
    })

    expect(Object.keys(json.answers)).toEqual(['terminalsInsulated'])
  })
})

describe('reading a stored row back', () => {
  it('round-trips the answers it wrote', () => {
    const required = requiredItemKeys({ lithiumPresent: true, damagedUnitsPresent: false })
    const { json } = buildChecklistJson({
      answers: allTicked(required),
      lithiumPresent: true,
      lithiumBasis: 'agent',
      damagedUnitsPresent: false,
    })

    expect(readStoredAnswers(json)).toEqual(json.answers)
    expect(readStoredLithiumPresent(json, false)).toBe(true)
  })

  // A row it cannot understand yields no ticks — the agent re-confirms rather
  // than being shown a checklist asserting things nobody actually asserted.
  it('yields nothing for junk rather than throwing', () => {
    for (const junk of [null, undefined, 42, 'nope', {}, { answers: 'no' }]) {
      expect(readStoredAnswers(junk)).toEqual({})
    }
    expect(readStoredLithiumPresent(null, true)).toBe(true)
    expect(readStoredLithiumPresent({ lithiumPresent: 'yes' }, false)).toBe(false)
  })

  // Rows written before the `answers` wrapper existed stored the map at the top
  // level. Tolerated so an early row still pre-fills.
  it('accepts a bare answer map at the top level', () => {
    expect(readStoredAnswers({ terminalsInsulated: true, ppeWorn: true })).toEqual({
      terminalsInsulated: true,
      ppeWorn: true,
    })
  })
})

describe('labelsFor', () => {
  it('turns keys into the lines the agent actually saw', () => {
    expect(labelsFor(['ppeWorn'])).toEqual(['PPE worn'])
    expect(labelsFor([])).toEqual([])
  })
})
