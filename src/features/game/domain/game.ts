import { advanceSeedState, createSeedState } from './seededRandom'
import {
  parseCardDefinition,
  parseCardDefinitions,
  type CardDefinition,
} from '../../cards/domain/cards'

export interface Player {
  readonly id: string
  readonly name: string
}

export interface GameSettings {
  readonly seed?: string
  readonly specialChance: number
  readonly maxSpecialsPerGame: number
}

export const DEFAULT_GAME_SETTINGS: GameSettings = { specialChance: 0.01, maxSpecialsPerGame: 1 }
export type Random = () => number
export type RuleScope =
  { readonly kind: 'everyone' } | { readonly kind: 'player'; readonly playerId: string }

export interface TemporaryRule {
  readonly id: string
  readonly cardId: string
  readonly text: string
  readonly scope: RuleScope
  readonly remainingTurns: number
  readonly activatedOnTurn: number
}

export interface HouseRule {
  readonly id: string
  readonly authorId: string
  readonly text: string
  readonly scope: { readonly kind: 'everyone' }
}

export interface GameSession {
  readonly randomState?: number
  readonly players: readonly Player[]
  readonly deck: readonly CardDefinition[]
  readonly settings: GameSettings
  readonly remainingCards: readonly CardDefinition[]
  readonly currentCard: CardDefinition | null
  readonly phase: 'turn' | 'house-rule'
  readonly currentPlayerIndex: number
  readonly completedTurns: number
  readonly temporaryRules: readonly TemporaryRule[]
  readonly houseRules: readonly HouseRule[]
  readonly specialsDrawn: number
  readonly drawnSpecialIds: readonly string[]
}

export class GameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GameError'
  }
}

function sample(random: Random): number {
  const fraction = random()
  if (!Number.isFinite(fraction) || fraction < 0 || fraction >= 1) {
    throw new GameError('Random samples must be between 0 inclusive and 1 exclusive.')
  }
  return fraction
}

function shuffle(cards: readonly CardDefinition[], random: Random): CardDefinition[] {
  const shuffled = [...cards]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const otherIndex = Math.floor(sample(random) * (index + 1))
    const card = shuffled[index]!
    shuffled[index] = shuffled[otherIndex]!
    shuffled[otherIndex] = card
  }
  return shuffled
}

function drawCard(session: GameSession, random: Random): GameSession {
  if (session.randomState === undefined) return drawCardWithRandom(session, random)
  let randomState = session.randomState
  const drawn = drawCardWithRandom(session, () => {
    randomState = advanceSeedState(randomState)
    return randomState / 4294967296
  })
  return { ...drawn, randomState }
}

function drawCardWithRandom(session: GameSession, random: Random): GameSession {
  const specials = session.deck.filter(
    (card) => card.kind === 'special' && !session.drawnSpecialIds.includes(card.id),
  )
  if (
    session.specialsDrawn < session.settings.maxSpecialsPerGame &&
    specials.length > 0 &&
    session.settings.specialChance > 0 &&
    sample(random) < session.settings.specialChance
  ) {
    const currentCard = specials[Math.floor(sample(random) * specials.length)]!
    return {
      ...session,
      currentCard,
      specialsDrawn: session.specialsDrawn + 1,
      drawnSpecialIds: [...session.drawnSpecialIds, currentCard.id],
    }
  }
  let remainingCards = [...session.remainingCards]
  if (remainingCards.length === 0) {
    remainingCards = shuffle(
      session.deck.filter((card) => card.kind !== 'special'),
      random,
    )
    if (remainingCards.length > 1 && remainingCards[0]!.id === session.currentCard?.id) {
      const repeatedCard = remainingCards.shift()!
      remainingCards.push(repeatedCard)
    }
  }
  const currentCard = remainingCards.shift()!
  return { ...session, currentCard, remainingCards }
}

