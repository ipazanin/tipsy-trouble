import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CardDefinition } from '@/features/cards/domain/cards'
import { createGame, type GameSession } from '../../domain/game'

const storage = vi.hoisted(() => ({
  listEnabledCards: vi.fn<() => Promise<CardDefinition[]>>(),
  clearGame: vi.fn<() => Promise<void>>(),
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
  storage.listEnabledCards.mockResolvedValue([
    ...savedSession.deck,
    { ...savedSession.deck[0]!, id: 'second-story' },
  ])
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

describe('ending a game', () => {
  it('keeps the session until deletion succeeds and allows retrying a failed deletion', async () => {
    const { useGameSession } = await import('../useGameSession')
    const game = useGameSession()
    await game.loadSession()
    storage.clearGame.mockRejectedValueOnce(new Error('Storage unavailable.'))
    await expect(game.endGame()).resolves.toBe(false)
    expect(game.gameSession.value).toBe(savedSession)
    expect(storage.saveGame).not.toHaveBeenCalled()
    storage.clearGame.mockResolvedValueOnce(undefined)
    await expect(game.endGame()).resolves.toBe(true)
    expect(game.gameSession.value).toBeNull()
    expect(game.sessionError.value).toBe('')
  })
})

const ruleSession = createGame(
  savedSession.players,
  [
    {
      id: 'quiet',
      kind: 'temporary-rule',
      title: 'Quiet voices',
      text: 'Use a quiet voice.',
      contentLocale: 'en',
      target: 'choose-player',
      duration: { amount: 2, unit: 'turns' },
    },
  ],
  { specialChance: 0, maxSpecialsPerGame: 0 },
  () => 0,
)

describe('activating a rule and advancing atomically', () => {
  it('saves one complete transition and retries a failed write without activating the displayed rule', async () => {
    storage.loadGame.mockResolvedValue(ruleSession)
    const { useGameSession } = await import('../useGameSession')
    const game = useGameSession()
    await game.loadSession()
    storage.saveGame.mockRejectedValueOnce(new Error('Storage quota exceeded.'))
    await expect(game.nextTurn('bob')).resolves.toBe(false)
    expect(game.gameSession.value).toBe(ruleSession)
    expect(game.gameSession.value?.temporaryRules).toEqual([])
    expect(storage.saveGame).toHaveBeenCalledTimes(1)
    const attempted = storage.saveGame.mock.calls[0]![0]
    expect(attempted.completedTurns).toBe(1)
    expect(attempted.currentPlayerIndex).toBe(1)
    expect(attempted.temporaryRules).toMatchObject([
      { scope: { kind: 'player', playerId: 'bob' }, remainingTurns: 2, activatedOnTurn: 0 },
    ])
    storage.saveGame.mockResolvedValueOnce(undefined)
    await expect(game.nextTurn('bob')).resolves.toBe(true)
    expect(storage.saveGame).toHaveBeenCalledTimes(2)
    expect(game.gameSession.value).toEqual(attempted)
  })

  it('ignores a second click while the combined transition is being saved', async () => {
    storage.loadGame.mockResolvedValue(ruleSession)
    const { useGameSession } = await import('../useGameSession')
    const game = useGameSession()
    await game.loadSession()
    let finishSave!: () => void
    storage.saveGame.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSave = resolve
      }),
    )
    const advancing = game.nextTurn('bob')
    await vi.waitFor(() => expect(storage.saveGame).toHaveBeenCalledTimes(1))
    await expect(game.nextTurn('alice')).resolves.toBe(false)
    expect(game.gameSession.value).toBe(ruleSession)
    finishSave()
    await expect(advancing).resolves.toBe(true)
    expect(storage.saveGame).toHaveBeenCalledTimes(1)
    expect(game.gameSession.value?.temporaryRules).toHaveLength(1)
    expect(game.gameSession.value?.completedTurns).toBe(1)
    expect(game.gameSession.value?.temporaryRules[0]?.scope).toEqual({
      kind: 'player',
      playerId: 'bob',
    })
  })

  it('resumes a legacy activated current card without applying it twice or shortening its duration', async () => {
    const activated: GameSession = {
      ...ruleSession,
      temporaryRules: [
        {
          id: 'temporary-0',
          cardId: 'quiet',
          text: 'Use a quiet voice.',
          scope: { kind: 'player', playerId: 'bob' },
          remainingTurns: 2,
          activatedOnTurn: 0,
        },
      ],
    }
    storage.loadGame.mockResolvedValue(activated)
    const { useGameSession } = await import('../useGameSession')
    const game = useGameSession()
    await game.loadSession()
    await expect(game.nextTurn()).resolves.toBe(true)
    expect(storage.saveGame).toHaveBeenCalledTimes(1)
    expect(game.gameSession.value?.temporaryRules).toEqual(activated.temporaryRules)
    expect(game.gameSession.value?.completedTurns).toBe(1)
  })
})

