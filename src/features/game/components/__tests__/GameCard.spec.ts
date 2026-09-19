import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { library } from '@/app/library'
import { getCardArtwork } from '@/features/cards/artwork'
import type { CardDefinition } from '@/features/cards/domain/cards'
import GameCard from '../GameCard.vue'

vi.mock('@/app/library', () => ({ library: { loadCardImage: vi.fn<() => Promise<unknown>>() } }))
vi.mock('@/app/i18n', () => ({ t: (key: string) => key }))

const card: CardDefinition = {
  id: 'shared-card',
  kind: 'prompt',
  title: 'One shared card',
  text: 'The host decides which artwork belongs to this card.',
  contentLocale: 'en',
  imageId: 'matching-image-id',
}
const session = {
  currentCard: card,
  temporaryRules: [],
  completedTurns: 0,
  players: [{ id: 'alice', name: 'Alice' }],
  currentPlayerIndex: 0,
}
const createObjectURL = vi.fn<typeof URL.createObjectURL>(() => 'blob:guest-local-artwork')
const revokeObjectURL = vi.fn<typeof URL.revokeObjectURL>()

beforeEach(() => {
  vi.mocked(library.loadCardImage).mockResolvedValue({
    id: card.imageId!,
    mimeType: 'image/jpeg',
    bytes: new Uint8Array([1, 2, 3]).buffer,
  })
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = createObjectURL
      static override revokeObjectURL = revokeObjectURL
    },
  )
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('game card artwork ownership', () => {
  it('uses stock fallback for a remote card without querying a matching guest image', async () => {
    const wrapper = mount(GameCard, {
      props: { session, busy: false, remote: true, readOnly: true },
    })
    await flushPromises()
    expect(library.loadCardImage).not.toHaveBeenCalled()
    expect(wrapper.get('img').attributes('src')).toBe(getCardArtwork(card).src)
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('uses only the supplied host artwork and preserves remote advance controls', async () => {
    const hostArtwork = 'data:image/jpeg;base64,aG9zdC1hcnR3b3Jr'
    const wrapper = mount(GameCard, {
      props: { session, busy: false, remote: true, remoteArtwork: hostArtwork },
    })
    await flushPromises()
    expect(library.loadCardImage).not.toHaveBeenCalled()
    expect(wrapper.get('img').attributes('src')).toBe(hostArtwork)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('next')).toEqual([[]])
    await wrapper.setProps({ busy: true })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('keeps loading and releasing uploaded artwork for a local game', async () => {
    const wrapper = mount(GameCard, { props: { session, busy: false } })
    await flushPromises()
    expect(library.loadCardImage).toHaveBeenCalledExactlyOnceWith(card.imageId)
    expect(wrapper.get('img').attributes('src')).toBe('blob:guest-local-artwork')
    wrapper.unmount()
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:guest-local-artwork')
  })
})
