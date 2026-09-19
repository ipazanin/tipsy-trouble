import { describe, expect, it } from 'vitest'
import type { CardDefinition } from '../../../cards/domain/cards'
import {
  GameError,
  completeTurn,
  createGame,
  getCurrentPlayer,
  getHouseRuleAuthor,
  getPlayerRules,
  parseGameSession,
  submitHouseRule,
  type GameSession,
} from '../game'

const random = () => 0.999
const players = ['A', 'B', 'C', 'D'].map((name) => ({ id: name, name }))
const prompt = (id: string): CardDefinition => ({
  id,
  kind: 'prompt',
  title: id,
  text: 'Tell a story.',
  contentLocale: 'en',
})
const temporary = (
  target: 'current-player' | 'everyone' | 'choose-player' = 'current-player',
  unit: 'turns' | 'circles' = 'turns',
  amount = 2,
): CardDefinition => ({
  id: 'rule',
  kind: 'temporary-rule',
  title: 'Quiet voice',
  text: 'Use a quiet voice.',
  contentLocale: 'en',
  target,
  duration: { amount, unit },
})

function advance(session: GameSession, turns: number): GameSession {
  for (let turn = 0; turn < turns; turn++)
    session = completeTurn(
      session,
      random,
      session.currentCard?.kind === 'temporary-rule' &&
        session.currentCard.target === 'choose-player'
        ? 'C'
        : undefined,
    )
  return session
}

describe('turns and scheduled house rules', () => {
  it('rotates authors after circles 2, 4, 6 and 8, then stops without consuming turns', () => {
    let session = createGame(players, [prompt('story')], undefined, random)
    for (const [index, author] of players.entries()) {
      session = advance(session, 8)
      expect(session.completedTurns).toBe((index + 1) * 8)
      expect(session.currentCard).toBeNull()
      expect(getHouseRuleAuthor(session)).toEqual(author)
      expect(() => completeTurn(session, random)).toThrow('Create the scheduled house rule')
      const before = session.completedTurns
      session = submitHouseRule(session, ` Rule ${index + 1} `, random)
      expect(session.completedTurns).toBe(before)
      expect(getCurrentPlayer(session).id).toBe('A')
      expect(session.houseRules[index]?.text).toBe(`Rule ${index + 1}`)
      expect(parseGameSession(JSON.parse(JSON.stringify(session)))).toEqual(session)
    }
    session = advance(session, 16)
    expect(session.phase).toBe('turn')
    expect(session.houseRules).toHaveLength(4)
  })

  it('completing a prompt consumes exactly one card and one player turn', () => {
    const original = createGame(players, [prompt('one'), prompt('two')], undefined, random)
    const next = completeTurn(original, random)
    expect(next.completedTurns).toBe(1)
    expect(getCurrentPlayer(next).id).toBe('B')
    expect(next.currentCard?.id).toBe('two')
    expect(original.completedTurns).toBe(0)
    expect(original.currentCard?.id).toBe('one')
  })

  it('rejects invalid roster, house-rule text and premature submission', () => {
    expect(() => createGame(players.slice(0, 1), [prompt('one')], undefined, random)).toThrow(
      GameError,
    )
    expect(() =>
      createGame([players[0]!, players[0]!], [prompt('one')], undefined, random),
    ).toThrow(GameError)
    let session = createGame(players, [prompt('one')], undefined, random)
    expect(() => submitHouseRule(session, 'Rule', random)).toThrow('No house rule')
    session = advance(session, 8)
    for (const text of ['', '   ', 'x'.repeat(241)]) {
      expect(() => submitHouseRule(session, text, random)).toThrow(GameError)
    }
    session = submitHouseRule(session, 'Tell a joke.', random)
    expect(session.houseRules[0]?.scope).toEqual({ kind: 'everyone' })
    expect(getPlayerRules(session, 'C').houseRules).toHaveLength(1)
    expect(getPlayerRules(session, 'B').houseRules).toHaveLength(1)
  })
})

