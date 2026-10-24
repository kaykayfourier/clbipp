import { describe, expect, it } from 'vitest'

import {
  NEGOTIATION_BAND_MAX_BP,
  checkReoffer,
  formatBandBp,
  getNegotiationBandBp,
  reofferCeilingPaise,
  sanctionedPricePaise,
} from './negotiation'

describe('sanctionedPricePaise', () => {
  it('is the office price when there is one, else the engine figure', () => {
    expect(sanctionedPricePaise({ enginePaise: 500_000, officePricePaise: 550_000 })).toBe(550_000)
    expect(sanctionedPricePaise({ enginePaise: 500_000, officePricePaise: null })).toBe(500_000)
  })
})

describe('reofferCeilingPaise', () => {
  it('adds the band and rounds down to whole paise', () => {
    expect(reofferCeilingPaise(500_000, 1000)).toBe(550_000)
    expect(reofferCeilingPaise(333_333, 1000)).toBe(366_666)
  })
  it('clamps the band to 0–50%', () => {
    expect(reofferCeilingPaise(100_000, -500)).toBe(100_000)
    expect(reofferCeilingPaise(100_000, 9000)).toBe(150_000)
  })
})

describe('checkReoffer', () => {
  const base = { currentPaise: 500_000, sanctionedPaise: 500_000, bandBp: 1000 }
  it('allows a price inside the band', () => {
    expect(checkReoffer({ ...base, pricePaise: 540_000 })).toEqual({ ok: true })
    expect(checkReoffer({ ...base, pricePaise: 550_000 })).toEqual({ ok: true })
  })
  it('refuses above the band and names the ceiling', () => {
    const r = checkReoffer({ ...base, pricePaise: 550_001 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('₹5,500')
  })
  it('refuses the unchanged price, zero and unstorable amounts', () => {
    expect(checkReoffer({ ...base, pricePaise: 500_000 }).ok).toBe(false)
    expect(checkReoffer({ ...base, pricePaise: 0 }).ok).toBe(false)
    expect(checkReoffer({ ...base, pricePaise: 3_000_000_000, sanctionedPaise: 3_000_000_000 }).ok).toBe(false)
  })
  it('with a 0% band only a lower price is possible', () => {
    expect(checkReoffer({ ...base, bandBp: 0, pricePaise: 500_001 }).ok).toBe(false)
    expect(checkReoffer({ ...base, bandBp: 0, pricePaise: 480_000 }).ok).toBe(true)
  })
})

describe('formatBandBp', () => {
  it('reads as a percentage', () => {
    expect(formatBandBp(1000)).toBe('10%')
    expect(formatBandBp(1250)).toBe('12.5%')
  })
})

describe('getNegotiationBandBp', () => {
  const db = (row: { negotiationBandBp: number } | null) => ({ opsSettings: { findUnique: async () => row } })
  it('fails closed to 0% when the row is missing', async () => {
    expect(await getNegotiationBandBp(db(null))).toBe(0)
  })
  it('returns the stored band, clamped', async () => {
    expect(await getNegotiationBandBp(db({ negotiationBandBp: 1000 }))).toBe(1000)
    expect(await getNegotiationBandBp(db({ negotiationBandBp: 99_999 }))).toBe(NEGOTIATION_BAND_MAX_BP)
  })
})