export function createGame(
  players: readonly Player[],
  deck: readonly CardDefinition[],
  settings: GameSettings | undefined,
  random: Random,
): GameSession {
  if (players.length < 2 || players.length > 100) {
    throw new GameError('Choose between 2 and 100 players.')
  }
  if (
    players.some(
      (player) =>
        !player.id.trim() ||
        player.id.length > 100 ||
        !player.name.trim() ||
        player.name.trim().length > 80,
    ) ||
    new Set(players.map((player) => player.id)).size !== players.length
  ) {
    throw new GameError('Players need unique IDs and names between 1 and 80 characters.')
  }
  const gameSettings = { ...(settings ?? DEFAULT_GAME_SETTINGS) }
  if (gameSettings.seed !== undefined) {
    if (
      typeof gameSettings.seed !== 'string' ||
      !gameSettings.seed.trim() ||
      gameSettings.seed.trim().length > 80
    ) {
      throw new GameError('A game seed must contain between 1 and 80 characters.')
    }
    gameSettings.seed = gameSettings.seed.trim()
  }
  if (
    !Number.isFinite(gameSettings.specialChance) ||
    gameSettings.specialChance < 0 ||
    gameSettings.specialChance > 1
  ) {
    throw new GameError('Special card chance must be between 0 and 1.')
  }
  if (
    !Number.isInteger(gameSettings.maxSpecialsPerGame) ||
    gameSettings.maxSpecialsPerGame < 0 ||
    gameSettings.maxSpecialsPerGame > 10
  ) {
    throw new GameError('The special card limit must be a whole number between 0 and 10.')
  }
  const session: GameSession = {
    ...(gameSettings.seed === undefined ? {} : { randomState: createSeedState(gameSettings.seed) }),
    players: players.map((player) => ({ id: player.id, name: player.name.trim() })),
    deck: parseCardDefinitions(deck),
    settings: gameSettings,
    remainingCards: [],
    currentCard: null,
    phase: 'turn',
    currentPlayerIndex: 0,
    completedTurns: 0,
    temporaryRules: [],
    houseRules: [],
    specialsDrawn: 0,
    drawnSpecialIds: [],
  }
  return drawCard(session, random)
}

export function getCurrentPlayer(
  session: Pick<GameSession, 'players' | 'currentPlayerIndex'>,
): Player {
  return session.players[session.currentPlayerIndex]!
}

export function getHouseRuleAuthor(
  session: Pick<GameSession, 'players' | 'phase' | 'houseRules'>,
): Player | null {
  return session.phase === 'house-rule' ? session.players[session.houseRules.length]! : null
}

function requireCurrentCard(session: GameSession): CardDefinition {
  if (session.phase !== 'turn' || session.currentCard === null) {
    throw new GameError('Create the scheduled house rule before continuing.')
  }
  return session.currentCard
}

function scopeFor(session: GameSession, targetId: string): RuleScope {
  if (!session.players.some((player) => player.id === targetId)) {
    throw new GameError('Choose a player from this game.')
  }
  return { kind: 'player', playerId: targetId }
}

function currentRuleIsActive(session: GameSession): boolean {
  return session.temporaryRules.some((rule) => rule.activatedOnTurn === session.completedTurns)
}

function activateCurrentRule(
  session: GameSession,
  card: Extract<CardDefinition, { kind: 'temporary-rule' }>,
  targetId?: string,
): GameSession {
  let scope: RuleScope
  if (card.target === 'current-player') {
    if (targetId !== undefined && targetId !== getCurrentPlayer(session).id) {
      throw new GameError('This rule applies to the current player.')
    }
    scope = { kind: 'player', playerId: getCurrentPlayer(session).id }
  } else if (card.target === 'everyone') {
    if (targetId !== undefined) throw new GameError('This rule applies to everyone.')
    scope = { kind: 'everyone' }
  } else {
    if (targetId === undefined) throw new GameError('Choose a player for this rule.')
    scope = scopeFor(session, targetId)
  }
  const rule: TemporaryRule = {
    id: `temporary-${session.completedTurns}`,
    cardId: card.id,
    text: card.text,
    scope,
    remainingTurns:
      card.duration.amount * (card.duration.unit === 'circles' ? session.players.length : 1),
    activatedOnTurn: session.completedTurns,
  }
  return { ...session, temporaryRules: [...session.temporaryRules, rule] }
}

function advanceTurn(session: GameSession, random: Random): GameSession {
  const completedTurns = session.completedTurns + 1
  const advanced: GameSession = {
    ...session,
    completedTurns,
    currentPlayerIndex: completedTurns % session.players.length,
    temporaryRules: session.temporaryRules
      .map((rule) =>
        rule.activatedOnTurn === session.completedTurns
          ? rule
          : { ...rule, remainingTurns: rule.remainingTurns - 1 },
      )
      .filter((rule) => rule.remainingTurns > 0),
  }
  if (
    completedTurns % (session.players.length * 2) === 0 &&
    session.houseRules.length < session.players.length
  ) {
    return { ...advanced, phase: 'house-rule', currentCard: null }
  }
  return drawCard(advanced, random)
}

export function completeTurn(session: GameSession, random: Random, targetId?: string): GameSession {
  const card = requireCurrentCard(session)
  const activatedSession =
    card.kind === 'temporary-rule' && !currentRuleIsActive(session)
      ? activateCurrentRule(session, card, targetId)
      : session
  return advanceTurn(activatedSession, random)
}