describe('temporary rule lifetimes', () => {
  it('does not decrement on activation or its creating turn, then expires after future turns', () => {
    let session = createGame(
      players,
      [temporary(), prompt('one'), prompt('two')],
      undefined,
      random,
    )
    session = completeTurn(session, random)
    expect(session.completedTurns).toBe(1)
    expect(getCurrentPlayer(session).id).toBe('B')
    expect(session.temporaryRules[0]?.remainingTurns).toBe(2)
    expect(session.temporaryRules[0]?.scope).toEqual({ kind: 'player', playerId: 'A' })
    session = completeTurn(session, random)
    expect(session.temporaryRules[0]?.remainingTurns).toBe(1)
    session = completeTurn(session, random)
    expect(session.temporaryRules).toEqual([])
  })

  it('counts a circle as the fixed roster length and leaves timers unchanged during authoring', () => {
    let session = createGame(
      players,
      [
        prompt('one'),
        prompt('two'),
        prompt('three'),
        prompt('four'),
        prompt('five'),
        prompt('six'),
        prompt('seven'),
        temporary('everyone', 'circles', 1),
      ],
      undefined,
      random,
    )
    session = advance(session, 7)
    session = completeTurn(session, random)
    expect(session.phase).toBe('house-rule')
    expect(session.temporaryRules[0]?.remainingTurns).toBe(4)
    expect(parseGameSession(JSON.parse(JSON.stringify(session)))).toEqual(session)
    session = submitHouseRule(session, 'Say please.', random)
    expect(session.temporaryRules[0]?.remainingTurns).toBe(4)
    expect(getPlayerRules(session, 'D').temporaryRules).toHaveLength(1)
    session = advance(session, 3)
    expect(session.temporaryRules[0]?.remainingTurns).toBe(1)
    session = advance(session, 1)
    expect(session.temporaryRules).toEqual([])
  })

  it('requires valid chosen targets and activates the chosen rule while advancing', () => {
    let session = createGame(players, [temporary('choose-player')], undefined, random)
    expect(() => completeTurn(session, random)).toThrow('Choose a player')
    expect(() => completeTurn(session, random, 'absent')).toThrow(GameError)
    session = completeTurn(session, random, 'D')
    expect(getPlayerRules(session, 'D').temporaryRules).toHaveLength(1)
    expect(getPlayerRules(session, 'A').temporaryRules).toHaveLength(0)
    expect(session.completedTurns).toBe(1)
    expect(session.temporaryRules[0]?.remainingTurns).toBe(2)
  })

  it('does not allow overriding fixed rule targets', () => {
    const current = createGame(players, [temporary()], undefined, random)
    const everyone = createGame(players, [temporary('everyone')], undefined, random)
    expect(() => completeTurn(current, random, 'B')).toThrow(GameError)
    expect(() => completeTurn(everyone, random, 'A')).toThrow(GameError)
  })
})

describe('draws and special cards', () => {
  it('draws without replacement and reshuffles only after the ordinary deck is exhausted', () => {
    let session = createGame(
      players,
      [prompt('one'), prompt('two'), prompt('three')],
      undefined,
      random,
    )
    const firstPass: string[] = []
    for (let count = 0; count < 3; count++) {
      firstPass.push(session.currentCard!.id)
      session = completeTurn(session, random)
    }
    expect(new Set(firstPass).size).toBe(3)
    expect(session.currentCard?.id).not.toBe(firstPass[2])
    expect(session.remainingCards).toHaveLength(2)
  })

  it('uses one-percent specials by default and caps them at one per game', () => {
    const special: CardDefinition = { ...prompt('special'), kind: 'special' }
    const defaults = createGame(players, [prompt('one'), special], undefined, () => 0)
    expect(defaults.settings).toEqual({ specialChance: 0.01, maxSpecialsPerGame: 1 })
    expect(defaults.currentCard?.kind).toBe('special')
    let disabled = createGame(
      players,
      [prompt('one'), special],
      { specialChance: 0, maxSpecialsPerGame: 1 },
      () => 0,
    )
    disabled = advance(disabled, 7)
    expect(disabled.specialsDrawn).toBe(0)
    let enabled = createGame(
      players,
      [prompt('one'), special],
      { specialChance: 1, maxSpecialsPerGame: 1 },
      () => 0,
    )
    expect(enabled.currentCard?.kind).toBe('special')
    for (let index = 0; index < 7; index++) {
      enabled = completeTurn(enabled, random)
      expect(enabled.currentCard?.kind).toBe('prompt')
    }
    expect(enabled.specialsDrawn).toBe(1)
  })

  it('supports cap zero and two unique specials without repeats after reshuffles', () => {
    const special: CardDefinition = { ...prompt('special'), kind: 'special' }
    const second: CardDefinition = { ...prompt('second-special'), kind: 'special' }
    const deck = [prompt('story'), special, second]
    let disabled = createGame(players, deck, { specialChance: 1, maxSpecialsPerGame: 0 }, () => 0)
    disabled = advance(disabled, 7)
    expect(disabled.specialsDrawn).toBe(0)
    let enabled = createGame(players, deck, { specialChance: 1, maxSpecialsPerGame: 2 }, () => 0)
    expect(enabled.currentCard?.id).toBe('special')
    enabled = completeTurn(enabled, () => 0)
    expect(enabled.currentCard?.id).toBe('second-special')
    expect(parseGameSession(JSON.parse(JSON.stringify(enabled)))).toEqual(enabled)
    enabled = advance(enabled, 6)
    expect(enabled.currentCard?.kind).toBe('prompt')
    expect(enabled.drawnSpecialIds).toEqual(['special', 'second-special'])
    expect(enabled.specialsDrawn).toBe(2)
  })

  it.each([-1, 1.5, 11, NaN])('rejects invalid special cap %s', (maxSpecialsPerGame) => {
    expect(() =>
      createGame(players, [prompt('one')], { specialChance: 1, maxSpecialsPerGame }, random),
    ).toThrow('special card limit')
  })

  it.each([-0.1, 1, NaN, Infinity])('rejects invalid injected random samples %s', (sample) => {
    expect(() =>
      createGame(players, [prompt('one'), prompt('two')], undefined, () => sample),
    ).toThrow('Random samples')
  })
})

