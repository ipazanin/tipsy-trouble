export const PAIRING_LIFETIME_MS = 10 * 60 * 1000
export const MAX_PAIRING_TOKEN_LENGTH = 16_384
const MAX_SDP_BYTES = 64 * 1024
const MAX_PAIRING_BYTES = MAX_SDP_BYTES * 6 + 1024
const prefix = 'tt1.'

export interface PairingDescription {
  readonly version: 1
  readonly kind: 'offer' | 'answer'
  readonly connectionId: string
  readonly expiresAt: number
  readonly sdp: string
}

export function extractPairingToken(input: string): string {
  const trimmed = input.trim()
  if (trimmed.length > MAX_PAIRING_TOKEN_LENGTH + 2048)
    throw new Error('The pairing code is too large.')
  if (trimmed.startsWith(prefix)) return trimmed
  if (trimmed.startsWith(`#${prefix}`)) return trimmed.slice(1)
  let fragment = trimmed
  if (!fragment.startsWith('#')) {
    const url = new URL(fragment)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new Error('Choose a valid pairing link.')
    fragment = url.hash
  }
  const query = fragment.indexOf('?')
  const token =
    query < 0 ? fragment.slice(1) : new URLSearchParams(fragment.slice(query + 1)).get('pair')
  if (!token?.startsWith(prefix)) throw new Error('This is not a Tipsy Trouble pairing code.')
  return token
}

function parseDescription(candidate: unknown, now: number): PairingDescription {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate))
    throw new Error('The pairing code is invalid.')
  const description = candidate as Record<string, unknown>
  if (description.version !== 1 || (description.kind !== 'offer' && description.kind !== 'answer'))
    throw new Error('This pairing code uses an unsupported format.')
  if (
    typeof description.connectionId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      description.connectionId,
    )
  )
    throw new Error('The pairing connection identifier is invalid.')
  if (
    typeof description.expiresAt !== 'number' ||
    !Number.isSafeInteger(description.expiresAt) ||
    description.expiresAt <= now
  )
    throw new Error('This pairing code has expired. Create a new one.')
  if (description.expiresAt > now + PAIRING_LIFETIME_MS + 60_000)
    throw new Error('The pairing expiry is invalid. Check the device clocks.')
  if (
    typeof description.sdp !== 'string' ||
    !description.sdp.startsWith('v=0\r\n') ||
    new TextEncoder().encode(description.sdp).length > MAX_SDP_BYTES ||
    !/^a=ice-ufrag:.+/m.test(description.sdp) ||
    !/^a=ice-pwd:.+/m.test(description.sdp) ||
    !/^a=fingerprint:.+/m.test(description.sdp) ||
    !/^m=application .+/m.test(description.sdp) ||
    !/^a=candidate:.+/m.test(description.sdp)
  )
    throw new Error('The pairing code does not contain a complete connection description.')
  return {
    version: 1,
    kind: description.kind,
    connectionId: description.connectionId,
    expiresAt: description.expiresAt,
    sdp: description.sdp,
  }
}

async function readBounded(
  stream: ReadableStream<Uint8Array>,
  maximum: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.length
      if (length > maximum) throw new Error('The pairing code is too large.')
      chunks.push(chunk.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

export async function encodePairingToken(
  description: PairingDescription,
  now = Date.now(),
): Promise<string> {
  const parsed = parseDescription(description, now)
  const bytes = new TextEncoder().encode(JSON.stringify(parsed))
  const compressed = await readBounded(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate')),
    MAX_PAIRING_TOKEN_LENGTH,
  )
  const base64 = btoa(Array.from(compressed, (byte) => String.fromCharCode(byte)).join(''))
  const token = prefix + base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  if (token.length > MAX_PAIRING_TOKEN_LENGTH) throw new Error('The pairing code is too large.')
  return token
}

export async function decodePairingToken(
  input: string,
  now = Date.now(),
): Promise<PairingDescription> {
  const token = extractPairingToken(input)
  if (token.length > MAX_PAIRING_TOKEN_LENGTH || !/^tt1\.[A-Za-z0-9_-]+$/.test(token))
    throw new Error('The pairing code is invalid or too large.')
  const encoded = token.slice(prefix.length).replaceAll('-', '+').replaceAll('_', '/')
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
  } catch {
    throw new Error('The pairing code is damaged.')
  }
  let decompressed: Uint8Array<ArrayBuffer>
  try {
    decompressed = await readBounded(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')),
      MAX_PAIRING_BYTES,
    )
  } catch {
    throw new Error('The pairing code is damaged or too large.')
  }
  let description: unknown
  try {
    description = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decompressed))
  } catch {
    throw new Error('The pairing code is damaged.')
  }
  return parseDescription(description, now)
}
