import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb'
import { parseCardDefinition, type CardDefinition } from '@/features/cards/domain/cards'
import { parseGameSession, type GameSession } from '@/features/game/domain/game'
import type { PlayerProfile } from '@/features/players/domain/playerProfile'
import { parseBackup, serializeBackup, referencedImageIds } from './localBackup'
import type { CardImage } from '@/features/cards/domain/cardImage'
import { validateCardImageContents } from './cardImages'
import { validateCustomCardIds, validateSavedPlayerIds } from './localLibraryPolicy'
import {
  decodePlayerProfile,
  encodePlayerProfile,
  type StoredPlayerProfile,
} from './storedPlayerProfile'

interface LocalLibraryDatabase extends DBSchema {
  players: { key: string; value: StoredPlayerProfile }
  customCards: { key: string; value: CardDefinition }
  session: { key: 'current'; value: GameSession }
  cardImages: { key: string; value: CardImage }
}

export interface BackupSummary {
  players: number
  customCards: number
  hasSession: boolean
}

export interface ImportResult {
  players: number
  customCards: number
  sessionRestored: boolean
}

async function abortWrite(
  transaction: { abort(): void; readonly done: Promise<void> },
  error: unknown,
): Promise<never> {
  try {
    transaction.abort()
  } catch {
    // A failed IndexedDB request may already have aborted the transaction.
  }
  await transaction.done.catch(() => undefined)
  throw error
}

function sameImage(first: CardImage, second: CardImage): boolean {
  if (first.mimeType !== second.mimeType || first.bytes.byteLength !== second.bytes.byteLength)
    return false
  const secondBytes = new Uint8Array(second.bytes)
  return new Uint8Array(first.bytes).every((byte, index) => byte === secondBytes[index])
}

async function removeUnusedImages(
  transaction: IDBPTransaction<
    LocalLibraryDatabase,
    ('players' | 'customCards' | 'session' | 'cardImages')[],
    'readwrite'
  >,
): Promise<void> {
  const [cards, session, imageIds] = await Promise.all([
    transaction.objectStore('customCards').getAll(),
    transaction.objectStore('session').get('current'),
    transaction.objectStore('cardImages').getAllKeys(),
  ])
  const referenced = referencedImageIds(cards, session)
  await Promise.all(
    imageIds
      .filter((id) => !referenced.has(id))
      .map((id) => transaction.objectStore('cardImages').delete(id)),
  )
}

