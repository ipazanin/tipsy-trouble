<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t } from '@/app/i18n'
import type { GameSession } from '../domain/game'
import { getCardArtwork } from '@/features/cards/artwork'
const props = defineProps<{ session: GameSession; busy: boolean }>()
const emit = defineEmits<{ next: []; skip: []; activate: [targetId?: string] }>()
const targetId = ref('')
const card = computed(() => props.session.currentCard)
const artwork = computed(() => (card.value ? getCardArtwork(card.value) : undefined))
const activated = computed(() =>
  props.session.temporaryRules.some(
    (rule) => rule.activatedOnTurn === props.session.completedTurns,
  ),
)
const needsActivation = computed(() => card.value?.kind === 'temporary-rule' && !activated.value)
watch(
  () => props.session.completedTurns,
  () => {
    targetId.value = ''
  },
)
</script>
<template>
  <div v-if="card">
    <article
      class="game-card"
      :class="{
        'temporary-card': card.kind === 'temporary-rule',
        'special-card': card.kind === 'special',
      }"
    >
      <div>
        <p class="eyebrow">
          {{
            t(
              card.kind === 'temporary-rule'
                ? 'game.temporary'
                : card.kind === 'special'
                  ? 'game.special'
                  : 'game.prompt',
            )
          }}
          · {{ card.title }}
        </p>
        <img v-if="artwork" class="card-artwork" :src="artwork.src" :alt="artwork.alt" />
        <p class="game-card-text">{{ card.text }}</p>
      </div>
      <div class="game-card-footer">
        <a
          v-if="artwork"
          class="photo-credit"
          :href="artwork.sourceUrl"
          target="_blank"
          rel="noopener noreferrer"
          >{{ t('game.photoCredit', { name: artwork.credit }) }}</a
        >
        <span class="game-card-decoration" aria-hidden="true">✳</span>
      </div>
    </article>
    <form
      v-if="needsActivation"
      class="panel target-form"
      @submit.prevent="emit('activate', targetId || undefined)"
    >
      <template v-if="card.kind === 'temporary-rule' && card.target === 'choose-player'"
        ><label class="field"
          >{{ t('game.target')
          }}<select v-model="targetId" required :disabled="busy">
            <option disabled value="">{{ t('game.targetPlaceholder') }}</option>
            <option v-for="player in session.players" :key="player.id" :value="player.id">
              {{ player.name }}
            </option></select
          ><small>{{ t('game.targetHelp') }}</small></label
        ></template
      >
      <p v-else class="help-text">
        {{
          t('game.forPlayer', {
            name:
              card.kind === 'temporary-rule' && card.target === 'everyone'
                ? t('game.everyone')
                : session.players[session.currentPlayerIndex]!.name,
          })
        }}
      </p>
      <button
        class="button button-lime"
        :disabled="
          busy || (card.kind === 'temporary-rule' && card.target === 'choose-player' && !targetId)
        "
      >
        {{ t('game.activate') }}
      </button>
    </form>
    <div class="game-action-row">
      <button
        v-if="!needsActivation"
        class="button button-primary"
        :disabled="busy"
        @click="emit('next')"
      >
        {{ t('game.next') }} <span aria-hidden="true">↗</span></button
      ><button class="button button-quiet" :disabled="busy" @click="emit('skip')">
        {{ t('game.skip') }}
      </button>
    </div>
  </div>
</template>
