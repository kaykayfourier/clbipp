import { describe, expect, it } from 'vitest'

import { reassignEligibility, runReassignEligibility } from './assignment'

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

describe('runReassignEligibility', () => {
  const RUN = 'RUN-20261117-5EED'
  const run = (runStatus: string, statuses: string[]) =>
    runReassignEligibility({ runStatus, runNo: RUN, stops: statuses.map((status, i) => ({ id: `PKP-${i}`, status })) })

  it('allows a planned run whose stops are all scheduled or offered', () => {
    expect(run('planned', ['scheduled', 'offered', 'scheduled'])).toEqual({ ok: true })
  })

  it('ignores a cancelled stop, but needs at least one live one', () => {
    expect(run('planned', ['scheduled', 'cancelled'])).toEqual({ ok: true })
    expect(run('planned', ['cancelled']).ok).toBe(false)
    expect(run('planned', []).ok).toBe(false)
  })

  it('refuses a run on the road, and says why', () => {
    const r = run('in_progress', ['scheduled'])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/loaded a box/)
  })

  it('refuses a finished or cancelled run', () => {
    expect(run('completed', ['scheduled']).ok).toBe(false)
    expect(run('cancelled', ['scheduled']).ok).toBe(false)
  })

  it('is held by ONE stop the agent is at, and names it', () => {
    const r = run('planned', ['scheduled', 'arrived'])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('PKP-1')
  })

  it('is held by a stop already collected', () => {
    expect(run('planned', ['scheduled', 'collected']).ok).toBe(false)
  })
})

describe('reassignEligibility on a run stop', () => {
  it('points at the run-level reassign instead', () => {
    const r = reassignEligibility({ status: 'scheduled', openRunNo: 'RUN-1' })
    if (!r.ok) expect(r.reason).toMatch(/Reassign the whole run/)
  })
})
