import { computed, ref, shallowRef } from 'vue'
import { library } from '@/app/library'
import { t } from '@/app/i18n'
import { builtInCards } from '@/features/cards/catalogue'
import {
  activateCurrentRule,
  completeTurn,
  createGame,
  skipCurrentCard,
  submitHouseRule,
  type GameSession,
  type GameSettings,
  type Player,
} from '../domain/game'

export const gameSession = shallowRef<GameSession | null>(null)
export const sessionLoaded = ref(false)
export const sessionBusy = ref(false)
export const isGameActive = computed(() => gameSession.value !== null)
const sessionError = ref('')
let loading: Promise<void> | undefined

function random(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296
}

async function loadSession(force = false): Promise<void> {
  if (sessionLoaded.value && !force) return
  if (loading) return loading
  sessionError.value = ''
  loading = (async () => {
    try {
      gameSession.value = (await library.loadGame()) ?? null
      sessionLoaded.value = true
    } catch (error) {
      sessionError.value = error instanceof Error ? error.message : t('common.error')
    } finally {
      loading = undefined
    }
  })()
  return loading
}

async function persistAction(
  change: () => Promise<GameSession | null> | GameSession | null,
): Promise<boolean> {
  if (sessionBusy.value) return false
  sessionBusy.value = true
  sessionError.value = ''
  try {
    const nextSession = await change()
    if (nextSession) await library.saveGame(nextSession)
    else await library.clearGame()
    gameSession.value = nextSession
    sessionLoaded.value = true
    return true
  } catch (error) {
    sessionError.value = `${t('game.saveError')} ${error instanceof Error ? error.message : ''}`
    return false
  } finally {
    sessionBusy.value = false
  }
}

function currentSession(): GameSession {
  if (!gameSession.value) throw new Error(t('game.empty'))
  return gameSession.value
}

export function useGameSession() {
  return {
    gameSession,
    sessionLoaded,
    sessionBusy,
    sessionError,
    isGameActive,
    loadSession,
    startGame: (players: readonly Player[], settings: GameSettings) =>
      persistAction(async () => {
        if (gameSession.value) throw new Error(t('players.active'))
        return createGame(
          players,
          [...builtInCards, ...(await library.listCustomCards())],
          settings,
          random,
        )
      }),
    nextTurn: () => persistAction(() => completeTurn(currentSession(), random)),
    skipCard: () => persistAction(() => skipCurrentCard(currentSession(), random)),
    activateRule: (targetId?: string) =>
      persistAction(() => activateCurrentRule(currentSession(), targetId)),
    addHouseRule: (text: string) =>
      persistAction(() => submitHouseRule(currentSession(), text, random)),
    endGame: () => persistAction(() => null),
  }
}
