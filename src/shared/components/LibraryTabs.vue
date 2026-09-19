<script setup lang="ts">
import { t } from '@/app/i18n'
import AppIcon from './AppIcon.vue'

defineProps<{ active: 'players' | 'cards' | 'backups' }>()
const tabs = [
  { id: 'players', icon: 'players' },
  { id: 'cards', icon: 'cards' },
  { id: 'backups', icon: 'backup' },
] as const
</script>

<template>
  <nav class="library-tabs" :aria-label="t('shell.library.navigation')">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.id"
      :to="{ path: '/library', query: { tab: tab.id } }"
      :aria-current="active === tab.id ? 'page' : undefined"
      :class="{ 'is-active': active === tab.id }"
    >
      <AppIcon :name="tab.icon" :size="18" />
      {{ t(`shell.library.${tab.id}`) }}
    </RouterLink>
  </nav>
</template>
