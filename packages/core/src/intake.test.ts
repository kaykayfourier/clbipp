import { describe, expect, it } from 'vitest'

import {
  CHEMISTRY_OPTIONS,
  CHEMISTRY_VALUES,
  CONDITION_OPTIONS,
  LI_ION_CHEMISTRIES,
  MAX_LINE_WEIGHT_KG,
  chemistryLabel,
  intakeTotals,
  isItemConfirmed,
  isLithium,
  itemConfirmationState,
  outstandingReason,
  parseIntakeSubmission,
  photoPathsBelongTo,
  requiresPhotoEvidence,
  type IntakeTotalsItemLike,
} from './intake'

/** A fully confirmed healthy line — the baseline the cases below vary from. */
function confirmedItem(over: Partial<IntakeTotalsItemLike> = {}): IntakeTotalsItemLike {
  return {
    quantity: 1,
    weightKg: 10,
    chemistry: 'lead_acid',
    confirmedWeightKg: 9.5,
    confirmedCondition: 'healthy',
    agentPhotoUrls: [],
    ...over,
  }
}

function pendingItem(over: Partial<IntakeTotalsItemLike> = {}): IntakeTotalsItemLike {
  return {
    quantity: 1,
    weightKg: 10,
    chemistry: null,
    confirmedWeightKg: null,
    confirmedCondition: null,
    agentPhotoUrls: [],
    ...over,
  }
}

describe('the D1 lithium branch', () => {
  it('routes the three li-ion families to the engine path', () => {
    expect(LI_ION_CHEMISTRIES).toEqual(['li_ion_nmc', 'li_ion_lfp', 'li_ion_nca'])
    for (const c of LI_ION_CHEMISTRIES) expect(isLithium(c)).toBe(true)
  })

  it('routes lead-acid, NiMH and other to the simple path', () => {
    expect(isLithium('lead_acid')).toBe(false)
    expect(isLithium('nimh')).toBe(false)
    expect(isLithium('other')).toBe(false)
  })

  // 🔴 An unassessed item must not offer a damage rubric. `chemistry` is null on
  // every BatteryItem until the agent confirms it, so a truthiness slip here
  // would send every untouched line down the engine path on the item list.
  it('treats an unconfirmed item as not lithium', () => {
    expect(isLithium(null)).toBe(false)
    expect(isLithium(undefined)).toBe(false)
  })

  it('treats an unrecognised chemistry as not lithium', () => {
    expect(isLithium('li_ion_lto')).toBe(false)
    expect(isLithium('')).toBe(false)
  })

  it('lists every chemistry family in the picker exactly once', () => {
    expect(new Set(CHEMISTRY_VALUES).size).toBe(CHEMISTRY_OPTIONS.length)
    for (const c of LI_ION_CHEMISTRIES) expect(CHEMISTRY_VALUES).toContain(c)
  })

  it('labels a chemistry, and returns null for one it does not know', () => {
    expect(chemistryLabel('li_ion_lfp')).toBe('Li-ion LFP')
    expect(chemistryLabel(null)).toBeNull()
    expect(chemistryLabel('nonsense')).toBeNull()
  })
})

describe('photo evidence', () => {
  it('is required for every condition marked damaged, and only those', () => {
    for (const option of CONDITION_OPTIONS) {
      expect(requiresPhotoEvidence(option.value)).toBe(option.damaged)
    }
  })

  // Deliberately wider than the safety checklist's damaged set, which excludes
  // `dead`. Safety asks "does this need special handling now"; intake asks "will
  // this line be disputed later". See the comment on EVIDENCE_REQUIRED_CONDITIONS.
  it('covers dead units, which the safety checklist does not treat as damaged', () => {
    expect(requiresPhotoEvidence('dead')).toBe(true)
    expect(requiresPhotoEvidence('healthy')).toBe(false)
  })

  it('is not required by a null or unknown condition', () => {
    expect(requiresPhotoEvidence(null)).toBe(false)
    expect(requiresPhotoEvidence('mangled')).toBe(false)
  })
})

