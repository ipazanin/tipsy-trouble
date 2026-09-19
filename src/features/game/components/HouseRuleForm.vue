<script setup lang="ts">
import { ref } from 'vue'
import { t } from '@/app/i18n'
import type { Player } from '../domain/game'
defineProps<{ author: Player; players: readonly Player[]; busy: boolean }>()
const emit = defineEmits<{ submit: [text: string, targetId?: string] }>()
const rule = ref(''),
  targetId = ref('')
</script>
<template>
  <form class="permanent-form stack" @submit.prevent="emit('submit', rule, targetId || undefined)">
    <div>
      <p class="eyebrow">{{ t('game.permanentRules') }}</p>
      <h2>{{ t('game.permanentTitle') }}</h2>
      <p>{{ t('game.permanentIntro', { name: author.name }) }}</p>
    </div>
    <label class="field"
      >{{ t('game.permanentLabel')
      }}<textarea
        v-model="rule"
        required
        maxlength="240"
        :placeholder="t('game.permanentPlaceholder')"
        :disabled="busy"
      /></label
    ><label class="field"
      >{{ t('game.target')
      }}<select v-model="targetId" :disabled="busy">
        <option value="">{{ t('game.everyone') }}</option>
        <option v-for="player in players" :key="player.id" :value="player.id">
          {{ player.name }}
        </option>
      </select></label
    >
    <p class="help-text">{{ t('game.mandatory') }}</p>
    <button class="button button-primary" :disabled="busy || !rule.trim()">
      {{ t('game.permanentSave') }}
    </button>
  </form>
</template>
