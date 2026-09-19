<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { t } from '@/app/i18n'
import PwaStatus from '@/app/pwa/PwaStatus.vue'
import { useGameSession } from '@/features/game/composables/useGameSession'

const { loadSession } = useGameSession()
onMounted(() => void loadSession())
</script>
<template>
  <div class="app-shell">
    <header class="site-header">
      <RouterLink class="brand" to="/"
        ><span class="brand-mark" aria-hidden="true">✳</span
        ><span
          >tipsy<span class="brand-light">trouble</span><span class="brand-dot">.</span></span
        ></RouterLink
      >
      <RouterLink class="quiet-link" to="/about">{{ t('nav.about') }}</RouterLink>
    </header>
    <main id="main-content"><RouterView /></main>
    <PwaStatus />
    <footer class="site-footer">
      <span>{{ t('app.tagline') }}</span
      ><span>{{ t('app.local') }}</span>
    </footer>
  </div>
</template>
