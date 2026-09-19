import { describe, expect, it } from 'vitest'
import type { CardDefinition } from '../../../cards/domain/cards'
import {
  GameError,
  activateCurrentRule,
  completeTurn,
  createGame,
  getCurrentPlayer,
  getHouseRuleAuthor,
  getPlayerRules,
  parseGameSession,
  skipCurrentCard,
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
  for (let turn = 0; turn < turns; turn++) session = skipCurrentCard(session, random)
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
      expect(() => skipCurrentCard(session, random)).toThrow('Create the scheduled house rule')
      expect(() => completeTurn(session, random)).toThrow('Create the scheduled house rule')
      const before = session.completedTurns
      session = submitHouseRule(session, ` Rule ${index + 1} `, undefined, random)
      expect(session.completedTurns).toBe(before)
      expect(getCurrentPlayer(session).id).toBe('A')
      expect(session.houseRules[index]?.text).toBe(`Rule ${index + 1}`)
      expect(parseGameSession(JSON.parse(JSON.stringify(session)))).toEqual(session)
    }
    session = advance(session, 16)
    expect(session.phase).toBe('turn')
    expect(session.houseRules).toHaveLength(4)
  })

  it('skips consume exactly one card and one player turn', () => {
    const original = createGame(players, [prompt('one'), prompt('two')], undefined, random)
    const next = skipCurrentCard(original, random)
    expect(next.completedTurns).toBe(1)
    expect(getCurrentPlayer(next).id).toBe('B')
    expect(next.currentCard?.id).toBe('two')
    expect(original.completedTurns).toBe(0)
    expect(original.currentCard?.id).toBe('one')
  })

  it('rejects invalid roster, house-rule text, targets and premature submission', () => {
    expect(() => createGame(players.slice(0, 1), [prompt('one')], undefined, random)).toThrow(
      GameError,
    )
    expect(() =>
      createGame([players[0]!, players[0]!], [prompt('one')], undefined, random),
    ).toThrow(GameError)
    let session = createGame(players, [prompt('one')], undefined, random)
    expect(() => submitHouseRule(session, 'Rule', undefined, random)).toThrow('No house rule')
    session = advance(session, 8)
    for (const text of ['', '   ', 'x'.repeat(241)]) {
      expect(() => submitHouseRule(session, text, undefined, random)).toThrow(GameError)
    }
    expect(() => submitHouseRule(session, 'Rule', 'absent', random)).toThrow(GameError)
    session = submitHouseRule(session, 'Tell a joke.', 'C', random)
    expect(getPlayerRules(session, 'C').houseRules).toHaveLength(1)
    expect(getPlayerRules(session, 'B').houseRules).toHaveLength(0)
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
    expect(() => completeTurn(session, random)).toThrow('Activate this rule')
    session = activateCurrentRule(session)
    expect(session.temporaryRules[0]?.remainingTurns).toBe(2)
    expect(session.temporaryRules[0]?.scope).toEqual({ kind: 'player', playerId: 'A' })
    expect(() => activateCurrentRule(session)).toThrow('already active')
    session = completeTurn(session, random)
    expect(session.temporaryRules[0]?.remainingTurns).toBe(2)
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
    session = activateCurrentRule(session)
    session = completeTurn(session, random)
    expect(session.phase).toBe('house-rule')
    expect(session.temporaryRules[0]?.remainingTurns).toBe(4)
    expect(parseGameSession(JSON.parse(JSON.stringify(session)))).toEqual(session)
    session = submitHouseRule(session, 'Say please.', undefined, random)
    expect(session.temporaryRules[0]?.remainingTurns).toBe(4)
    expect(getPlayerRules(session, 'D').temporaryRules).toHaveLength(1)
    session = advance(session, 3)
    expect(session.temporaryRules[0]?.remainingTurns).toBe(1)
    session = advance(session, 1)
    expect(session.temporaryRules).toEqual([])
  })

  it('requires valid chosen targets and removes an activation when its card is skipped', () => {
    let session = createGame(players, [temporary('choose-player')], undefined, random)
    expect(() => activateCurrentRule(session)).toThrow('Choose a player')
    expect(() => activateCurrentRule(session, 'absent')).toThrow(GameError)
    session = activateCurrentRule(session, 'D')
    expect(getPlayerRules(session, 'D').temporaryRules).toHaveLength(1)
    expect(getPlayerRules(session, 'A').temporaryRules).toHaveLength(0)
    session = skipCurrentCard(session, random)
    expect(session.temporaryRules).toEqual([])
  })

  it('does not allow overriding fixed rule targets', () => {
    const current = createGame(players, [temporary()], undefined, random)
    const everyone = createGame(players, [temporary('everyone')], undefined, random)
    expect(() => activateCurrentRule(current, 'B')).toThrow(GameError)
    expect(() => activateCurrentRule(everyone, 'A')).toThrow(GameError)
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
  it('preserves current activation and prevents a second application after JSON roundtrip', () => {
    const session = activateCurrentRule(
      createGame(players, [temporary('choose-player')], undefined, random),
      'C',
    )
    const restored = parseGameSession(JSON.parse(JSON.stringify(session)))
    expect(restored).toEqual(session)
    expect(() => activateCurrentRule(restored, 'C')).toThrow('already active')
    expect(completeTurn(restored, random).temporaryRules[0]?.remainingTurns).toBe(2)
  })

  it('rejects inconsistent counters, deck, targeting, lifetime and duplicated activations', () => {
    const session = activateCurrentRule(
      createGame(players, [temporary(), prompt('story')], undefined, random),
    )
    const rule = session.temporaryRules[0]!
    const invalid = [
      null,
      { ...session, completedTurns: -1 },
      { ...session, currentPlayerIndex: 1 },
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
