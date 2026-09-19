import { parseCardDefinition } from '@/features/cards/domain/cards'
import type { GameSession, HouseRule, RuleScope, TemporaryRule } from '@/features/game/domain/game'

export type PublicGame = Pick<
  GameSession,
  | 'players'
  | 'phase'
  | 'currentCard'
  | 'currentPlayerIndex'
  | 'completedTurns'
  | 'temporaryRules'
  | 'houseRules'
>

export interface SharedSnapshot {
  readonly roomId: string
  readonly revision: number
  readonly assignedPlayerId: string
  readonly game: PublicGame
  readonly currentArtwork?: string
}

export type GuestCommand = {
  readonly roomId: string
  readonly commandId: string
  readonly expectedRevision: number
} & (
  | { readonly action: 'advance'; readonly targetId?: string }
  | { readonly action: 'house-rule'; readonly text: string }
)

export const rejectionReasons = [
  'wrong-room',
  'stale',
  'busy',
  'not-your-turn',
  'invalid-command',
  'save-failed',
] as const
export type RejectionReason = (typeof rejectionReasons)[number]

export type HostMessage =
  | { readonly version: 1; readonly type: 'snapshot'; readonly snapshot: SharedSnapshot }
  | {
      readonly version: 1
      readonly type: 'result'
      readonly commandId: string
      readonly accepted: boolean
      readonly reason?: RejectionReason
    }
  | { readonly version: 1; readonly type: 'ended' }

export type GuestMessage =
  | { readonly version: 1; readonly type: 'ready' }
  | { readonly version: 1; readonly type: 'command'; readonly command: GuestCommand }

export class ProtocolError extends Error {
  constructor(message = 'Invalid multiplayer message.') {
    super(message)
    this.name = 'ProtocolError'
  }
}

function record(candidate: unknown): Record<string, unknown> {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new ProtocolError()
  }
  return candidate as Record<string, unknown>
}

function text(candidate: unknown, maximum = 100): string {
  if (typeof candidate !== 'string' || !candidate.trim() || candidate.length > maximum) {
    throw new ProtocolError()
  }
  return candidate
}

function count(candidate: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  if (
    typeof candidate !== 'number' ||
    !Number.isSafeInteger(candidate) ||
    candidate < 0 ||
    candidate > maximum
  ) {
    throw new ProtocolError()
  }
  return candidate
}

function list(candidate: unknown, maximum: number): unknown[] {
  if (!Array.isArray(candidate) || candidate.length > maximum) throw new ProtocolError()
  return candidate
}

function parsePublicGame(candidate: unknown): PublicGame {
  const game = record(candidate)
  const players = list(game.players, 100).map((candidate) => {
    const player = record(candidate)
    return { id: text(player.id), name: text(player.name, 80) }
  })
  const playerIds = new Set(players.map((player) => player.id))
  if (players.length < 2 || playerIds.size !== players.length) throw new ProtocolError()
  const completedTurns = count(game.completedTurns)
  const currentPlayerIndex = count(game.currentPlayerIndex, players.length - 1)
  if (currentPlayerIndex !== completedTurns % players.length) throw new ProtocolError()
  if (game.phase !== 'turn' && game.phase !== 'house-rule') throw new ProtocolError()
  const currentCard = game.currentCard === null ? null : parseCardDefinition(game.currentCard)
  if ((game.phase === 'turn') !== (currentCard !== null)) throw new ProtocolError()

  function scope(candidate: unknown): RuleScope {
    const ruleScope = record(candidate)
    if (ruleScope.kind === 'everyone') return { kind: 'everyone' }
    if (ruleScope.kind !== 'player' || !playerIds.has(text(ruleScope.playerId))) {
      throw new ProtocolError()
    }
    return { kind: 'player', playerId: ruleScope.playerId as string }
  }

  const houseRules = list(game.houseRules, players.length).map((candidate, index): HouseRule => {
    const rule = record(candidate)
    if (
      rule.id !== `house-${index}` ||
      rule.authorId !== players[index]!.id ||
      scope(rule.scope).kind !== 'everyone'
    ) {
      throw new ProtocolError()
    }
    return {
      id: rule.id as string,
      authorId: rule.authorId as string,
      text: text(rule.text, 240),
      scope: { kind: 'everyone' },
    }
  })
  const pending = game.phase === 'house-rule'
  const rulesDue = Math.min(Math.floor(completedTurns / (players.length * 2)), players.length)
  if (
    houseRules.length !== rulesDue - (pending ? 1 : 0) ||
    (pending &&
      (completedTurns === 0 ||
        completedTurns % (players.length * 2) !== 0 ||
        completedTurns > players.length * players.length * 2))
  ) {
    throw new ProtocolError()
  }
  const temporaryRules = list(game.temporaryRules, 10000).map((candidate): TemporaryRule => {
    const rule = record(candidate)
    const activatedOnTurn = count(rule.activatedOnTurn, completedTurns)
    const remainingTurns = count(rule.remainingTurns, 10000)
    if (rule.id !== `temporary-${activatedOnTurn}` || remainingTurns === 0) {
      throw new ProtocolError()
    }
    if (
      activatedOnTurn === completedTurns &&
      (currentCard?.kind !== 'temporary-rule' || currentCard.id !== rule.cardId)
    ) {
      throw new ProtocolError()
    }
    return {
      id: rule.id as string,
      cardId: text(rule.cardId),
      text: text(rule.text, 240),
      scope: scope(rule.scope),
      remainingTurns,
      activatedOnTurn,
    }
  })
  if (new Set(temporaryRules.map((rule) => rule.id)).size !== temporaryRules.length) {
    throw new ProtocolError()
  }
  return {
    players,
    phase: game.phase,
    currentCard,
    currentPlayerIndex,
    completedTurns,
    temporaryRules,
    houseRules,
  }
}

