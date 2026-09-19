<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { t } from '@/app/i18n'
import { library } from '@/app/library'
import type { CardDefinition } from '../domain/cards'
const props = defineProps<{ card?: CardDefinition }>()
const emit = defineEmits<{ saved: []; cancel: [] }>()
const titleInput = ref<HTMLInputElement>()
const title = ref(''),
  text = ref(''),
  kind = ref<CardDefinition['kind']>('prompt'),
  duration = ref(1),
  durationUnit = ref<'turns' | 'circles'>('circles'),
  target = ref<'current-player' | 'everyone' | 'choose-player'>('choose-player'),
  busy = ref(false),
  error = ref('')
watch(
  () => props.card,
  (card) => {
    title.value = card?.title ?? ''
    text.value = card?.text ?? ''
    kind.value = card?.kind ?? 'prompt'
    duration.value = card?.kind === 'temporary-rule' ? card.duration.amount : 1
    durationUnit.value = card?.kind === 'temporary-rule' ? card.duration.unit : 'circles'
    target.value = card?.kind === 'temporary-rule' ? card.target : 'choose-player'
    error.value = ''
    if (card) void nextTick(() => titleInput.value?.focus())
  },
  { immediate: true },
)
async function save() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const content = {
    id: props.card?.id ?? `custom-${crypto.randomUUID()}`,
    title: title.value.trim(),
    text: text.value.trim(),
    contentLocale: props.card?.contentLocale ?? 'en',
  }
  const card: CardDefinition =
    kind.value === 'temporary-rule'
      ? {
          ...content,
          kind: 'temporary-rule',
          target: target.value,
          duration: { amount: duration.value, unit: durationUnit.value },
        }
      : { ...content, kind: kind.value }
  try {
    await library.saveCustomCard(card)
    emit('saved')
    title.value = ''
    text.value = ''
    kind.value = 'prompt'
    duration.value = 1
    durationUnit.value = 'circles'
    target.value = 'choose-player'
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('common.error')
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <form class="panel stack" @submit.prevent="save">
    <h2>{{ t(card ? 'cards.edit' : 'cards.add') }}</h2>
    <label class="field"
      >{{ t('cards.titleLabel')
      }}<input ref="titleInput" v-model="title" maxlength="80" required :disabled="busy" /></label
    ><label class="field"
      >{{ t('cards.kind')
      }}<select v-model="kind" :disabled="busy">
        <option value="prompt">{{ t('cards.prompt') }}</option>
        <option value="temporary-rule">{{ t('cards.temporary') }}</option>
        <option v-if="props.card?.kind === 'special'" value="special">
          {{ t('game.special') }}
        </option>
      </select></label
    ><label class="field"
      >{{ t('cards.text')
      }}<textarea
        v-model="text"
        maxlength="240"
        required
        :placeholder="t('cards.placeholder')"
        :disabled="busy"
      /></label
    ><label v-if="kind === 'temporary-rule'" class="field"
      >{{ t('cards.durationAmount')
      }}<input
        v-model.number="duration"
        type="number"
        min="1"
        max="100"
        step="1"
        required
        :disabled="busy"
    /></label>
    <template v-if="kind === 'temporary-rule'">
      <label class="field"
        >{{ t('cards.durationUnit')
        }}<select v-model="durationUnit" :disabled="busy">
          <option value="circles">{{ t('cards.circles') }}</option>
          <option value="turns">{{ t('cards.turns') }}</option>
        </select></label
      >
      <label class="field"
        >{{ t('cards.target')
        }}<select v-model="target" :disabled="busy">
          <option value="choose-player">{{ t('cards.targetChoose') }}</option>
          <option value="current-player">{{ t('cards.targetCurrent') }}</option>
          <option value="everyone">{{ t('cards.targetEveryone') }}</option>
        </select></label
      >
    </template>
    <p v-if="error" class="error-message" role="alert">{{ error }}</p>
    <div class="form-actions">
      <button class="button button-primary" :disabled="busy">{{ t('cards.save') }}</button
      ><button
        v-if="card"
        class="button button-quiet"
        type="button"
        :disabled="busy"
        @click="emit('cancel')"
      >
        {{ t('common.cancel') }}
      </button>
    </div>
  </form>
</template>
