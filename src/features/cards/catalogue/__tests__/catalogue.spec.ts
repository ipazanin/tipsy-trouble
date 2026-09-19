import { describe, expect, it } from 'vitest'
import { builtInCards } from '..'
import { cardMechanics } from '../definitions'
import englishCards from '../en.json'

describe('built-in catalogue', () => {
  it('keeps mechanics and English card content in sync', () => {
    expect(Object.keys(englishCards).sort()).toEqual(cardMechanics.map((card) => card.id).sort())
    expect(builtInCards.every((card) => card.contentLocale === 'en')).toBe(true)
  })

  it('provides 200 distinct cards with a complete ordinary deck and bounded rare specials', () => {
    expect(builtInCards).toHaveLength(200)
    expect(builtInCards.filter((card) => card.kind === 'prompt')).toHaveLength(160)
    expect(builtInCards.filter((card) => card.kind === 'temporary-rule')).toHaveLength(38)
    expect(new Set(builtInCards.map((card) => card.title)).size).toBe(200)
    expect(new Set(builtInCards.map((card) => card.text)).size).toBe(200)
    expect(builtInCards.find((card) => card.id === 'last-call')?.text).toBe(
      'Raise a toast to the table, then take three sips at your own pace.',
    )
    expect(builtInCards.find((card) => card.id === 'captains-choice')?.text).toBe(
      'Give a victory speech worthy of a captain, then take five sips at your own pace.',
    )
  })

  it('keeps the two optional specials outside the ordinary deck', () => {
    expect(builtInCards.filter((card) => card.kind === 'special')).toHaveLength(2)
    expect(builtInCards.some((card) => card.kind === 'temporary-rule')).toBe(true)
    expect(builtInCards.some((card) => card.kind === 'prompt')).toBe(true)
  })
})
