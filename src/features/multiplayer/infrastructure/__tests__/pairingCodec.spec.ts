// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  decodePairingToken,
  encodePairingToken,
  extractPairingToken,
  MAX_PAIRING_TOKEN_LENGTH,
  PAIRING_LIFETIME_MS,
  type PairingDescription,
} from '../pairingCodec'

const now = 1_800_000_000_000
const sdp =
  'v=0\r\na=ice-ufrag:test\r\na=ice-pwd:test-password\r\na=fingerprint:sha-256 AA:BB\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=candidate:1 1 udp 2122262783 test.local 12345 typ host\r\n'
const offer: PairingDescription = {
  version: 1,
  kind: 'offer',
  connectionId: '9825dada-83f4-4e8a-ae46-98d9a98dd350',
  expiresAt: now + PAIRING_LIFETIME_MS,
  sdp,
}

async function encodeUntrusted(candidate: unknown) {
  const compressed = await new Response(
    new Blob([JSON.stringify(candidate)]).stream().pipeThrough(new CompressionStream('deflate')),
  ).arrayBuffer()
  return 'tt1.' + Buffer.from(compressed).toString('base64url')
}

describe('manual pairing codec', () => {
  it('round-trips complete offers and answers in compact offline tokens and fragment links', async () => {
    for (const kind of ['offer', 'answer'] as const) {
      const description = { ...offer, kind }
      const token = await encodePairingToken(description, now)
      expect(token).toMatch(/^tt1\.[a-zA-Z0-9_-]+$/)
      expect(token.length).toBeLessThan(
        Buffer.from(JSON.stringify(description)).toString('base64url').length,
      )
      for (const input of [
        token,
        ` #${token} `,
        `#/multiplayer?pair=${token}`,
        `https://example.test/tipsy-trouble/#/multiplayer?pair=${token}`,
      ]) {
        expect(await decodePairingToken(input, now)).toEqual(description)
      }
    }
  })

  it.each([
    null,
    [],
    { ...offer, version: 2 },
    { ...offer, kind: 'join' },
    { ...offer, connectionId: 'not-a-uuid' },
    { ...offer, expiresAt: now },
    { ...offer, expiresAt: 'later' },
    { ...offer, expiresAt: now + PAIRING_LIFETIME_MS + 60_001 },
    { ...offer, sdp: 'v=0\r\n' },
    { ...offer, sdp: `${sdp}${'x'.repeat(65536)}` },
  ])('rejects malformed, expired or oversized pairing metadata %#', async (candidate) => {
    await expect(decodePairingToken(await encodeUntrusted(candidate), now)).rejects.toThrow(
      /pairing|connection/,
    )
  })

  it.each([
    'garbage',
    '#nothing',
    'javascript:#tt1.test',
    '#/multiplayer?pair=missing',
    `tt1.${'x'.repeat(MAX_PAIRING_TOKEN_LENGTH)}`,
    'tt1.%%%',
  ])('rejects unsupported pairing input %#', async (input) => {
    await expect(decodePairingToken(input, now)).rejects.toThrow(Error)
  })

  it('bounds decompression of hostile compact payloads', async () => {
    const token = await encodeUntrusted({ ...offer, sdp: 'x'.repeat(600_000) })
    await expect(decodePairingToken(token, now)).rejects.toThrow('damaged or too large')
  })

  it('rejects damaged compressed bytes and unexpected payloads', async () => {
    await expect(decodePairingToken('tt1.a', now)).rejects.toThrow('damaged')
    await expect(decodePairingToken('tt1.aGVsbG8', now)).rejects.toThrow('damaged')
    const invalidJson = await new Response(
      new Blob(['not json']).stream().pipeThrough(new CompressionStream('deflate')),
    ).arrayBuffer()
    await expect(
      decodePairingToken('tt1.' + Buffer.from(invalidJson).toString('base64url'), now),
    ).rejects.toThrow('damaged')
    expect(() => extractPairingToken('x'.repeat(MAX_PAIRING_TOKEN_LENGTH + 2049))).toThrow(
      'too large',
    )
  })
})
