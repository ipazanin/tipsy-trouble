import type { CardDefinition } from '../domain/cards'
import photos from './photos.json'
import pairings from './pairings.json'

type PhotoTheme = keyof typeof photos

export interface CardArtwork {
  readonly src: string
  readonly alt: string
  readonly credit: string
  readonly sourceUrl: string
}

const builtInPairings: Readonly<Record<string, PhotoTheme>> = pairings as Record<string, PhotoTheme>

export const customArtworkThemes: readonly PhotoTheme[] = [
  'snacks',
  'music',
  'island',
  'stars',
  'books',
  'microphone',
  'rain',
  'hat',
  'penguin',
  'celebration',
]

function customTheme(cardId: string): PhotoTheme {
  let hash = 0
  for (const character of cardId) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0
  }
  return customArtworkThemes[hash % customArtworkThemes.length]!
}

export function getCardArtwork(card: CardDefinition): CardArtwork {
  const theme = Object.prototype.hasOwnProperty.call(builtInPairings, card.id)
    ? builtInPairings[card.id]!
    : customTheme(card.id)
  const photo = photos[theme]
  return {
    src: `${import.meta.env.BASE_URL}artwork/${theme}.webp`,
    alt: '',
    credit: `${photo.author} / Unsplash`,
    sourceUrl: photo.sourceUrl,
  }
}
