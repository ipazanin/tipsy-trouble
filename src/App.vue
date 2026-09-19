<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { t } from '@/app/i18n'
import PwaStatus from '@/app/pwa/PwaStatus.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import { useGameSession } from '@/features/game/composables/useGameSession'

const route = useRoute()
const mainContent = ref<HTMLElement>()
const playing = computed(() => route.path === '/play')
const brandIcon = `${import.meta.env.BASE_URL}icon.svg`
const { loadSession, isGameActive } = useGameSession()
onMounted(() => void loadSession())

watch(
  () => [route.path, route.matched.length] as const,
  async ([path], [previousPath, previousMatches]) => {
    if (!previousMatches || path === previousPath) return
    await nextTick()
    mainContent.value?.focus({ preventScroll: true })
  },
  { flush: 'post' },
)

function focusContent() {
  mainContent.value?.focus()
  mainContent.value?.scrollIntoView({ block: 'start' })
}
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--playing': playing }">
    <a class="skip-link" href="#main-content" @click.prevent="focusContent">{{
      t('shell.skip')
    }}</a>
    <header class="site-header">
      <RouterLink class="brand" to="/" :aria-label="t('shell.home')">
        <img class="brand-mark" :src="brandIcon" alt="" width="40" height="40" />
        <span>tipsy<span class="brand-light">trouble</span><span class="brand-dot">.</span></span>
      </RouterLink>
      <nav class="site-nav" :aria-label="t('shell.navigation')">
        <RouterLink
          v-if="!playing"
          :to="isGameActive ? '/play' : '/players'"
          :class="{ 'is-active': route.path === '/' || route.path === '/players' }"
        >
          {{ t('shell.play') }}
        </RouterLink>
        <RouterLink to="/library" :class="{ 'is-active': route.path === '/library' }">
          <AppIcon name="library" :size="17" />{{ t('shell.libraryLabel') }}
        </RouterLink>
      </nav>
    </header>
    <main id="main-content" ref="mainContent" tabindex="-1"><RouterView /></main>
    <PwaStatus />
    <footer class="site-footer">
      <div class="footer-links">
        <RouterLink to="/about">{{ t('shell.howTo') }}</RouterLink>
        <span>Domain Software Solutions d.o.o</span>
      </div>
      <a class="footer-contact" href="mailto:ivan.pazanin1996@gmail.com">
        <span>Ivan Pazanin</span>
        <span>ivan.pazanin1996@gmail.com</span>
      </a>
    </footer>
  </div>
</template>
