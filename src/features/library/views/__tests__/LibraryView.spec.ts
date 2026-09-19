import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import type { CardDefinition } from '@/features/cards/domain/cards'
import type { PlayerProfile } from '@/features/players/domain/playerProfile'
import { builtInCards } from '@/features/cards/catalogue'
import CardLibrarySection from '../../components/CardLibrarySection.vue'
import LibraryView from '../LibraryView.vue'

const storage = vi.hoisted(() => ({
  listPlayers: vi.fn<() => Promise<PlayerProfile[]>>(),
  loadDeckConfiguration:
    vi.fn<() => Promise<{ customCards: CardDefinition[]; disabledCardIds: readonly string[] }>>(),
  setCardEnabled: vi.fn<(cardId: string, enabled: boolean) => Promise<void>>(),
}))
vi.mock('@/app/library', () => ({ library: storage }))

describe('library navigation during a card save', () => {
  it('finishes the write without announcing the card after navigating to backups', async () => {
    storage.listPlayers.mockResolvedValue([])
    storage.loadDeckConfiguration
      .mockResolvedValueOnce({ customCards: [], disabledCardIds: [] })
      .mockResolvedValueOnce({ customCards: [], disabledCardIds: [builtInCards[0]!.id] })
    let finishWrite!: () => void
    storage.setCardEnabled.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishWrite = resolve
      }),
    )
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/library', component: LibraryView }],
    })
    await router.push('/library?tab=cards')
    const wrapper = mount(LibraryView, {
      global: {
        plugins: [router],
        stubs: {
          AppButton: true,
          AppDialog: true,
          PlayerAvatar: true,
          PlayerForm: true,
          CardEditor: true,
          BackupPanel: true,
          CardLibrarySection: true,
          LibraryTabs: true,
          AppSectionHeader: true,
        },
      },
    })
    await flushPromises()
    wrapper.findAllComponents(CardLibrarySection)[2]!.vm.$emit('toggle', builtInCards[0])
    await flushPromises()
    expect(storage.setCardEnabled).toHaveBeenCalledWith(builtInCards[0]!.id, false)
    await router.push('/library?tab=backups')
    await flushPromises()
    finishWrite()
    await flushPromises()
    expect(storage.loadDeckConfiguration).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    await router.push('/library?tab=cards')
    await flushPromises()
    expect(wrapper.findAllComponents(CardLibrarySection)[3]!.props('cards')).toEqual([
      builtInCards[0],
    ])
    wrapper.unmount()
  })
})
