import { parseCardDefinition, type CardDefinition } from '@/features/cards/domain/cards'
import { parseGameSession, type GameSession } from '@/features/game/domain/game'
import { validatePlayerProfile, type PlayerProfile } from '@/features/players/domain/playerProfile'
import { createPlayerPhoto } from './playerPhotos'
import { validateCardImageId, type CardImage } from '@/features/cards/domain/cardImage'
import { validateCardImageContents } from './cardImages'
import { builtInCards } from '@/features/cards/catalogue'
import { parseDeckPreferences, type DeckPreferences } from '@/features/cards/domain/deckPreferences'
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
  cardImages?: CardImage[]
  deckPreferences?: DeckPreferences
}

export function referencedImageIds(
  cards: readonly CardDefinition[],
  session?: GameSession,
): Set<string> {
  return new Set(
    [
      ...cards,
      ...(session?.deck ?? []),
      ...(session?.remainingCards ?? []),
      ...(session?.currentCard ? [session.currentCard] : []),
    ].flatMap((card) => (card.imageId ? [card.imageId] : [])),
  )
}

async function parseCardImage(candidate: unknown): Promise<CardImage> {
  const image = backupRecord(candidate)
  const id = validateCardImageId(image.id)
  if (
    typeof image.dataUrl !== 'string' ||
    image.dataUrl.length > 700_000 ||
    !/^data:image\/jpeg;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      image.dataUrl,
    )
  )
    throw new Error('The backup contains an invalid or oversized card image.')
  const bytes = Uint8Array.from(
    atob(image.dataUrl.slice('data:image/jpeg;base64,'.length)),
    (character) => character.charCodeAt(0),
  ).buffer
  const savedImage: CardImage = { id, mimeType: 'image/jpeg', bytes }
  await validateCardImageContents(savedImage)
  return savedImage
}

function validateImageReferences(
  cards: readonly CardDefinition[],
  session: GameSession | undefined,
  images: readonly CardImage[],
): void {
  const available = new Set(images.map((image) => image.id))
  for (const imageId of referencedImageIds(cards, session)) {
    if (!available.has(imageId)) throw new Error('The backup is missing a referenced card image.')
  }
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
  const deckPreferences =
    backup.deckPreferences === undefined
      ? undefined
      : parseDeckPreferences(
          backup.deckPreferences,
          [...builtInCards, ...customCards].map((card) => card.id),
        )
  const session = backup.session === undefined ? undefined : parseGameSession(backup.session)
  if (
    backup.cardImages !== undefined &&
    (!Array.isArray(backup.cardImages) || backup.cardImages.length > MAX_CUSTOM_CARDS * 2)
  )
    throw new Error('The backup contains an invalid card image list.')
  const cardImages: CardImage[] = []
  for (const image of (backup.cardImages ?? []) as unknown[])
    cardImages.push(await parseCardImage(image))
  uniqueIdentifiers(cardImages, 'image')
  validateImageReferences(customCards, session, cardImages)
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
  return {
    players,
    customCards,
    session,
    ...(cardImages.length ? { cardImages } : {}),
    ...(deckPreferences ? { deckPreferences } : {}),
  }
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
  const cards = contents.customCards.map(parseCardDefinition)
  const session = contents.session === undefined ? undefined : parseGameSession(contents.session)
  const deckPreferences =
    contents.deckPreferences === undefined
      ? undefined
      : parseDeckPreferences(
          contents.deckPreferences,
          [...builtInCards, ...cards].map((card) => card.id),
        )
  const images = contents.cardImages ?? []
  uniqueIdentifiers(images, 'image')
  validateImageReferences(cards, session, images)
  for (const image of images) await validateCardImageContents(image)
  const cardImages = await Promise.all(
    images.map(async (image) => ({
      id: image.id,
      dataUrl: await photoDataUrl(new Blob([image.bytes], { type: image.mimeType })),
    })),
  )
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
      customCards: cards,
      session,
      ...(cardImages.length ? { cardImages } : {}),
      ...(deckPreferences ? { deckPreferences } : {}),
    },
    null,
    2,
  )
  if (json.length > maximumBackupLength) {
    throw new Error('This library is too large for a 25 MB backup. Remove unused photos first.')
  }
  return json
}
