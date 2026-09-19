export const MAX_CARD_IMAGE_BYTES = 512 * 1024

export interface CardImage {
  readonly id: string
  readonly mimeType: 'image/jpeg'
  readonly bytes: ArrayBuffer
}

export function validateCardImageId(candidate: unknown): string {
  if (typeof candidate !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(candidate)) {
    throw new Error('Card image identifiers must contain 1 to 100 safe characters.')
  }
  return candidate
}

export function validateCardImage(image: CardImage): void {
  validateCardImageId(image.id)
  const bytes = new Uint8Array(image.bytes)
  if (
    image.mimeType !== 'image/jpeg' ||
    bytes.length < 4 ||
    bytes.length > MAX_CARD_IMAGE_BYTES ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[bytes.length - 2] !== 0xff ||
    bytes[bytes.length - 1] !== 0xd9
  ) {
    throw new Error('Card images must be valid JPEG images no larger than 512 KB.')
  }
}
