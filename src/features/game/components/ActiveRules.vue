<script setup lang="ts">
import { t } from '@/app/i18n'
import type { GameSession, RuleScope } from '../domain/game'
const props = defineProps<{ session: GameSession }>()
function playerName(id: string) {
  return props.session.players.find((player) => player.id === id)?.name ?? ''
}
function scopeName(scope: RuleScope) {
  return scope.kind === 'everyone' ? t('game.everyone') : playerName(scope.playerId)
}
</script>
<template>
  <section id="active-rules" class="rules-section" aria-labelledby="active-rules-heading">
    <h2 id="active-rules-heading">{{ t('game.rules') }}</h2>
    <p v-if="!session.temporaryRules.length && !session.houseRules.length" class="empty-state">
      {{ t('game.noRules') }}
    </p>
    <div v-else class="rules-grid">
      <section v-if="session.temporaryRules.length" class="panel">
        <h3>{{ t('game.temporaryRules') }}</h3>
        <ul class="rule-list">
          <li v-for="rule in session.temporaryRules" :key="rule.id">
            <span class="rule-target">{{
              t('game.forPlayer', { name: scopeName(rule.scope) })
            }}</span>
            <p>{{ rule.text }}</p>
            <small>{{
              t(rule.remainingTurns === 1 ? 'game.remainingOne' : 'game.remaining', {
                count: rule.remainingTurns,
              })
            }}</small>
          </li>
        </ul>
      </section>
      <section v-if="session.houseRules.length" class="panel">
        <h3>{{ t('game.permanentRules') }}</h3>
        <ul class="rule-list">
          <li v-for="rule in session.houseRules" :key="rule.id">
            <span class="rule-target">{{
              t('game.forPlayer', { name: scopeName(rule.scope) })
            }}</span>
            <p>{{ rule.text }}</p>
            <small>{{ t('game.author', { name: playerName(rule.authorId) }) }}</small>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>
