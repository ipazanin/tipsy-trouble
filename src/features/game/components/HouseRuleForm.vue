<script setup lang="ts">
import { ref } from 'vue'
import { t } from '@/app/i18n'
import type { Player } from '../domain/game'
import AppButton from '@/shared/components/AppButton.vue'
defineProps<{ author: Player; busy: boolean }>()
const emit = defineEmits<{ submit: [text: string] }>()
const rule = ref('')
</script>
<template>
  <form class="play-house-form stack" @submit.prevent="emit('submit', rule)">
    <div>
      <p class="eyebrow">{{ t('play.houseScope') }}</p>
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
      />
    </label>
    <p class="help-text">{{ t('play.houseHelp') }}</p>
    <AppButton type="submit" :disabled="busy || !rule.trim()">{{
      t('game.permanentSave')
    }}</AppButton>
  </form>
</template>