describe('itemConfirmationState', () => {
  it('is confirmed once chemistry, weight and condition are recorded on a healthy line', () => {
    expect(itemConfirmationState(confirmedItem())).toBe('confirmed')
    expect(isItemConfirmed(confirmedItem())).toBe(true)
  })

  it('is pending with nothing recorded', () => {
    expect(itemConfirmationState(pendingItem())).toBe('pending')
  })

  it.each([
    ['chemistry', { chemistry: null }],
    ['weight', { confirmedWeightKg: null }],
    ['condition', { confirmedCondition: null }],
  ])('is pending when %s is missing', (_field, over) => {
    expect(itemConfirmationState(confirmedItem(over))).toBe('pending')
  })

  // A zero weight is a real submission path — an empty numeric input parses to
  // 0 — and a line that weighs nothing has not been weighed.
  it('is pending when the weight is zero or negative', () => {
    expect(itemConfirmationState(confirmedItem({ confirmedWeightKg: 0 }))).toBe('pending')
    expect(itemConfirmationState(confirmedItem({ confirmedWeightKg: -1 }))).toBe('pending')
  })

  it('needs a photo when a damaged line has none', () => {
    const item = confirmedItem({ confirmedCondition: 'leaking', agentPhotoUrls: [] })
    expect(itemConfirmationState(item)).toBe('needs-photo')
    expect(isItemConfirmed(item)).toBe(false)
  })

  it('is confirmed once the damaged line has a photo', () => {
    const item = confirmedItem({ confirmedCondition: 'leaking', agentPhotoUrls: ['uid/a.jpg'] })
    expect(itemConfirmationState(item)).toBe('confirmed')
  })

  it('does not require a photo on a healthy line', () => {
    expect(itemConfirmationState(confirmedItem({ agentPhotoUrls: [] }))).toBe('confirmed')
  })

  // The customer's own booking photos are a different column and must never
  // satisfy the agent's evidence requirement — that is the whole point of the
  // two halves being separate.
  it('names what is outstanding, and nothing once it is done', () => {
    expect(outstandingReason(confirmedItem())).toBeNull()
    expect(outstandingReason(pendingItem())).toContain('chemistry')
    expect(outstandingReason(pendingItem())).toContain('weighed kg')
    expect(outstandingReason(confirmedItem({ confirmedCondition: 'swollen' }))).toContain('photo')
  })
})

describe('intakeTotals', () => {
  const items: IntakeTotalsItemLike[] = [
    confirmedItem({ quantity: 14, weightKg: 196, confirmedWeightKg: 194.5 }),
    confirmedItem({
      quantity: 2,
      weightKg: 28,
      confirmedWeightKg: 27,
      confirmedCondition: 'leaking',
      agentPhotoUrls: ['uid/leak.jpg'],
    }),
    pendingItem({ quantity: 6, weightKg: 33.5 }),
  ]

  it('counts every line and unit, confirmed or not', () => {
    const totals = intakeTotals(items)
    expect(totals.lines).toBe(3)
    expect(totals.units).toBe(22)
    expect(totals.declaredKg).toBeCloseTo(257.5)
  })

  it('weighs only the confirmed lines, so the number never overstates the scale', () => {
    expect(intakeTotals(items).weighedKg).toBeCloseTo(221.5)
    expect(intakeTotals(items).confirmedLines).toBe(2)
  })

  it('unlocks the quote only when every line is confirmed', () => {
    expect(intakeTotals(items).allConfirmed).toBe(false)
    const all = items.map((i) => confirmedItem({ quantity: i.quantity, weightKg: i.weightKg }))
    expect(intakeTotals(all).allConfirmed).toBe(true)
  })

  // 🔴 An empty pickup is a data fault, not a finished job. `0 === 0` would
  // otherwise read as complete and let Batch 5a raise an Offer for nothing.
  it('does NOT report an empty pickup as fully confirmed', () => {
    const totals = intakeTotals([])
    expect(totals.lines).toBe(0)
    expect(totals.allConfirmed).toBe(false)
  })

  it('treats a weightless declared line as zero rather than NaN', () => {
    const totals = intakeTotals([pendingItem({ weightKg: null })])
    expect(totals.declaredKg).toBe(0)
  })
})

