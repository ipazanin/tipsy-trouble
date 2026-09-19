<script setup lang="ts">
import { onScopeDispose, ref } from 'vue'
import { t } from '@/app/i18n'

type ThemePreference = 'system' | 'light' | 'dark'

declare global {
  interface Window {
    tipsyTheme: { setPreference(preference: ThemePreference): void }
  }
}

function currentPreference(): ThemePreference {
  const preference = document.documentElement.dataset.themePreference
  return preference === 'light' || preference === 'dark' ? preference : 'system'
}

const preference = ref<ThemePreference>(currentPreference())
function updatePreference(event: Event) {
  const select = event.target as HTMLSelectElement
  if (select.value === 'light' || select.value === 'dark' || select.value === 'system') {
    window.tipsyTheme.setPreference(select.value)
  }
}
function syncPreference() {
  preference.value = currentPreference()
}
window.addEventListener('tipsy-theme-change', syncPreference)
onScopeDispose(() => window.removeEventListener('tipsy-theme-change', syncPreference))
</script>

<template>
  <label class="theme-preference">
    <span>{{ t('shell.theme.label') }}</span>
    <select :value="preference" @change="updatePreference">
      <option value="system">{{ t('shell.theme.system') }}</option>
      <option value="light">{{ t('shell.theme.light') }}</option>
      <option value="dark">{{ t('shell.theme.dark') }}</option>
    </select>
  </label>
</template>
