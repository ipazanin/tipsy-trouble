import {
  decodePairingToken,
  encodePairingToken,
  PAIRING_LIFETIME_MS,
  type PairingDescription,
} from './pairingCodec'
import {
  createMessageAssembler,
  encodeMessage,
  messageFrames,
  MAX_FRAME_BYTES,
  MAX_MESSAGE_BYTES,
} from './messageFrames'

export type PeerTransportStatus =
  'idle' | 'pairing' | 'connecting' | 'connected' | 'closed' | 'failed'
export interface PeerTransportCallbacks {
  readonly onMessage: (message: string) => void
  readonly onStatus: (status: PeerTransportStatus) => void
  readonly onError?: (error: Error) => void
  readonly createPeerConnection?: (configuration: RTCConfiguration) => RTCPeerConnection
  readonly now?: () => number
}
export interface PeerTransport {
  createOffer(): Promise<string>
  acceptOffer(token: string): Promise<string>
  acceptAnswer(token: string): Promise<void>
  send(message: string): Promise<void>
  close(): void
}

const CHANNEL_LABEL = 'tipsy-trouble'
const CHANNEL_PROTOCOL = 'tipsy-trouble.v1'
const GATHER_TIMEOUT_MS = 10_000
const CONNECT_TIMEOUT_MS = 30_000
const BUFFER_TIMEOUT_MS = 15_000
const BUFFER_HIGH_BYTES = 256 * 1024
const BUFFER_LOW_BYTES = 64 * 1024

interface PeerSession {
  readonly peer: RTCPeerConnection
  readonly abort: AbortController
  readonly connectionId: string
  readonly expiresAt: number
  readonly role: 'host' | 'guest'
  readonly assembler: ReturnType<typeof createMessageAssembler>
  channel?: RTCDataChannel
  connectTimer?: ReturnType<typeof setTimeout>
  expiryTimer?: ReturnType<typeof setTimeout>
  failure?: Error
  answerAccepted: boolean
}

function asError(failure: unknown): Error {
  return failure instanceof Error ? failure : new Error('The local connection failed.')
}

