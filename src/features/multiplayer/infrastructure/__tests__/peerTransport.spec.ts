// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPeerTransport, type PeerTransportStatus } from '../peerTransport'
import { decodePairingToken, encodePairingToken } from '../pairingCodec'
import {
  createMessageAssembler,
  encodeMessage,
  messageFrames,
  MAX_MESSAGE_BYTES,
} from '../messageFrames'

const sdp =
  'v=0\r\na=ice-ufrag:test\r\na=ice-pwd:test-password\r\na=fingerprint:sha-256 AA:BB\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=candidate:1 1 udp 2122262783 test.local 12345 typ host\r\n'
class Channel extends EventTarget {
  label = 'tipsy-trouble'
  protocol = 'tipsy-trouble.v1'
  ordered = true
  maxRetransmits = null
  maxPacketLifeTime = null
  readyState: RTCDataChannelState = 'connecting'
  bufferedAmount = 0
  bufferedAmountLowThreshold = 0
  binaryType = 'blob'
  sent: ArrayBuffer[] = []
  send(frame: ArrayBuffer) {
    this.sent.push(frame)
  }
  open() {
    this.readyState = 'open'
    this.dispatchEvent(new Event('open'))
  }
  close() {
    if (this.readyState === 'closed') return
    this.readyState = 'closed'
    this.dispatchEvent(new Event('close'))
  }
  drain() {
    this.bufferedAmount = 0
    this.dispatchEvent(new Event('bufferedamountlow'))
  }
  receive(frame: ArrayBuffer) {
    this.dispatchEvent(new MessageEvent('message', { data: frame }))
  }
}
class Peer extends EventTarget {
  iceGatheringState: RTCIceGatheringState = 'complete'
  connectionState: RTCPeerConnectionState = 'new'
  localDescription: RTCSessionDescriptionInit | null = null
  remoteDescription: RTCSessionDescriptionInit | null = null
  channel = new Channel()
  createDataChannel = vi.fn<() => Channel>(() => this.channel)
  createOffer = vi.fn<() => Promise<RTCSessionDescriptionInit>>(async () => ({
    type: 'offer',
    sdp,
  }))
  createAnswer = vi.fn<() => Promise<RTCSessionDescriptionInit>>(async () => ({
    type: 'answer',
    sdp,
  }))
  setLocalDescription = vi.fn<(description: RTCSessionDescriptionInit) => Promise<void>>(
    async (description) => {
      this.localDescription = description
    },
  )
  setRemoteDescription = vi.fn<(description: RTCSessionDescriptionInit) => Promise<void>>(
    async (description) => {
      this.remoteDescription = description
    },
  )
  close() {
    this.connectionState = 'closed'
    this.dispatchEvent(new Event('connectionstatechange'))
  }
  receiveChannel(channel = this.channel) {
    this.dispatchEvent(Object.assign(new Event('datachannel'), { channel }))
  }
}
const transports: ReturnType<typeof createPeerTransport>[] = []
afterEach(() => {
  for (const transport of transports.splice(0)) transport.close()
  vi.useRealTimers()
})
function harness() {
  const peers: Peer[] = []
  const onMessage = vi.fn<(message: string) => void>()
  const onStatus = vi.fn<(status: PeerTransportStatus) => void>()
  const onError = vi.fn<(error: Error) => void>()
  const createPeerConnection = vi.fn<(configuration: RTCConfiguration) => RTCPeerConnection>(() => {
    const peer = new Peer()
    peers.push(peer)
    return peer as unknown as RTCPeerConnection
  })
  const transport = createPeerTransport({ createPeerConnection, onMessage, onStatus, onError })
  transports.push(transport)
  return { transport, peers, onMessage, onStatus, onError, createPeerConnection }
}
async function connectHost() {
  const host = harness()
  const token = await host.transport.createOffer()
  const offer = await decodePairingToken(token)
  await host.transport.acceptAnswer(await encodePairingToken({ ...offer, kind: 'answer' }))
  host.peers[0]!.channel.open()
  return host
}

