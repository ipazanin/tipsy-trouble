import { describe, expect, it } from 'vitest'
import { CardValidationError, type CardDefinition } from '@/features/cards/domain/cards'
import {
  completeTurn,
  createGame,
  submitHouseRule,
  type GameSession,
} from '@/features/game/domain/game'
import {
  authorizeCommand,
  parseGuestMessage,
  parseHostMessage,
  ProtocolError,
  publicGame,
  rejectionReasons,
  type GuestCommand,
  type PublicGame,
} from '../protocol'

const players = [
  { id: 'alice', name: 'Alice' },
  { id: 'bob', name: 'Bob' },
]
const prompt: CardDefinition = {
  id: 'story',
  title: 'A story',
  text: 'Tell a short story.',
  contentLocale: 'en',
  kind: 'prompt',
}
const session = createGame(
  players,
  [prompt],
  { specialChance: 0, maxSpecialsPerGame: 0, seed: 'private-seed' },
  () => 0,
)
const game = publicGame(session)
const command: GuestCommand = {
  roomId: 'room-one',
  commandId: 'command-one',
  expectedRevision: 7,
  action: 'advance',
}
const authority = { roomId: 'room-one', revision: 7, playerId: 'alice', busy: false, game }

function hostSnapshot(
  gameChanges: Record<string, unknown> = {},
  snapshotChanges: Record<string, unknown> = {},
) {
  return JSON.stringify({
    version: 1,
    type: 'snapshot',
    snapshot: {
      roomId: 'room-one',
      revision: 7,
      assignedPlayerId: 'alice',
      game: { ...game, ...gameChanges },
      ...snapshotChanges,
    },
  })
}
function guestCommand(changes: Record<string, unknown> = {}) {
  return JSON.stringify({ version: 1, type: 'command', command: { ...command, ...changes } })
}
function temporaryCard(target: 'current-player' | 'choose-player' | 'everyone'): CardDefinition {
  return {
    id: 'quiet',
    title: 'Quiet',
    text: 'Use a quiet voice.',
    contentLocale: 'en',
    kind: 'temporary-rule',
    target,
    duration: { amount: 3, unit: 'turns' },
  }
}
function ruleGame(target: 'current-player' | 'choose-player' | 'everyone'): PublicGame {
  return publicGame(
    createGame(
      players,
      [temporaryCard(target)],
      { specialChance: 0, maxSpecialsPerGame: 0 },
      () => 0,
    ),
  )
}
function dueSession(): GameSession {
  let due = session
  for (let turn = 0; turn < 4; turn++) due = completeTurn(due, () => 0)
  return due
}

describe('public game projection', () => {
  it('shares only the visible state, without the seed, future deck or random state', () => {
    const shared = publicGame(session)
    expect(Object.keys(shared).sort()).toEqual(
      [
        'players',
        'phase',
        'currentCard',
        'currentPlayerIndex',
        'completedTurns',
        'temporaryRules',
        'houseRules',
      ].sort(),
    )
    expect(shared.currentCard).toEqual(prompt)
    expect(shared.players).toEqual(players)
    for (const secret of [
      'settings',
      'seed',
      'randomState',
      'remainingCards',
      'deck',
      'drawnSpecialIds',
      'specialsDrawn',
    ])
      expect(shared).not.toHaveProperty(secret)
    expect(JSON.stringify(shared)).not.toContain('private-seed')
  })
})

