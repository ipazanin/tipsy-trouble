<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '@/app/i18n'
import type { GameSession, RuleScope } from '../domain/game'
const props = defineProps<{ session: GameSession }>()
const expanded = ref(true)
const ruleCount = computed(
  () => props.session.temporaryRules.length + props.session.houseRules.length,
)
function playerName(id: string) {
  return props.session.players.find((player) => player.id === id)?.name ?? ''
}
function scopeName(scope: RuleScope) {
  return scope.kind === 'everyone' ? t('game.everyone') : playerName(scope.playerId)
}
</script>
<template>
  <section class="play-rules" aria-labelledby="active-rules-heading">
    <div class="play-rules-heading">
      <h2 id="active-rules-heading">
        {{ t('play.rules') }} <span aria-hidden="true">{{ ruleCount }}</span>
      </h2>
      <button
        v-if="ruleCount"
        class="play-rules-toggle"
        :aria-expanded="expanded"
        aria-controls="active-rule-details"
        @click="expanded = !expanded"
      >
        {{ t(expanded ? 'play.hideRules' : 'play.showRules') }}
      </button>
    </div>
    <p v-if="!ruleCount" class="play-rules-empty">{{ t('game.noRules') }}</p>
    <p v-else class="play-rule-summary">
      {{
        t('play.ruleSummary', {
          temporary: session.temporaryRules.length,
          house: session.houseRules.length,
        })
      }}
    </p>
    <div v-show="expanded && ruleCount" id="active-rule-details" class="play-rule-details">
      <section v-if="session.temporaryRules.length">
        <h3>{{ t('game.temporaryRules') }}</h3>
        <ul class="play-rule-list">
          <li v-for="rule in session.temporaryRules" :key="rule.id">
            <div class="play-rule-meta">
              <strong>{{ t('game.forPlayer', { name: scopeName(rule.scope) }) }}</strong
              ><span>{{
                t(rule.remainingTurns === 1 ? 'game.remainingOne' : 'game.remaining', {
                  count: rule.remainingTurns,
                })
              }}</span>
            </div>
            <p>{{ rule.text }}</p>
          </li>
        </ul>
      </section>
      <section v-if="session.houseRules.length">
        <h3>
          {{ t('game.permanentRules') }} <span>{{ t('game.everyone') }}</span>
        </h3>
        <ul class="play-rule-list">
          <li v-for="rule in session.houseRules" :key="rule.id">
            <p>{{ rule.text }}</p>
            <small>{{ t('game.author', { name: playerName(rule.authorId) }) }}</small>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>
