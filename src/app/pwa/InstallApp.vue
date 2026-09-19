<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { t } from '@/app/i18n'

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const installPrompt = ref<InstallPrompt | null>(null)
const instructionsOpen = ref(false)
const standalone = ref(false)
const installing = ref(false)
const platformInstructions = computed(() => {
  if (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  )
    return t('pwa.ios')
  if (/Android/.test(navigator.userAgent)) return t('pwa.android')
  return t('pwa.desktop')
})

function rememberPrompt(event: Event) {
  event.preventDefault()
  installPrompt.value = event as InstallPrompt
}

function markInstalled() {
  standalone.value = true
  installPrompt.value = null
  instructionsOpen.value = false
}

async function install() {
  const prompt = installPrompt.value
  if (!prompt) {
    instructionsOpen.value = !instructionsOpen.value
    return
  }
  installing.value = true
  try {
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') markInstalled()
  } catch {
    instructionsOpen.value = true
  } finally {
    installPrompt.value = null
    installing.value = false
  }
}

onMounted(() => {
  standalone.value =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  window.addEventListener('beforeinstallprompt', rememberPrompt)
  window.addEventListener('appinstalled', markInstalled)
})

onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', rememberPrompt)
  window.removeEventListener('appinstalled', markInstalled)
})
</script>

<template>
  <div v-if="!standalone" class="install-app">
    <button
      type="button"
      :disabled="installing"
      :aria-expanded="instructionsOpen"
      aria-controls="installation-help"
      @click="install"
    >
      {{ t('pwa.install') }}
    </button>
    <div v-if="instructionsOpen" id="installation-help" class="installation-help">
      <p>{{ t('pwa.installDetails') }}</p>
      <p>{{ platformInstructions }}</p>
    </div>
  </div>
</template>

<style scoped>
.install-app {
  max-width: 34rem;
  margin-inline: auto;
  text-align: center;
}

button {
  min-height: 44px;
  padding: 0.6rem 1rem;
  border: 1px solid currentColor;
  border-radius: 0.75rem;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.installation-help {
  padding-block: 0.5rem;
  font-size: 0.85rem;
  line-height: 1.65;
}
</style>