describe('network envelopes', () => {
  it('gives protocol errors a stable name and default message', () => {
    expect(new ProtocolError().name).toBe('ProtocolError')
    expect(new ProtocolError().message).toBe('Invalid multiplayer message.')
  })
  it.each(['{', 'null', '[]', 'false', '12', '"text"', 'x'.repeat(4 * 1024 * 1024 + 1)])(
    'rejects malformed or oversized network input %#',
    (serialized) => {
      const expectedError = serialized === '{' ? SyntaxError : ProtocolError
      expect(() => parseHostMessage(serialized)).toThrow(expectedError)
      expect(() => parseGuestMessage(serialized)).toThrow(expectedError)
    },
  )
  it.each([undefined, 0, 2, '1'])('rejects incompatible protocol versions %#', (version) => {
    expect(() => parseHostMessage(JSON.stringify({ version, type: 'ended' }))).toThrow(
      'Update both apps',
    )
    expect(() => parseGuestMessage(JSON.stringify({ version, type: 'ready' }))).toThrow(
      'Update both apps',
    )
  })
  it('accepts ended and ready envelopes, dropping extra fields', () => {
    expect(
      parseHostMessage(JSON.stringify({ version: 1, type: 'ended', extra: 'ignored' })),
    ).toEqual({ version: 1, type: 'ended' })
    expect(
      parseGuestMessage(JSON.stringify({ version: 1, type: 'ready', extra: 'ignored' })),
    ).toEqual({ version: 1, type: 'ready' })
  })
  it('rejects unknown message types', () => {
    expect(() => parseHostMessage('{"version":1,"type":"unknown"}')).toThrow(ProtocolError)
    expect(() => parseGuestMessage('{"version":1,"type":"unknown"}')).toThrow(ProtocolError)
  })
})

describe('host result messages', () => {
  it('accepts successful results without carrying a contradictory rejection reason', () => {
    expect(
      parseHostMessage(
        JSON.stringify({
          version: 1,
          type: 'result',
          commandId: 'one',
          accepted: true,
          reason: 'busy',
        }),
      ),
    ).toEqual({ version: 1, type: 'result', commandId: 'one', accepted: true })
  })
  it.each(rejectionReasons)('accepts the known rejection %s', (reason) => {
    const result = { version: 1, type: 'result', commandId: 'one', accepted: false, reason }
    expect(parseHostMessage(JSON.stringify(result))).toEqual(result)
  })
  it.each([
    { accepted: 'true' },
    { accepted: false },
    { accepted: false, reason: 'unknown' },
    { accepted: true, commandId: '' },
  ])('rejects malformed results %#', (changes) => {
    expect(() =>
      parseHostMessage(
        JSON.stringify({ version: 1, type: 'result', commandId: 'one', ...changes }),
      ),
    ).toThrow(ProtocolError)
  })
})

