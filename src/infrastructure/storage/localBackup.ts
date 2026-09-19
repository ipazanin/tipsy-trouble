import { parseCardDefinition, type CardDefinition } from '@/features/cards/domain/cards'
import { parseGameSession, type GameSession } from '@/features/game/domain/game'
import { validatePlayerProfile, type PlayerProfile } from '@/features/players/domain/playerProfile'
import { createPlayerPhoto } from './playerPhotos'
import {
  MAX_CUSTOM_CARDS,
  MAX_SAVED_PLAYERS,
  validateCustomCardIds,
  validateSavedPlayerIds,
} from './localLibraryPolicy'

const maximumBackupLength = 25 * 1024 * 1024

export interface LibraryContents {
  players: PlayerProfile[]
  customCards: CardDefinition[]
  session?: GameSession
}

function backupRecord(candidate: unknown): Record<string, unknown> {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    throw new Error('The backup must contain valid objects.')
  }
  return candidate as Record<string, unknown>
}

function uniqueIdentifiers(records: readonly { id: string }[], label: string): void {
  if (new Set(records.map((record) => record.id)).size !== records.length) {
    throw new Error(`The backup contains duplicate ${label} identifiers.`)
  }
}

async function parsePhoto(photoDataUrl: unknown): Promise<Blob> {
  if (typeof photoDataUrl !== 'string') {
    throw new Error('A saved photo must be an image data URL.')
  }
  const encodedPhoto = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    photoDataUrl,
  )
  if (!encodedPhoto || photoDataUrl.length > 1_400_000) {
    throw new Error('The backup contains an invalid or oversized photo.')
  }
  let photoBytes: Uint8Array<ArrayBuffer>
  try {
    const decodedPhoto = atob(encodedPhoto[2]!)
    photoBytes = Uint8Array.from(decodedPhoto, (character) => character.charCodeAt(0))
  } catch {
    throw new Error('The backup contains an unreadable photo.')
  }
  if (photoBytes.length > 1024 * 1024) {
    throw new Error('A saved photo must be smaller than 1 MB.')
  }
  return createPlayerPhoto(new File([photoBytes], 'player-photo', { type: encodedPhoto[1] }))
}

export async function parseBackup(json: string): Promise<LibraryContents> {
  if (json.length > maximumBackupLength) {
    throw new Error('Choose a backup smaller than 25 MB.')
  }
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(json)
  } catch {
    throw new Error('This file is not a valid JSON backup.')
  }
  const backup = backupRecord(parsedJson)
  if (backup.format !== 'tipsy-trouble' || backup.version !== 1) {
    throw new Error('Choose a Tipsy Trouble version 1 backup.')
  }
  if (!Array.isArray(backup.players) || backup.players.length > MAX_SAVED_PLAYERS) {
    throw new Error(
      `The backup must contain a player list with at most ${MAX_SAVED_PLAYERS} players.`,
    )
  }
  if (!Array.isArray(backup.customCards) || backup.customCards.length > MAX_CUSTOM_CARDS) {
    throw new Error(
      `The backup must contain a card list with at most ${MAX_CUSTOM_CARDS} custom cards.`,
    )
  }

  const customCards = backup.customCards.map(parseCardDefinition)
  uniqueIdentifiers(customCards, 'card')
  validateCustomCardIds(customCards.map((card) => card.id))
  const session = backup.session === undefined ? undefined : parseGameSession(backup.session)
  const players: PlayerProfile[] = []
  for (const candidate of backup.players) {
    const savedPlayer = backupRecord(candidate)
    if (typeof savedPlayer.id !== 'string' || typeof savedPlayer.name !== 'string') {
      throw new Error('Each saved player needs an identifier and a name.')
    }
    const player: PlayerProfile = { id: savedPlayer.id, name: savedPlayer.name.trim() }
    validatePlayerProfile(player)
    if (savedPlayer.photoDataUrl !== undefined) {
      player.photo = await parsePhoto(savedPlayer.photoDataUrl)
    }
    players.push(player)
  }
  uniqueIdentifiers(players, 'player')
  return { players, customCards, session }
}

function photoDataUrl(photo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('A saved photo could not be exported.'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('A saved photo could not be read.'))
    reader.onabort = () => reject(new Error('Photo export was interrupted.'))
    reader.readAsDataURL(photo)
  })
}

export async function serializeBackup(contents: LibraryContents): Promise<string> {
  uniqueIdentifiers(contents.players, 'player')
  uniqueIdentifiers(contents.customCards, 'card')
  validateSavedPlayerIds(contents.players.map((player) => player.id))
  validateCustomCardIds(contents.customCards.map((card) => card.id))
  const players = await Promise.all(
    contents.players.map(async (player) => ({
      id: player.id,
      name: player.name,
      ...(player.photo ? { photoDataUrl: await photoDataUrl(player.photo) } : {}),
    })),
  )
  const json = JSON.stringify(
    {
      format: 'tipsy-trouble',
      version: 1,
      exportedAt: new Date().toISOString(),
      players,
      customCards: contents.customCards,
      session: contents.session,
    },
    null,
    2,
  )
  if (json.length > maximumBackupLength) {
    throw new Error('This library is too large for a 25 MB backup. Remove unused photos first.')
  }
  return json
}
