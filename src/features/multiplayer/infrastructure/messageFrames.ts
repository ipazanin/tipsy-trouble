export const MAX_MESSAGE_BYTES = 4 * 1024 * 1024
export const MAX_FRAME_BYTES = 16 * 1024
const HEADER_BYTES = 16
const MAGIC = 0x54540101
export const MESSAGE_TIMEOUT_MS = 15_000

export function encodeMessage(message: string): Uint8Array<ArrayBuffer> {
  if (message.length > MAX_MESSAGE_BYTES) throw new Error('The multiplayer message exceeds 4 MiB.')
  const bytes = new TextEncoder().encode(message)
  if (bytes.length > MAX_MESSAGE_BYTES) throw new Error('The multiplayer message exceeds 4 MiB.')
  return bytes
}

export function* messageFrames(
  bytes: Uint8Array<ArrayBuffer>,
  messageId: number,
): Generator<ArrayBuffer> {
  if (bytes.length > MAX_MESSAGE_BYTES) throw new Error('The multiplayer message exceeds 4 MiB.')
  const chunkBytes = MAX_FRAME_BYTES - HEADER_BYTES
  for (let offset = 0; offset < Math.max(1, bytes.length); offset += chunkBytes) {
    const chunk = bytes.subarray(offset, offset + chunkBytes)
    const frame = new ArrayBuffer(HEADER_BYTES + chunk.length)
    const header = new DataView(frame)
    header.setUint32(0, MAGIC)
    header.setUint32(4, messageId)
    header.setUint32(8, bytes.length)
    header.setUint32(12, offset)
    new Uint8Array(frame, HEADER_BYTES).set(chunk)
    yield frame
  }
}

export function createMessageAssembler(
  onMessage: (message: string) => void,
  onError: (error: Error) => void,
) {
  let pending: { id: number; bytes: Uint8Array<ArrayBuffer>; received: number } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  function clear() {
    clearTimeout(timer)
    timer = undefined
    pending = undefined
  }
  function receive(frame: unknown) {
    try {
      if (
        !(frame instanceof ArrayBuffer) ||
        frame.byteLength < HEADER_BYTES ||
        frame.byteLength > MAX_FRAME_BYTES
      )
        throw new Error('The multiplayer frame is invalid.')
      const header = new DataView(frame)
      const id = header.getUint32(4)
      const total = header.getUint32(8)
      const offset = header.getUint32(12)
      const payload = new Uint8Array(frame, HEADER_BYTES)
      if (
        header.getUint32(0) !== MAGIC ||
        total > MAX_MESSAGE_BYTES ||
        offset + payload.length > total ||
        (total > 0 && payload.length === 0)
      )
        throw new Error('The multiplayer frame is invalid.')
      if (!pending) {
        if (offset !== 0) throw new Error('The multiplayer message is incomplete.')
        pending = { id, bytes: new Uint8Array(total), received: 0 }
        timer = setTimeout(() => {
          clear()
          onError(new Error('The multiplayer message timed out.'))
        }, MESSAGE_TIMEOUT_MS)
      }
      if (pending.id !== id || pending.bytes.length !== total || pending.received !== offset)
        throw new Error('The multiplayer message arrived out of order.')
      pending.bytes.set(payload, offset)
      pending.received += payload.length
      if (pending.received === total) {
        const message = new TextDecoder('utf-8', { fatal: true }).decode(pending.bytes)
        clear()
        onMessage(message)
      }
    } catch (failure) {
      clear()
      onError(failure instanceof Error ? failure : new Error('The multiplayer message is invalid.'))
    }
  }
  return { receive, close: clear }
}