export function submitHouseRule(session: GameSession, text: string, random: Random): GameSession {
  const author = getHouseRuleAuthor(session)
  if (author === null) throw new GameError('No house rule is due.')
  const trimmedText = text.trim()
  if (!trimmedText || trimmedText.length > 240) {
    throw new GameError('A house rule must contain between 1 and 240 characters.')
  }
  const rule: HouseRule = {
    id: `house-${session.houseRules.length}`,
    authorId: author.id,
    text: trimmedText,
    scope: { kind: 'everyone' },
  }
  return drawCard({ ...session, houseRules: [...session.houseRules, rule], phase: 'turn' }, random)
}

export function getPlayerRules(
  session: GameSession,
  playerId: string,
): { temporaryRules: readonly TemporaryRule[]; houseRules: readonly HouseRule[] } {
  scopeFor(session, playerId)
  const applies = (rule: { readonly scope: RuleScope }) =>
    rule.scope.kind === 'everyone' || rule.scope.playerId === playerId
  return {
    temporaryRules: session.temporaryRules.filter(applies),
    houseRules: session.houseRules.filter(applies),
  }
}

function savedRecord(candidate: unknown): Record<string, unknown> {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    throw new GameError('Saved game contains an invalid object.')
  }
  return candidate as Record<string, unknown>
}

function savedArray(candidate: unknown): unknown[] {
  if (!Array.isArray(candidate)) throw new GameError('Saved game contains an invalid list.')
  return candidate
}

function savedText(candidate: unknown, maximum = 240): string {
  if (typeof candidate !== 'string' || !candidate.trim() || candidate.length > maximum) {
    throw new GameError('Saved game contains invalid text.')
  }
  return candidate
}

function savedCount(candidate: unknown): number {
  if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < 0) {
    throw new GameError('Saved game contains an invalid counter.')
  }
  return candidate
}

function savedScope(candidate: unknown, session: GameSession): RuleScope {
  const scope = savedRecord(candidate)
  if (scope.kind === 'everyone') return { kind: 'everyone' }
  if (scope.kind === 'player') return scopeFor(session, savedText(scope.playerId))
  throw new GameError('Saved game contains an invalid rule scope.')
}

