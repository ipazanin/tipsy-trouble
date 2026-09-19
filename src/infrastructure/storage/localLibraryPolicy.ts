import { builtInCards } from '@/features/cards/catalogue'
import { MAX_DECK_CARDS } from '@/features/cards/domain/cards'

export const MAX_SAVED_PLAYERS = 1000
export const MAX_CUSTOM_CARDS = MAX_DECK_CARDS - builtInCards.length

const builtInCardIds = new Set(builtInCards.map((card) => card.id))

export function validateSavedPlayerIds(playerIds: readonly string[]): void {
  if (new Set(playerIds).size > MAX_SAVED_PLAYERS) {
    throw new Error(`Save at most ${MAX_SAVED_PLAYERS} player profiles on this device.`)
  }
}

export function validateCustomCardIds(cardIds: readonly string[]): void {
  if (cardIds.some((id) => builtInCardIds.has(id))) {
    throw new Error('Custom cards cannot use identifiers reserved for built-in cards.')
  }
  if (new Set(cardIds).size > MAX_CUSTOM_CARDS) {
    throw new Error(`Save at most ${MAX_CUSTOM_CARDS} custom cards alongside the built-in deck.`)
  }
}
