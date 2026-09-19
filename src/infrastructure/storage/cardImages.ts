import {
  MAX_CARD_IMAGE_BYTES,
  validateCardImage,
  type CardImage,
} from '@/features/cards/domain/cardImage'
import { decodeImage, resizeImage } from './imageProcessing'

export async function createCardImage(file: File): Promise<CardImage> {
  const photo = await resizeImage(file, 1200, 800, MAX_CARD_IMAGE_BYTES)
  return { id: crypto.randomUUID(), mimeType: 'image/jpeg', bytes: await photo.arrayBuffer() }
}

export async function validateCardImageContents(image: CardImage): Promise<void> {
  validateCardImage(image)
  const { image: decoded, release } = await decodeImage(
    new Blob([image.bytes], { type: image.mimeType }),
  )
  try {
    if (decoded.naturalWidth > 1200 || decoded.naturalHeight > 800)
      throw new Error('Saved card images must fit within 1200 × 800 pixels.')
  } finally {
    release()
  }
}
