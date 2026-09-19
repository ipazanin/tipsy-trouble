import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PairingScanner from '../PairingScanner.vue'

vi.mock('@/app/i18n', () => ({ t: (key: string) => key }))
vi.mock('jsqr', () => ({ default: vi.fn<() => null>(() => null) }))

const getUserMedia = vi.fn<() => Promise<MediaStream>>()

function deferredStream() {
  let resolve!: (stream: MediaStream) => void
  const promise = new Promise<MediaStream>((resolveStream) => {
    resolve = resolveStream
  })
  return { promise, resolve }
}
function cameraStream() {
  const stop = vi.fn<() => void>()
  const track = { stop, addEventListener: vi.fn<MediaStreamTrack['addEventListener']>() }
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream
  return { stream, stop }
}
async function startCamera(wrapper: ReturnType<typeof mount>) {
  const start = wrapper
    .findAll('button')
    .find((button) => button.text() === 'multiplayer.scanner.start')
  await start!.trigger('click')
}

beforeEach(() => {
  getUserMedia.mockReset()
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn<CanvasRenderingContext2D['drawImage']>(),
    getImageData: vi.fn<CanvasRenderingContext2D['getImageData']>(),
  } as unknown as CanvasRenderingContext2D)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('pairing camera ownership', () => {
  it('requests video only and stops the live stream when the scanner unmounts', async () => {
    const camera = cameraStream()
    getUserMedia.mockResolvedValue(camera.stream)
    const scanner = mount(PairingScanner)
    await startCamera(scanner)
    await flushPromises()
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false, video: expect.any(Object) }),
    )
    expect(scanner.find('video').element.srcObject).toBe(camera.stream)
    scanner.unmount()
    expect(camera.stop).toHaveBeenCalledOnce()
  })

  it('stops a stream granted after the user cancels the permission request', async () => {
    const pending = deferredStream()
    const camera = cameraStream()
    getUserMedia.mockReturnValue(pending.promise)
    const scanner = mount(PairingScanner)
    await startCamera(scanner)
    await scanner
      .findAll('button')
      .find((button) => button.text() === 'common.cancel')!
      .trigger('click')
    expect(scanner.emitted('close')).toHaveLength(1)
    pending.resolve(camera.stream)
    await flushPromises()
    expect(camera.stop).toHaveBeenCalledOnce()
    expect(scanner.find('video').exists()).toBe(false)
    expect(scanner.emitted('decoded')).toBeUndefined()
    scanner.unmount()
  })

  it('stops scanning when pairing becomes busy and preserves the paste alternative after denial', async () => {
    const camera = cameraStream()
    getUserMedia.mockResolvedValueOnce(camera.stream)
    const scanner = mount(PairingScanner)
    await startCamera(scanner)
    await flushPromises()
    await scanner.setProps({ busy: true })
    expect(camera.stop).toHaveBeenCalledOnce()
    await scanner.setProps({ busy: false })
    getUserMedia.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
    await startCamera(scanner)
    await flushPromises()
    expect(scanner.get('[role="alert"]').text()).toBe('multiplayer.scanner.denied')
    await scanner.get('textarea').setValue('tt1.example-code')
    await scanner.get('form').trigger('submit')
    expect(scanner.emitted('decoded')).toEqual([['tt1.example-code']])
    scanner.unmount()
  })
})
