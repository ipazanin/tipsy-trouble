import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame, type GameSession } from '../../domain/game'

const storage = vi.hoisted(() => ({
  loadGame: vi.fn<() => Promise<GameSession | undefined>>(),
  saveGame: vi.fn<(session: GameSession) => Promise<void>>(),
}))

vi.mock('@/app/library', () => ({ library: storage }))

const savedSession = createGame(
  [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
  ],
  [
    {
      id: 'story',
      kind: 'prompt',
      title: 'Story time',
      text: 'Share a story.',
      contentLocale: 'en',
    },
  ],
  { specialChance: 0, maxSpecialsPerGame: 0 },
  () => 0,
)

beforeEach(() => {
  vi.resetAllMocks()
  vi.resetModules()
  storage.loadGame.mockResolvedValue(savedSession)
})

describe('persisting a game action', () => {
  it('retains the displayed turn when storage fails and allows retrying the same move', async () => {
    const { useGameSession } = await import('../useGameSession')
    const game = useGameSession()
    await game.loadSession()
    storage.saveGame.mockRejectedValueOnce(new Error('Storage quota exceeded.'))

    await expect(game.nextTurn()).resolves.toBe(false)

    expect(game.gameSession.value).toBe(savedSession)
    expect(game.gameSession.value?.completedTurns).toBe(0)
    expect(game.sessionBusy.value).toBe(false)
    expect(game.sessionError.value).toContain("Your game hasn't advanced.")
    expect(game.sessionError.value).toContain('Storage quota exceeded.')

    storage.saveGame.mockResolvedValueOnce(undefined)
    await expect(game.nextTurn()).resolves.toBe(true)
    expect(game.gameSession.value?.completedTurns).toBe(1)
    expect(game.sessionError.value).toBe('')
    expect(game.sessionBusy.value).toBe(false)
  })

  it('ignores a second advance while the first write is unresolved', async () => {
    const { useGameSession } = await import('../useGameSession')
    const game = useGameSession()
    await game.loadSession()
    let finishSave!: () => void
    const pendingSave = new Promise<void>((resolve) => {
      finishSave = resolve
    })
    storage.saveGame.mockReturnValueOnce(pendingSave)

    const firstAdvance = game.nextTurn()
    await vi.waitFor(() => expect(storage.saveGame).toHaveBeenCalledTimes(1))
    expect(game.sessionBusy.value).toBe(true)
    expect(game.gameSession.value).toBe(savedSession)

    await expect(game.nextTurn()).resolves.toBe(false)
    expect(storage.saveGame).toHaveBeenCalledTimes(1)
    expect(game.sessionBusy.value).toBe(true)

    finishSave()
    await expect(firstAdvance).resolves.toBe(true)
    expect(game.sessionBusy.value).toBe(false)
    expect(game.gameSession.value?.completedTurns).toBe(1)
    expect(game.gameSession.value?.currentPlayerIndex).toBe(1)
  })
})
