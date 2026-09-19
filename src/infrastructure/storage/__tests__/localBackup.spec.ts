import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateCardImage, type CardImage } from '@/features/cards/domain/cardImage'
import { createGame } from '@/features/game/domain/game'
import type { CardDefinition } from '@/features/cards/domain/cards'
import { parseBackup, serializeBackup } from '../localBackup'
import { builtInCards } from '@/features/cards/catalogue'
import { MAX_CUSTOM_CARDS, MAX_SAVED_PLAYERS } from '../localLibraryPolicy'

vi.mock('../playerPhotos', () => ({
  createPlayerPhoto: vi.fn<(file: File) => Promise<Blob>>(async (file) => file),
}))
vi.mock('../cardImages', () => ({
  validateCardImageContents: vi.fn<(image: CardImage) => Promise<void>>(async (image) =>
    validateCardImage(image),
  ),
}))
afterEach(() => vi.unstubAllGlobals())

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

  it('rejects missing image assets in both custom cards and game snapshots', async () => {
    const illustrated = { ...customCard, imageId: 'missing-image' }
    await expect(parseBackup(backup({ customCards: [illustrated] }))).rejects.toThrow(
      'missing a referenced card image',
    )
    const players = [
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Bob' },
    ]
    const session = createGame(players, [illustrated], undefined, () => 0)
    await expect(parseBackup(backup({ session }))).rejects.toThrow(
      'missing a referenced card image',
    )
    await expect(serializeBackup({ players, customCards: [], session })).rejects.toThrow(
      'missing a referenced card image',
    )
  })

  it('rejects external and SVG card image payloads', async () => {
    for (const dataUrl of ['https://example.com/photo.jpg', 'data:image/svg+xml;base64,PHN2Zy8+']) {
      await expect(
        parseBackup(backup({ cardImages: [{ id: 'image-1', dataUrl }] })),
      ).rejects.toThrow('invalid or oversized card image')
    }
  })

  it('round-trips deck choices and leaves legacy backups without choices unspecified', async () => {
    const deckPreferences = { disabledCardIds: [builtInCards[0]!.id, customCard.id] }
    const contents = { players: [], customCards: [customCard], deckPreferences }
    expect(await parseBackup(await serializeBackup(contents))).toEqual({
      ...contents,
      session: undefined,
    })
    expect(await parseBackup(backup())).not.toHaveProperty('deckPreferences')
    for (const invalid of [
      null,
      { disabledCardIds: ['missing'] },
      { disabledCardIds: [customCard.id, customCard.id] },
    ]) {
      await expect(parseBackup(backup({ deckPreferences: invalid }))).rejects.toThrow(
        'Deck preferences',
      )
    }
  })

  it('round-trips card image bytes and player photos without changing their IDs', async () => {
    const image = {
      id: 'image-1',
      mimeType: 'image/jpeg' as const,
      bytes: new Uint8Array([255, 216, 255, 217]).buffer,
    }
    const photo = new Blob([new Uint8Array([255, 216, 255, 217])], { type: 'image/jpeg' })
    const contents = {
      players: [{ id: 'ana', name: 'Ana', photo }],
      customCards: [{ ...customCard, imageId: image.id }],
      cardImages: [image],
    }
    const restored = await parseBackup(await serializeBackup(contents))
    expect(restored.cardImages).toEqual(contents.cardImages)
    expect(restored.customCards).toEqual(contents.customCards)
    expect(restored.players[0]!.photo?.size).toBe(photo.size)
    expect(restored.players[0]!.photo?.type).toBe(photo.type)
  })

  it.each([null, [], 12])('rejects malformed top-level records', async (candidate) => {
    await expect(parseBackup(JSON.stringify(candidate))).rejects.toThrow('valid objects')
  })

  it.each([
    [{ players: null }, 'player list'],
    [{ customCards: null }, 'card list'],
    [{ cardImages: {} }, 'invalid card image list'],
    [{ cardImages: Array(MAX_CUSTOM_CARDS * 2 + 1).fill(null) }, 'invalid card image list'],
    [{ cardImages: [{ id: 'image-1', dataUrl: 12 }] }, 'invalid or oversized card image'],
    [
      { cardImages: [{ id: 'image-1', dataUrl: 'x'.repeat(700_001) }] },
      'invalid or oversized card image',
    ],
    [{ players: [{ id: 12, name: 'Ana' }] }, 'identifier and a name'],
    [{ players: [{ id: 'ana', name: 12 }] }, 'identifier and a name'],
    [{ players: [{ id: 'ana', name: 'Ana', photoDataUrl: 12 }] }, 'image data URL'],
    [
      { players: [{ id: 'ana', name: 'Ana', photoDataUrl: 'data:image/jpeg;base64,A' }] },
      'unreadable photo',
    ],
    [
      {
        players: [
          {
            id: 'ana',
            name: 'Ana',
            photoDataUrl: `data:image/jpeg;base64,${'A'.repeat(1_400_000)}`,
          },
        ],
      },
      'invalid or oversized photo',
    ],
    [
      {
        players: [
          {
            id: 'ana',
            name: 'Ana',
            photoDataUrl: `data:image/jpeg;base64,${btoa('x'.repeat(1024 * 1024 + 1))}`,
          },
        ],
      },
      'smaller than 1 MB',
    ],
  ])('rejects malformed media and lists before import', async (contents, message) => {
    await expect(parseBackup(backup(contents))).rejects.toThrow(message)
  })

  it('rejects backups larger than the file limit on import and export', async () => {
    await expect(parseBackup('x'.repeat(25 * 1024 * 1024 + 1))).rejects.toThrow(
      'smaller than 25 MB',
    )
    vi.stubGlobal(
      'FileReader',
      class {
        result = 'x'.repeat(25 * 1024 * 1024)
        onload?: () => void
        readAsDataURL() {
          this.onload?.()
        }
      },
    )
    await expect(
      serializeBackup({
        players: [{ id: 'ana', name: 'Ana', photo: new Blob(['photo']) }],
        customCards: [],
      }),
    ).rejects.toThrow('too large')
  })

  it.each([
    ['load', undefined, undefined, 'could not be exported'],
    ['error', undefined, new Error('Read failed'), 'Read failed'],
    ['error', undefined, null, 'could not be read'],
    ['abort', undefined, undefined, 'interrupted'],
  ])('reports photo reader %s failures', async (event, result, error, message) => {
    vi.stubGlobal(
      'FileReader',
      class {
        result = result
        error = error
        onload?: () => void
        onerror?: () => void
        onabort?: () => void
        readAsDataURL() {
          if (event === 'load') this.onload?.()
          else if (event === 'error') this.onerror?.()
          else this.onabort?.()
        }
      },
    )
    await expect(
      serializeBackup({
        players: [{ id: 'ana', name: 'Ana', photo: new Blob(['photo']) }],
        customCards: [],
      }),
    ).rejects.toThrow(message)
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