describe('host snapshots', () => {
  it('round-trips the visible prompt and discards hidden or extra fields sent by a host', () => {
    const parsed = parseHostMessage(
      hostSnapshot({ ...session, secret: 'private' }, { secret: 'private' }),
    )
    expect(parsed).toEqual({
      version: 1,
      type: 'snapshot',
      snapshot: { roomId: 'room-one', revision: 7, assignedPlayerId: 'alice', game },
    })
  })
  it('accepts both scoped and table-wide active rules and the complete house-rule schedule', () => {
    for (const target of ['current-player', 'choose-player', 'everyone'] as const) {
      const started = createGame(
        players,
        [temporaryCard(target)],
        { specialChance: 0, maxSpecialsPerGame: 0 },
        () => 0,
      )
      const advanced = completeTurn(
        started,
        () => 0,
        target === 'choose-player' ? 'bob' : undefined,
      )
      expect(parseHostMessage(hostSnapshot(publicGame(advanced)))).toMatchObject({
        snapshot: { game: publicGame(advanced) },
      })
    }
    let progressed = dueSession()
    expect(parseHostMessage(hostSnapshot(publicGame(progressed)))).toMatchObject({
      snapshot: { game: { phase: 'house-rule', currentCard: null } },
    })
    progressed = submitHouseRule(progressed, 'Say please.', () => 0)
    expect(parseHostMessage(hostSnapshot(publicGame(progressed)))).toMatchObject({
      snapshot: { game: { houseRules: [{ authorId: 'alice', scope: { kind: 'everyone' } }] } },
    })
    for (let turn = 0; turn < 4; turn++) progressed = completeTurn(progressed, () => 0)
    progressed = submitHouseRule(progressed, 'Say thanks.', () => 0)
    for (let turn = 0; turn < 5; turn++) progressed = completeTurn(progressed, () => 0)
    expect(parseHostMessage(hostSnapshot(publicGame(progressed)))).toMatchObject({
      snapshot: { game: { houseRules: [{ authorId: 'alice' }, { authorId: 'bob' }] } },
    })
  })
  it.each([
    { roomId: '' },
    { roomId: 'x'.repeat(101) },
    { roomId: 12 },
    { revision: -1 },
    { revision: 1.5 },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { revision: '7' },
    { assignedPlayerId: 'absent' },
    { assignedPlayerId: null },
    { game: null },
  ])('rejects invalid snapshot identities or counters %#', (changes) => {
    expect(() => parseHostMessage(hostSnapshot({}, changes))).toThrow(ProtocolError)
  })
  it.each([
    { players: null },
    { players: [] },
    { players: [players[0]] },
    { players: [players[0], players[0]] },
    { players: Array(101).fill(players[0]) },
    { players: [null, players[1]] },
    { players: [{ id: '', name: 'Alice' }, players[1]] },
    { players: [{ id: 'alice', name: 'x'.repeat(81) }, players[1]] },
    { completedTurns: -1 },
    { completedTurns: null },
    { currentPlayerIndex: 2 },
    { currentPlayerIndex: 1 },
    { phase: 'other' },
    { currentCard: null },
    { phase: 'house-rule' },
    { currentCard: { ...prompt, text: '' } },
    { houseRules: null },
    { houseRules: Array(3).fill({}) },
    { temporaryRules: null },
    { temporaryRules: Array(10001).fill(null) },
  ])('rejects malformed visible game states %#', (changes) => {
    expect(() => parseHostMessage(hostSnapshot(changes))).toThrow(
      'currentCard' in changes && changes.currentCard ? CardValidationError : ProtocolError,
    )
  })
  it.each([
    { id: 'wrong' },
    { authorId: 'bob' },
    { scope: { kind: 'player', playerId: 'alice' } },
    { scope: { kind: 'player', playerId: 'absent' } },
    { scope: { kind: 'unknown' } },
    { scope: null },
    { text: ' ' },
  ])('rejects malformed or non-global house rules %#', (changes) => {
    const rule = {
      id: 'house-0',
      authorId: 'alice',
      text: 'Say please.',
      scope: { kind: 'everyone' },
      ...changes,
    }
    expect(() => parseHostMessage(hostSnapshot({ completedTurns: 4, houseRules: [rule] }))).toThrow(
      ProtocolError,
    )
  })
  it.each([
    { completedTurns: 4, houseRules: [] },
    { phase: 'house-rule', currentCard: null, completedTurns: 0 },
    { phase: 'house-rule', currentCard: null, completedTurns: 5, currentPlayerIndex: 1 },
    {
      phase: 'house-rule',
      currentCard: null,
      completedTurns: 12,
      houseRules: [
        { id: 'house-0', authorId: 'alice', text: 'A rule.', scope: { kind: 'everyone' } },
      ],
    },
  ])('rejects inconsistent house-rule timing %#', (changes) => {
    expect(() => parseHostMessage(hostSnapshot(changes))).toThrow(ProtocolError)
  })
  it.each([
    { id: 'wrong' },
    { activatedOnTurn: 2 },
    { remainingTurns: 0 },
    { remainingTurns: 10001 },
    { cardId: '' },
    { text: 'x'.repeat(241) },
    { scope: { kind: 'player', playerId: 'absent' } },
  ])('rejects malformed temporary rules %#', (changes) => {
    const rule = {
      id: 'temporary-0',
      cardId: 'quiet',
      text: 'Be quiet.',
      scope: { kind: 'everyone' },
      remainingTurns: 3,
      activatedOnTurn: 0,
      ...changes,
    }
    expect(() =>
      parseHostMessage(
        hostSnapshot({ completedTurns: 1, currentPlayerIndex: 1, temporaryRules: [rule] }),
      ),
    ).toThrow(ProtocolError)
  })
  it('rejects duplicate temporary activations', () => {
    const rule = {
      id: 'temporary-0',
      cardId: 'quiet',
      text: 'Be quiet.',
      scope: { kind: 'everyone' },
      remainingTurns: 3,
      activatedOnTurn: 0,
    }
    expect(() =>
      parseHostMessage(
        hostSnapshot({ completedTurns: 1, currentPlayerIndex: 1, temporaryRules: [rule, rule] }),
      ),
    ).toThrow(ProtocolError)
  })
  it('preserves a valid legacy activation on the current temporary card', () => {
    const legacy = {
      ...ruleGame('choose-player'),
      temporaryRules: [
        {
          id: 'temporary-0',
          cardId: 'quiet',
          text: 'Use a quiet voice.',
          scope: { kind: 'player', playerId: 'bob' },
          remainingTurns: 3,
          activatedOnTurn: 0,
        },
      ],
    }
    expect(parseHostMessage(hostSnapshot(legacy))).toMatchObject({ snapshot: { game: legacy } })
  })
  it.each([
    { currentCard: prompt, cardId: prompt.id },
    { currentCard: temporaryCard('choose-player'), cardId: 'other-card' },
    { currentCard: null, cardId: 'quiet', phase: 'house-rule', completedTurns: 4 },
  ])(
    'rejects a current activation without its matching temporary card %#',
    ({ currentCard, cardId, phase = 'turn', completedTurns = 0 }) => {
      const rule = {
        id: `temporary-${completedTurns}`,
        cardId,
        text: 'Use a quiet voice.',
        scope: { kind: 'player', playerId: 'bob' },
        remainingTurns: 3,
        activatedOnTurn: completedTurns,
      }
      expect(() =>
        parseHostMessage(
          hostSnapshot({ currentCard, phase, completedTurns, temporaryRules: [rule] }),
        ),
      ).toThrow(ProtocolError)
    },
  )

  it('accepts local JPEG artwork only when the displayed card declares an image', () => {
    const currentArtwork = 'data:image/jpeg;base64,/9j/2Q=='
    expect(
      parseHostMessage(
        hostSnapshot({ currentCard: { ...prompt, imageId: 'image-1' } }, { currentArtwork }),
      ),
    ).toMatchObject({ snapshot: { currentArtwork } })
    expect(() => parseHostMessage(hostSnapshot({}, { currentArtwork }))).toThrow(ProtocolError)
    for (const artwork of [
      'https://example.com/photo.jpg',
      'data:image/svg+xml;base64,PHN2Zy8+',
      'data:image/jpeg;base64,A',
      'data:image/jpeg;base64,AAAAA=',
      'data:image/jpeg;base64,AAAA====',
      '',
      'x'.repeat(700001),
    ]) {
      expect(() =>
        parseHostMessage(
          hostSnapshot(
            { currentCard: { ...prompt, imageId: 'image-1' } },
            { currentArtwork: artwork },
          ),
        ),
      ).toThrow(ProtocolError)
    }
  })
})

