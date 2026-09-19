<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { t } from '@/app/i18n'
import { useGameSession } from '@/features/game/composables/useGameSession'
import { useMultiplayer } from '../composables/useMultiplayer'
import AppButton from '@/shared/components/AppButton.vue'
import PairingCode from '../components/PairingCode.vue'
import PairingScanner from '../components/PairingScanner.vue'

const route = useRoute()
const router = useRouter()
const { gameSession, sessionLoaded, loadSession } = useGameSession()
const {
  hostActive,
  hostConnections,
  hostError,
  guestStatus,
  guestAnswer,
  guestState,
  guestError,
  startHosting,
  pairPlayer,
  acceptGuestAnswer,
  removeGuest,
  stopHosting,
  joinHost,
  leaveGuest,
  pairingLink,
} = useMultiplayer()
const joining = ref(false)
const working = ref(false)
const selectedPlayerId = ref('')
const selectedConnectionId = ref('')
const scanningReply = ref(false)
const pendingReply = ref('')
const localError = ref('')
let consumedPair = ''
const availablePlayers = computed(
  () =>
    gameSession.value?.players.filter(
      (player) => !hostConnections.value.some((connection) => connection.playerId === player.id),
    ) ?? [],
)
const selectedConnection = computed(() =>
  hostConnections.value.find((connection) => connection.id === selectedConnectionId.value),
)
const guestStarted = computed(() => guestStatus.value !== 'idle')
function playerName(playerId: string) {
  return gameSession.value?.players.find((player) => player.id === playerId)?.name ?? playerId
}
watch(
  availablePlayers,
  (players) => {
    if (!players.some((player) => player.id === selectedPlayerId.value))
      selectedPlayerId.value = players[0]?.id ?? ''
  },
  { immediate: true },
)
async function perform(action: () => void | Promise<unknown>) {
  working.value = true
  localError.value = ''
  try {
    await action()
  } catch (failure) {
    localError.value = failure instanceof Error ? failure.message : t('common.error')
  } finally {
    working.value = false
  }
}
async function pair() {
  const playerId = selectedPlayerId.value
  if (!playerId) return
  await perform(() => pairPlayer(playerId))
  selectedConnectionId.value =
    hostConnections.value.find((connection) => connection.playerId === playerId)?.id ?? ''
  scanningReply.value = false
}
async function readReply(code: string) {
  if (!selectedConnectionId.value) return
  await perform(() => acceptGuestAnswer(selectedConnectionId.value, code))
  if (!selectedConnection.value?.error && !hostError.value && !localError.value) {
    pendingReply.value = ''
    scanningReply.value = false
  }
}
async function join(code: string) {
  await perform(async () => {
    if (await joinHost(code)) joining.value = false
  })
}
async function consumePair() {
  const code = route.query.pair
  if (typeof code !== 'string' || !code || code === consumedPair) return
  consumedPair = code
  if (hostActive.value) {
    pendingReply.value = code
    selectedConnectionId.value =
      hostConnections.value.find((connection) => connection.status !== 'connected')?.id ?? ''
  } else {
    joining.value = true
    await join(code)
  }
  const query = { ...route.query }
  delete query.pair
  await router.replace({ query })
}
onMounted(async () => {
  await loadSession()
  await consumePair()
})
watch(() => route.query.pair, consumePair)
watch([guestStatus, guestState], () => {
  if (guestStatus.value === 'connected' && guestState.value) void router.replace('/remote')
})
function selectConnection(id: string) {
  selectedConnectionId.value = id
  scanningReply.value = false
}
function disconnect() {
  leaveGuest()
  joining.value = false
}
function stop() {
  stopHosting()
  scanningReply.value = false
  pendingReply.value = ''
}
</script>

