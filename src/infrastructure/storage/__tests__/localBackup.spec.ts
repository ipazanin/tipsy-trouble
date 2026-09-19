import { describe, expect, it } from 'vitest'
import { createGame } from '@/features/game/domain/game'
import type { CardDefinition } from '@/features/cards/domain/cards'
import { parseBackup, serializeBackup } from '../localBackup'
import { builtInCards } from '@/features/cards/catalogue'
import { MAX_CUSTOM_CARDS, MAX_SAVED_PLAYERS } from '../localLibraryPolicy'

const customCard: CardDefinition = {
  id: 'custom-story',
  title: 'Tell a story',
  text: 'Tell everyone about your favourite holiday.',
  contentLocale: 'en',
  kind: 'prompt',
}

function backup(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: 'tipsy-trouble',
    version: 1,
    players: [{ id: 'player-ana', name: 'Ana' }],
    customCards: [customCard],
    ...overrides,
  })
}

describe('local backup validation', () => {
  it('round-trips a library and the exact saved game without drawing another card', async () => {
    const players = [
      { id: 'player-ana', name: 'Ana' },
      { id: 'player-luka', name: 'Luka' },
    ]
    const session = createGame(players, [customCard], undefined, () => 0)
    const contents = { players, customCards: [customCard], session }

    const exported = await serializeBackup(contents)

    expect(await parseBackup(exported)).toEqual(contents)
  })

  it('accepts an empty library without a saved game', async () => {
    expect(await parseBackup(backup({ players: [], customCards: [] }))).toEqual({
      players: [],
      customCards: [],
      session: undefined,
    })
  })

  it('rejects imported and exported custom cards that collide with the built-in deck', async () => {
    const collision = { ...customCard, id: builtInCards[0]!.id }

    await expect(parseBackup(backup({ customCards: [collision] }))).rejects.toThrow(
      'reserved for built-in cards',
    )
    await expect(serializeBackup({ players: [], customCards: [collision] })).rejects.toThrow(
      'reserved for built-in cards',
    )
  })

  it('round-trips a library at both collection limits', async () => {
    const contents = {
      players: Array.from({ length: MAX_SAVED_PLAYERS }, (_, index) => ({
        id: `player-${index}`,
        name: `Player ${index}`,
      })),
      customCards: Array.from({ length: MAX_CUSTOM_CARDS }, (_, index) => ({
        ...customCard,
        id: `custom-${index}`,
      })),
    }

    expect(await parseBackup(await serializeBackup(contents))).toEqual(contents)
  })

  it('rejects oversized collections on both import and export', async () => {
    const oversizedPlayers = {
      players: Array.from({ length: MAX_SAVED_PLAYERS + 1 }, (_, index) => ({
        id: `player-${index}`,
        name: `Player ${index}`,
      })),
      customCards: [],
    }
    const oversizedCards = {
      players: [],
      customCards: Array.from({ length: MAX_CUSTOM_CARDS + 1 }, (_, index) => ({
        ...customCard,
        id: `custom-${index}`,
      })),
    }

    for (const contents of [oversizedPlayers, oversizedCards]) {
      await expect(parseBackup(backup(contents))).rejects.toThrow('at most')
      await expect(serializeBackup(contents)).rejects.toThrow('at most')
    }
  })

  it.each([
    ['invalid JSON', '{', 'not a valid JSON backup'],
    ['another application', backup({ format: 'another-app' }), 'version 1 backup'],
    ['a future version', backup({ version: 2 }), 'version 1 backup'],
    [
      'duplicate cards',
      backup({ customCards: [customCard, customCard] }),
      'duplicate card identifiers',
    ],
    ['invalid cards', backup({ customCards: [{ ...customCard, text: '' }] }), 'Card text'],
    ['a malformed saved game', backup({ session: { players: [] } }), 'A deck must contain'],
    [
      'duplicate player identifiers',
      backup({
        players: [
          { id: 'ana', name: 'Ana' },
          { id: 'ana', name: 'Another Ana' },
        ],
      }),
      'duplicate player identifiers',
    ],
    [
      'an external photo URL',
      backup({
        players: [{ id: 'ana', name: 'Ana', photoDataUrl: 'https://example.com/photo.jpg' }],
      }),
      'invalid or oversized photo',
    ],
  ])('rejects %s before any import can write to storage', async (_description, json, message) => {
    await expect(parseBackup(json)).rejects.toThrow(message)
  })
})
