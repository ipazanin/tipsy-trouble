<script setup lang="ts">
import { nextTick, onScopeDispose, ref, watch } from 'vue'
import { t } from '@/app/i18n'
import { library } from '@/app/library'
import type { PlayerProfile } from '../domain/playerProfile'
import { createPlayerPhoto } from '@/infrastructure/storage/playerPhotos'
import PlayerAvatar from '@/shared/components/PlayerAvatar.vue'
const props = defineProps<{ player?: PlayerProfile; cancellable?: boolean }>()
const emit = defineEmits<{ saved: [player: PlayerProfile]; cancel: [] }>()
const nameInput = ref<HTMLInputElement>()
let active = true
onScopeDispose(() => {
  active = false
})
const name = ref(''),
  photo = ref<Blob>(),
  busy = ref(false),
  error = ref('')
watch(
  () => props.player,
  (player) => {
    name.value = player?.name ?? ''
    photo.value = player?.photo
    error.value = ''
    if (player) void nextTick(() => nameInput.value?.focus())
  },
  { immediate: true },
)
async function choosePhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  busy.value = true
  error.value = ''
  try {
    const preparedPhoto = await createPlayerPhoto(file)
    if (active) photo.value = preparedPhoto
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('common.error')
  } finally {
    busy.value = false
  }
}
async function save() {
  if (busy.value) return
  if (!name.value.trim()) {
    error.value = t('players.nameRequired')
    return
  }
  busy.value = true
  error.value = ''
  const player: PlayerProfile = {
    id: props.player?.id ?? crypto.randomUUID(),
    name: name.value.trim(),
    ...(photo.value ? { photo: photo.value } : {}),
  }
  try {
    await library.savePlayer(player)
    if (!active) return
    emit('saved', player)
    name.value = ''
    photo.value = undefined
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('common.error')
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <form class="panel stack" @submit.prevent="save">
    <h2>{{ props.player ? t('players.edit', { name: props.player.name }) : t('players.add') }}</h2>
    <label class="field"
      >{{ t('players.name')
      }}<input
        ref="nameInput"
        v-model="name"
        required
        maxlength="80"
        autocomplete="off"
        :placeholder="t('players.namePlaceholder')"
        :disabled="busy" /></label
    ><label class="field"
      >{{ t('players.photo')
      }}<input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        :disabled="busy"
        @change="choosePhoto"
      /><small>{{ t('players.photoHint') }}</small></label
    >
    <div v-if="photo" class="photo-preview">
      <PlayerAvatar :name="name" :photo="photo" large /><button
        type="button"
        class="button button-quiet"
        :disabled="busy"
        @click="photo = undefined"
      >
        {{ t('players.removePhoto') }}
      </button>
    </div>
    <p v-if="error" class="error-message" role="alert">{{ error }}</p>
    <div class="form-actions">
      <button class="button button-primary" :disabled="busy">{{ t('players.save') }}</button
      ><button
        v-if="props.player || cancellable"
        type="button"
        class="button button-quiet"
        :disabled="busy"
        @click="emit('cancel')"
      >
        {{ t('common.cancel') }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.photo-preview {
  display: flex;
  align-items: center;
  gap: 16px;
}
</style>
