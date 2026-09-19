<script setup lang="ts">
import { computed, nextTick, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { t } from '@/app/i18n'
import { library } from '@/app/library'
import type { CardDefinition } from '../domain/cards'
import type { CardImage } from '../domain/cardImage'
import { createCardImage } from '@/infrastructure/storage/cardImages'
import { useCardArtwork } from '../composables/useCardArtwork'
import AppButton from '@/shared/components/AppButton.vue'
const props = defineProps<{ card?: CardDefinition; cancellable?: boolean }>()
const emit = defineEmits<{ saved: []; cancel: [] }>()
const titleInput = ref<HTMLInputElement>()
const imageInput = ref<HTMLInputElement>()
const draftId = ref(`custom-${crypto.randomUUID()}`)
const imageId = ref<string>()
const preparedImage = shallowRef<CardImage>()
const previewUrl = ref('')
function releasePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}
let active = true
onScopeDispose(() => {
  active = false
  releasePreview()
})
function resetImage() {
  releasePreview()
  imageId.value = undefined
  preparedImage.value = undefined
  if (imageInput.value) imageInput.value.value = ''
}
async function chooseImage(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const image = await createCardImage(file)
    if (!active) return
    releasePreview()
    preparedImage.value = image
    imageId.value = image.id
    previewUrl.value = URL.createObjectURL(new Blob([image.bytes], { type: image.mimeType }))
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('common.error')
  } finally {
    busy.value = false
  }
}
const title = ref(''),
  text = ref(''),
  kind = ref<CardDefinition['kind']>('prompt'),
  duration = ref(1),
  durationUnit = ref<'turns' | 'circles'>('circles'),
  target = ref<'current-player' | 'everyone' | 'choose-player'>('choose-player'),
  busy = ref(false),
  error = ref('')
const previewCard = computed<CardDefinition>(() => ({
  id: props.card?.id ?? draftId.value,
  title: title.value || 'Preview',
  text: text.value || 'Preview',
  contentLocale: 'en',
  kind: 'prompt',
  ...(imageId.value ? { imageId: imageId.value } : {}),
}))
const artwork = useCardArtwork(previewCard)
watch(
  () => props.card,
  (card) => {
    resetImage()
    imageId.value = card?.imageId
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
    id: props.card?.id ?? draftId.value,
    title: title.value.trim(),
    text: text.value.trim(),
    contentLocale: props.card?.contentLocale ?? 'en',
    ...(imageId.value ? { imageId: imageId.value } : {}),
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
    await library.saveCustomCard(card, preparedImage.value)
    if (!active) return
    emit('saved')
    title.value = ''
    text.value = ''
    resetImage()
    draftId.value = `custom-${crypto.randomUUID()}`
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
  <form class="panel stack card-editor" @submit.prevent="save">
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
    <div class="card-image-field">
      <img :src="previewUrl || artwork.src" :alt="t('library.imagePreview')" />
      <div class="stack">
        <label class="field"
          >{{ t('library.imageLabel')
          }}<input
            ref="imageInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            :disabled="busy"
            @change="chooseImage"
          /><small>{{ t('library.imageHint') }}</small></label
        >
        <AppButton v-if="imageId" variant="quiet" :disabled="busy" @click="resetImage">{{
          t('library.imageReset')
        }}</AppButton>
        <p v-else class="help-text">{{ t('library.imageStock') }}</p>
      </div>
    </div>
    <p v-if="error" class="error-message" role="alert">{{ error }}</p>
    <div class="form-actions">
      <button class="button button-primary" :disabled="busy">{{ t('cards.save') }}</button
      ><button
        v-if="card || cancellable"
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

<style scoped>
.card-editor {
  margin-bottom: 24px;
}
.card-image-field {
  display: grid;
  grid-template-columns: minmax(0, 200px) minmax(0, 1fr);
  gap: 20px;
  align-items: center;
  padding-top: 8px;
}
.card-image-field > img {
  width: 100%;
  aspect-ratio: 3/2;
  object-fit: cover;
  border-radius: 12px;
}
.card-image-field small {
  line-height: 1.6;
}
@media (max-width: 600px) {
  .card-image-field {
    grid-template-columns: 1fr;
  }
  .card-image-field > img {
    max-width: 280px;
  }
}
</style>
