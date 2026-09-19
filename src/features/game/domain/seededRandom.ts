export function createSeedState(seed: string): number {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index++) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619)
  }
  return ((hash >>> 0) % 4294967295) + 1
}

export function advanceSeedState(state: number): number {
  let next = state ^ (state << 13)
  next ^= next >>> 17
  next ^= next << 5
  return next >>> 0
}
