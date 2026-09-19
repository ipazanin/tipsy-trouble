import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame, completeTurn, type GameSession } from '@/features/game/domain/game'
import type { CardDefinition } from '@/features/cards/domain/cards'
import type { PeerTransport, PeerTransportCallbacks } from '../../infrastructure/peerTransport'
import {
  publicGame,
  type GuestCommand,
  type HostMessage,
  type SharedSnapshot,
} from '../../domain/protocol'

const storage = vi.hoisted(() => ({
  loadGame: vi.fn<() => Promise<GameSession | undefined>>(),
  saveGame: vi.fn<(game: GameSession) => Promise<void>>(),
  clearGame: vi.fn<() => Promise<void>>(),
  loadCardImage: vi.fn<(id: string) => Promise<{ bytes: ArrayBuffer } | undefined>>(),
}))
vi.mock('@/app/library', () => ({ library: storage }))
const players = [
  { id: 'alice', name: 'Alice' },
  { id: 'bob', name: 'Bob' },
]
const card: CardDefinition = {
  id: 'story',
  kind: 'prompt',
  title: 'Story',
  text: 'Tell a story.',
  contentLocale: 'en',
}
const initial = createGame(players, [card], { specialChance: 0, maxSpecialsPerGame: 0 }, () => 0)
interface FakePeer extends PeerTransport {
  callbacks: PeerTransportCallbacks
  sent: HostMessage[]
}
const cleanup: Array<() => void> = []
beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  storage.loadGame.mockResolvedValue(initial)
  storage.saveGame.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose())
  vi.useRealTimers()
})
function deferred<T>() {
  let resolve!: (result: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function harness(game = initial, artwork?: (id: string) => Promise<string | undefined>) {
  storage.loadGame.mockResolvedValue(game)
  const { useGameSession } = await import('@/features/game/composables/useGameSession')
  const session = useGameSession()
  await session.loadSession()
  const peers: FakePeer[] = []
  const factory = vi.fn<(callbacks: PeerTransportCallbacks) => PeerTransport>((callbacks) => {
    const sent: HostMessage[] = []
    const peer: FakePeer = {
      callbacks,
      sent,
      createOffer: vi.fn<() => Promise<string>>().mockResolvedValue('tt1.offer'),
      acceptOffer: vi.fn<(token: string) => Promise<string>>().mockResolvedValue('tt1.answer'),
      acceptAnswer: vi.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined),
      send: vi.fn<(message: string) => Promise<void>>(async (message) => {
        sent.push(JSON.parse(message) as HostMessage)
      }),
      close: vi.fn<() => void>(() => callbacks.onStatus('closed')),
    }
    peers.push(peer)
    callbacks.onStatus('idle')
    return peer
  })
  const { createMultiplayer } = await import('../useMultiplayer')
  const multiplayer = createMultiplayer(session, factory, artwork)
  cleanup.push(multiplayer.dispose)
  return { multiplayer, session, peers, factory }
}
async function hosted(game = initial, artwork?: (id: string) => Promise<string | undefined>) {
  const context = await harness(game, artwork)
  await context.multiplayer.pairPlayer('alice')
  const peer = context.peers[0]!
  peer.callbacks.onStatus('connected')
  peer.callbacks.onMessage(JSON.stringify({ version: 1, type: 'ready' }))
  await vi.waitFor(() =>
    expect(peer.sent.some((message) => message.type === 'snapshot')).toBe(true),
  )
  const snapshot = (
    peer.sent.find((message) => message.type === 'snapshot') as Extract<
      HostMessage,
      { type: 'snapshot' }
    >
  ).snapshot
  return { ...context, peer, snapshot }
}
function command(snapshot: SharedSnapshot, changes: Partial<GuestCommand> = {}) {
  return JSON.stringify({
    version: 1,
    type: 'command',
    command: {
      roomId: snapshot.roomId,
      expectedRevision: snapshot.revision,
      commandId: crypto.randomUUID(),
      action: 'advance',
      ...changes,
    },
  })
}
function snapshotMessage(changes: Partial<SharedSnapshot> = {}) {
  return JSON.stringify({
    version: 1,
    type: 'snapshot',
    snapshot: {
      roomId: 'room',
      revision: 0,
      assignedPlayerId: 'alice',
      game: publicGame(initial),
      ...changes,
    },
  })
}
async function joined() {
  const context = await harness()
  await context.multiplayer.joinHost('tt1.offer')
  const peer = context.peers[0]!
  peer.callbacks.onStatus('connected')
  peer.callbacks.onMessage(snapshotMessage())
  return { ...context, peer }
}

describe('host authority and persistence', () => {
  it('publishes only durable turns and deduplicates an in-flight or completed command', async () => {
    const { peer, snapshot, session } = await hosted()
    const saving = deferred<void>()
    storage.saveGame.mockReturnValueOnce(saving.promise)
    const serialized = command(snapshot)
    peer.sent.length = 0
    peer.callbacks.onMessage(serialized)
    peer.callbacks.onMessage(serialized)
    await vi.waitFor(() => expect(storage.saveGame).toHaveBeenCalledOnce())
    expect(peer.sent).toEqual([])
    expect(session.gameSession.value).toBe(initial)
    saving.resolve()
    await vi.waitFor(() =>
      expect(peer.sent.some((message) => message.type === 'result' && message.accepted)).toBe(true),
    )
    expect(
      peer.sent
        .filter((message) => message.type === 'snapshot')
        .every((message) => message.snapshot.game.completedTurns === 1),
    ).toBe(true)
    peer.callbacks.onMessage(serialized)
    await vi.waitFor(() =>
      expect(peer.sent.filter((message) => message.type === 'result')).toHaveLength(2),
    )
    expect(storage.saveGame).toHaveBeenCalledOnce()
  })

  it('rejects unauthorized, stale, wrong-room and concurrent moves without saving', async () => {
    const { peer, snapshot, session } = await hosted()
    for (const [changes, reason] of [
      [{ roomId: 'elsewhere' }, 'wrong-room'],
      [{ expectedRevision: 99 }, 'stale'],
    ] as const) {
      peer.callbacks.onMessage(command(snapshot, changes))
      await vi.waitFor(() =>
        expect(peer.sent).toContainEqual(
          expect.objectContaining({ type: 'result', accepted: false, reason }),
        ),
      )
    }
    const saving = deferred<void>()
    storage.saveGame.mockReturnValueOnce(saving.promise)
    peer.callbacks.onMessage(command(snapshot))
    peer.callbacks.onMessage(command(snapshot))
    await vi.waitFor(() =>
      expect(peer.sent).toContainEqual(expect.objectContaining({ type: 'result', reason: 'busy' })),
    )
    saving.resolve()
    await vi.waitFor(() => expect(session.gameSession.value!.completedTurns).toBe(1))
    peer.callbacks.onMessage(command(snapshot, { expectedRevision: 1 }))
    await vi.waitFor(() =>
      expect(peer.sent).toContainEqual(
        expect.objectContaining({ type: 'result', reason: 'not-your-turn' }),
      ),
    )
    expect(storage.saveGame).toHaveBeenCalledOnce()
  })

  it('reports failed saves without advancing and accepts a newly requested retry', async () => {
    const { peer, snapshot, session } = await hosted()
    storage.saveGame.mockRejectedValueOnce(new Error('Disk full'))
    peer.callbacks.onMessage(command(snapshot))
    await vi.waitFor(() =>
      expect(peer.sent).toContainEqual(
        expect.objectContaining({ type: 'result', reason: 'save-failed' }),
      ),
    )
    expect(session.gameSession.value).toBe(initial)
    peer.callbacks.onMessage(command(snapshot))
    await vi.waitFor(() => expect(session.gameSession.value!.completedTurns).toBe(1))
    expect(storage.saveGame).toHaveBeenCalledTimes(2)
  })

  it('persists a permanent rule through the same authorized host boundary', async () => {
    let due = initial
    for (let turn = 0; turn < 4; turn++) due = completeTurn(due, () => 0)
    const { peer, snapshot, session } = await hosted(due)
    peer.callbacks.onMessage(command(snapshot, { action: 'house-rule', text: 'Speak quietly' }))
    await vi.waitFor(() => expect(session.gameSession.value!.houseRules).toHaveLength(1))
    expect(storage.saveGame).toHaveBeenCalledOnce()
  })

  it('isolates malformed messages and send failures to the affected connection', async () => {
    const { peer, multiplayer } = await hosted()
    peer.callbacks.onMessage('{')
    expect(multiplayer.hostConnections.value[0]!.status).toBe('failed')
    expect(peer.close).toHaveBeenCalledOnce()
    await multiplayer.pairPlayer('alice')
    const replacement = multiplayer.hostConnections.value[0]!
    expect(replacement.id).not.toBe('')
    peer.callbacks.onStatus('connected')
    peer.callbacks.onMessage(JSON.stringify({ version: 1, type: 'ready' }))
    expect(multiplayer.hostConnections.value[0]!.status).toBe('idle')
  })

  it('ends every connection when the game ends or a restore begins', async () => {
    const { peer, multiplayer, session } = await hosted()
    await session.endGame()
    expect(multiplayer.hostActive.value).toBe(false)
    expect(peer.sent).toContainEqual({ version: 1, type: 'ended' })
    await session.loadSession(true)
    await multiplayer.pairPlayer('alice')
    const loading = deferred<GameSession | undefined>()
    storage.loadGame.mockReturnValueOnce(loading.promise)
    const restoring = session.loadSession(true)
    expect(multiplayer.hostActive.value).toBe(false)
    loading.resolve(initial)
    await restoring
  })
})

describe('guest command acknowledgement', () => {
  it.each([true, false])(
    'requires both accepted acknowledgement and newer snapshot, acknowledgement first=%s',
    async (ackFirst) => {
      const { peer, multiplayer } = await joined()
      expect(multiplayer.canGuestAdvance.value).toBe(true)
      await multiplayer.guestNextTurn()
      expect(multiplayer.guestBusy.value).toBe(true)
      const sent = JSON.parse(vi.mocked(peer.send).mock.calls.at(-1)![0]) as {
        command: GuestCommand
      }
      const ack = JSON.stringify({
        version: 1,
        type: 'result',
        commandId: sent.command.commandId,
        accepted: true,
      })
      const updated = snapshotMessage({
        revision: 1,
        game: publicGame(completeTurn(initial, () => 0)),
      })
      peer.callbacks.onMessage(ackFirst ? ack : updated)
      expect(multiplayer.guestBusy.value).toBe(true)
      peer.callbacks.onMessage(ackFirst ? updated : ack)
      expect(multiplayer.guestBusy.value).toBe(false)
      expect(multiplayer.canGuestAdvance.value).toBe(false)
      await multiplayer.guestNextTurn()
      expect(peer.send).toHaveBeenCalledTimes(2)
    },
  )

  it('retains its current snapshot for stale messages and handles explicit rejection', async () => {
    const { peer, multiplayer } = await joined()
    await multiplayer.guestNextTurn('bob')
    await multiplayer.guestNextTurn()
    const sent = JSON.parse(vi.mocked(peer.send).mock.calls.at(-1)![0]) as { command: GuestCommand }
    expect(sent.command).toMatchObject({ action: 'advance', targetId: 'bob' })
    peer.callbacks.onMessage(
      snapshotMessage({ revision: 0, game: publicGame(completeTurn(initial, () => 0)) }),
    )
    expect(multiplayer.guestState.value!.game.completedTurns).toBe(0)
    peer.callbacks.onMessage(
      JSON.stringify({ version: 1, type: 'result', commandId: 'unknown', accepted: true }),
    )
    expect(multiplayer.guestBusy.value).toBe(true)
    peer.callbacks.onMessage(
      JSON.stringify({
        version: 1,
        type: 'result',
        commandId: sent.command.commandId,
        accepted: false,
        reason: 'save-failed',
      }),
    )
    expect(multiplayer.guestBusy.value).toBe(false)
    expect(multiplayer.guestError.value).not.toBe('')
  })

  it('allows the assigned house-rule author and forwards the rule text', async () => {
    const { peer, multiplayer } = await joined()
    await multiplayer.guestAddHouseRule('Not due')
    let due = initial
    for (let turn = 0; turn < 4; turn++) due = completeTurn(due, () => 0)
    peer.callbacks.onMessage(snapshotMessage({ revision: 1, game: publicGame(due) }))
    expect(multiplayer.canGuestAddRule.value).toBe(true)
    await multiplayer.guestAddHouseRule('Speak quietly')
    expect(JSON.parse(vi.mocked(peer.send).mock.calls.at(-1)![0])).toMatchObject({
      command: { action: 'house-rule', text: 'Speak quietly' },
    })
  })

  it('fails a changed room, malformed host message, or transport write and permits re-pairing', async () => {
    const { peer, multiplayer, peers } = await joined()
    peer.callbacks.onMessage(snapshotMessage({ revision: 1, roomId: 'other' }))
    expect(multiplayer.guestStatus.value).toBe('failed')
    await multiplayer.joinHost('tt1.fresh')
    peer.callbacks.onStatus('connected')
    peer.callbacks.onMessage(snapshotMessage())
    peer.callbacks.onError?.(new Error('obsolete'))
    expect(multiplayer.guestState.value).toBeNull()
    const fresh = peers[1]!
    fresh.callbacks.onStatus('connected')
    fresh.callbacks.onMessage('{')
    expect(multiplayer.guestStatus.value).toBe('failed')
    await multiplayer.joinHost('tt1.next')
    const next = peers[2]!
    next.callbacks.onStatus('connected')
    next.callbacks.onMessage(snapshotMessage())
    vi.mocked(next.send).mockRejectedValueOnce(new Error('Disconnected'))
    await multiplayer.guestNextTurn()
    expect(multiplayer.guestStatus.value).toBe('failed')
    expect(multiplayer.guestError.value).toBe('Disconnected')
  })

  it('times out unacknowledged commands and closes on the host end notification', async () => {
    const { peer, multiplayer } = await joined()
    vi.useFakeTimers()
    await multiplayer.guestNextTurn()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(multiplayer.guestStatus.value).toBe('failed')
    expect(multiplayer.guestBusy.value).toBe(false)
    peer.callbacks.onMessage(JSON.stringify({ version: 1, type: 'ended' }))
    expect(multiplayer.guestStatus.value).toBe('closed')
  })
})

describe('pairing lifecycle and bounded state', () => {
  it('requires a loaded game, separates host and guest roles, and exposes recoverable pairing links', async () => {
    const { multiplayer, session } = await harness()
    expect(multiplayer.multiplayerActive.value).toBe(false)
    expect(multiplayer.pairingLink('tt1.offer')).toContain('#/multiplayer?pair=tt1.offer')
    const { useMultiplayer } = await import('../useMultiplayer')
    expect(useMultiplayer()).toBe(useMultiplayer())
    await session.endGame()
    await multiplayer.pairPlayer('alice')
    expect(multiplayer.hostError.value).not.toBe('')
    await session.loadSession(true)
    await multiplayer.pairPlayer('missing')
    expect(multiplayer.hostConnections.value).toHaveLength(0)
    expect(multiplayer.hostError.value).not.toBe('')
    expect(await multiplayer.joinHost('tt1.offer')).toBe(false)
    multiplayer.stopHosting()
    await multiplayer.joinHost('tt1.offer')
    multiplayer.startHosting()
    expect(multiplayer.hostActive.value).toBe(false)
    expect(multiplayer.multiplayerActive.value).toBe(true)
    expect(multiplayer.hostError.value).not.toBe('')
    multiplayer.removeGuest('missing')
  })

  it('caps device count and bounds the command retry cache', async () => {
    const roster = Array.from({ length: 13 }, (_, index) => ({
      id: `player-${index}`,
      name: `Player ${index}`,
    }))
    const many = createGame(roster, [card], { specialChance: 0, maxSpecialsPerGame: 0 }, () => 0)
    const { multiplayer, peers } = await harness(many)
    for (const player of roster) await multiplayer.pairPlayer(player.id)
    expect(multiplayer.hostConnections.value).toHaveLength(12)
    expect(multiplayer.hostError.value).not.toBe('')
    const peer = peers[0]!
    peer.callbacks.onStatus('connected')
    peer.callbacks.onMessage(JSON.stringify({ version: 1, type: 'ready' }))
    await vi.waitFor(() => expect(peer.sent).toHaveLength(1))
    const snapshot = (peer.sent[0] as Extract<HostMessage, { type: 'snapshot' }>).snapshot
    for (let index = 0; index < 257; index++)
      peer.callbacks.onMessage(
        command(snapshot, { expectedRevision: 99, commandId: `command-${index}` }),
      )
    await vi.waitFor(() =>
      expect(peer.sent.filter((message) => message.type === 'result')).toHaveLength(257),
    )
    expect(storage.saveGame).not.toHaveBeenCalled()
  })

  it('handles host answer errors, transport errors and pending pairing removed before completion', async () => {
    const { multiplayer, peers, factory } = await harness()
    await multiplayer.acceptGuestAnswer('missing', 'tt1.answer')
    await multiplayer.pairPlayer('alice')
    const peer = peers[0]!
    const id = multiplayer.hostConnections.value[0]!.id
    peer.callbacks.onError?.(new Error('Radio offline'))
    expect(multiplayer.hostConnections.value[0]!.error).toBe('Radio offline')
    await multiplayer.acceptGuestAnswer(id, 'https://example.test/#/multiplayer?pair=tt1.answer')
    expect(peer.acceptAnswer).toHaveBeenCalledWith('tt1.answer')
    vi.mocked(peer.acceptAnswer).mockRejectedValueOnce('Unknown failure')
    await multiplayer.acceptGuestAnswer(id, 'tt1.answer')
    expect(multiplayer.hostConnections.value[0]!.error).not.toBe('')
    const answer = deferred<void>()
    vi.mocked(peer.acceptAnswer).mockReturnValueOnce(answer.promise)
    const accepting = multiplayer.acceptGuestAnswer(id, 'tt1.answer')
    multiplayer.removeGuest(id)
    answer.reject(new Error('obsolete'))
    await accepting
    expect(multiplayer.hostConnections.value).toHaveLength(0)
    const implementation = factory.getMockImplementation()!
    const offer = deferred<string>()
    factory.mockImplementationOnce((callbacks) => {
      const pending = implementation(callbacks)
      vi.mocked(pending.createOffer).mockReturnValueOnce(offer.promise)
      return pending
    })
    const pairing = multiplayer.pairPlayer('alice')
    multiplayer.removeGuest(multiplayer.hostConnections.value[0]!.id)
    offer.resolve('tt1.obsolete')
    await pairing
    expect(multiplayer.hostConnections.value).toHaveLength(0)
    factory.mockImplementationOnce((callbacks) => {
      const failed = implementation(callbacks)
      vi.mocked(failed.createOffer).mockRejectedValueOnce(new Error('No local candidates'))
      return failed
    })
    await multiplayer.pairPlayer('alice')
    expect(multiplayer.hostConnections.value[0]!.error).toBe('No local candidates')
  })

  it('ignores stale host sends and command failures after removal', async () => {
    const { multiplayer, peer, snapshot, session } = await hosted()
    const sending = deferred<void>()
    vi.mocked(peer.send).mockReturnValueOnce(sending.promise)
    peer.callbacks.onMessage(JSON.stringify({ version: 1, type: 'ready' }))
    multiplayer.removeGuest(multiplayer.hostConnections.value[0]!.id)
    sending.reject(new Error('old send'))
    await Promise.resolve()
    expect(multiplayer.hostConnections.value).toHaveLength(0)
    await multiplayer.pairPlayer('alice')
    const freshId = multiplayer.hostConnections.value[0]!.id
    const failedMove = deferred<boolean>()
    vi.spyOn(session, 'nextTurn').mockReturnValueOnce(failedMove.promise)
    // The removed transport's callback cannot reach its former session.
    peer.callbacks.onMessage(command(snapshot))
    expect(session.nextTurn).not.toHaveBeenCalled()
    multiplayer.removeGuest(freshId)
    failedMove.resolve(false)
  })

  it('marks a current failed send and safely finishes a rejected end notification', async () => {
    const { peer, multiplayer } = await hosted()
    vi.mocked(peer.send).mockRejectedValueOnce(new Error('Send failed'))
    peer.callbacks.onMessage(JSON.stringify({ version: 1, type: 'ready' }))
    await vi.waitFor(() => expect(multiplayer.hostConnections.value[0]!.status).toBe('failed'))
    peer.callbacks.onMessage(JSON.stringify({ version: 1, type: 'ready' }))
    peer.callbacks.onStatus('connected')
    vi.mocked(peer.send).mockRejectedValueOnce(new Error('Already gone'))
    vi.useFakeTimers()
    multiplayer.stopHosting()
    await vi.advanceTimersByTimeAsync(250)
    expect(peer.close).toHaveBeenCalledTimes(2)
  })

  it('cancels guest pairing safely, handles pairing errors, and ignores obsolete callbacks', async () => {
    const { multiplayer, factory, peers } = await harness()
    const implementation = factory.getMockImplementation()!
    const joining = deferred<string>()
    factory.mockImplementationOnce((callbacks) => {
      const peer = implementation(callbacks)
      vi.mocked(peer.acceptOffer).mockReturnValueOnce(joining.promise)
      return peer
    })
    const pending = multiplayer.joinHost('tt1.offer')
    multiplayer.leaveGuest()
    joining.resolve('tt1.obsolete')
    expect(await pending).toBe(false)
    expect(multiplayer.guestAnswer.value).toBe('')
    factory.mockImplementationOnce((callbacks) => {
      const peer = implementation(callbacks)
      vi.mocked(peer.acceptOffer).mockRejectedValueOnce(new Error('Expired'))
      return peer
    })
    expect(await multiplayer.joinHost('tt1.offer')).toBe(false)
    expect(multiplayer.guestError.value).toBe('Expired')
    await multiplayer.joinHost('tt1.offer')
    const fresh = peers.at(-1)!
    const send = deferred<void>()
    vi.mocked(fresh.send).mockReturnValueOnce(send.promise)
    fresh.callbacks.onStatus('connected')
    multiplayer.leaveGuest()
    send.reject(new Error('old ready'))
    await Promise.resolve()
    expect(multiplayer.guestStatus.value).toBe('idle')
    await multiplayer.joinHost('tt1.offer')
    const current = peers.at(-1)!
    current.callbacks.onError?.(new Error('Connection unavailable'))
    expect(multiplayer.guestError.value).toBe('Connection unavailable')
    vi.mocked(current.send).mockRejectedValueOnce(new Error('Ready failed'))
    current.callbacks.onStatus('connected')
    await vi.waitFor(() => expect(multiplayer.guestStatus.value).toBe('failed'))
  })
})

describe('artwork snapshots', () => {
  const illustrated = createGame(
    players,
    [{ ...card, imageId: 'photo' }],
    { specialChance: 0, maxSpecialsPerGame: 0 },
    () => 0,
  )
  it('shares artwork once, drops obsolete revisions, and retains correct async ordering', async () => {
    const artwork = deferred<string | undefined>()
    const loader = vi
      .fn<(id: string) => Promise<string | undefined>>()
      .mockReturnValue(artwork.promise)
    const { multiplayer, session, peers } = await harness(illustrated, loader)
    await multiplayer.pairPlayer('alice')
    const peer = peers[0]!
    peer.callbacks.onStatus('connected')
    peer.callbacks.onMessage(JSON.stringify({ version: 1, type: 'ready' }))
    await session.nextTurn()
    expect(peer.sent).toEqual([])
    artwork.resolve('data:image/jpeg;base64,YQ==')
    await vi.waitFor(() => expect(peer.sent).toHaveLength(1))
    expect(peer.sent[0]).toMatchObject({
      type: 'snapshot',
      snapshot: { revision: 1, currentArtwork: 'data:image/jpeg;base64,YQ==' },
    })
    expect(loader).toHaveBeenCalledExactlyOnceWith('photo')
  })
  it('drops artwork completing after a room ends and recovers from an image read failure', async () => {
    const artwork = deferred<string | undefined>()
    const loader = vi
      .fn<(id: string) => Promise<string | undefined>>()
      .mockReturnValueOnce(artwork.promise)
      .mockRejectedValueOnce(new Error('Image missing'))
    const { multiplayer, peers } = await harness(illustrated, loader)
    await multiplayer.pairPlayer('alice')
    const peer = peers[0]!
    peer.callbacks.onStatus('connected')
    peer.callbacks.onMessage(JSON.stringify({ version: 1, type: 'ready' }))
    multiplayer.stopHosting()
    artwork.resolve('data:image/jpeg;base64,YQ==')
    await Promise.resolve()
    expect(peer.sent.every((message) => message.type === 'ended')).toBe(true)
    await multiplayer.pairPlayer('alice')
    const fresh = peers[1]!
    fresh.callbacks.onStatus('connected')
    fresh.callbacks.onMessage(JSON.stringify({ version: 1, type: 'ready' }))
    await vi.waitFor(() => expect(fresh.sent).toHaveLength(1))
    expect(multiplayer.hostError.value).not.toBe('')
    expect(fresh.sent[0]).not.toHaveProperty('snapshot.currentArtwork')
  })
  it('keeps replacement room errors and artwork cache isolated from an old image rejection', async () => {
    const obsoleteArtwork = deferred<string | undefined>()
    const currentArtwork = deferred<string | undefined>()
    const loader = vi
      .fn<(id: string) => Promise<string | undefined>>()
      .mockReturnValueOnce(obsoleteArtwork.promise)
      .mockReturnValue(currentArtwork.promise)
    const { multiplayer, peers } = await harness(illustrated, loader)
    await multiplayer.pairPlayer('alice')
    const previous = peers[0]!
    previous.callbacks.onStatus('connected')
    previous.callbacks.onMessage(JSON.stringify({ version: 1, type: 'ready' }))
    multiplayer.stopHosting()

    await multiplayer.pairPlayer('alice')
    const current = peers[1]!
    current.callbacks.onStatus('connected')
    current.callbacks.onMessage(JSON.stringify({ version: 1, type: 'ready' }))
    obsoleteArtwork.reject(new Error('Old room image failed'))
    await obsoleteArtwork.promise.catch(() => undefined)
    expect(multiplayer.hostError.value).toBe('')

    current.callbacks.onMessage(JSON.stringify({ version: 1, type: 'ready' }))
    expect(loader).toHaveBeenCalledTimes(2)
    currentArtwork.resolve('data:image/jpeg;base64,AQID')
    await vi.waitFor(() => expect(current.sent).toHaveLength(2))
    expect(current.sent).toEqual([
      expect.objectContaining({
        snapshot: expect.objectContaining({ currentArtwork: 'data:image/jpeg;base64,AQID' }),
      }),
      expect.objectContaining({
        snapshot: expect.objectContaining({ currentArtwork: 'data:image/jpeg;base64,AQID' }),
      }),
    ])
    expect(previous.sent).toEqual([{ version: 1, type: 'ended' }])
  })

  it('loads stored image bytes through the browser reader and tolerates a missing asset', async () => {
    storage.loadCardImage.mockResolvedValueOnce({ bytes: new Uint8Array([1, 2, 3]).buffer })
    const { peer } = await hosted(illustrated)
    expect(peer.sent[0]).toMatchObject({
      snapshot: { currentArtwork: 'data:image/jpeg;base64,AQID' },
    })
    const missing = await hosted(illustrated)
    expect(missing.peer.sent[0]).not.toHaveProperty('snapshot.currentArtwork')
  })
})

describe('pending network work', () => {
  it('keeps guest pairing exclusive when the real adapter initially reports idle', async () => {
    const { multiplayer, factory } = await harness()
    const implementation = factory.getMockImplementation()!
    const answer = deferred<string>()
    factory.mockImplementationOnce((callbacks) => {
      const peer = implementation(callbacks)
      vi.mocked(peer.acceptOffer).mockReturnValueOnce(answer.promise)
      return peer
    })
    const joining = multiplayer.joinHost('tt1.offer')
    expect(multiplayer.guestStatus.value).toBe('pairing')
    multiplayer.startHosting()
    expect(multiplayer.hostActive.value).toBe(false)
    answer.resolve('tt1.answer')
    expect(await joining).toBe(true)
  })

  it('handles a connection opening before answer encoding finishes and statuses without an open channel', async () => {
    const { multiplayer, factory, peers } = await harness()
    const implementation = factory.getMockImplementation()!
    const answer = deferred<string>()
    factory.mockImplementationOnce((callbacks) => {
      const peer = implementation(callbacks)
      vi.mocked(peer.acceptOffer).mockReturnValueOnce(answer.promise)
      return peer
    })
    const joining = multiplayer.joinHost('tt1.offer')
    const peer = peers[0]!
    peer.callbacks.onStatus('pairing')
    peer.callbacks.onStatus('connecting')
    peer.callbacks.onStatus('connected')
    answer.resolve('tt1.answer')
    expect(await joining).toBe(true)
    expect(multiplayer.guestAnswer.value).toBe('')
    peer.callbacks.onStatus('failed')
    expect(multiplayer.guestStatus.value).toBe('failed')
  })

  it('ignores a rejected old guest pairing or command after leaving', async () => {
    const { multiplayer, factory, peers } = await harness()
    const implementation = factory.getMockImplementation()!
    const answer = deferred<string>()
    factory.mockImplementationOnce((callbacks) => {
      const peer = implementation(callbacks)
      vi.mocked(peer.acceptOffer).mockReturnValueOnce(answer.promise)
      return peer
    })
    const joining = multiplayer.joinHost('tt1.offer')
    multiplayer.leaveGuest()
    answer.reject(new Error('obsolete offer'))
    expect(await joining).toBe(false)
    expect(multiplayer.guestStatus.value).toBe('idle')
    await multiplayer.joinHost('tt1.new')
    const peer = peers[1]!
    peer.callbacks.onStatus('connected')
    peer.callbacks.onMessage(snapshotMessage())
    const sending = deferred<void>()
    vi.mocked(peer.send).mockReturnValueOnce(sending.promise)
    const command = multiplayer.guestNextTurn()
    multiplayer.leaveGuest()
    sending.reject(new Error('obsolete command'))
    await command
    expect(multiplayer.guestError.value).toBe('')
  })

  it('ignores rejected host pairing after removal and stopped-host pending command completion', async () => {
    const { multiplayer, factory } = await harness()
    const implementation = factory.getMockImplementation()!
    const offer = deferred<string>()
    factory.mockImplementationOnce((callbacks) => {
      const peer = implementation(callbacks)
      vi.mocked(peer.createOffer).mockReturnValueOnce(offer.promise)
      return peer
    })
    const pairing = multiplayer.pairPlayer('alice')
    multiplayer.removeGuest(multiplayer.hostConnections.value[0]!.id)
    offer.reject(new Error('obsolete offer'))
    await pairing
    expect(multiplayer.hostConnections.value).toHaveLength(0)
    const hostedContext = await hosted()
    const move = deferred<boolean>()
    vi.spyOn(hostedContext.session, 'nextTurn').mockReturnValueOnce(move.promise)
    hostedContext.peer.callbacks.onMessage(command(hostedContext.snapshot))
    hostedContext.multiplayer.stopHosting()
    move.resolve(false)
    await Promise.resolve()
    await Promise.resolve()
    expect(hostedContext.multiplayer.hostConnections.value).toHaveLength(0)
    expect(hostedContext.peer.sent.filter((message) => message.type === 'result')).toHaveLength(0)
  })

  it('does not revive a removed connection when its command promise rejects', async () => {
    const { multiplayer, peer, snapshot, session } = await hosted()
    const move = deferred<boolean>()
    vi.spyOn(session, 'nextTurn').mockReturnValueOnce(move.promise)
    peer.callbacks.onMessage(command(snapshot))
    multiplayer.removeGuest(multiplayer.hostConnections.value[0]!.id)
    move.reject(new Error('old move'))
    await Promise.resolve()
    await Promise.resolve()
    expect(multiplayer.hostConnections.value).toHaveLength(0)
    expect(peer.close).toHaveBeenCalledOnce()
  })
})
