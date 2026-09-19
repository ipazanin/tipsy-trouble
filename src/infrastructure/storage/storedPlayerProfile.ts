import { validatePlayerProfile, type PlayerProfile } from '@/features/players/domain/playerProfile'

export interface StoredPlayerProfile {
  readonly id: string
  readonly name: string
  readonly photo?: { readonly bytes: ArrayBuffer; readonly type: string } | Blob
}

export async function encodePlayerProfile(player: PlayerProfile): Promise<StoredPlayerProfile> {
  validatePlayerProfile(player)
  return {
    id: player.id,
    name: player.name.trim(),
    // WebKit's ephemeral IndexedDB cannot store Blobs; raw bytes work in all target browsers.
    ...(player.photo
      ? { photo: { bytes: await player.photo.arrayBuffer(), type: player.photo.type } }
      : {}),
  }
}

export function decodePlayerProfile(storedPlayer: StoredPlayerProfile): PlayerProfile {
  const photo = storedPlayer.photo
  const player: PlayerProfile = {
    id: storedPlayer.id,
    name: storedPlayer.name,
    ...(photo
      ? { photo: photo instanceof Blob ? photo : new Blob([photo.bytes], { type: photo.type }) }
      : {}),
  }
  validatePlayerProfile(player)
  return player
}