<template>
  <section class="page room-page">
    <header class="room-heading">
      <div>
        <h1>{{ t('multiplayer.room.title') }}</h1>
        <p class="help-text">{{ t('multiplayer.room.intro') }}</p>
      </div>
    </header>
    <p v-if="hostError || guestError || localError" class="error-message" role="alert">
      {{ hostError || guestError || localError }}
    </p>
    <p v-if="!sessionLoaded" class="loading-state">{{ t('common.loading') }}</p>
    <template v-else-if="hostActive">
      <form class="room-pair-form" @submit.prevent="pair">
        <label class="field"
          ><span>{{ t('multiplayer.room.assign') }}</span>
          <select v-model="selectedPlayerId" :disabled="working || !availablePlayers.length">
            <option v-for="player in availablePlayers" :key="player.id" :value="player.id">
              {{ player.name }}
            </option>
          </select>
        </label>
        <AppButton
          type="submit"
          :loading="working"
          :disabled="!selectedPlayerId || hostConnections.length >= 12"
          >{{ t('multiplayer.room.connect') }}</AppButton
        >
      </form>
      <p class="help-text">{{ t('multiplayer.room.hostHint') }}</p>
      <div v-if="hostConnections.length" class="room-connections">
        <h2>{{ t('multiplayer.room.phones') }}</h2>
        <ul class="room-phone-list">
          <li v-for="connection in hostConnections" :key="connection.id">
            <button
              type="button"
              class="room-phone"
              :aria-pressed="selectedConnectionId === connection.id"
              @click="selectConnection(connection.id)"
            >
              <strong>{{ playerName(connection.playerId) }}</strong
              ><span
                class="connection-status"
                :class="{ 'is-connected': connection.status === 'connected' }"
                >{{ t(`multiplayer.status.${connection.status}`) }}</span
              >
            </button>
            <AppButton
              variant="quiet"
              :disabled="working"
              :aria-label="
                t('multiplayer.room.removeNamed', { name: playerName(connection.playerId) })
              "
              @click="removeGuest(connection.id)"
              >{{ t('multiplayer.room.remove') }}</AppButton
            >
          </li>
        </ul>
      </div>
      <section v-if="pendingReply" class="room-panel">
        <h2>{{ t('multiplayer.room.receivedReply') }}</h2>
        <label class="field"
          ><span>{{ t('multiplayer.room.replyFor') }}</span
          ><select v-model="selectedConnectionId">
            <option
              v-for="connection in hostConnections"
              :key="connection.id"
              :value="connection.id"
            >
              {{ playerName(connection.playerId) }}
            </option>
          </select></label
        >
        <AppButton
          :disabled="!selectedConnectionId"
          :loading="working"
          @click="readReply(pendingReply)"
          >{{ t('multiplayer.room.acceptReply') }}</AppButton
        >
      </section>
      <section v-if="selectedConnection" class="room-panel">
        <h2 class="room-player-name" :title="playerName(selectedConnection.playerId)">
          {{ playerName(selectedConnection.playerId) }}
        </h2>
        <p v-if="selectedConnection.error" class="error-message" role="alert">
          {{ selectedConnection.error }}
        </p>
        <template v-if="selectedConnection.status !== 'connected'">
          <PairingCode
            v-if="selectedConnection.offer"
            :value="pairingLink(selectedConnection.offer)"
            :title="t('multiplayer.room.offerTitle')"
            :description="t('multiplayer.room.offerHint')"
          />
          <AppButton
            v-if="!scanningReply"
            variant="secondary"
            :disabled="working"
            @click="scanningReply = true"
            >{{ t('multiplayer.room.readReply') }}</AppButton
          >
          <PairingScanner
            v-else
            :key="selectedConnection.id"
            :busy="working"
            :title="t('multiplayer.room.readReply')"
            @decoded="readReply"
            @close="scanningReply = false"
          />
        </template>
        <p v-else class="room-connected" role="status">{{ t('multiplayer.room.connectedHint') }}</p>
      </section>
      <AppButton variant="quiet" :disabled="working" @click="stop">{{
        t('multiplayer.room.stop')
      }}</AppButton>
    </template>
    <section v-else-if="guestStatus === 'connected' && guestState" class="room-panel">
      <h2>{{ t('multiplayer.active') }}</h2>
      <RouterLink class="button button-primary" to="/remote">{{
        t('multiplayer.resume')
      }}</RouterLink>
      <AppButton variant="quiet" @click="disconnect">{{ t('multiplayer.guest.leave') }}</AppButton>
    </section>
    <template
      v-else-if="
        guestStarted && guestAnswer && guestStatus !== 'failed' && guestStatus !== 'closed'
      "
    >
      <p class="connection-status" role="status">{{ t(`multiplayer.status.${guestStatus}`) }}</p>
      <PairingCode
        :value="pairingLink(guestAnswer)"
        :title="t('multiplayer.room.answerTitle')"
        :description="t('multiplayer.room.answerHint')"
        download-name="tipsy-trouble-reply.png"
      />
      <p class="help-text">{{ t('multiplayer.room.waiting') }}</p>
      <AppButton variant="secondary" @click="disconnect">{{
        t('multiplayer.room.cancelJoin')
      }}</AppButton>
    </template>
    <PairingScanner
      v-else-if="joining"
      :busy="working"
      :title="t('multiplayer.room.joinTitle')"
      @decoded="join"
      @close="disconnect"
    />
    <div v-else class="room-options">
      <AppButton v-if="guestStarted" variant="quiet" @click="disconnect">{{
        t('multiplayer.guest.leave')
      }}</AppButton>
      <section class="room-option">
        <h2>{{ t('multiplayer.room.hostTitle') }}</h2>
        <p>{{ t('multiplayer.room.hostDescription') }}</p>
        <AppButton v-if="gameSession" @click="startHosting">{{
          t('multiplayer.room.host')
        }}</AppButton>
        <RouterLink v-else class="button button-primary" to="/players">{{
          t('multiplayer.room.setup')
        }}</RouterLink>
      </section>
      <section class="room-option">
        <h2>{{ t('multiplayer.room.joinTitle') }}</h2>
        <p>{{ t('multiplayer.room.joinDescription') }}</p>
        <AppButton variant="secondary" @click="joining = true">{{
          t('multiplayer.room.join')
        }}</AppButton>
      </section>
    </div>
    <p class="room-network-note help-text">{{ t('multiplayer.room.network') }}</p>
  </section>