describe('session restoration', () => {
  it('normalizes legacy player-scoped house rules without changing the live turn or timers', () => {
    let session = createGame(
      players,
      [prompt('story'), temporary('choose-player', 'circles', 5)],
      undefined,
      random,
    )
    session = advance(session, 7)
    session = completeTurn(session, random, 'C')
    session = submitHouseRule(session, 'Say please.', random)
    const legacy = JSON.parse(JSON.stringify(session))
    legacy.houseRules[0].scope = { kind: 'player', playerId: 'C' }
    const restored = parseGameSession(legacy)
    expect(restored).toEqual(session)
    expect(restored.temporaryRules[0]?.scope).toEqual({ kind: 'player', playerId: 'C' })
    for (const player of players)
      expect(getPlayerRules(restored, player.id).houseRules).toHaveLength(1)
    legacy.houseRules[0].scope.playerId = 'absent'
    expect(() => parseGameSession(legacy)).toThrow(GameError)
  })

  it('preserves current activation and prevents a second application after JSON roundtrip', () => {
    const original = createGame(players, [temporary('choose-player')], undefined, random)
    const session: GameSession = {
      ...original,
      temporaryRules: [
        {
          id: 'temporary-0',
          cardId: 'rule',
          text: 'Use a quiet voice.',
          scope: { kind: 'player', playerId: 'C' },
          remainingTurns: 2,
          activatedOnTurn: 0,
        },
      ],
    }
    const restored = parseGameSession(JSON.parse(JSON.stringify(session)))
    expect(restored).toEqual(session)
    const advanced = completeTurn(restored, random)
    expect(advanced.temporaryRules).toEqual(session.temporaryRules)
    expect(advanced.completedTurns).toBe(1)
  })

  it('rejects inconsistent counters, deck, targeting, lifetime and duplicated activations', () => {
    const session = completeTurn(
      createGame(players, [temporary(), prompt('story')], undefined, random),
      random,
    )
    const rule = session.temporaryRules[0]!
    const invalid = [
      null,
      { ...session, completedTurns: -1 },
      { ...session, currentPlayerIndex: 2 },
      { ...session, phase: 'house-rule' },
      { ...session, currentCard: prompt('unknown') },
      { ...session, remainingCards: [session.currentCard] },
      { ...session, temporaryRules: [rule, rule] },
      { ...session, temporaryRules: [{ ...rule, remainingTurns: 99 }] },
      { ...session, temporaryRules: [{ ...rule, scope: { kind: 'player', playerId: 'B' } }] },
      { ...session, specialsDrawn: 2 },
    ]
    for (const candidate of invalid) expect(() => parseGameSession(candidate)).toThrow(GameError)
  })
})

