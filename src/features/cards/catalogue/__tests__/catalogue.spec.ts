import { describe, expect, it } from 'vitest'
import { builtInCards } from '..'
import { cardMechanics } from '../definitions'
import englishCards from '../en.json'

describe('built-in catalogue', () => {
  it('keeps mechanics and English card content in sync', () => {
    expect(Object.keys(englishCards).sort()).toEqual(cardMechanics.map((card) => card.id).sort())
    expect(builtInCards.every((card) => card.contentLocale === 'en')).toBe(true)
  })

  it('keeps the two optional specials outside the ordinary deck', () => {
    expect(builtInCards.filter((card) => card.kind === 'special')).toHaveLength(2)
    expect(builtInCards.some((card) => card.kind === 'temporary-rule')).toBe(true)
    expect(builtInCards.some((card) => card.kind === 'prompt')).toBe(true)
  })
})
