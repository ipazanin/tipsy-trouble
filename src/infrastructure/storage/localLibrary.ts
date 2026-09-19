import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { parseCardDefinition, type CardDefinition } from '@/features/cards/domain/cards'
import { parseGameSession, type GameSession } from '@/features/game/domain/game'
import type { PlayerProfile } from '@/features/players/domain/playerProfile'
import { parseBackup, serializeBackup } from './localBackup'
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

export function createLocalLibrary() {
  let openingDatabase: Promise<IDBPDatabase<LocalLibraryDatabase>> | undefined

  function database(): Promise<IDBPDatabase<LocalLibraryDatabase>> {
    if (!openingDatabase) {
      openingDatabase = openDB<LocalLibraryDatabase>('tipsy-trouble', 1, {
        upgrade(library) {
          library.createObjectStore('players', { keyPath: 'id' })
          library.createObjectStore('customCards', { keyPath: 'id' })
          library.createObjectStore('session')
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

    async saveCustomCard(card: CardDefinition): Promise<void> {
      const savedCard = parseCardDefinition(card)
      validateCustomCardIds([savedCard.id])
      const library = await database()
      const write = library.transaction('customCards', 'readwrite')
      try {
        const cardIds = await write.store.getAllKeys()
        validateCustomCardIds([...cardIds, savedCard.id])
        await write.store.put(savedCard)
        await write.done
      } catch (error) {
        await abortWrite(write, error)
      }
    },

    async deleteCustomCard(cardId: string): Promise<void> {
      const library = await database()
      await library.delete('customCards', cardId)
    },

    async loadGame(): Promise<GameSession | undefined> {
      const library = await database()
      const session = await library.get('session', 'current')
      return session === undefined ? undefined : parseGameSession(session)
    },

    async saveGame(session: GameSession): Promise<void> {
      const savedSession = parseGameSession(session)
      const library = await database()
      await library.put('session', savedSession, 'current')
    },

    async clearGame(): Promise<void> {
      const library = await database()
      await library.delete('session', 'current')
    },

    async exportBackup(): Promise<string> {
      const library = await database()
      const snapshot = library.transaction(['players', 'customCards', 'session'], 'readonly')
      const [players, customCards, session] = await Promise.all([
        snapshot.objectStore('players').getAll(),
        snapshot.objectStore('customCards').getAll(),
        snapshot.objectStore('session').get('current'),
        snapshot.done,
      ])
      return serializeBackup({ players: players.map(decodePlayerProfile), customCards, session })
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
      const merge = library.transaction(['players', 'customCards', 'session'], 'readwrite')
      try {
        const [playerIds, cardIds] = await Promise.all([
          merge.objectStore('players').getAllKeys(),
          merge.objectStore('customCards').getAllKeys(),
        ])
        validateSavedPlayerIds([...playerIds, ...backup.players.map((player) => player.id)])
        validateCustomCardIds([...cardIds, ...backup.customCards.map((card) => card.id)])
        const writes: Promise<unknown>[] = [
          ...savedPlayers.map((player) => merge.objectStore('players').put(player)),
          ...backup.customCards.map((card) => merge.objectStore('customCards').put(card)),
        ]
        if (restoreSession && backup.session) {
          writes.push(merge.objectStore('session').put(backup.session, 'current'))
        }
        await Promise.all([...writes, merge.done])
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