export function createPeerTransport(callbacks: PeerTransportCallbacks): PeerTransport {
  const now = callbacks.now ?? Date.now
  const createConnection =
    callbacks.createPeerConnection ?? ((configuration) => new RTCPeerConnection(configuration))
  let current: PeerSession | undefined
  let generation = 0
  let status: PeerTransportStatus = 'idle'
  let outgoingId = 0
  let queuedBytes = 0
  let queuedMessages = 0
  let sendQueue = Promise.resolve()

  function setStatus(next: PeerTransportStatus) {
    if (status === next) return
    status = next
    callbacks.onStatus(next)
  }
  function dispose() {
    generation++
    const previous = current
    current = undefined
    if (!previous) return
    previous.abort.abort(previous.failure ?? new Error('The connection was closed.'))
    clearTimeout(previous.connectTimer)
    clearTimeout(previous.expiryTimer)
    previous.assembler.close()
    previous.channel?.close()
    previous.peer.close()
  }
  function fail(session: PeerSession, error: Error) {
    if (current !== session) return
    session.failure = error
    dispose()
    setStatus('failed')
    callbacks.onError?.(error)
  }
  function ensureCurrent(session: PeerSession) {
    if (current !== session || session.abort.signal.aborted)
      throw session.failure ?? new Error('Pairing was cancelled. Create a new code.')
  }
  function attachChannel(session: PeerSession, channel: RTCDataChannel) {
    if (current !== session) {
      channel.close()
      return
    }
    if (
      session.channel ||
      channel.label !== CHANNEL_LABEL ||
      channel.protocol !== CHANNEL_PROTOCOL ||
      !channel.ordered ||
      channel.maxRetransmits !== null ||
      channel.maxPacketLifeTime !== null
    ) {
      channel.close()
      fail(session, new Error('The peer requested an unsupported data channel.'))
      return
    }
    session.channel = channel
    channel.binaryType = 'arraybuffer'
    channel.bufferedAmountLowThreshold = BUFFER_LOW_BYTES
    const listener = { signal: session.abort.signal }
    const connected = () => {
      clearTimeout(session.connectTimer)
      clearTimeout(session.expiryTimer)
      setStatus('connected')
    }
    channel.addEventListener('open', connected, listener)
    if (channel.readyState === 'open') connected()
    channel.addEventListener('message', (event) => session.assembler.receive(event.data), listener)
    channel.addEventListener(
      'close',
      () => {
        dispose()
        setStatus('closed')
      },
      listener,
    )
    channel.addEventListener(
      'error',
      () => fail(session, new Error('The local data connection failed. Pair again to continue.')),
      listener,
    )
  }
  function begin(connectionId: string, expiresAt: number, role: 'host' | 'guest'): PeerSession {
    dispose()
    setStatus('pairing')
    let peer: RTCPeerConnection
    try {
      peer = createConnection({ iceServers: [], bundlePolicy: 'max-bundle' })
    } catch (failure) {
      const error = asError(failure)
      setStatus('failed')
      callbacks.onError?.(error)
      throw error
    }
    const session: PeerSession = {
      peer,
      abort: new AbortController(),
      connectionId,
      expiresAt,
      role,
      answerAccepted: false,
      assembler: createMessageAssembler(callbacks.onMessage, (error) => fail(session, error)),
    }
    current = session
    setStatus('pairing')
    const listener = { signal: session.abort.signal }
    peer.addEventListener('datachannel', (event) => attachChannel(session, event.channel), listener)
    peer.addEventListener(
      'connectionstatechange',
      () => {
        if (peer.connectionState === 'failed')
          fail(
            session,
            new Error(
              'Could not connect directly. Use the same Wi-Fi or hotspot; this network may block local connections.',
            ),
          )
        else if (peer.connectionState === 'closed') {
          dispose()
          setStatus('closed')
        } else if (peer.connectionState === 'disconnected')
          fail(session, new Error('The device disconnected. Pair again to continue.'))
      },
      listener,
    )
    session.expiryTimer = setTimeout(
      () => fail(session, new Error('The pairing code expired. Create a new one.')),
      Math.max(0, expiresAt - now()),
    )
    return session
  }
  function waitFor(
    session: PeerSession,
    target: EventTarget,
    eventName: string,
    ready: () => boolean,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<void> {
    ensureCurrent(session)
    if (ready()) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer)
        target.removeEventListener(eventName, check)
        session.abort.signal.removeEventListener('abort', cancelled)
        if (error) reject(error)
        else resolve()
      }
      const check = () => {
        if (ready()) finish()
      }
      const cancelled = () => finish(asError(session.abort.signal.reason))
      const timer = setTimeout(() => finish(new Error(timeoutMessage)), timeoutMs)
      target.addEventListener(eventName, check)
      session.abort.signal.addEventListener('abort', cancelled, { once: true })
      check()
    })
  }
  async function localToken(
    session: PeerSession,
    kind: PairingDescription['kind'],
  ): Promise<string> {
    await waitFor(
      session,
      session.peer,
      'icegatheringstatechange',
      () => session.peer.iceGatheringState === 'complete',
      GATHER_TIMEOUT_MS,
      'Could not gather local connection details. Try pairing again.',
    )
    ensureCurrent(session)
    const sdp = session.peer.localDescription?.sdp
    if (!sdp) throw new Error('The browser did not create a connection description.')
    const token = await encodePairingToken(
      { version: 1, kind, connectionId: session.connectionId, expiresAt: session.expiresAt, sdp },
      now(),
    )
    ensureCurrent(session)
    return token
  }
  async function createOffer(): Promise<string> {
    const session = begin(crypto.randomUUID(), now() + PAIRING_LIFETIME_MS, 'host')
    try {
      attachChannel(
        session,
        session.peer.createDataChannel(CHANNEL_LABEL, {
          ordered: true,
          protocol: CHANNEL_PROTOCOL,
        }),
      )
      await session.peer.setLocalDescription(await session.peer.createOffer())
      return await localToken(session, 'offer')
    } catch (failure) {
      const error = asError(failure)
      fail(session, error)
      throw error
    }
  }
  async function acceptOffer(token: string): Promise<string> {
    const beforeDecode = generation
    const offer = await decodePairingToken(token, now())
    if (beforeDecode !== generation) throw new Error('Pairing was cancelled. Create a new code.')
    if (offer.kind !== 'offer') throw new Error('Scan the host’s offer to join a game.')
    const session = begin(offer.connectionId, offer.expiresAt, 'guest')
    try {
      await session.peer.setRemoteDescription({ type: 'offer', sdp: offer.sdp })
      ensureCurrent(session)
      await session.peer.setLocalDescription(await session.peer.createAnswer())
      const answer = await localToken(session, 'answer')
      if (status !== 'connected') setStatus('connecting')
      return answer
    } catch (failure) {
      const error = asError(failure)
      fail(session, error)
      throw error
    }
  }
  async function acceptAnswer(token: string): Promise<void> {
    const session = current
    if (!session || session.role !== 'host' || session.answerAccepted)
      throw new Error('Create a fresh host offer before accepting an answer.')
    const answer = await decodePairingToken(token, now())
    ensureCurrent(session)
    if (
      answer.kind !== 'answer' ||
      answer.connectionId !== session.connectionId ||
      answer.expiresAt !== session.expiresAt
    )
      throw new Error('This answer belongs to a different pairing attempt.')
    if (session.answerAccepted) throw new Error('This pairing answer has already been accepted.')
    session.answerAccepted = true
    try {
      setStatus('connecting')
      session.connectTimer = setTimeout(
        () =>
          fail(
            session,
            new Error(
              'The direct connection timed out. Use the same Wi-Fi or hotspot and try again.',
            ),
          ),
        CONNECT_TIMEOUT_MS,
      )
      await session.peer.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
      ensureCurrent(session)
    } catch (failure) {
      const error = asError(failure)
      fail(session, error)
      throw error
    }
  }
  async function transmit(session: PeerSession, bytes: Uint8Array<ArrayBuffer>, id: number) {
    ensureCurrent(session)
    const channel = session.channel
    if (!channel || channel.readyState !== 'open') throw new Error('The device is not connected.')
    for (const frame of messageFrames(bytes, id)) {
      await waitFor(
        session,
        channel,
        'bufferedamountlow',
        () => channel.bufferedAmount + MAX_FRAME_BYTES <= BUFFER_HIGH_BYTES,
        BUFFER_TIMEOUT_MS,
        'The device is not receiving messages. Pair again to continue.',
      )
      ensureCurrent(session)
      if (channel.readyState !== 'open') throw new Error('The device is not connected.')
      channel.send(frame)
    }
  }
  function send(message: string): Promise<void> {
    const session = current
    if (!session || session.channel?.readyState !== 'open')
      return Promise.reject(new Error('The device is not connected.'))
    let bytes: Uint8Array<ArrayBuffer>
    try {
      bytes = encodeMessage(message)
    } catch (failure) {
      return Promise.reject(asError(failure))
    }
    if (queuedBytes + bytes.length > MAX_MESSAGE_BYTES * 2 || queuedMessages >= 32)
      return Promise.reject(
        new Error('Too many multiplayer messages are waiting. Try again shortly.'),
      )
    queuedBytes += bytes.length
    queuedMessages++
    outgoingId = (outgoingId + 1) >>> 0
    const id = outgoingId
    const sending = sendQueue
      .then(() => transmit(session, bytes, id))
      .catch((failure) => {
        const error = asError(failure)
        fail(session, error)
        throw error
      })
      .finally(() => {
        queuedBytes -= bytes.length
        queuedMessages--
      })
    sendQueue = sending.catch(() => undefined)
    return sending
  }
  callbacks.onStatus('idle')
  return {
    createOffer,
    acceptOffer,
    acceptAnswer,
    send,
    close: () => {
      dispose()
      setStatus('closed')
    },
  }
}