describe('seeded games', () => {
  const deck: CardDefinition[] = [
    prompt('one'),
    prompt('two'),
    prompt('three'),
    temporary('everyone'),
    { ...prompt('surprise'), kind: 'special' },
  ]
  const seededSettings = { seed: 'Saturday evening', specialChance: 0.3, maxSpecialsPerGame: 1 }
  const unusedRandom = () => {
    throw new Error('Seeded draws must not call the external random source.')
  }

  function progress(session: GameSession): GameSession {
    return session.phase === 'house-rule'
      ? submitHouseRule(session, 'Say please.', unusedRandom)
      : completeTurn(session, unusedRandom)
  }

  it('replays the same deck and settings across reshuffles, special draws, house rules and reloads', () => {
    let first = createGame(players, deck, seededSettings, unusedRandom)
    let replay = createGame(
      players,
      deck,
      { ...seededSettings, seed: '  Saturday evening  ' },
      unusedRandom,
    )
    for (let turn = 0; turn < 40; turn++) {
      expect(first).toEqual(replay)
      expect(first.randomState).toBeGreaterThan(0)
      first = progress(first)
      replay = progress(parseGameSession(JSON.parse(JSON.stringify(replay))))
    }
    expect(first.specialsDrawn).toBe(1)
    expect(first.houseRules).toHaveLength(players.length)
  })

  it('preserves state before a transition so retrying it produces the same result', () => {
    const session = createGame(players, deck, seededSettings, unusedRandom)
    const originalState = session.randomState
    expect(completeTurn(session, unusedRandom)).toEqual(completeTurn(session, unusedRandom))
    expect(session.randomState).toBe(originalState)
    const other = createGame(
      players,
      deck,
      { ...seededSettings, seed: 'Sunday evening' },
      unusedRandom,
    )
    expect(other.randomState).not.toBe(originalState)
  })

  it.each(['', ' ', 'x'.repeat(81), null, 42])('rejects invalid host seed %#', (seed) => {
    expect(() =>
      createGame(players, deck, { ...seededSettings, seed: seed as string }, random),
    ).toThrow('game seed')
  })

  it.each([undefined, null, 0, -1, 0.5, 4294967296, '10'])(
    'rejects missing or invalid persisted random state %#',
    (randomState) => {
      const session = createGame(players, deck, seededSettings, unusedRandom)
      expect(() => parseGameSession({ ...session, randomState })).toThrow(GameError)
    },
  )

  it('keeps legacy games unseeded and rejects orphaned random state', () => {
    const session = createGame(players, [prompt('one')], undefined, random)
    expect(parseGameSession(JSON.parse(JSON.stringify(session)))).not.toHaveProperty('randomState')
    expect(() => parseGameSession({ ...session, randomState: 12 })).toThrow('requires a game seed')
    expect(
      createGame(players, deck, { ...seededSettings, seed: 'x'.repeat(80) }, unusedRandom).settings
        .seed,
    ).toHaveLength(80)
  })
})

