<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { t } from '@/app/i18n'
import { library } from '@/app/library'
import { getCurrentPlayer, getHouseRuleAuthor } from '../domain/game'
import { useGameSession } from '../composables/useGameSession'
import type { PlayerProfile } from '@/features/players/domain/playerProfile'
import PlayerAvatar from '@/shared/components/PlayerAvatar.vue'
import AppButton from '@/shared/components/AppButton.vue'
import AppDialog from '@/shared/components/AppDialog.vue'
import GameCard from '../components/GameCard.vue'
import HouseRuleForm from '../components/HouseRuleForm.vue'
import ActiveRules from '../components/ActiveRules.vue'
import '../styles/game.css'

const router = useRouter()
const turnHeading = ref<HTMLHeadingElement>()
const endDialogOpen = ref(false)
const endDialogInvoker = shallowRef<HTMLElement | null>(null)
const {
  gameSession,
  sessionLoaded,
  sessionBusy,
  sessionError,
  loadSession,
  nextTurn,
  addHouseRule,
  endGame,
} = useGameSession()
const profiles = ref<PlayerProfile[]>([])
const profileError = ref('')
const author = computed(() => (gameSession.value ? getHouseRuleAuthor(gameSession.value) : null))
const currentPlayer = computed(() =>
  gameSession.value ? (author.value ?? getCurrentPlayer(gameSession.value)) : null,
)
const nextPlayer = computed(() => {
  const session = gameSession.value
  if (!session) return null
  return session.players[
    (session.currentPlayerIndex + (author.value ? 0 : 1)) % session.players.length
  ]!
})
function photoFor(id: string) {
  return profiles.value.find((profile) => profile.id === id)?.photo
}
onMounted(async () => {
  await loadSession()
  try {
    profiles.value = await library.listPlayers()
  } catch (failure) {
    profileError.value = failure instanceof Error ? failure.message : t('common.error')
  }
})
function confirmEnd(event: MouseEvent) {
  endDialogInvoker.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  endDialogOpen.value = true
}
async function end() {
  if (await endGame()) {
    endDialogOpen.value = false
    await router.push('/')
  }
}
async function revealSavedTurn(action: () => Promise<boolean>) {
  if (!(await action())) return
  await nextTick()
  turnHeading.value?.focus({ preventScroll: true })
  turnHeading.value?.scrollIntoView({ block: 'start' })
}
function saveHouseRule(text: string) {
  return revealSavedTurn(() => addHouseRule(text))
}
</script>
<template>
  <section class="page play-page">
    <p v-if="sessionError || profileError" class="error-message" role="alert">
      {{ sessionError || profileError }}
    </p>
    <p v-if="!sessionLoaded" class="loading-state">
      {{ t('common.loading') }}
      <AppButton v-if="sessionError" variant="secondary" @click="loadSession(true)">{{
        t('common.retry')
      }}</AppButton>
    </p>
    <template v-else-if="gameSession && currentPlayer && nextPlayer">
      <header class="play-turnbar">
        <div class="play-current-player">
          <PlayerAvatar :name="currentPlayer.name" :photo="photoFor(currentPlayer.id)" />
          <div class="play-turn-copy">
            <p class="play-turn-label">
              {{
                author
                  ? t('play.ruleTurn')
                  : t('game.turn', { count: gameSession.completedTurns + 1 })
              }}
            </p>
            <h1 ref="turnHeading" tabindex="-1" :title="currentPlayer.name">
              {{ t('game.yourTurn', { name: currentPlayer.name }) }}
            </h1>
          </div>
        </div>
        <div class="play-next-player">
          <span>{{ t('play.upNext') }}</span
          ><strong :title="nextPlayer.name">{{ nextPlayer.name }}</strong>
        </div>
        <AppButton
          variant="secondary"
          class="play-end-button"
          :disabled="sessionBusy"
          @click="confirmEnd"
          >{{ t('game.end') }}</AppButton
        >
      </header>
      <div class="play-layout">
        <div class="play-turn">
          <HouseRuleForm
            v-if="author"
            :key="author.id"
            :author="author"
            :busy="sessionBusy"
            @submit="saveHouseRule"
          />
          <GameCard
            v-else
            :session="gameSession"
            :busy="sessionBusy"
            @next="(targetId) => revealSavedTurn(() => nextTurn(targetId))"
          />
          <p class="play-save-hint">{{ t('play.savedLocally') }}</p>
        </div>
        <aside class="play-sidebar">
          <ActiveRules :session="gameSession" />
          <details class="play-roster" open>
            <summary>
              {{ t('play.players') }} <span>{{ gameSession.players.length }}</span>
            </summary>
            <p v-if="gameSession.settings.seed" class="help-text">
              {{ t('play.seed') }} <code>{{ gameSession.settings.seed }}</code>
            </p>
            <ol>
              <li
                v-for="player in gameSession.players"
                :key="player.id"
                :class="{ 'is-current': player.id === currentPlayer.id }"
              >
                <PlayerAvatar :name="player.name" :photo="photoFor(player.id)" /><span>{{
                  player.name
                }}</span>
              </li>
            </ol>
          </details>
        </aside>
      </div>
      <AppDialog
        :open="endDialogOpen"
        :return-focus="endDialogInvoker"
        :title="t('play.endTitle')"
        :confirm-label="t('game.end')"
        :cancel-label="t('play.keepPlaying')"
        :busy="sessionBusy"
        danger
        @confirm="end"
        @close="endDialogOpen = false"
      >
        <p>{{ t('play.endBody') }}</p>
        <p v-if="sessionError" class="error-message" role="alert">{{ sessionError }}</p>
      </AppDialog>
    </template>
    <template v-else>
      <h1>{{ t('game.emptyTitle') }}</h1>
      <p class="page-intro">{{ t('game.empty') }}</p>
      <RouterLink class="button button-primary" to="/players">{{ t('game.start') }}</RouterLink>
    </template>
  </section>
</template>
