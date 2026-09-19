<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import AppDialog from '@/shared/components/AppDialog.vue'
import { t } from '@/app/i18n'
import { library } from '@/app/library'
import { useGameSession } from '@/features/game/composables/useGameSession'
import type { BackupSummary } from '@/infrastructure/storage/localLibrary'
const emit = defineEmits<{ imported: [] }>()
const { loadSession, sessionBusy } = useGameSession()
const confirming = ref(false)
const importInvoker = shallowRef<HTMLElement | null>(null)
const busy = ref(false),
  error = ref(''),
  success = ref(''),
  json = ref(''),
  summary = ref<BackupSummary>(),
  restoreSession = ref(false)
async function exportBackup() {
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    const backup = await library.exportBackup()
    const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `tipsy-trouble-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    success.value = t('cards.exportDone')
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('common.error')
  } finally {
    busy.value = false
  }
}
async function inspect(event: Event) {
  summary.value = undefined
  json.value = ''
  error.value = ''
  success.value = ''
  restoreSession.value = false
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  busy.value = true
  try {
    if (file.size > 25 * 1024 * 1024) throw new Error('Choose a backup smaller than 25 MB.')
    const contents = await file.text()
    summary.value = await library.inspectBackup(contents)
    json.value = contents
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('common.error')
  } finally {
    busy.value = false
  }
}
async function requestImport(event: SubmitEvent) {
  if (restoreSession.value) {
    importInvoker.value = event.submitter instanceof HTMLElement ? event.submitter : null
    confirming.value = true
  } else await importBackup()
}
async function importBackup() {
  if (!summary.value || busy.value || sessionBusy.value) return
  confirming.value = false
  busy.value = true
  sessionBusy.value = true
  error.value = ''
  success.value = ''
  try {
    const result = await library.importBackup(json.value, { restoreSession: restoreSession.value })
    if (result.sessionRestored) await loadSession(true)
    success.value = t('cards.importDone', { players: result.players, cards: result.customCards })
    json.value = ''
    summary.value = undefined
    emit('imported')
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('common.error')
  } finally {
    busy.value = false
    sessionBusy.value = false
  }
}
</script>
<template>
  <section class="panel backup-panel">
    <h2>{{ t('cards.backupTitle') }}</h2>
    <p class="muted">{{ t('cards.backupText') }}</p>
    <button class="button button-secondary" :disabled="busy || sessionBusy" @click="exportBackup">
      {{ t('cards.export') }} <span aria-hidden="true">↓</span>
    </button>
    <form class="backup-form" @submit.prevent="requestImport">
      <label class="field"
        >{{ t('cards.file')
        }}<input
          type="file"
          accept="application/json,.json"
          :disabled="busy || sessionBusy"
          @change="inspect"
      /></label>
      <p class="help-text">{{ t('cards.importHint') }}</p>
      <p v-if="summary" class="success-message">
        {{ t('cards.preview', { players: summary.players, cards: summary.customCards }) }}
      </p>
      <label v-if="summary?.hasSession" class="checkbox-line"
        ><input v-model="restoreSession" type="checkbox" :disabled="busy" />{{
          t('cards.restore')
        }}</label
      ><button class="button button-primary" :disabled="!summary || busy || sessionBusy">
        {{ t('cards.importButton') }}
      </button>
    </form>
    <p v-if="error" class="error-message" role="alert">{{ error }}</p>
    <p v-if="success" class="success-message" role="status">{{ success }}</p>
    <AppDialog
      :open="confirming"
      :return-focus="importInvoker"
      :title="t('library.restoreTitle')"
      :confirm-label="t('cards.importButton')"
      :busy="busy"
      danger
      @confirm="importBackup"
      @close="confirming = false"
      ><p>{{ t('cards.restoreConfirm') }}</p></AppDialog
    >
  </section>
</template>

<style scoped>
.backup-panel {
  max-width: 760px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 20px;
}
.backup-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  border-top: 1px solid var(--line);
  padding-top: 24px;
}
.backup-form > button {
  align-self: flex-start;
}
</style>