export function publicGame(session: GameSession): PublicGame {
  return {
    players: session.players,
    phase: session.phase,
    currentCard: session.currentCard,
    currentPlayerIndex: session.currentPlayerIndex,
    completedTurns: session.completedTurns,
    temporaryRules: session.temporaryRules,
    houseRules: session.houseRules,
  }
}

function envelope(serialized: string): Record<string, unknown> {
  if (serialized.length > 4 * 1024 * 1024) throw new ProtocolError()
  const message = record(JSON.parse(serialized))
  if (message.version !== 1)
    throw new ProtocolError('These app versions cannot play together. Update both apps.')
  return message
}

export function parseHostMessage(serialized: string): HostMessage {
  const message = envelope(serialized)
  if (message.type === 'ended') return { version: 1, type: 'ended' }
  if (message.type === 'result') {
    const commandId = text(message.commandId)
    if (typeof message.accepted !== 'boolean') throw new ProtocolError()
    if (message.accepted) return { version: 1, type: 'result', commandId, accepted: true }
    if (!rejectionReasons.includes(message.reason as RejectionReason)) throw new ProtocolError()
    return {
      version: 1,
      type: 'result',
      commandId,
      accepted: false,
      reason: message.reason as RejectionReason,
    }
  }
  if (message.type !== 'snapshot') throw new ProtocolError()
  const snapshot = record(message.snapshot)
  const game = parsePublicGame(snapshot.game)
  const assignedPlayerId = text(snapshot.assignedPlayerId)
  if (!game.players.some((player) => player.id === assignedPlayerId)) throw new ProtocolError()
  let currentArtwork: string | undefined
  if (snapshot.currentArtwork !== undefined) {
    currentArtwork = text(snapshot.currentArtwork, 700000)
    if (
      !/^data:image\/jpeg;base64,(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        currentArtwork,
      ) ||
      !game.currentCard?.imageId
    ) {
      throw new ProtocolError()
    }
  }
  return {
    version: 1,
    type: 'snapshot',
    snapshot: {
      roomId: text(snapshot.roomId),
      revision: count(snapshot.revision),
      assignedPlayerId,
      game,
      ...(currentArtwork === undefined ? {} : { currentArtwork }),
    },
  }
}

export function parseGuestMessage(serialized: string): GuestMessage {
  const message = envelope(serialized)
  if (message.type === 'ready') return { version: 1, type: 'ready' }
  if (message.type !== 'command') throw new ProtocolError()
  const command = record(message.command)
  const identity = {
    roomId: text(command.roomId),
    commandId: text(command.commandId),
    expectedRevision: count(command.expectedRevision),
  }
  if (command.action === 'advance') {
    return {
      version: 1,
      type: 'command',
      command: {
        ...identity,
        action: 'advance',
        ...(command.targetId === undefined ? {} : { targetId: text(command.targetId) }),
      },
    }
  }
  if (command.action !== 'house-rule') throw new ProtocolError()
  return {
    version: 1,
    type: 'command',
    command: { ...identity, action: 'house-rule', text: text(command.text, 240).trim() },
  }
}

export function authorizeCommand(
  command: GuestCommand,
  authority: {
    roomId: string
    revision: number
    game: PublicGame
    playerId: string
    busy: boolean
  },
): RejectionReason | null {
  if (command.roomId !== authority.roomId) return 'wrong-room'
  if (command.expectedRevision !== authority.revision) return 'stale'
  if (authority.busy) return 'busy'
  const { game } = authority
  if (command.action === 'house-rule') {
    return game.phase === 'house-rule' &&
      game.players[game.houseRules.length]?.id === authority.playerId
      ? null
      : 'not-your-turn'
  }
  if (game.phase !== 'turn' || game.players[game.currentPlayerIndex]!.id !== authority.playerId)
    return 'not-your-turn'
  const card = game.currentCard!
  if (game.temporaryRules.some((rule) => rule.activatedOnTurn === game.completedTurns)) {
    return command.targetId === undefined ? null : 'invalid-command'
  }
  if (card.kind === 'temporary-rule') {
    if (card.target === 'choose-player') {
      if (!game.players.some((player) => player.id === command.targetId)) return 'invalid-command'
    } else if (
      command.targetId !== undefined &&
      (card.target === 'everyone' || command.targetId !== authority.playerId)
    ) {
      return 'invalid-command'
    }
  } else if (command.targetId !== undefined) return 'invalid-command'
  return null
}
