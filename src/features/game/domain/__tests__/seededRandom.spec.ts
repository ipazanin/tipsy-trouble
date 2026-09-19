import { describe, expect, it } from 'vitest'
import { advanceSeedState, createSeedState } from '../seededRandom'

describe('seeded random sequence', () => {
  it('matches the xorshift32 reference sequence and stays within unsigned state bounds', () => {
    let state = 1
    const sequence = Array.from({ length: 5 }, () => (state = advanceSeedState(state)))
    expect(sequence).toEqual([270369, 67634689, 2647435461, 307599695, 2398689233])
  })

  it('maps matching text to matching nonzero state and distinguishes different host seeds', () => {
    expect(createSeedState('hello')).toBe(1335831724)
    expect(createSeedState('party')).toBe(createSeedState('party'))
    expect(createSeedState('party')).not.toBe(createSeedState('another party'))
    for (const seed of ['', '🍋 evening', 'a'.repeat(80)]) {
      const state = createSeedState(seed)
      expect(Number.isInteger(state)).toBe(true)
      expect(state).toBeGreaterThan(0)
      expect(state).toBeLessThanOrEqual(4294967295)
    }
  })
})
