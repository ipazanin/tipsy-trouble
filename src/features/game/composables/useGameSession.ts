import { computed, ref, shallowRef } from 'vue'
import { library } from '@/app/library'
import { t } from '@/app/i18n'
import {
  completeTurn,
  createGame,
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
let loading: Promise<boolean> | undefined
let loadRequest = 0

function random(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296
}

async function loadSession(force = false): Promise<boolean> {
  if (sessionLoaded.value && !force) return true
  if (loading && !force) return loading
  const request = ++loadRequest
  sessionLoaded.value = false
  sessionError.value = ''
  loading = (async () => {
    try {
      const loadedSession = (await library.loadGame()) ?? null
      if (request !== loadRequest) return false
      gameSession.value = loadedSession
      sessionLoaded.value = true
      return true
    } catch (error) {
      if (request === loadRequest) {
        sessionError.value = error instanceof Error ? error.message : t('common.error')
      }
      return false
    } finally {
      if (request === loadRequest) loading = undefined
    }
  })()
  return loading
}

async function persistAction(
  change: () => Promise<GameSession | null> | GameSession | null,
): Promise<boolean> {
  if (sessionBusy.value || !sessionLoaded.value) return false
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
        const deck = await library.listEnabledCards()
        if (!deck.some((card) => card.kind !== 'special')) {
          throw new Error(t('library.noOrdinaryCards'))
        }
        return createGame(players, deck, settings, random)
      }),
    nextTurn: (targetId?: string) =>
      persistAction(() => completeTurn(currentSession(), random, targetId)),
    addHouseRule: (text: string) =>
      persistAction(() => submitHouseRule(currentSession(), text, random)),
    endGame: () => persistAction(() => null),
  }
}
