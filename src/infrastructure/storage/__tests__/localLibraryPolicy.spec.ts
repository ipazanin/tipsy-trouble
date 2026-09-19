import { describe, expect, it } from 'vitest'
import { builtInCards } from '@/features/cards/catalogue'
import { MAX_DECK_CARDS, parseCardDefinitions } from '@/features/cards/domain/cards'
import {
  MAX_CUSTOM_CARDS,
  MAX_SAVED_PLAYERS,
  validateCustomCardIds,
  validateSavedPlayerIds,
} from '../localLibraryPolicy'

describe('local library capacity', () => {
  it('leaves room for every built-in card when the custom library is full', () => {
    const customCards = Array.from({ length: MAX_CUSTOM_CARDS }, (_, index) => ({
      id: `custom-${index}`,
      title: 'Custom prompt',
      text: 'Tell a story.',
      contentLocale: 'en',
      kind: 'prompt' as const,
    }))

    expect(() => validateCustomCardIds(customCards.map((card) => card.id))).not.toThrow()
    expect(parseCardDefinitions([...builtInCards, ...customCards])).toHaveLength(MAX_DECK_CARDS)
    expect(() =>
      validateCustomCardIds([...customCards.map((card) => card.id), 'one-too-many']),
    ).toThrow(`at most ${MAX_CUSTOM_CARDS}`)
  })

  it('allows replacing cards at capacity but rejects adding to a full merged library', () => {
    const existing = Array.from({ length: MAX_CUSTOM_CARDS }, (_, index) => `custom-${index}`)

    expect(() => validateCustomCardIds([...existing, existing[0]!])).not.toThrow()
    expect(() => validateCustomCardIds([...existing, 'additional-card'])).toThrow(
      `at most ${MAX_CUSTOM_CARDS}`,
    )
  })

  it('allows replacing profiles at capacity but rejects an additional saved player', () => {
    const existing = Array.from({ length: MAX_SAVED_PLAYERS }, (_, index) => `player-${index}`)

    expect(() => validateSavedPlayerIds([...existing, existing[0]!])).not.toThrow()
    expect(() => validateSavedPlayerIds([...existing, 'additional-player'])).toThrow(
      `at most ${MAX_SAVED_PLAYERS}`,
    )
  })

  it.each(builtInCards.map((card) => card.id))('reserves built-in identifier %s', (id) => {
    expect(() => validateCustomCardIds([id])).toThrow('reserved for built-in cards')
  })
})
