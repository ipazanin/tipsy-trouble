import { describe, expect, it } from 'vitest'
import { validatePlayerProfile, type PlayerProfile } from '../playerProfile'

const player: PlayerProfile = { id: 'alice', name: 'Alice' }

describe('player profile validation', () => {
  it('accepts boundary identifiers and names without mutating saved text', () => {
    const boundary = { id: 'x'.repeat(100), name: 'n'.repeat(80) }
    expect(() => validatePlayerProfile(boundary)).not.toThrow(/player|Player/)
    expect(() => validatePlayerProfile(player)).not.toThrow(/player|Player/)
    const spaced = { id: ' alice ', name: ' Alice ' }
    validatePlayerProfile(spaced)
    expect(spaced).toEqual({ id: ' alice ', name: ' Alice ' })
  })

  it.each([
    { id: '' },
    { id: ' ' },
    { id: 'x'.repeat(101) },
    { name: '' },
    { name: ' ' },
    { name: 'x'.repeat(81) },
  ])('rejects invalid profile %j', (invalid) => {
    expect(() => validatePlayerProfile({ ...player, ...invalid })).toThrow(/player|Player/)
  })

  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'accepts supported %s photos through the maximum size',
    (type) => {
      expect(() =>
        validatePlayerProfile({
          ...player,
          photo: new Blob([new Uint8Array(1024 * 1024)], { type }),
        }),
      ).not.toThrow(/player|Player/)
    },
  )

  it.each([
    new Blob([], { type: 'image/jpeg' }),
    new Blob(['gif'], { type: 'image/gif' }),
    new Blob([new Uint8Array(1024 * 1024 + 1)], { type: 'image/jpeg' }),
    { type: 'image/jpeg', size: 3 } as Blob,
  ])('rejects invalid photo %#', (photo) => {
    expect(() => validatePlayerProfile({ ...player, photo })).toThrow('Player photos')
  })
})