describe('game input and restoration boundaries', () => {
  it.each([-1, 1.1, NaN, Infinity])('rejects invalid special probability %s', (specialChance) => {
    expect(() =>
      createGame(players, [prompt('one')], { specialChance, maxSpecialsPerGame: 1 }, random),
    ).toThrow('Special card chance')
  })

  it.each([
    { id: '', name: 'A' },
    { id: ' '.repeat(3), name: 'A' },
    { id: 'x'.repeat(101), name: 'A' },
    { id: 'A', name: '' },
    { id: 'A', name: ' ' },
    { id: 'A', name: 'x'.repeat(81) },
  ])('rejects invalid roster entries %#', (invalid) => {
    expect(() => createGame([invalid, players[1]!], [prompt('one')], undefined, random)).toThrow(
      'unique IDs and names',
    )
  })

  it('accepts roster limits and prevents the last card repeating across a reshuffle', () => {
    const roster = Array.from({ length: 100 }, (_, index) => ({ id: String(index), name: ' x ' }))
    expect(createGame(roster, [prompt('one')], undefined, random).players[0]?.name).toBe('x')
    expect(() =>
      createGame([...roster, { id: '101', name: 'x' }], [prompt('one')], undefined, random),
    ).toThrow('between 2 and 100')
    const initial = createGame(players, [prompt('one'), prompt('two')], undefined, random)
    const second = completeTurn(initial, random)
    const shuffled = completeTurn(second, () => 0)
    expect(shuffled.currentCard?.id).toBe('one')
    expect(shuffled.remainingCards.map((card) => card.id)).toEqual(['two'])
  })

  it('rejects malformed records, lists, texts, phases and settings before restoring', () => {
    const session = createGame(players, [prompt('one'), prompt('two')], undefined, random)
    const invalid = [
      [],
      'game',
      { ...session, players: {} },
      { ...session, players: [null] },
      { ...session, players: [{ id: 12, name: 'A' }, players[1]] },
      { ...session, players: [{ id: 'A', name: '' }, players[1]] },
      { ...session, settings: {} },
      { ...session, settings: { specialChance: 0 } },
      { ...session, phase: 'finished' },
      { ...session, currentCard: null },
      { ...session, remainingCards: [session.remainingCards[0], session.remainingCards[0]] },
      { ...session, currentCard: { ...session.currentCard, text: 'Changed after dealing' } },
    ]
    for (const candidate of invalid) expect(() => parseGameSession(candidate)).toThrow(GameError)
  })

  it('rejects unavailable, duplicate and inconsistent saved special draws', () => {
    const special: CardDefinition = { ...prompt('special'), kind: 'special' }
    const other: CardDefinition = { ...prompt('other-special'), kind: 'special' }
    const session = createGame(
      players,
      [prompt('one'), special, other],
      { specialChance: 1, maxSpecialsPerGame: 2 },
      () => 0,
    )
    const invalid = [
      { ...session, settings: { specialChance: 0, maxSpecialsPerGame: 2 } },
      { ...session, drawnSpecialIds: ['absent'] },
      { ...session, drawnSpecialIds: ['special', 'special'], specialsDrawn: 2 },
      { ...session, drawnSpecialIds: ['other-special'] },
      {
        ...session,
        currentCard: prompt('one'),
        remainingCards: [],
        drawnSpecialIds: ['special', 'other-special'],
        specialsDrawn: 2,
      },
      { ...session, remainingCards: [other] },
    ]
    for (const candidate of invalid) expect(() => parseGameSession(candidate)).toThrow(GameError)
  })

  it('rejects house rule scope, author order and schedule corruption', () => {
    const due = advance(createGame(players, [prompt('one')], undefined, random), 8)
    const submitted = submitHouseRule(due, 'Say please.', random)
    const houseRule = submitted.houseRules[0]!
    const invalid = [
      { ...submitted, houseRules: [{ ...houseRule, scope: { kind: 'unknown' } }] },
      { ...submitted, houseRules: [{ ...houseRule, authorId: 'B' }] },
      { ...submitted, houseRules: [{ ...houseRule, id: 'house-1' }] },
      { ...submitted, houseRules: [] },
      { ...due, completedTurns: 7, currentPlayerIndex: 3 },
      { ...due, completedTurns: 0 },
    ]
    for (const candidate of invalid) expect(() => parseGameSession(candidate)).toThrow(GameError)
  })

  it('rejects temporary activations that disagree with deck, current card, target or timing', () => {
    const session = completeTurn(
      createGame(players, [temporary('choose-player'), prompt('one')], undefined, random),
      random,
      'C',
    )
    const rule = session.temporaryRules[0]!
    const invalid = [
      { ...session, temporaryRules: [{ ...rule, cardId: 'one' }] },
      { ...session, temporaryRules: [{ ...rule, cardId: 'absent' }] },
      { ...session, temporaryRules: [{ ...rule, activatedOnTurn: 2 }] },
      { ...session, temporaryRules: [{ ...rule, id: 'temporary-99' }] },
      { ...session, temporaryRules: [{ ...rule, text: 'Changed rule' }] },
      { ...session, temporaryRules: [{ ...rule, remainingTurns: 0 }] },
      { ...session, temporaryRules: [{ ...rule, scope: { kind: 'everyone' } }] },
      { ...session, temporaryRules: [{ ...rule, activatedOnTurn: 1, id: 'temporary-1' }] },
    ]
    for (const candidate of invalid) expect(() => parseGameSession(candidate)).toThrow(GameError)
  })
})
