<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { t } from '@/app/i18n'
import { getCurrentPlayer, getHouseRuleAuthor } from '@/features/game/domain/game'
import { useMultiplayer } from '../composables/useMultiplayer'
import GameCard from '@/features/game/components/GameCard.vue'
import HouseRuleForm from '@/features/game/components/HouseRuleForm.vue'
import ActiveRules from '@/features/game/components/ActiveRules.vue'
import PlayerAvatar from '@/shared/components/PlayerAvatar.vue'
import AppButton from '@/shared/components/AppButton.vue'
import '@/features/game/styles/game.css'

const router = useRouter()
const {
  guestState,
  guestStatus,
  guestError,
  guestBusy,
  canGuestAdvance,
  canGuestAddRule,
  guestNextTurn,
  guestAddHouseRule,
  leaveGuest,
} = useMultiplayer()
const turnHeading = ref<HTMLHeadingElement>()
const game = computed(() => guestState.value?.game)
const author = computed(() => (game.value ? getHouseRuleAuthor(game.value) : null))
const currentPlayer = computed(() =>
  game.value ? (author.value ?? getCurrentPlayer(game.value)) : null,
)
const assignedPlayer = computed(() =>
  game.value?.players.find((player) => player.id === guestState.value?.assignedPlayerId),
)
const nextPlayer = computed(
  () =>
    game.value?.players[
      (game.value.currentPlayerIndex + (author.value ? 0 : 1)) % game.value.players.length
    ],
)
const connected = computed(() => guestStatus.value === 'connected')
const mayAdvance = computed(
  () =>
    connected.value &&
    (canGuestAdvance.value ||
      (guestBusy.value && !author.value && currentPlayer.value?.id === assignedPlayer.value?.id)),
)
const mayAddRule = computed(
  () =>
    connected.value &&
    (canGuestAddRule.value || (guestBusy.value && author.value?.id === assignedPlayer.value?.id)),
)
let requestedTurn = false
watch(guestBusy, async (busy, wasBusy) => {
  if (busy || !wasBusy || !requestedTurn) return
  requestedTurn = false
  await nextTick()
  if (!guestError.value) turnHeading.value?.focus({ preventScroll: true })
})
async function advance(targetId?: string) {
  requestedTurn = true
  await guestNextTurn(targetId)
}
async function addRule(text: string) {
  requestedTurn = true
  await guestAddHouseRule(text)
}
async function leave() {
  leaveGuest()
  await router.push('/multiplayer')
}
</script>

<template>
  <section class="page play-page guest-page">
    <p v-if="guestError" class="error-message" role="alert">{{ guestError }}</p>
    <template v-if="game && currentPlayer">
      <div class="guest-connection" :class="{ 'is-disconnected': !connected }">
        <p v-if="connected" class="guest-identity" :title="assignedPlayer?.name">
          {{ t('multiplayer.guest.playingAs', { name: assignedPlayer?.name ?? '' }) }}
        </p>
        <p v-else role="status">{{ t('multiplayer.guest.disconnected') }}</p>
        <RouterLink v-if="!connected" to="/multiplayer">{{
          t('multiplayer.guest.reconnect')
        }}</RouterLink>
        <AppButton variant="quiet" :disabled="guestBusy" @click="leave">{{
          t('multiplayer.guest.leave')
        }}</AppButton>
      </div>
      <header class="play-turnbar">
        <div class="play-current-player">
          <PlayerAvatar :name="currentPlayer.name" />
          <div class="play-turn-copy">
            <p class="play-turn-label">
              {{ author ? t('play.ruleTurn') : t('game.turn', { count: game.completedTurns + 1 }) }}
            </p>
            <h1 ref="turnHeading" tabindex="-1" :title="currentPlayer.name">
              {{ t('game.yourTurn', { name: currentPlayer.name }) }}
            </h1>
          </div>
        </div>
        <div v-if="nextPlayer" class="play-next-player">
          <span>{{ t('play.upNext') }}</span
          ><strong :title="nextPlayer.name">{{ nextPlayer.name }}</strong>
        </div>
      </header>
      <div class="play-layout">
        <div class="play-turn">
          <template v-if="author">
            <HouseRuleForm
              v-if="mayAddRule"
              :key="author.id"
              :author="author"
              :busy="guestBusy"
              @submit="addRule"
            />
            <section v-else class="guest-waiting">
              <h2>{{ t('multiplayer.guest.ruleTitle') }}</h2>
              <p>{{ t('multiplayer.guest.waitForRule', { name: author.name }) }}</p>
            </section>
          </template>
          <GameCard
            v-else
            :session="game"
            :busy="guestBusy"
            :read-only="!mayAdvance"
            remote
            :remote-artwork="guestState?.currentArtwork"
            @next="advance"
          />
          <p v-if="!author && !mayAdvance && connected" class="play-save-hint" role="status">
            {{ t('multiplayer.guest.waitForTurn', { name: currentPlayer.name }) }}
          </p>
          <p v-if="guestBusy" class="play-save-hint" role="status">
            {{ t('multiplayer.guest.saving') }}
          </p>
        </div>
        <aside class="play-sidebar">
          <ActiveRules :session="game" />
          <details class="play-roster" open>
            <summary>
              {{ t('play.players') }} <span>{{ game.players.length }}</span>
            </summary>
            <ol>
              <li
                v-for="player in game.players"
                :key="player.id"
                :class="{ 'is-current': player.id === currentPlayer.id }"
              >
                <PlayerAvatar :name="player.name" /><span>{{ player.name }}</span>
              </li>
            </ol>
          </details>
        </aside>
      </div>
    </template>
    <div v-else class="empty-state">
      <h1>{{ t('multiplayer.guest.empty') }}</h1>
      <p>{{ t('multiplayer.guest.emptyHint') }}</p>
      <RouterLink class="button button-primary" to="/multiplayer">{{
        t('multiplayer.room.joinTitle')
      }}</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.guest-connection {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  align-items: center;
  margin-bottom: var(--space-3);
  border-bottom: 1px solid var(--line);
  padding-bottom: var(--space-2);
  color: var(--muted);
  font-size: 0.875rem;
}
.guest-connection p {
  flex: 1 1 12rem;
  min-width: 0;
  overflow-wrap: anywhere;
}
.guest-identity {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.guest-connection.is-disconnected {
  color: var(--accent);
}
.guest-waiting {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: var(--space-6);
  display: grid;
  gap: var(--space-3);
  overflow-wrap: anywhere;
}
</style>