</template>

<style scoped>
.room-page {
  max-width: 56rem;
  display: grid;
  gap: var(--space-5);
}
.room-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-4);
}
.room-heading > div {
  flex: 1 1 18rem;
}
.room-heading h1 {
  margin-bottom: var(--space-2);
}
.room-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-6);
}
.room-option {
  display: grid;
  align-content: start;
  justify-items: start;
  gap: var(--space-4);
  padding-block: var(--space-4);
}
.room-option p {
  color: var(--muted);
}
.room-panel {
  padding: var(--space-5);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel);
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}
.room-panel > h2,
.room-phone strong {
  overflow-wrap: anywhere;
}
.room-phone strong,
.room-player-name {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.room-pair-form {
  display: flex;
  gap: var(--space-3);
  align-items: end;
  flex-wrap: wrap;
}
.room-pair-form .field {
  flex: 1 1 15rem;
  min-width: 0;
}
.room-pair-form select,
.room-panel select {
  width: 100%;
  min-width: 0;
}
.room-phone-list {
  list-style: none;
  padding: 0;
  margin-top: var(--space-3);
}
.room-phone-list li {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  border-bottom: 1px solid var(--line);
  padding-block: var(--space-2);
}
.room-phone {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: var(--space-1);
  background: transparent;
  color: var(--text);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  text-align: left;
  padding: var(--space-3);
  min-height: 44px;
}
.room-phone[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--panel);
}
.connection-status {
  font-size: 0.875rem;
  color: var(--muted);
}
.connection-status.is-connected,
.room-connected {
  color: var(--positive);
}
.room-network-note {
  border-top: 1px solid var(--line);
  padding-top: var(--space-4);
}
@media (max-width: 540px) {
  .room-options {
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }
  .room-option + .room-option {
    border-top: 1px solid var(--line);
  }
  .room-panel {
    padding: var(--space-3);
  }
}
</style>
