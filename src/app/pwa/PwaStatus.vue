<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { t } from '@/app/i18n'
import {
  isGameActive,
  sessionLoaded,
  sessionBusy,
} from '@/features/game/composables/useGameSession'

const offline = ref(!navigator.onLine)
const registrationFailed = ref(false)
const updateFailed = ref(false)
const updating = ref(false)
const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onRegisterError() {
    registrationFailed.value = true
  },
})

function refreshConnection() {
  offline.value = !navigator.onLine
}

function dismiss() {
  offlineReady.value = false
  needRefresh.value = false
  registrationFailed.value = false
  updateFailed.value = false
}

async function installUpdate() {
  if (!sessionLoaded.value || sessionBusy.value || isGameActive.value || updating.value) return
  updating.value = true
  updateFailed.value = false
  try {
    await updateServiceWorker(true)
  } catch {
    updateFailed.value = true
  } finally {
    updating.value = false
  }
}

onMounted(() => {
  window.addEventListener('online', refreshConnection)
  window.addEventListener('offline', refreshConnection)
})

onUnmounted(() => {
  window.removeEventListener('online', refreshConnection)
  window.removeEventListener('offline', refreshConnection)
})
</script>

<template>
  <p v-if="offline" class="connection-status" role="status">{{ t('pwa.offline') }}</p>
  <aside
    v-if="offlineReady || needRefresh || registrationFailed || updateFailed"
    class="pwa-notice"
    aria-live="polite"
    aria-atomic="true"
  >
    <template v-if="registrationFailed || updateFailed">
      <p>{{ t(updateFailed ? 'pwa.updateError' : 'pwa.error') }}</p>
      <button type="button" @click="dismiss">{{ t('pwa.close') }}</button>
    </template>
    <template v-else-if="needRefresh">
      <p v-if="isGameActive">{{ t('pwa.updateAfterGame') }}</p>
      <template v-else>
        <strong>{{ t('pwa.update') }}</strong>
        <p>{{ t('pwa.updateDetails') }}</p>
      </template>
      <div class="pwa-actions">
        <button
          v-if="sessionLoaded && !isGameActive"
          type="button"
          :disabled="updating || sessionBusy"
          @click="installUpdate"
        >
          {{ t('pwa.updateNow') }}
        </button>
        <button type="button" @click="dismiss">{{ t('pwa.later') }}</button>
      </div>
    </template>
    <template v-else>
      <strong>{{ t('pwa.ready') }}</strong>
      <p>{{ t('pwa.readyDetails') }}</p>
      <button type="button" @click="dismiss">{{ t('pwa.close') }}</button>
    </template>
  </aside>
</template>

<style scoped>
.connection-status {
  margin: 2rem 0 0;
  padding: 0.6rem 1rem;
  background: #e9ecc4;
  color: #19212b;
  text-align: center;
  font-size: 0.85rem;
  border-radius: 0.75rem;
}

.pwa-notice {
  width: 100%;
  max-width: 28rem;
  margin: 2rem auto 0;
  padding: 1.1rem 1.25rem;
  border: 1px solid #c9d1b4;
  border-radius: 1rem;
  background: #f5efdf;
  color: #19212b;
  overflow-wrap: anywhere;
}

.pwa-notice p {
  margin: 0.4rem 0 0.8rem;
  font-size: 0.9rem;
}

.pwa-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.pwa-notice button {
  min-height: 44px;
  padding: 0.5rem 1rem;
  border: 1px solid #19212b;
  border-radius: 0.6rem;
  background: #19212b;
  color: #f5efdf;
  cursor: pointer;
}

.pwa-notice button:focus-visible {
  outline: 3px solid #a14e2c;
  outline-offset: 3px;
}
</style>
