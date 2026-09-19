<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t } from '@/app/i18n'
import type { GameSession } from '../domain/game'
import { useCardArtwork } from '@/features/cards/composables/useCardArtwork'
import AppButton from '@/shared/components/AppButton.vue'
const props = defineProps<{ session: GameSession; busy: boolean }>()
const emit = defineEmits<{ next: []; skip: []; activate: [targetId?: string] }>()
const targetId = ref('')
const card = computed(() => props.session.currentCard)
const artwork = useCardArtwork(card)
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
  <div v-if="card" class="play-card-area">
    <article
      class="play-card"
      :class="{
        'play-card-temporary': card.kind === 'temporary-rule',
        'play-card-special': card.kind === 'special',
      }"
    >
      <div class="play-card-caption">
        <span>{{
          t(
            card.kind === 'temporary-rule'
              ? 'play.temporary'
              : card.kind === 'special'
                ? 'play.special'
                : 'play.prompt',
          )
        }}</span>
        <span>{{ card.title }}</span>
      </div>
      <img
        v-if="artwork"
        class="play-card-artwork card-artwork"
        :src="artwork.src"
        :alt="artwork.alt"
      />
      <p class="play-card-text">{{ card.text }}</p>
      <a
        v-if="artwork?.sourceUrl"
        class="play-photo-credit"
        :href="artwork.sourceUrl"
        target="_blank"
        rel="noopener noreferrer"
        >{{ t('game.photoCredit', { name: artwork.credit }) }}</a
      >
    </article>
    <form
      v-if="needsActivation"
      class="play-target-form"
      @submit.prevent="emit('activate', targetId || undefined)"
    >
      <label v-if="card.kind === 'temporary-rule' && card.target === 'choose-player'" class="field"
        >{{ t('game.target')
        }}<select v-model="targetId" required :disabled="busy">
          <option disabled value="">{{ t('game.targetPlaceholder') }}</option>
          <option v-for="player in session.players" :key="player.id" :value="player.id">
            {{ player.name }}
          </option>
        </select></label
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
      <div class="play-actions">
        <AppButton
          type="submit"
          :disabled="
            busy || (card.kind === 'temporary-rule' && card.target === 'choose-player' && !targetId)
          "
          >{{ t('game.activate') }}</AppButton
        >
        <AppButton variant="secondary" :disabled="busy" @click="emit('skip')">{{
          t('game.skip')
        }}</AppButton>
      </div>
    </form>
    <div v-else class="play-actions">
      <AppButton :disabled="busy" @click="emit('next')"
        >{{ t('game.next') }} <span aria-hidden="true">→</span></AppButton
      >
      <AppButton variant="secondary" :disabled="busy" @click="emit('skip')">{{
        t('game.skip')
      }}</AppButton>
    </div>
  </div>
</template>
