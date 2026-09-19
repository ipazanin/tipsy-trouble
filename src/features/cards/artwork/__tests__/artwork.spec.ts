// @vitest-environment node
import { access, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { builtInCards } from '../../catalogue'
import { customArtworkThemes, getCardArtwork } from '..'
import photos from '../photos.json'
import pairings from '../pairings.json'

describe('offline card artwork', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('pairs every built-in card with a credited, bundled photograph', async () => {
    vi.stubEnv('BASE_URL', '/tipsy-trouble/')
    expect(Object.keys(pairings).sort()).toEqual(builtInCards.map((card) => card.id).sort())
    const sizes = await Promise.all(
      Object.keys(photos).map(async (theme) => {
        const photoPath = fileURLToPath(
          new URL(`../../../../../public/artwork/${theme}.webp`, import.meta.url),
        )
        await access(photoPath)
        return (await stat(photoPath)).size
      }),
    )
    expect(sizes.reduce((total, bytes) => total + bytes, 0)).toBeLessThan(1_000_000)
    for (const card of builtInCards) {
      const artwork = getCardArtwork(card)
      expect(artwork.src).toMatch(/^\/tipsy-trouble\/artwork\/[a-z]+\.webp$/)
      expect(artwork.sourceUrl).toMatch(/^https:\/\/unsplash.com\//)
      expect(artwork.credit).toContain(' / Unsplash')
    }
  })

  it('keeps a custom card’s template consistent when its text is edited', () => {
    const card = {
      id: 'custom-party-card',
      kind: 'prompt' as const,
      contentLocale: 'en',
      title: 'Your challenge',
      text: 'Make up a challenge.',
    }
    expect(new Set(customArtworkThemes).size).toBe(10)
    expect(getCardArtwork(card)).toEqual(
      getCardArtwork({ ...card, text: 'A different challenge.' }),
    )
    expect(
      customArtworkThemes.some((theme) => getCardArtwork(card).src.endsWith(`/${theme}.webp`)),
    ).toBe(true)
  })
})
