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