describe('guest commands', () => {
  it('accepts advance commands with optional target and trims submitted rule text', () => {
    expect(parseGuestMessage(guestCommand())).toEqual({ version: 1, type: 'command', command })
    expect(parseGuestMessage(guestCommand({ targetId: 'bob' }))).toEqual({
      version: 1,
      type: 'command',
      command: { ...command, targetId: 'bob' },
    })
    expect(
      parseGuestMessage(guestCommand({ action: 'house-rule', text: '  Say please.  ' })),
    ).toEqual({
      version: 1,
      type: 'command',
      command: {
        roomId: 'room-one',
        commandId: 'command-one',
        expectedRevision: 7,
        action: 'house-rule',
        text: 'Say please.',
      },
    })
  })
  it.each([
    { action: 'unknown' },
    { action: 'house-rule', text: '' },
    { action: 'house-rule', text: 'x'.repeat(241) },
    { roomId: null },
    { commandId: ' ' },
    { expectedRevision: -1 },
    { targetId: '' },
  ])('rejects malformed command payloads %#', (changes) => {
    expect(() => parseGuestMessage(guestCommand(changes))).toThrow(ProtocolError)
  })
})

describe('host command authorization', () => {
  it('rejects another room, stale revision and a busy host before applying any action', () => {
    expect(authorizeCommand({ ...command, roomId: 'another' }, authority)).toBe('wrong-room')
    expect(authorizeCommand({ ...command, expectedRevision: 6 }, authority)).toBe('stale')
    expect(authorizeCommand(command, { ...authority, busy: true })).toBe('busy')
  })
  it('permits only the current player to advance and rejects targets on ordinary prompts', () => {
    expect(authorizeCommand(command, authority)).toBeNull()
    expect(authorizeCommand(command, { ...authority, playerId: 'bob' })).toBe('not-your-turn')
    expect(authorizeCommand(command, { ...authority, game: publicGame(dueSession()) })).toBe(
      'not-your-turn',
    )
    expect(authorizeCommand({ ...command, targetId: 'alice' }, authority)).toBe('invalid-command')
  })
  it('permits the scheduled author, rather than the nominal turn player, to submit each house rule', () => {
    const houseCommand: GuestCommand = {
      roomId: 'room-one',
      commandId: 'house',
      expectedRevision: 7,
      action: 'house-rule',
      text: 'Say please.',
    }
    const firstDue = publicGame(dueSession())
    expect(authorizeCommand(houseCommand, { ...authority, game: firstDue })).toBeNull()
    expect(authorizeCommand(houseCommand, { ...authority, game: firstDue, playerId: 'bob' })).toBe(
      'not-your-turn',
    )
    expect(authorizeCommand(houseCommand, authority)).toBe('not-your-turn')
    let nextDue = submitHouseRule(dueSession(), 'Say please.', () => 0)
    for (let turn = 0; turn < 4; turn++) nextDue = completeTurn(nextDue, () => 0)
    expect(nextDue.currentPlayerIndex).toBe(0)
    expect(
      authorizeCommand(houseCommand, { ...authority, game: publicGame(nextDue), playerId: 'bob' }),
    ).toBeNull()
    expect(authorizeCommand(houseCommand, { ...authority, game: publicGame(nextDue) })).toBe(
      'not-your-turn',
    )
    expect(
      authorizeCommand(houseCommand, {
        ...authority,
        game: {
          ...firstDue,
          houseRules: [
            ...firstDue.houseRules,
            { id: 'house-0', authorId: 'alice', text: 'A', scope: { kind: 'everyone' } },
            { id: 'house-1', authorId: 'bob', text: 'B', scope: { kind: 'everyone' } },
          ],
        },
      }),
    ).toBe('not-your-turn')
  })
  it('resumes a legacy activated current card without allowing a target change', () => {
    const legacy: PublicGame = {
      ...ruleGame('choose-player'),
      temporaryRules: [
        {
          id: 'temporary-0',
          cardId: 'quiet',
          text: 'Use a quiet voice.',
          scope: { kind: 'player', playerId: 'bob' },
          remainingTurns: 3,
          activatedOnTurn: 0,
        },
      ],
    }
    expect(authorizeCommand(command, { ...authority, game: legacy })).toBeNull()
    expect(authorizeCommand({ ...command, targetId: 'bob' }, { ...authority, game: legacy })).toBe(
      'invalid-command',
    )
    const advanced = { ...legacy, completedTurns: 1, currentPlayerIndex: 1 }
    expect(
      authorizeCommand(
        { ...command, targetId: 'alice' },
        { ...authority, game: advanced, playerId: 'bob' },
      ),
    ).toBeNull()
  })

  it('enforces the target contract for every temporary rule scope', () => {
    const chosen = { ...authority, game: ruleGame('choose-player') }
    expect(authorizeCommand(command, chosen)).toBe('invalid-command')
    expect(authorizeCommand({ ...command, targetId: 'absent' }, chosen)).toBe('invalid-command')
    expect(authorizeCommand({ ...command, targetId: 'bob' }, chosen)).toBeNull()
    const current = { ...authority, game: ruleGame('current-player') }
    expect(authorizeCommand(command, current)).toBeNull()
    expect(authorizeCommand({ ...command, targetId: 'alice' }, current)).toBeNull()
    expect(authorizeCommand({ ...command, targetId: 'bob' }, current)).toBe('invalid-command')
    const everyone = { ...authority, game: ruleGame('everyone') }
    expect(authorizeCommand(command, everyone)).toBeNull()
    expect(authorizeCommand({ ...command, targetId: 'alice' }, everyone)).toBe('invalid-command')
  })
})
