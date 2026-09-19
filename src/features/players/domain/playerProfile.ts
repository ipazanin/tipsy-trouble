export interface PlayerProfile {
  id: string
  name: string
  photo?: Blob
}

export function validatePlayerProfile(player: PlayerProfile): void {
  if (!player.id.trim() || player.id.length > 100) {
    throw new Error('A player must have a valid identifier.')
  }

  if (!player.name.trim() || player.name.length > 80) {
    throw new Error('Player names must contain between 1 and 80 characters.')
  }

  if (
    player.photo &&
    (!(player.photo instanceof Blob) ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(player.photo.type) ||
      player.photo.size === 0 ||
      player.photo.size > 1024 * 1024)
  ) {
    throw new Error('Player photos must be JPEG, PNG, or WebP images smaller than 1 MB.')
  }
}
