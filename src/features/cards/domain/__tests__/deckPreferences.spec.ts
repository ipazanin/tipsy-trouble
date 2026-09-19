import { describe, expect, it } from 'vitest'
import { MAX_DECK_CARDS } from '../cards'
import { mergeDeckPreferences, parseDeckPreferences } from '../deckPreferences'

describe('deck preferences', () => {
  it('accepts an empty selection and preserves disabled built-in and custom IDs', () => {
    expect(parseDeckPreferences({ disabledCardIds: [] }, ['built-in'])).toEqual({
      disabledCardIds: [],
    })
    const choices = { disabledCardIds: ['built-in', 'custom-one'] }
    const parsed = parseDeckPreferences(choices, ['built-in', 'custom-one'])
    expect(parsed).toEqual(choices)
    expect(parsed.disabledCardIds).not.toBe(choices.disabledCardIds)
  })

  it.each([null, [], 'deck', 12])('rejects a non-object preference record %s', (candidate) => {
    expect(() => parseDeckPreferences(candidate, [])).toThrow('must be an object')
  })

  it.each([
    {},
    { disabledCardIds: null },
    { disabledCardIds: 'card' },
    { disabledCardIds: Array.from({ length: MAX_DECK_CARDS + 1 }, (_, index) => `card-${index}`) },
  ])('rejects missing or oversized disabled lists', (candidate) => {
    expect(() => parseDeckPreferences(candidate, [])).toThrow('at most')
  })

  it.each(['missing', 1, null])(
    'rejects unknown or invalid card identifiers',
    (disabledCardIds) => {
      expect(() => parseDeckPreferences({ disabledCardIds: [disabledCardIds] }, ['known'])).toThrow(
        'unknown card',
      )
    },
  )

  it('rejects duplicate identifiers and accepts the maximum valid list', () => {
    expect(() => parseDeckPreferences({ disabledCardIds: ['known', 'known'] }, ['known'])).toThrow(
      'duplicate',
    )
    const ids = Array.from({ length: MAX_DECK_CARDS }, (_, index) => `card-${index}`)
    expect(parseDeckPreferences({ disabledCardIds: ids }, ids).disabledCardIds).toEqual(ids)
  })

  it('restores imported choices while retaining choices for local-only cards', () => {
    expect(
      mergeDeckPreferences(
        { disabledCardIds: ['built-in', 'local-only', 'imported'] },
        { disabledCardIds: ['another-built-in'] },
        ['built-in', 'another-built-in', 'imported'],
      ),
    ).toEqual({ disabledCardIds: ['local-only', 'another-built-in'] })
  })
})