export function createLocalLibrary() {
  let openingDatabase: Promise<IDBPDatabase<LocalLibraryDatabase>> | undefined

  function database(): Promise<IDBPDatabase<LocalLibraryDatabase>> {
    if (!openingDatabase) {
      openingDatabase = openDB<LocalLibraryDatabase>('tipsy-trouble', 2, {
        upgrade(library, oldVersion) {
          if (oldVersion < 1) {
            library.createObjectStore('players', { keyPath: 'id' })
            library.createObjectStore('customCards', { keyPath: 'id' })
            library.createObjectStore('session')
          }
          library.createObjectStore('cardImages', { keyPath: 'id' })
        },
        blocking() {
          void openingDatabase?.then((library) => library.close())
          openingDatabase = undefined
        },
        terminated() {
          openingDatabase = undefined
        },
      }).catch((error: unknown) => {
        openingDatabase = undefined
        throw error
      })
    }
    return openingDatabase
  }

  return {
    async listPlayers(): Promise<PlayerProfile[]> {
      const library = await database()
      return (await library.getAll('players'))
        .map(decodePlayerProfile)
        .sort((first, second) => first.name.localeCompare(second.name))
    },

    async savePlayer(player: PlayerProfile): Promise<void> {
      const savedPlayer = await encodePlayerProfile(player)
      const library = await database()
      const write = library.transaction('players', 'readwrite')
      try {
        const playerIds = await write.store.getAllKeys()
        validateSavedPlayerIds([...playerIds, savedPlayer.id])
        await write.store.put(savedPlayer)
        await write.done
      } catch (error) {
        await abortWrite(write, error)
      }
    },

    async deletePlayer(playerId: string): Promise<void> {
      const library = await database()
      await library.delete('players', playerId)
    },

    async listCustomCards(): Promise<CardDefinition[]> {
      const library = await database()
      return (await library.getAll('customCards')).map(parseCardDefinition)
    },

    async loadCardImage(imageId: string): Promise<CardImage | undefined> {
      return (await database()).get('cardImages', imageId)
    },

    async saveCustomCard(card: CardDefinition, image?: CardImage): Promise<void> {
      const savedCard = parseCardDefinition(card)
      validateCustomCardIds([savedCard.id])
      if (image) {
        if (savedCard.imageId !== image.id)
          throw new Error('The card and image identifiers do not match.')
        await validateCardImageContents(image)
      }
      const library = await database()
      const write = library.transaction(['customCards', 'cardImages', 'session'], 'readwrite')
      try {
        const cardIds = await write.objectStore('customCards').getAllKeys()
        validateCustomCardIds([...cardIds, savedCard.id])
        if (image) {
          const existing = await write.objectStore('cardImages').get(image.id)
          if (existing && !sameImage(existing, image))
            throw new Error('A different image already uses this identifier.')
          await write
            .objectStore('cardImages')
            .put({ id: image.id, mimeType: image.mimeType, bytes: image.bytes })
        }
        if (savedCard.imageId && !(await write.objectStore('cardImages').getKey(savedCard.imageId)))
          throw new Error('The card image is missing. Choose the image again.')
        await write.objectStore('customCards').put(savedCard)
        await removeUnusedImages(write)
        await write.done
      } catch (error) {
        await abortWrite(write, error)
      }
    },

    async deleteCustomCard(cardId: string): Promise<void> {
      const library = await database()
      const write = library.transaction(['customCards', 'cardImages', 'session'], 'readwrite')
      try {
        await write.objectStore('customCards').delete(cardId)
        await removeUnusedImages(write)
        await write.done
      } catch (error) {
        await abortWrite(write, error)
      }
    },

    async loadGame(): Promise<GameSession | undefined> {
      const library = await database()
      const session = await library.get('session', 'current')
      return session === undefined ? undefined : parseGameSession(session)
    },

    async saveGame(session: GameSession): Promise<void> {
      const savedSession = parseGameSession(session)
      const library = await database()
      const write = library.transaction(['session', 'cardImages'], 'readwrite')
      try {
        for (const imageId of referencedImageIds([], savedSession)) {
          if (!(await write.objectStore('cardImages').getKey(imageId)))
            throw new Error('A saved game image is missing.')
        }
        await write.objectStore('session').put(savedSession, 'current')
        await write.done
      } catch (error) {
        await abortWrite(write, error)
      }
    },

    async clearGame(): Promise<void> {
      const library = await database()
      const write = library.transaction(['customCards', 'cardImages', 'session'], 'readwrite')
      try {
        await write.objectStore('session').delete('current')
        await removeUnusedImages(write)
        await write.done
      } catch (error) {
        await abortWrite(write, error)
      }
    },

    async exportBackup(): Promise<string> {
      const library = await database()
      const snapshot = library.transaction(
        ['players', 'customCards', 'session', 'cardImages'],
        'readonly',
      )
      const [players, customCards, session, cardImages] = await Promise.all([
        snapshot.objectStore('players').getAll(),
        snapshot.objectStore('customCards').getAll(),
        snapshot.objectStore('session').get('current'),
        snapshot.objectStore('cardImages').getAll(),
        snapshot.done,
      ])
      const referenced = referencedImageIds(customCards, session)
      return serializeBackup({
        players: players.map(decodePlayerProfile),
        customCards,
        session,
        cardImages: cardImages.filter((image) => referenced.has(image.id)),
      })
    },

    async inspectBackup(json: string): Promise<BackupSummary> {
      const backup = await parseBackup(json)
      return {
        players: backup.players.length,
        customCards: backup.customCards.length,
        hasSession: backup.session !== undefined,
      }
    },

    async importBackup(
      json: string,
      { restoreSession = false }: { restoreSession?: boolean } = {},
    ): Promise<ImportResult> {
      const backup = await parseBackup(json)
      const savedPlayers = await Promise.all(backup.players.map(encodePlayerProfile))
      const library = await database()
      const merge = library.transaction(
        ['players', 'customCards', 'session', 'cardImages'],
        'readwrite',
      )
      try {
        const [playerIds, cardIds] = await Promise.all([
          merge.objectStore('players').getAllKeys(),
          merge.objectStore('customCards').getAllKeys(),
        ])
        validateSavedPlayerIds([...playerIds, ...backup.players.map((player) => player.id)])
        validateCustomCardIds([...cardIds, ...backup.customCards.map((card) => card.id)])
        for (const image of backup.cardImages ?? []) {
          const existing = await merge.objectStore('cardImages').get(image.id)
          if (existing && !sameImage(existing, image))
            throw new Error(
              'A different saved image already uses an identifier from this backup. Nothing was imported.',
            )
        }
        const writes: Promise<unknown>[] = [
          ...(backup.cardImages ?? []).map((image) => merge.objectStore('cardImages').put(image)),
          ...savedPlayers.map((player) => merge.objectStore('players').put(player)),
          ...backup.customCards.map((card) => merge.objectStore('customCards').put(card)),
        ]
        if (restoreSession && backup.session) {
          writes.push(merge.objectStore('session').put(backup.session, 'current'))
        }
        await Promise.all(writes)
        await removeUnusedImages(merge)
        await merge.done
      } catch (error) {
        await abortWrite(merge, error)
      }
      return {
        players: backup.players.length,
        customCards: backup.customCards.length,
        sessionRestored: restoreSession && backup.session !== undefined,
      }
    },
  }
}