export function parseGameSession(candidate: unknown): GameSession {
  const saved = savedRecord(candidate)
  const players = savedArray(saved.players).map((candidate) => {
    const player = savedRecord(candidate)
    return { id: savedText(player.id), name: savedText(player.name, 80) }
  })
  const deck = parseCardDefinitions(saved.deck)
  const settings = savedRecord(saved.settings)
  if (typeof settings.specialChance !== 'number' || typeof settings.maxSpecialsPerGame !== 'number')
    throw new GameError('Saved game needs special card settings.')
  const base = createGame(
    players,
    deck,
    {
      specialChance: settings.specialChance,
      maxSpecialsPerGame: settings.maxSpecialsPerGame,
      ...(settings.seed === undefined ? {} : { seed: settings.seed as string }),
    },
    () => 0,
  )
  let randomState: number | undefined
  if (base.settings.seed !== undefined) {
    randomState = savedCount(saved.randomState)
    if (randomState === 0 || randomState > 4294967295)
      throw new GameError('Saved game contains an invalid random state.')
  } else if (saved.randomState !== undefined) {
    throw new GameError('Saved random state requires a game seed.')
  }
  const completedTurns = savedCount(saved.completedTurns)
  const currentPlayerIndex = savedCount(saved.currentPlayerIndex)
  const specialsDrawn = savedCount(saved.specialsDrawn)
  const drawnSpecialIds = savedArray(saved.drawnSpecialIds).map((id) => savedText(id, 100))
  if (
    currentPlayerIndex !== completedTurns % players.length ||
    specialsDrawn > settings.maxSpecialsPerGame ||
    specialsDrawn !== drawnSpecialIds.length ||
    new Set(drawnSpecialIds).size !== drawnSpecialIds.length
  ) {
    throw new GameError('Saved game counters are inconsistent.')
  }
  if (
    specialsDrawn > 0 &&
    (settings.specialChance === 0 ||
      drawnSpecialIds.some((id) => !deck.some((card) => card.id === id && card.kind === 'special')))
  ) {
    throw new GameError('Saved game contains an unavailable special card.')
  }
  function savedCard(candidate: unknown): CardDefinition {
    const parsed = parseCardDefinition(candidate)
    const card = deck.find((card) => card.id === parsed.id)
    if (!card || JSON.stringify(card) !== JSON.stringify(parsed)) {
      throw new GameError('Saved game references a card outside its deck.')
    }
    return card
  }
  const remainingCards = savedArray(saved.remainingCards).map(savedCard)
  if (
    remainingCards.some((card) => card.kind === 'special') ||
    new Set(remainingCards.map((card) => card.id)).size !== remainingCards.length
  ) {
    throw new GameError('Saved game contains an invalid remaining deck.')
  }
  const currentCard = saved.currentCard === null ? null : savedCard(saved.currentCard)
  if (currentCard && remainingCards.some((card) => card.id === currentCard.id)) {
    throw new GameError('The current card cannot also be in the remaining deck.')
  }
  if (
    (currentCard?.kind === 'special' &&
      drawnSpecialIds[drawnSpecialIds.length - 1] !== currentCard.id) ||
    specialsDrawn > completedTurns + (currentCard?.kind === 'special' ? 1 : 0)
  ) {
    throw new GameError('Saved game special count is inconsistent.')
  }
  if (saved.phase !== 'turn' && saved.phase !== 'house-rule')
    throw new GameError('Saved game has an invalid phase.')
  if ((saved.phase === 'turn') !== (currentCard !== null))
    throw new GameError('Saved game phase and card are inconsistent.')
  const houseRules = savedArray(saved.houseRules).map((candidate, index): HouseRule => {
    const rule = savedRecord(candidate)
    if (rule.id !== `house-${index}` || rule.authorId !== players[index]?.id) {
      throw new GameError('Saved house rule authors must follow player order exactly once.')
    }
    savedScope(rule.scope, base)
    return {
      id: rule.id as string,
      authorId: rule.authorId as string,
      text: savedText(rule.text),
      scope: { kind: 'everyone' },
    }
  })
  const rulesDue = Math.min(Math.floor(completedTurns / (players.length * 2)), players.length)
  const pending = saved.phase === 'house-rule'
  if (
    houseRules.length !== rulesDue - (pending ? 1 : 0) ||
    (pending &&
      (completedTurns === 0 ||
        completedTurns % (players.length * 2) !== 0 ||
        houseRules.length >= players.length ||
        completedTurns > players.length * players.length * 2))
  ) {
    throw new GameError('Saved house rule schedule is inconsistent.')
  }
  const temporaryRules = savedArray(saved.temporaryRules).map((candidate): TemporaryRule => {
    const rule = savedRecord(candidate)
    const card = deck.find((card) => card.id === rule.cardId)
    const activatedOnTurn = savedCount(rule.activatedOnTurn)
    const remainingTurns = savedCount(rule.remainingTurns)
    const scope = savedScope(rule.scope, base)
    if (
      !card ||
      card.kind !== 'temporary-rule' ||
      activatedOnTurn > completedTurns ||
      rule.id !== `temporary-${activatedOnTurn}` ||
      rule.text !== card.text
    ) {
      throw new GameError('Saved temporary rule does not match a card activation.')
    }
    const duration = card.duration.amount * (card.duration.unit === 'circles' ? players.length : 1)
    if (
      remainingTurns === 0 ||
      remainingTurns !== duration - Math.max(0, completedTurns - activatedOnTurn - 1)
    ) {
      throw new GameError('Saved temporary rule expiry is inconsistent.')
    }
    if (
      (card.target === 'everyone' && scope.kind !== 'everyone') ||
      (card.target !== 'everyone' && scope.kind !== 'player') ||
      (card.target === 'current-player' &&
        scope.kind === 'player' &&
        scope.playerId !== players[activatedOnTurn % players.length]!.id)
    ) {
      throw new GameError('Saved temporary rule target is inconsistent.')
    }
    if (activatedOnTurn === completedTurns && (pending || currentCard?.id !== card.id)) {
      throw new GameError('Saved current rule activation does not match the current card.')
    }
    return {
      id: rule.id as string,
      cardId: card.id,
      text: card.text,
      scope,
      remainingTurns,
      activatedOnTurn,
    }
  })
  if (new Set(temporaryRules.map((rule) => rule.id)).size !== temporaryRules.length) {
    throw new GameError('Saved game contains duplicate rule activations.')
  }
  return {
    ...base,
    ...(randomState === undefined ? {} : { randomState }),
    remainingCards,
    currentCard,
    phase: saved.phase,
    currentPlayerIndex,
    completedTurns,
    temporaryRules,
    houseRules,
    specialsDrawn,
    drawnSpecialIds,
  }
}