describe('loading and starting sessions', () => {
  it.each<{ deck: CardDefinition[] }>([
    { deck: [] },
    {
      deck: [
        {
          id: 'special-only',
          kind: 'special',
          title: 'Rare',
          text: 'A rare card.',
          contentLocale: 'en',
        },
      ],
    },
  ])('requires an enabled ordinary card without creating a saved game %#', async ({ deck }) => {
    storage.loadGame.mockResolvedValueOnce(undefined)
    storage.listEnabledCards.mockResolvedValueOnce(deck)
    const { useGameSession } = await import('../useGameSession')
    const game = useGameSession()
    await game.loadSession()

    await expect(
      game.startGame(savedSession.players, { specialChance: 0.01, maxSpecialsPerGame: 1 }),
    ).resolves.toBe(false)
    expect(game.sessionError.value).toContain('Enable at least one prompt or temporary rule')
    expect(storage.saveGame).not.toHaveBeenCalled()
    expect(game.gameSession.value).toBeNull()
  })

  it('shares a pending load, caches completed loads and refreshes only when forced', async () => {
    let finishLoad!: (session: GameSession | undefined) => void
    storage.loadGame.mockReturnValueOnce(
      new Promise((resolve) => {
        finishLoad = resolve
      }),
    )
    const { useGameSession } = await import('../useGameSession')
    const game = useGameSession()
    expect(game.isGameActive.value).toBe(false)
    const first = game.loadSession()
    const second = game.loadSession()
    expect(storage.loadGame).toHaveBeenCalledTimes(1)
    finishLoad(savedSession)
    await Promise.all([first, second])
    expect(game.isGameActive.value).toBe(true)
    await game.loadSession()
    expect(storage.loadGame).toHaveBeenCalledTimes(1)
    storage.loadGame.mockResolvedValueOnce(undefined)
    await game.loadSession(true)
    expect(storage.loadGame).toHaveBeenCalledTimes(2)
    expect(game.gameSession.value).toBeNull()
    expect(game.isGameActive.value).toBe(false)
  })

  it.each([new Error('Read failed.'), 'non-error rejection'])(
    'recovers from failed storage reads %#',
    async (failure) => {
      storage.loadGame.mockRejectedValueOnce(failure)
      const { useGameSession } = await import('../useGameSession')
      const game = useGameSession()
      await game.loadSession()
      expect(game.sessionLoaded.value).toBe(false)
      expect(game.sessionError.value).not.toBe('')
      await game.loadSession()
      expect(game.sessionLoaded.value).toBe(true)
      expect(game.gameSession.value).toBe(savedSession)
      expect(game.sessionError.value).toBe('')
    },
  )

  it('starts from the enabled deck, persists before displaying it and blocks replacing an active game', async () => {
    storage.loadGame.mockResolvedValueOnce(undefined)
    const { useGameSession } = await import('../useGameSession')
    const game = useGameSession()
    await game.loadSession()
    const settings = { specialChance: 0, maxSpecialsPerGame: 0 }
    await expect(game.startGame(savedSession.players, settings)).resolves.toBe(true)
    expect(storage.listEnabledCards).toHaveBeenCalledTimes(1)
    expect(storage.saveGame).toHaveBeenCalledTimes(1)
    expect(game.gameSession.value?.deck).toEqual(
      await storage.listEnabledCards.mock.results[0]!.value,
    )
    expect(game.isGameActive.value).toBe(true)
    await expect(game.startGame(savedSession.players, settings)).resolves.toBe(false)
    expect(storage.saveGame).toHaveBeenCalledTimes(1)
  })

  it('rejects actions without a session and handles non-Error persistence failures', async () => {
    storage.loadGame.mockResolvedValueOnce(undefined)
    const { useGameSession } = await import('../useGameSession')
    const game = useGameSession()
    await game.loadSession()
    await expect(game.nextTurn()).resolves.toBe(false)
    expect(storage.saveGame).not.toHaveBeenCalled()
    storage.clearGame.mockRejectedValueOnce('Storage rejected deletion')
    await expect(game.endGame()).resolves.toBe(false)
    expect(game.sessionError.value).toContain("Your game hasn't advanced.")
    expect(game.sessionError.value).not.toContain('undefined')
  })

  it('persists a scheduled house rule without consuming another player turn', async () => {
    const due: GameSession = {
      ...savedSession,
      currentCard: null,
      completedTurns: 4,
      phase: 'house-rule',
    }
    storage.loadGame.mockResolvedValueOnce(due)
    const { useGameSession } = await import('../useGameSession')
    const game = useGameSession()
    await game.loadSession()
    await expect(game.addHouseRule('Say please.')).resolves.toBe(true)
    expect(storage.saveGame).toHaveBeenCalledTimes(1)
    expect(game.gameSession.value?.completedTurns).toBe(4)
    expect(game.gameSession.value?.houseRules).toMatchObject([
      { authorId: 'alice', text: 'Say please.', scope: { kind: 'everyone' } },
    ])
  })

  it('retries the identical seeded draw after a failed write and resumes its sequence after reloading', async () => {
    const seeded = createGame(
      savedSession.players,
      [
        ...savedSession.deck,
        { ...savedSession.deck[0]!, id: 'two' },
        { ...savedSession.deck[0]!, id: 'three' },
      ],
      { specialChance: 0, maxSpecialsPerGame: 0, seed: 'Friday' },
      () => 0,
    )
    storage.loadGame.mockResolvedValueOnce(seeded)
    const { useGameSession } = await import('../useGameSession')
    const game = useGameSession()
    await game.loadSession()
    storage.saveGame.mockRejectedValueOnce(new Error('Full storage.'))
    await expect(game.nextTurn()).resolves.toBe(false)
    const attempted = storage.saveGame.mock.calls[0]![0]
    expect(game.gameSession.value?.randomState).toBe(seeded.randomState)
    await expect(game.nextTurn()).resolves.toBe(true)
    expect(storage.saveGame.mock.calls[1]![0]).toEqual(attempted)
    storage.loadGame.mockResolvedValueOnce(JSON.parse(JSON.stringify(attempted)))
    await game.loadSession(true)
    await expect(game.nextTurn()).resolves.toBe(true)
    expect(game.gameSession.value?.completedTurns).toBe(2)
    expect(game.gameSession.value?.currentCard?.id).not.toBe(attempted.currentCard?.id)
  })
})

