import { describe, expect, it } from 'vitest'

import {
  dropoffPrefill,
  expectedVehicle,
  formatVehicleReg,
  isVehicleCorrection,
  normaliseVehicleReg,
  parseVehicleReg,
  vehicleRegFromText,
} from './vehicle'

describe('normaliseVehicleReg', () => {
  it('uppercases, strips spaces and dashes, pads district and number', () => {
    expect(normaliseVehicleReg('dl 1lr-4471')).toBe('DL01LR4471')
    expect(normaliseVehicleReg('MH 12 AB 1234')).toBe('MH12AB1234')
    expect(normaliseVehicleReg('UP16CT2291')).toBe('UP16CT2291')
    expect(normaliseVehicleReg('KA 05 M 7')).toBe('KA05M0007')
  })

  it('accepts a Bharat-series plate', () => {
    expect(normaliseVehicleReg('22 BH 1234 AB')).toBe('22BH1234AB')
  })

  it('rejects text that is not a registration', () => {
    expect(normaliseVehicleReg('')).toBeNull()
    expect(normaliseVehicleReg(null)).toBeNull()
    expect(normaliseVehicleReg('Tata Ace')).toBeNull()
    expect(normaliseVehicleReg('D1LR4471')).toBeNull()
    expect(normaliseVehicleReg('DL1LR44711')).toBeNull()
  })

  it('makes padded and unpadded spellings one vehicle', () => {
    expect(normaliseVehicleReg('DL 01 LR 4471')).toBe(normaliseVehicleReg('DL1LR4471'))
  })
})

describe('vehicleRegFromText', () => {
  it('finds the reg after the model, as profiles write it', () => {
    expect(vehicleRegFromText('Tata Ace · DL 1LR 4471')).toBe('DL01LR4471')
    expect(vehicleRegFromText('Mahindra Jeeto · UP 16 CT 2291')).toBe('UP16CT2291')
  })
  it('reads a bare reg, and gives null for a model alone', () => {
    expect(vehicleRegFromText('HR26EQ8804')).toBe('HR26EQ8804')
    expect(vehicleRegFromText('Tata Ace')).toBeNull()
    expect(vehicleRegFromText(null)).toBeNull()
  })
})

describe('expectedVehicle', () => {
  it('prefers the run vehicle over the profile', () => {
    expect(expectedVehicle({ runVehicle: 'Eicher · HR 26 EQ 8804', profileVehicle: 'Tata Ace · DL 1LR 4471' })).toBe('HR26EQ8804')
  })
  it('falls back to the profile when the run has none or an unreadable one', () => {
    expect(expectedVehicle({ runVehicle: null, profileVehicle: 'Tata Ace · DL 1LR 4471' })).toBe('DL01LR4471')
    expect(expectedVehicle({ runVehicle: 'the blue van', profileVehicle: 'Tata Ace · DL 1LR 4471' })).toBe('DL01LR4471')
  })
  it('is null when neither holds a registration', () => {
    expect(expectedVehicle({})).toBeNull()
  })
})

describe('parseVehicleReg', () => {
  it('requires a value', () => {
    expect(parseVehicleReg('  ')).toEqual({ ok: false, error: 'Enter the vehicle number.' })
    expect(parseVehicleReg(undefined).ok).toBe(false)
  })
  it('rejects a malformed value and returns the canonical form otherwise', () => {
    expect(parseVehicleReg('van').ok).toBe(false)
    expect(parseVehicleReg('dl 1lr 4471')).toEqual({ ok: true, reg: 'DL01LR4471' })
  })
})

describe('isVehicleCorrection', () => {
  it('is false when the entry is the prefill in any spelling', () => {
    expect(isVehicleCorrection('DL1LR4471', 'dl 01 lr 4471')).toBe(false)
  })
  it('is true when it is a different vehicle', () => {
    expect(isVehicleCorrection('DL01LR4471', 'UP16CT2291')).toBe(true)
  })
  it('is never a correction when there was no prefill', () => {
    expect(isVehicleCorrection(null, 'UP16CT2291')).toBe(false)
  })
})

describe('formatVehicleReg', () => {
  it('spaces the groups for display', () => {
    expect(formatVehicleReg('DL01LR4471')).toBe('DL 01 LR 4471')
    expect(formatVehicleReg('22BH1234AB')).toBe('22 BH 1234 AB')
  })
  it('leaves text it cannot read alone', () => {
    expect(formatVehicleReg('van')).toBe('van')
    expect(formatVehicleReg(null)).toBe('')
  })
})

describe('dropoffPrefill', () => {
  it('takes the most common collection vehicle, in any spelling', () => {
    expect(dropoffPrefill(['DL01LR4471', 'UP16CT2291', 'dl 1lr 4471'])).toBe('DL01LR4471')
  })
  it('breaks a tie by first seen and ignores pickups with none', () => {
    expect(dropoffPrefill([null, 'UP16CT2291', 'DL01LR4471'])).toBe('UP16CT2291')
    expect(dropoffPrefill([null, undefined])).toBeNull()
  })
})
