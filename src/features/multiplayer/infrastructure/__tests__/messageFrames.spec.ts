// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMessageAssembler,
  encodeMessage,
  messageFrames,
  MAX_MESSAGE_BYTES,
  MAX_FRAME_BYTES,
  MESSAGE_TIMEOUT_MS,
} from '../messageFrames'

afterEach(() => {
  vi.useRealTimers()
})
function harness() {
  const received = vi.fn<(message: string) => void>()
  const rejected = vi.fn<(error: Error) => void>()
  return { received, rejected, assembler: createMessageAssembler(received, rejected) }
}

describe('bounded reliable message framing', () => {
  it.each(['', '{"turn":7}', '🍋'.repeat(100_000), 'x'.repeat(MAX_MESSAGE_BYTES)])(
    'round-trips UTF-8 messages across bounded frames %#',
    (message) => {
      const { received, rejected, assembler } = harness()
      const frames = [...messageFrames(encodeMessage(message), 7)]
      for (const frame of frames) {
        expect(frame.byteLength).toBeLessThanOrEqual(MAX_FRAME_BYTES)
        assembler.receive(frame)
      }
      expect(received).toHaveBeenCalledExactlyOnceWith(message)
      expect(rejected).not.toHaveBeenCalled()
      assembler.close()
    },
  )

  it.each(['x'.repeat(MAX_MESSAGE_BYTES + 1), '🍋'.repeat(MAX_MESSAGE_BYTES / 3)])(
    'rejects oversized logical messages before transmission %#',
    (message) => {
      expect(() => encodeMessage(message)).toThrow('4 MiB')
    },
  )

  it.each(['text', null, new ArrayBuffer(0), new ArrayBuffer(MAX_FRAME_BYTES + 1)])(
    'rejects invalid frame types and sizes %#',
    (frame) => {
      const { assembler, received, rejected } = harness()
      assembler.receive(frame)
      expect(rejected).toHaveBeenCalledOnce()
      expect(received).not.toHaveBeenCalled()
    },
  )

  it.each([
    [0, 0],
    [8, MAX_MESSAGE_BYTES + 1],
    [8, 1],
    [12, 5],
  ])('rejects invalid frame headers %#', (offset, replacement) => {
    const { assembler, received, rejected } = harness()
    const frame = [...messageFrames(encodeMessage('hello'), 1)][0]!
    new DataView(frame).setUint32(offset!, replacement!)
    assembler.receive(frame)
    expect(rejected).toHaveBeenCalledOnce()
    expect(received).not.toHaveBeenCalled()
  })

  it('rejects interleaving, missing chunks and invalid UTF-8 without retaining a partial message', () => {
    const { assembler, received, rejected } = harness()
    const frames = [...messageFrames(encodeMessage('x'.repeat(MAX_FRAME_BYTES * 2)), 1)]
    assembler.receive(frames[1])
    expect(rejected).toHaveBeenCalledTimes(1)
    assembler.receive(frames[0])
    assembler.receive([...messageFrames(encodeMessage('another'), 2)][0])
    expect(rejected).toHaveBeenCalledTimes(2)
    assembler.receive([...messageFrames(new Uint8Array([0xff]), 3)][0])
    expect(rejected).toHaveBeenCalledTimes(3)
    assembler.receive([...messageFrames(encodeMessage('recovered'), 4)][0])
    expect(received).toHaveBeenCalledExactlyOnceWith('recovered')
  })

  it('expires incomplete messages and cancels timers when closed', () => {
    vi.useFakeTimers()
    const { assembler, received, rejected } = harness()
    const frames = [...messageFrames(encodeMessage('x'.repeat(MAX_FRAME_BYTES * 2)), 1)]
    assembler.receive(frames[0])
    vi.advanceTimersByTime(MESSAGE_TIMEOUT_MS)
    expect(rejected).toHaveBeenCalledOnce()
    expect(rejected.mock.calls[0]![0].message).toContain('timed out')
    expect(received).not.toHaveBeenCalled()
    assembler.receive(frames[0])
    assembler.close()
    vi.advanceTimersByTime(MESSAGE_TIMEOUT_MS)
    expect(rejected).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
