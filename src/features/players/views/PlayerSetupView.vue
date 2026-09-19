<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { t } from '@/app/i18n'
import { library } from '@/app/library'
import { useGameSession } from '@/features/game/composables/useGameSession'
import type { PlayerProfile } from '../domain/playerProfile'
import PlayerForm from '../components/PlayerForm.vue'
import PlayerAvatar from '@/shared/components/PlayerAvatar.vue'
const router = useRouter()
const { isGameActive, sessionBusy, sessionError, sessionLoaded, loadSession, startGame } =
  useGameSession()
const players = ref<PlayerProfile[]>([]),
  selectedIds = ref<string[]>([]),
  error = ref(''),
  loaded = ref(false),
  specials = ref(true),
  chance = ref(1),
  maximum = ref(1)
const selected = computed(() =>
  selectedIds.value
    .map((id) => players.value.find((player) => player.id === id))
    .filter((player): player is PlayerProfile => Boolean(player)),
)
async function load() {
  error.value = ''
  try {
    await loadSession()
    players.value = await library.listPlayers()
    loaded.value = true
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('common.error')
  }
}
onMounted(load)
function toggle(id: string) {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((selected) => selected !== id)
    : [...selectedIds.value, id]
}
function move(index: number, direction: number) {
  const reordered = [...selectedIds.value]
  const [playerId] = reordered.splice(index, 1)
  if (playerId) reordered.splice(index + direction, 0, playerId)
  selectedIds.value = reordered
}
async function saved(player: PlayerProfile) {
  const previous = players.value.findIndex((saved) => saved.id === player.id)
  if (previous === -1) {
    players.value.push(player)
    selectedIds.value.push(player.id)
  } else players.value[previous] = player
}
async function start() {
  if (selected.value.length < 2) {
    error.value = t('players.minimum')
    return
  }
  if (
    await startGame(selected.value, {
      specialChance: specials.value ? chance.value / 100 : 0,
      maxSpecialsPerGame: specials.value ? maximum.value : 0,
    })
  )
    await router.push('/play')
}
</script>
<template>
  <section class="page">
    <RouterLink class="back-link" to="/">← {{ t('nav.home') }}</RouterLink>
    <p class="eyebrow">{{ t('players.eyebrow') }}</p>
    <h1>{{ t('players.title') }}</h1>
    <p class="page-intro">{{ t('players.intro') }}</p>
    <p v-if="error || sessionError" class="error-message" role="alert">
      {{ error || sessionError }}
      <button class="button button-quiet" @click="load">{{ t('common.retry') }}</button>
    </p>
    <p v-if="!loaded" class="loading-state">{{ t('common.loading') }}</p>
    <div v-else class="setup-columns">
      <div class="stack">
        <PlayerForm @saved="saved" />
        <section>
          <div class="saved-heading">
            <h2>{{ t('players.saved') }}</h2>
            <RouterLink to="/library?tab=players">{{ t('library.managePlayers') }} ↗</RouterLink>
          </div>
          <p v-if="!players.length" class="empty-state">{{ t('players.empty') }}</p>
          <div class="player-list">
            <div v-for="player in players" :key="player.id" class="player-row">
              <button
                type="button"
                class="player-pick"
                :class="{ selected: selectedIds.includes(player.id) }"
                :aria-pressed="selectedIds.includes(player.id)"
                :aria-label="
                  t(selectedIds.includes(player.id) ? 'players.deselect' : 'players.select', {
                    name: player.name,
                  })
                "
                @click="toggle(player.id)"
              >
                <PlayerAvatar :name="player.name" :photo="player.photo" /><span
                  class="player-name"
                  >{{ player.name }}</span
                ><span class="selection-mark" aria-hidden="true">{{
                  selectedIds.includes(player.id) ? '✓' : '+'
                }}</span>
              </button>
            </div>
          </div>
        </section>
      </div>
      <section class="panel">
        <p class="eyebrow">{{ t('players.selected') }}</p>
        <h2>{{ t('players.selectedCount', { count: selected.length }) }}</h2>
        <p v-if="!selected.length" class="empty-state">{{ t('players.noneSelected') }}</p>
        <ol class="ordered-list">
          <li v-for="(player, index) in selected" :key="player.id">
            <span class="order-number">{{ index + 1 }}</span
            ><PlayerAvatar :name="player.name" :photo="player.photo" /><span class="player-name">{{
              player.name
            }}</span>
            <div class="order-controls">
              <button
                class="icon-button"
                :disabled="index === 0"
                :aria-label="t('players.moveUp', { name: player.name })"
                @click="move(index, -1)"
              >
                ↑</button
              ><button
                class="icon-button"
                :disabled="index === selected.length - 1"
                :aria-label="t('players.moveDown', { name: player.name })"
                @click="move(index, 1)"
              >
                ↓
              </button>
            </div>
          </li>
        </ol>
        <form class="stack" @submit.prevent="start">
          <details>
            <summary>{{ t('players.specials') }}</summary>
            <label class="checkbox-line"
              ><input v-model="specials" type="checkbox" />{{ t('players.specialEnabled') }}</label
            >
            <div v-if="specials" class="stack">
              <label class="field"
                >{{ t('players.specialChance')
                }}<input
                  v-model.number="chance"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  required /></label
              ><label class="field"
                >{{ t('players.specialMaximum')
                }}<input v-model.number="maximum" type="number" min="0" max="10" step="1" required
              /></label>
            </div>
            <p class="help-text">{{ t('players.specialHelp') }}</p>
          </details>
          <template v-if="isGameActive"
            ><p class="callout">{{ t('players.active') }}</p>
            <RouterLink class="button button-primary setup-start" to="/play">{{
              t('players.resume')
            }}</RouterLink></template
          ><button
            v-else
            class="button button-primary setup-start"
            :disabled="selected.length < 2 || sessionBusy || !sessionLoaded"
          >
            {{ t('players.start') }} <span aria-hidden="true">↗</span>
          </button>
        </form>
      </section>
    </div>
  </section>
</template>

<style scoped>
.setup-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: 32px;
  margin-top: 28px;
}
.setup-columns > .panel {
  position: sticky;
  top: 24px;
}
.saved-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.saved-heading > a {
  font-size: 0.8rem;
  color: var(--coral);
  padding: 10px 0;
}
.player-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.player-row {
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
}
.player-pick {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  background: var(--panel);
  color: var(--cream);
  text-align: left;
}
.player-pick.selected {
  background: color-mix(in srgb, var(--lime) 10%, var(--panel));
  box-shadow: inset 0 0 0 1px var(--lime);
}
.player-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: 650;
}
.selection-mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--ink);
  color: var(--muted);
}
.selected .selection-mark {
  background: var(--lime);
  color: var(--ink);
}
.ordered-list {
  padding: 0;
  margin: 24px 0;
  list-style: none;
}
.ordered-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.order-number {
  color: var(--muted);
  font-size: 0.8rem;
  width: 14px;
}
.order-controls {
  display: flex;
}
.setup-start {
  width: 100%;
  margin-top: 12px;
}
@media (max-width: 760px) {
  .setup-columns {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .setup-columns > .panel {
    position: static;
  }
}
</style>
