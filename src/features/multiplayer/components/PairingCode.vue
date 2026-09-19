<script setup lang="ts">
import { nextTick, onScopeDispose, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { t } from '@/app/i18n'
import AppButton from '@/shared/components/AppButton.vue'
import AppIcon from '@/shared/components/AppIcon.vue'

const props = withDefaults(
  defineProps<{ value: string; title: string; description?: string; downloadName?: string }>(),
  { description: undefined, downloadName: 'tipsy-trouble-pairing.png' },
)
const qrImage = ref('')
const qrUnavailable = ref(false)
const copied = ref(false)
const copyFailed = ref(false)
const textOpen = ref(false)
const codeField = ref<HTMLTextAreaElement>()
let generation = 0

watch(
  () => props.value,
  async (code) => {
    const currentGeneration = ++generation
    qrImage.value = ''
    qrUnavailable.value = false
    copied.value = false
    copyFailed.value = false
    if (!code) return
    try {
      const image = await QRCode.toDataURL(code, {
        errorCorrectionLevel: 'L',
        margin: 4,
        scale: 6,
        color: { dark: '#131d27ff', light: '#ffffffff' },
      })
      if (currentGeneration === generation) qrImage.value = image
    } catch {
      if (currentGeneration === generation) qrUnavailable.value = true
    }
  },
  { immediate: true },
)
onScopeDispose(() => generation++)

async function copyCode() {
  copied.value = false
  copyFailed.value = false
  const code = props.value
  try {
    await navigator.clipboard.writeText(code)
    if (code === props.value) copied.value = true
  } catch {
    if (code !== props.value) return
    copyFailed.value = true
    textOpen.value = true
    await nextTick()
    codeField.value?.focus()
    codeField.value?.select()
  }
}
</script>

<template>
  <section class="pairing-code" :aria-label="title">
    <div class="pairing-code-heading">
      <h2>{{ title }}</h2>
      <p v-if="description" class="muted">{{ description }}</p>
    </div>
    <img v-if="qrImage" class="pairing-qr" :src="qrImage" :alt="t('multiplayer.qr.alt')" />
    <p v-else-if="qrUnavailable" class="callout">{{ t('multiplayer.qr.unavailable') }}</p>
    <p v-else class="help-text" role="status">{{ t('multiplayer.qr.preparing') }}</p>
    <div class="form-actions">
      <AppButton :disabled="!value" @click="copyCode">{{ t('multiplayer.qr.copy') }}</AppButton>
      <a v-if="qrImage" class="button button-secondary" :href="qrImage" :download="downloadName">
        <AppIcon name="download" :size="18" />{{ t('multiplayer.qr.download') }}
      </a>
    </div>
    <p v-if="copied" class="help-text" role="status">{{ t('multiplayer.qr.copied') }}</p>
    <p v-if="copyFailed" class="help-text" role="status">{{ t('multiplayer.qr.copyFallback') }}</p>
    <details :open="textOpen" @toggle="textOpen = ($event.target as HTMLDetailsElement).open">
      <summary>{{ t('multiplayer.qr.showText') }}</summary>
      <label class="field">
        {{ t('multiplayer.qr.codeLabel') }}
        <textarea ref="codeField" :value="value" readonly rows="4" spellcheck="false" />
      </label>
    </details>
  </section>
</template>

<style scoped>
.pairing-code {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}
.pairing-code-heading p {
  margin-top: var(--space-2);
  font-size: 0.9rem;
}
.pairing-qr {
  display: block;
  width: min(100%, 360px);
  height: auto;
  aspect-ratio: 1;
  justify-self: center;
  border-radius: var(--radius-sm);
  background: white;
  image-rendering: pixelated;
}
.pairing-code details {
  min-width: 0;
}
.pairing-code textarea {
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}
</style>