describe('server-free peer transport', () => {
  it('exchanges complete pairing descriptions and reliable ordered binary messages without ICE servers', async () => {
    const host = harness()
    const guest = harness()
    const offer = await host.transport.createOffer()
    const answer = await guest.transport.acceptOffer(offer)
    await host.transport.acceptAnswer(answer)
    expect(host.createPeerConnection).toHaveBeenCalledWith({
      iceServers: [],
      bundlePolicy: 'max-bundle',
    })
    expect(guest.createPeerConnection).toHaveBeenCalledWith({
      iceServers: [],
      bundlePolicy: 'max-bundle',
    })
    expect(host.peers[0]!.createDataChannel).toHaveBeenCalledWith('tipsy-trouble', {
      ordered: true,
      protocol: 'tipsy-trouble.v1',
    })
    guest.peers[0]!.receiveChannel()
    host.peers[0]!.channel.open()
    guest.peers[0]!.channel.open()
    const message = JSON.stringify({ card: '🍋'.repeat(10000) })
    await host.transport.send(message)
    for (const frame of host.peers[0]!.channel.sent) guest.peers[0]!.channel.receive(frame)
    expect(guest.onMessage).toHaveBeenCalledExactlyOnceWith(message)
    expect(host.onStatus).toHaveBeenLastCalledWith('connected')
    expect(guest.onStatus).toHaveBeenLastCalledWith('connected')
  })

  it('reports browser initialization failure and can retry with a fresh peer', async () => {
    const host = harness()
    host.createPeerConnection.mockImplementationOnce(() => {
      throw new Error('WebRTC unavailable')
    })
    await expect(host.transport.createOffer()).rejects.toThrow('WebRTC unavailable')
    expect(host.onStatus).toHaveBeenLastCalledWith('failed')
    expect(host.onError).toHaveBeenCalledExactlyOnceWith(new Error('WebRTC unavailable'))
    expect((await decodePairingToken(await host.transport.createOffer())).kind).toBe('offer')
  })

  it('rejects stale, wrong-role and duplicate answers without abandoning a valid pending offer', async () => {
    const host = harness()
    await expect(host.transport.acceptAnswer('tt1.invalid')).rejects.toThrow('fresh host offer')
    const offerToken = await host.transport.createOffer()
    const offer = await decodePairingToken(offerToken)
    await expect(host.transport.acceptAnswer(offerToken)).rejects.toThrow('different pairing')
    await expect(
      host.transport.acceptAnswer(
        await encodePairingToken({ ...offer, kind: 'answer', connectionId: crypto.randomUUID() }),
      ),
    ).rejects.toThrow('different pairing')
    await host.transport.acceptAnswer(await encodePairingToken({ ...offer, kind: 'answer' }))
    await expect(
      host.transport.acceptAnswer(await encodePairingToken({ ...offer, kind: 'answer' })),
    ).rejects.toThrow('fresh host offer')
    expect(host.onError).not.toHaveBeenCalled()
  })

  it('waits for completed ICE gathering and cancels an obsolete pending attempt when re-paired', async () => {
    const host = harness()
    const pending = host.transport.createOffer()
    host.peers[0]!.iceGatheringState = 'gathering'
    await vi.waitFor(() => expect(host.peers[0]!.setLocalDescription).toHaveBeenCalledOnce())
    const [, replacement] = await Promise.all([
      expect(pending).rejects.toThrow(/closed|cancelled/),
      host.transport.createOffer(),
    ])
    expect(host.peers[0]!.connectionState).toBe('closed')
    expect((await decodePairingToken(replacement)).kind).toBe('offer')
    expect(host.onError).not.toHaveBeenCalled()
  })

  it('fails bounded ICE gathering and closes peer resources', async () => {
    vi.useFakeTimers()
    const host = harness()
    const pending = host.transport.createOffer()
    host.peers[0]!.iceGatheringState = 'gathering'
    await Promise.all([
      expect(pending).rejects.toThrow('gather local'),
      vi.advanceTimersByTimeAsync(10_000),
    ])
    expect(host.onStatus).toHaveBeenLastCalledWith('failed')
    expect(host.peers[0]!.connectionState).toBe('closed')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves the failure cause when ICE gathering is aborted by a network error', async () => {
    const host = harness()
    const pending = host.transport.createOffer()
    host.peers[0]!.iceGatheringState = 'gathering'
    await vi.waitFor(() => expect(host.peers[0]!.setLocalDescription).toHaveBeenCalledOnce())
    await Promise.all([
      expect(pending).rejects.toThrow('Could not connect directly'),
      Promise.resolve().then(() => {
        host.peers[0]!.connectionState = 'failed'
        host.peers[0]!.dispatchEvent(new Event('connectionstatechange'))
      }),
    ])
    expect(host.onError).toHaveBeenCalledOnce()
  })

  it('times out an unanswered connection after the host applies the guest answer', async () => {
    vi.useFakeTimers()
    const host = harness()
    const offer = await decodePairingToken(await host.transport.createOffer())
    await host.transport.acceptAnswer(await encodePairingToken({ ...offer, kind: 'answer' }))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(host.onStatus).toHaveBeenLastCalledWith('failed')
    expect(host.onError.mock.calls[0]![0].message).toContain('timed out')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('respects backpressure, bounds the send queue and rejects pending sends when closed', async () => {
    const host = await connectHost()
    const channel = host.peers[0]!.channel
    channel.bufferedAmount = 256 * 1024
    const first = host.transport.send('x'.repeat(MAX_MESSAGE_BYTES))
    const second = host.transport.send('y'.repeat(MAX_MESSAGE_BYTES))
    await expect(host.transport.send('overflow')).rejects.toThrow('Too many')
    expect(channel.sent).toHaveLength(0)
    channel.drain()
    await Promise.all([first, second])
    const received = vi.fn<(message: string) => void>()
    const assembler = createMessageAssembler(received, (error) => {
      throw error
    })
    for (const frame of channel.sent) assembler.receive(frame)
    expect(received.mock.calls.map(([message]) => message.length)).toEqual([
      MAX_MESSAGE_BYTES,
      MAX_MESSAGE_BYTES,
    ])
    channel.bufferedAmount = 256 * 1024
    const waiting = host.transport.send('waiting')
    await Promise.all([
      expect(waiting).rejects.toThrow(/closed|cancelled/),
      Promise.resolve().then(() => host.transport.close()),
    ])
    expect(host.onStatus).toHaveBeenLastCalledWith('closed')
  })

  it('fails malformed or stalled incoming frames and ignores old callbacks after disposal', async () => {
    vi.useFakeTimers()
    const host = await connectHost()
    const channel = host.peers[0]!.channel
    const frames = [...messageFrames(encodeMessage('x'.repeat(32_000)), 1)]
    channel.receive(frames[0]!)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(host.onStatus).toHaveBeenLastCalledWith('failed')
    expect(host.onError.mock.calls[0]![0].message).toContain('message timed out')
    channel.receive(frames[1]!)
    channel.open()
    expect(host.onMessage).not.toHaveBeenCalled()
    expect(host.onStatus).toHaveBeenLastCalledWith('failed')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects extra or unreliable channels and reports network loss', async () => {
    const host = await connectHost()
    host.peers[0]!.connectionState = 'disconnected'
    host.peers[0]!.dispatchEvent(new Event('connectionstatechange'))
    expect(host.onStatus).toHaveBeenLastCalledWith('failed')
    await expect(host.transport.send('message')).rejects.toThrow('not connected')
    const offer = await host.transport.createOffer()
    const guest = harness()
    await guest.transport.acceptOffer(offer)
    const unexpected = new Channel()
    unexpected.ordered = false
    guest.peers[0]!.receiveChannel(unexpected)
    expect(unexpected.readyState).toBe('closed')
    expect(guest.onError.mock.calls[0]![0].message).toContain('unsupported data channel')
  })
})