describe('parseIntakeSubmission', () => {
  const good = { chemistry: 'li_ion_nmc', weightKg: '12.34', condition: 'healthy' }

  it('accepts a well-formed submission', () => {
    const result = parseIntakeSubmission(good)
    expect(result.error).toBeNull()
    expect(result.value).toEqual({
      chemistry: 'li_ion_nmc',
      confirmedWeightKg: 12.34,
      confirmedCondition: 'healthy',
    })
  })

  it('rounds to two decimals, matching Decimal(8,2) on the column', () => {
    expect(parseIntakeSubmission({ ...good, weightKg: '12.345' }).value?.confirmedWeightKg).toBe(12.35)
    expect(parseIntakeSubmission({ ...good, weightKg: ' 8.005 ' }).value?.confirmedWeightKg).toBe(8.01)
  })

  it('rejects a chemistry that is not in the enum', () => {
    expect(parseIntakeSubmission({ ...good, chemistry: 'plutonium' }).error).toBeTruthy()
    expect(parseIntakeSubmission({ ...good, chemistry: null }).error).toBeTruthy()
  })

  it('rejects a condition that is not in the enum', () => {
    expect(parseIntakeSubmission({ ...good, condition: 'mangled' }).error).toBeTruthy()
    expect(parseIntakeSubmission({ ...good, condition: null }).error).toBeTruthy()
  })

  // Number('') is 0 and Number(' ') is 0 — both would sail past a `> 0` check
  // written after the parse instead of before it.
  it.each([['', 'empty'], [' ', 'whitespace'], ['abc', 'not a number'], ['0', 'zero'], ['-3', 'negative']])(
    'rejects %s weight (%s)',
    (weightKg) => {
      expect(parseIntakeSubmission({ ...good, weightKg }).error).toBeTruthy()
    },
  )

  it('rejects a weight past the typo rail', () => {
    const over = String(MAX_LINE_WEIGHT_KG + 1)
    expect(parseIntakeSubmission({ ...good, weightKg: over }).error).toBeTruthy()
    expect(parseIntakeSubmission({ ...good, weightKg: String(MAX_LINE_WEIGHT_KG) }).error).toBeNull()
  })
})

describe('photoPathsBelongTo', () => {
  const uid = '11111111-1111-4111-8111-111111111111'

  it('accepts paths under the uploader’s own folder', () => {
    expect(photoPathsBelongTo([`${uid}/jobs/a.jpg`, `${uid}/jobs/b.jpg`], uid)).toBe(true)
  })

  it('accepts an empty list — a healthy line needs no photo', () => {
    expect(photoPathsBelongTo([], uid)).toBe(true)
  })

  // 🔴 The attack this exists for: the browser uploads under its own uid (RLS
  // enforces that), but the PATHS then ride a form field into a service-role
  // write that bypasses RLS entirely.
  it('rejects a path under another user’s folder', () => {
    const other = '22222222-2222-4222-8222-222222222222'
    expect(photoPathsBelongTo([`${uid}/ok.jpg`, `${other}/theirs.jpg`], uid)).toBe(false)
  })

  it('rejects a prefix that merely starts with the uid', () => {
    expect(photoPathsBelongTo([`${uid}-evil/theirs.jpg`], uid)).toBe(false)
  })

  it('rejects everything when there is no user id', () => {
    expect(photoPathsBelongTo([`${uid}/ok.jpg`], '')).toBe(false)
  })
})
