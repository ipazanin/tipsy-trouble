<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { t } from '@/app/i18n'
import { library } from '@/app/library'
import { getCurrentPlayer, getHouseRuleAuthor } from '../domain/game'
import { useGameSession } from '../composables/useGameSession'
import type { PlayerProfile } from '@/features/players/domain/playerProfile'
import PlayerAvatar from '@/shared/components/PlayerAvatar.vue'
import GameCard from '../components/GameCard.vue'
import HouseRuleForm from '../components/HouseRuleForm.vue'
import ActiveRules from '../components/ActiveRules.vue'
const router = useRouter()
const turnHeading = ref<HTMLHeadingElement>()
const {
  gameSession,
  sessionLoaded,
  sessionBusy,
  sessionError,
  loadSession,
  nextTurn,
  skipCard,
  activateRule,
  addHouseRule,
  endGame,
} = useGameSession()
const profiles = ref<PlayerProfile[]>([]),
  profileError = ref('')
const currentPlayer = computed(() =>
  gameSession.value
    ? (getHouseRuleAuthor(gameSession.value) ?? getCurrentPlayer(gameSession.value))
    : null,
)
const author = computed(() => (gameSession.value ? getHouseRuleAuthor(gameSession.value) : null))
const activeRuleCount = computed(() =>
  gameSession.value
    ? gameSession.value.temporaryRules.length + gameSession.value.houseRules.length
    : 0,
)
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
async function end() {
  if (window.confirm(t('game.endConfirm')) && (await endGame())) await router.push('/')
}
async function revealSavedTurn(action: () => Promise<boolean>) {
  if (!(await action())) return
  await nextTick()
  turnHeading.value?.focus({ preventScroll: true })
  turnHeading.value?.scrollIntoView({ block: 'start' })
}
function saveHouseRule(text: string, targetId?: string) {
  return revealSavedTurn(() => addHouseRule(text, targetId))
}
</script>
<template>
  <section class="page game-page">
    <p v-if="sessionError || profileError" class="error-message" role="alert">
      {{ sessionError || profileError }}
    </p>
    <p v-if="!sessionLoaded" class="loading-state">
      {{ t('common.loading') }}
      <button v-if="sessionError" class="button button-secondary" @click="loadSession(true)">
        {{ t('common.retry') }}
      </button>
    </p>
    <template v-else-if="gameSession && currentPlayer"
      ><div class="game-topbar">
        <div class="game-progress">
          <span class="pill pill-coral">{{
            t('game.circle', {
              count: Math.floor(gameSession.completedTurns / gameSession.players.length) + 1,
            })
          }}</span
          ><span class="pill">{{ t('game.turn', { count: gameSession.completedTurns + 1 }) }}</span>
        </div>
        <button class="button button-quiet" :disabled="sessionBusy" @click="end">
          {{ t('game.end') }}
        </button>
      </div>
      <div class="turn-heading">
        <PlayerAvatar :name="currentPlayer.name" :photo="photoFor(currentPlayer.id)" large />
        <h1 ref="turnHeading" tabindex="-1">
          {{ t('game.yourTurn', { name: currentPlayer.name }) }}
        </h1>
      </div>
      <RouterLink
        v-if="activeRuleCount"
        class="rule-jump"
        :to="{ path: '/play', hash: '#active-rules' }"
      >
        {{
          t(activeRuleCount === 1 ? 'game.viewOneRule' : 'game.viewRules', {
            count: activeRuleCount,
          })
        }}
        <span aria-hidden="true">↓</span>
      </RouterLink>
      <HouseRuleForm
        v-if="author"
        :key="author.id"
        :author="author"
        :players="gameSession.players"
        :busy="sessionBusy"
        @submit="saveHouseRule" /><GameCard
        v-else
        :session="gameSession"
        :busy="sessionBusy"
        @next="revealSavedTurn(nextTurn)"
        @skip="revealSavedTurn(skipCard)"
        @activate="activateRule" />
      <p class="session-hint" role="status">{{ t('game.resumeHint') }}</p>
      <section class="game-roster">
        <h2 class="eyebrow">{{ t('game.roster') }}</h2>
        <div class="roster-strip">
          <span
            v-for="player in gameSession.players"
            :key="player.id"
            class="roster-chip"
            :class="{ active: player.id === currentPlayer.id }"
            ><PlayerAvatar :name="player.name" :photo="photoFor(player.id)" />{{
              player.name
            }}</span
          >
        </div>
      </section>
      <ActiveRules :session="gameSession" /></template
    ><template v-else
      ><h1>{{ t('game.emptyTitle') }}</h1>
      <p class="page-intro">{{ t('game.empty') }}</p>
      <RouterLink class="button button-primary" to="/players">{{
        t('game.start')
      }}</RouterLink></template
    >
  </section>
</template>

<style scoped>
.turn-heading h1 {
  scroll-margin-top: 24px;
}
</style>
