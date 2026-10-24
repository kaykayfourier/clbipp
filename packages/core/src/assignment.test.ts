import { describe, expect, it } from 'vitest'

import { reassignEligibility } from './assignment'

describe('reassignEligibility', () => {
  it('allows a scheduled job and an offered one in any sub-state', () => {
    expect(reassignEligibility({ status: 'scheduled' })).toEqual({ ok: true })
    expect(reassignEligibility({ status: 'offered' })).toEqual({ ok: true })
    expect(reassignEligibility({ status: 'offered', openRunNo: null })).toEqual({ ok: true })
  })

  it('refuses once the agent has arrived, with its own reason', () => {
    const r = reassignEligibility({ status: 'arrived' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/on site/)
  })

  it('refuses before dispatch and after collection', () => {
    for (const status of ['requested', 'collected', 'tested', 'certified', 'cancelled']) {
      expect(reassignEligibility({ status }).ok).toBe(false)
    }
  })

  it('refuses a stop on an open run and names the run', () => {
    const r = reassignEligibility({ status: 'scheduled', openRunNo: 'RUN-20261024-5EED' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('RUN-20261024-5EED')
  })
})
