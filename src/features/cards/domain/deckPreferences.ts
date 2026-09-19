import { MAX_DECK_CARDS } from './cards'

export interface DeckPreferences {
  readonly disabledCardIds: readonly string[]
}

export function parseDeckPreferences(
  candidate: unknown,
  availableCardIds: readonly string[],
): DeckPreferences {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    throw new Error('Deck preferences must be an object.')
  }
  const disabledCardIds = (candidate as Record<string, unknown>).disabledCardIds
  if (!Array.isArray(disabledCardIds) || disabledCardIds.length > MAX_DECK_CARDS) {
    throw new Error(`Deck preferences need a list of at most ${MAX_DECK_CARDS} disabled cards.`)
  }
  const available = new Set(availableCardIds)
  if (disabledCardIds.some((cardId) => typeof cardId !== 'string' || !available.has(cardId))) {
    throw new Error('Deck preferences refer to an unknown card.')
  }
  if (new Set(disabledCardIds).size !== disabledCardIds.length) {
    throw new Error('Deck preferences contain duplicate card identifiers.')
  }
  return { disabledCardIds: [...disabledCardIds] }
}

export function mergeDeckPreferences(
  current: DeckPreferences,
  imported: DeckPreferences,
  replacedCardIds: readonly string[],
): DeckPreferences {
  const replaced = new Set(replacedCardIds)
  return {
    disabledCardIds: [
      ...current.disabledCardIds.filter((cardId) => !replaced.has(cardId)),
      ...imported.disabledCardIds,
    ],
  }
}