describe('synchronizing a restored game', () => {
  const restoredSession: GameSession = {
    ...savedSession,
    completedTurns: 2,
    deck: [{ ...savedSession.deck[0]!, id: 'restored-card', text: 'Restored game content.' }],
    currentCard: { ...savedSession.deck[0]!, id: 'restored-card', text: 'Restored game content.' },
  }

  it('blocks every mutation after a failed forced read until retry loads the restored snapshot', async () => {
    const { useGameSession } = await import('../useGameSession')
    const game = useGameSession()
    await expect(game.loadSession()).resolves.toBe(true)
    storage.loadGame.mockRejectedValueOnce(new Error('Restored game read failed.'))
    await expect(game.loadSession(true)).resolves.toBe(false)
    expect(game.sessionLoaded.value).toBe(false)
    expect(game.gameSession.value).toBe(savedSession)
    await expect(game.nextTurn()).resolves.toBe(false)
    await expect(game.addHouseRule('Stale rule')).resolves.toBe(false)
    await expect(game.endGame()).resolves.toBe(false)
    await expect(game.startGame(savedSession.players, savedSession.settings)).resolves.toBe(false)
    expect(storage.saveGame).not.toHaveBeenCalled()
    expect(storage.clearGame).not.toHaveBeenCalled()
    expect(game.sessionError.value).toBe('Restored game read failed.')
    storage.loadGame.mockResolvedValueOnce(restoredSession)
    await expect(game.loadSession(true)).resolves.toBe(true)
    expect(game.sessionLoaded.value).toBe(true)
    expect(game.gameSession.value).toBe(restoredSession)
    await expect(game.nextTurn()).resolves.toBe(true)
    expect(storage.saveGame).toHaveBeenCalledTimes(1)
    expect(storage.saveGame.mock.calls[0]![0].completedTurns).toBe(3)
    expect(storage.saveGame.mock.calls[0]![0].deck).toEqual(restoredSession.deck)
  })

  it('supersedes a pending older read and never lets its result replace the restored game', async () => {
    let finishOldLoad!: (session: GameSession) => void
    storage.loadGame.mockReturnValueOnce(
      new Promise((resolve) => {
        finishOldLoad = resolve
      }),
    )
    storage.loadGame.mockResolvedValueOnce(restoredSession)
    const { useGameSession } = await import('../useGameSession')
    const game = useGameSession()
    const oldLoad = game.loadSession()
    await expect(game.loadSession(true)).resolves.toBe(true)
    expect(storage.loadGame).toHaveBeenCalledTimes(2)
    finishOldLoad(savedSession)
    await expect(oldLoad).resolves.toBe(false)
    expect(game.gameSession.value).toBe(restoredSession)
    expect(game.sessionLoaded.value).toBe(true)
  })

  it('ignores an obsolete read failure while sharing the still-pending replacement read', async () => {
    let failOldLoad!: (error: Error) => void
    let finishRestoreLoad!: (session: GameSession) => void
    storage.loadGame.mockReturnValueOnce(
      new Promise((_, reject) => {
        failOldLoad = reject
      }),
    )
    storage.loadGame.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRestoreLoad = resolve
      }),
    )
    const { useGameSession } = await import('../useGameSession')
    const game = useGameSession()
    const oldLoad = game.loadSession()
    const restoreLoad = game.loadSession(true)
    await expect(game.nextTurn()).resolves.toBe(false)
    failOldLoad(new Error('Obsolete failure.'))
    await expect(oldLoad).resolves.toBe(false)
    expect(game.sessionError.value).toBe('')
    const shared = game.loadSession()
    expect(storage.loadGame).toHaveBeenCalledTimes(2)
    finishRestoreLoad(restoredSession)
    await expect(restoreLoad).resolves.toBe(true)
    await expect(shared).resolves.toBe(true)
    expect(game.gameSession.value).toBe(restoredSession)
  })
})
