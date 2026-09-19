<script setup lang="ts">
import { computed, nextTick, onMounted, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { t } from '@/app/i18n'
import { library } from '@/app/library'
import { useGameSession } from '@/features/game/composables/useGameSession'
import AppButton from '@/shared/components/AppButton.vue'
import AppDialog from '@/shared/components/AppDialog.vue'
import PlayerAvatar from '@/shared/components/PlayerAvatar.vue'
import PlayerForm from '@/features/players/components/PlayerForm.vue'
import CardEditor from '@/features/cards/components/CardEditor.vue'
import BackupPanel from '@/features/cards/components/BackupPanel.vue'
import CardLibrarySection from '../components/CardLibrarySection.vue'
import LibraryTabs from '@/shared/components/LibraryTabs.vue'
import AppSectionHeader from '@/shared/components/AppSectionHeader.vue'
import { builtInCards } from '@/features/cards/catalogue'
import type { CardDefinition } from '@/features/cards/domain/cards'
import type { PlayerProfile } from '@/features/players/domain/playerProfile'

const route = useRoute()
const { isGameActive, sessionLoaded } = useGameSession()
const tabs = ['players', 'cards', 'backups'] as const
const tab = computed(() => tabs.find((tab) => tab === route.query.tab) ?? 'players')
const players = ref<PlayerProfile[]>([])
const cards = ref<CardDefinition[]>([])
const disabledCardIds = ref<readonly string[]>([])
const toggling = ref(false)
let viewActive = true
onScopeDispose(() => {
  viewActive = false
})
const cardGroups = computed(() => {
  const disabled = new Set(disabledCardIds.value)
  return [
    {
      key: 'enabledCustom',
      custom: true,
      enabled: true,
      cards: cards.value.filter((card) => !disabled.has(card.id)),
    },
    {
      key: 'disabledCustom',
      custom: true,
      enabled: false,
      cards: cards.value.filter((card) => disabled.has(card.id)),
    },
    {
      key: 'enabledBuiltIn',
      custom: false,
      enabled: true,
      cards: builtInCards.filter((card) => !disabled.has(card.id)),
    },
    {
      key: 'disabledBuiltIn',
      custom: false,
      enabled: false,
      cards: builtInCards.filter((card) => disabled.has(card.id)),
    },
  ]
})
const enabledCards = computed(() =>
  cardGroups.value.filter((group) => group.enabled).flatMap((group) => group.cards),
)
const noOrdinaryCards = computed(() => !enabledCards.value.some((card) => card.kind !== 'special'))
const editingPlayer = ref<PlayerProfile>()
const editingCard = ref<CardDefinition>()
const playerFormOpen = ref(false)
const cardFormOpen = ref(false)
const removingPlayer = ref<PlayerProfile>()
const removingCard = ref<CardDefinition>()
const removalInvoker = shallowRef<HTMLElement | null>(null)
const busy = ref(false)
const loaded = ref(false)
const error = ref('')
const removalError = ref('')
const success = ref('')
watch(tab, () => {
  success.value = ''
})
const sectionHeading = ref<InstanceType<typeof AppSectionHeader>>()

async function load() {
  error.value = ''
  try {
    const [savedPlayers, deck] = await Promise.all([
      library.listPlayers(),
      library.loadDeckConfiguration(),
    ])
    players.value = savedPlayers
    cards.value = deck.customCards
    disabledCardIds.value = deck.disabledCardIds
    loaded.value = true
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('common.error')
  }
}
onMounted(load)

async function toggleCard(card: CardDefinition) {
  if (toggling.value) return
  toggling.value = true
  error.value = ''
  success.value = ''
  try {
    const enabled = disabledCardIds.value.includes(card.id)
    await library.setCardEnabled(card.id, enabled)
    const deck = await library.loadDeckConfiguration()
    cards.value = deck.customCards
    disabledCardIds.value = deck.disabledCardIds
    if (!viewActive || tab.value !== 'cards') return
    success.value = t(enabled ? 'library.cardEnabled' : 'library.cardDisabled', {
      title: card.title,
    })
    toggling.value = false
    await nextTick()
    if (viewActive && tab.value === 'cards')
      document.getElementById(`card-toggle-${card.id}`)?.focus()
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('common.error')
  } finally {
    toggling.value = false
  }
}
function editPlayer(player?: PlayerProfile) {
  editingPlayer.value = player
  playerFormOpen.value = true
  success.value = ''
}
function editCard(card?: CardDefinition) {
  editingCard.value = card
  cardFormOpen.value = true
  success.value = ''
}
async function saved() {
  playerFormOpen.value = false
  cardFormOpen.value = false
  editingPlayer.value = undefined
  editingCard.value = undefined
  await load()
  success.value = t('common.saved')
}
function confirmPlayerRemoval(player: PlayerProfile, event: MouseEvent) {
  removalInvoker.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  removingPlayer.value = player
}
function confirmCardRemoval(card: CardDefinition, event: MouseEvent) {
  removalInvoker.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  removingCard.value = card
}
function closeRemoval() {
  removalError.value = ''
  removingPlayer.value = undefined
  removingCard.value = undefined
}
async function remove() {
  if (busy.value) return
  busy.value = true
  removalError.value = ''
  try {
    if (removingPlayer.value) await library.deletePlayer(removingPlayer.value.id)
    if (removingCard.value) await library.deleteCustomCard(removingCard.value.id)
    removingPlayer.value = undefined
    removingCard.value = undefined
    await load()
    await nextTick()
    sectionHeading.value?.$el.focus()
  } catch (failure) {
    removalError.value = failure instanceof Error ? failure.message : t('common.error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="page library-page">
    <header class="library-header">
      <div>
        <p class="eyebrow">{{ t('library.eyebrow') }}</p>
        <h1>{{ t('library.title') }}</h1>
        <p class="page-intro">{{ t('library.intro') }}</p>
      </div>
      <RouterLink
        v-if="sessionLoaded && !isGameActive"
        class="button button-secondary"
        to="/players"
        >{{ t('library.play') }} <span aria-hidden="true">↗</span></RouterLink
      >
    </header>
    <LibraryTabs :active="tab" />
    <p v-if="error" class="error-message" role="alert">
      {{ error }} <AppButton variant="quiet" @click="load">{{ t('common.retry') }}</AppButton>
    </p>
    <p v-if="success" class="success-message" role="status">{{ success }}</p>
    <p v-if="!loaded" class="loading-state">{{ t('common.loading') }}</p>
    <template v-else-if="tab === 'players'">
      <AppSectionHeader
        ref="sectionHeading"
        tabindex="-1"
        role="region"
        :aria-label="t('library.playersHeading')"
        :title="t('library.playersHeading')"
        :description="t('library.playersIntro')"
      >
        <AppButton v-if="!playerFormOpen" @click="editPlayer()"
          >{{ t('players.add') }} <span aria-hidden="true">+</span></AppButton
        >
      </AppSectionHeader>
      <PlayerForm
        v-if="playerFormOpen"
        :key="editingPlayer?.id ?? 'new'"
        class="library-editor"
        :player="editingPlayer"
        cancellable
        @saved="saved"
        @cancel="playerFormOpen = false"
      />
      <div v-if="!players.length && !playerFormOpen" class="library-empty">
        <span aria-hidden="true">☺</span>
        <h3>{{ t('library.playersEmpty') }}</h3>
        <p>{{ t('library.playersEmptyText') }}</p>
      </div>
      <div class="saved-player-grid">
        <article v-for="player in players" :key="player.id" class="saved-player-tile">
          <PlayerAvatar :name="player.name" :photo="player.photo" large />
          <h3>{{ player.name }}</h3>
          <div class="tile-actions">
            <AppButton
              variant="quiet"
              :disabled="playerFormOpen"
              :aria-label="t('players.edit', { name: player.name })"
              @click="editPlayer(player)"
              >{{ t('common.edit') }}</AppButton
            ><AppButton
              variant="quiet"
              :disabled="playerFormOpen"
              :aria-label="t('players.delete', { name: player.name })"
              @click="confirmPlayerRemoval(player, $event)"
              >{{ t('common.delete') }}</AppButton
            >
          </div>
        </article>
      </div>
    </template>
    <template v-else-if="tab === 'cards'">
      <AppSectionHeader
        ref="sectionHeading"
        tabindex="-1"
        role="region"
        :aria-label="t('cards.custom')"
        :title="t('cards.custom')"
        :description="
          t('library.cardsIntro', {
            enabled: enabledCards.length,
            count: builtInCards.length + cards.length,
          })
        "
      >
        <AppButton v-if="!cardFormOpen" :disabled="toggling" @click="editCard()"
          >{{ t('cards.add') }} <span aria-hidden="true">+</span></AppButton
        >
      </AppSectionHeader>
      <CardEditor
        v-if="cardFormOpen"
        :key="editingCard?.id ?? 'new'"
        :card="editingCard"
        cancellable
        @saved="saved"
        @cancel="cardFormOpen = false"
      />
      <p v-if="noOrdinaryCards" class="callout" role="status">{{ t('library.noOrdinaryCards') }}</p>
      <CardLibrarySection
        v-for="group in cardGroups"
        :key="group.key"
        :title="t(`library.${group.key}`)"
        :cards="group.cards"
        :custom="group.custom"
        :enabled="group.enabled"
        :busy="toggling || cardFormOpen"
        @toggle="toggleCard"
        @edit="editCard"
        @remove="confirmCardRemoval"
      />
    </template>
    <BackupPanel v-else @imported="load" />
    <p class="library-storage-note">{{ t('library.localNote') }}</p>
    <AppDialog
      :open="Boolean(removingPlayer || removingCard)"
      :return-focus="removalInvoker"
      :title="t('library.deleteTitle')"
      :confirm-label="t('common.delete')"
      :busy="busy"
      danger
      @confirm="remove"
      @close="closeRemoval"
    >
      <p>
        {{
          removingPlayer
            ? t('players.deleteConfirm', { name: removingPlayer.name })
            : t('cards.deleteConfirm')
        }}
      </p>
      <p v-if="removalError" class="error-message" role="alert">{{ removalError }}</p>
    </AppDialog>
  </section>
</template>

<style scoped>
.library-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.library-header .button {
  flex-shrink: 0;
}

.library-editor {
  max-width: 600px;
  margin-bottom: 24px;
}
.saved-player-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.saved-player-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 28px 16px 12px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 20px;
  text-align: center;
}
.saved-player-tile h3 {
  overflow-wrap: anywhere;
}
.tile-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}
.library-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 24px;
  border: 1px dashed var(--line);
  border-radius: 20px;
  gap: 12px;
  color: var(--muted);
}
.library-empty > span {
  font-size: 3rem;
  color: var(--accent);
}
.library-empty h3 {
  color: var(--text);
  font-size: 1.3rem;
}
.library-storage-note {
  color: var(--muted);
  font-size: 0.8rem;
  margin-top: 36px;
  max-width: 660px;
}
@media (max-width: 620px) {
  .library-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 16px;
  }

  .saved-player-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .saved-player-tile {
    padding: 20px 8px 8px;
  }
  .tile-actions {
    gap: 0;
  }
}
</style>
