import { describe, expect, it } from 'vitest'
import { MAX_CARD_IMAGE_BYTES, validateCardImage, validateCardImageId } from '../cardImage'
import { parseCardDefinition } from '../cards'

describe('card image contracts', () => {
  it('preserves optional image references and accepts legacy cards without images', () => {
    const card = { id: 'custom-story', title: 'Story', text: 'Tell a story.', kind: 'prompt' }
    expect(parseCardDefinition(card)).not.toHaveProperty('imageId')
    expect(parseCardDefinition({ ...card, imageId: 'image-123' }).imageId).toBe('image-123')
  })

  it.each([
    '',
    'https://example.com/a.jpg',
    'data:image/jpeg;base64,abcd',
    '../image',
    'x'.repeat(101),
  ])('rejects an unsafe image reference %s', (reference) => {
    expect(() => validateCardImageId(reference)).toThrow('identifiers')
  })

  it('rejects oversized images and non-JPEG bytes before persistence', () => {
    const oversized = new Uint8Array(MAX_CARD_IMAGE_BYTES + 1)
    oversized.set([0xff, 0xd8])
    oversized.set([0xff, 0xd9], oversized.length - 2)
    for (const bytes of [oversized.buffer, new Uint8Array([1, 2, 3, 4]).buffer]) {
      expect(() => validateCardImage({ id: 'image-123', mimeType: 'image/jpeg', bytes })).toThrow(
        '512 KB',
      )
    }
  })
})

describe('JPEG envelope validation boundaries', () => {
  it.each([4, MAX_CARD_IMAGE_BYTES])('accepts a JPEG envelope of %s bytes', (length) => {
    const bytes = new Uint8Array(length)
    bytes.set([0xff, 0xd8])
    bytes.set([0xff, 0xd9], length - 2)
    expect(() =>
      validateCardImage({ id: 'image-1', mimeType: 'image/jpeg', bytes: bytes.buffer }),
    ).not.toThrow()
  })

  it.each([
    { mimeType: 'image/png', bytes: [0xff, 0xd8, 0xff, 0xd9] },
    { mimeType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
    { mimeType: 'image/jpeg', bytes: [0xff, 0, 0xff, 0xd9] },
    { mimeType: 'image/jpeg', bytes: [0xff, 0xd8, 0, 0xd9] },
    { mimeType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff, 0] },
  ])('rejects invalid MIME or JPEG markers %#', (candidate) => {
    expect(() =>
      validateCardImage({
        id: 'image-1',
        mimeType: candidate.mimeType as 'image/jpeg',
        bytes: new Uint8Array(candidate.bytes).buffer,
      }),
    ).toThrow('valid JPEG')
  })

  it.each([undefined, null, 12, {}, []])('rejects non-text reference %#', (reference) => {
    expect(() => validateCardImageId(reference)).toThrow('identifiers')
  })
})
