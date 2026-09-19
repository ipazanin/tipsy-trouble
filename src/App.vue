<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { t } from '@/app/i18n'
import PwaStatus from '@/app/pwa/PwaStatus.vue'
import ThemePreference from '@/app/theme/ThemePreference.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import { useGameSession } from '@/features/game/composables/useGameSession'
import { getCurrentPlayer, getHouseRuleAuthor } from '@/features/game/domain/game'
import { useMultiplayer } from '@/features/multiplayer/composables/useMultiplayer'

const route = useRoute()
const mainContent = ref<HTMLElement>()
const playing = computed(() => route.path === '/play' || route.path === '/remote')
const brandIcon = `${import.meta.env.BASE_URL}icon.svg`
const { loadSession, sessionLoaded, isGameActive, gameSession } = useGameSession()
const { guestActive, guestState } = useMultiplayer()
const resumeRoute = computed(() =>
  guestActive.value ? (guestState.value ? '/remote' : '/multiplayer') : '/play',
)
const resumeLabel = computed(() => t(guestActive.value ? 'multiplayer.resume' : 'shell.resume'))
const savedTurn = computed(() => {
  const session = guestActive.value ? guestState.value?.game : gameSession.value
  if (!session) return t('multiplayer.active')
  const ruleAuthor = getHouseRuleAuthor(session)
  const player = ruleAuthor ?? getCurrentPlayer(session)
  return t(ruleAuthor ? 'shell.savedRuleTurn' : 'shell.savedTurn', {
    name: player.name,
    count: session.completedTurns + 1,
  })
})
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
          v-if="sessionLoaded && !playing && !isGameActive && !guestActive"
          to="/players"
          :class="{ 'is-active': route.path === '/' || route.path === '/players' }"
        >
          {{ t('shell.play') }}
        </RouterLink>
        <RouterLink to="/library" :class="{ 'is-active': route.path === '/library' }">
          <AppIcon name="library" :size="17" />{{ t('shell.libraryLabel') }}
        </RouterLink>
      </nav>
    </header>
    <aside
      v-if="(isGameActive || guestActive) && !playing && route.path !== '/'"
      class="resume-strip"
      :aria-label="t('shell.activeGame')"
    >
      <RouterLink
        class="resume-game"
        :to="resumeRoute"
        :aria-label="resumeLabel"
        aria-describedby="saved-game-context"
      >
        <span class="resume-icon"><AppIcon name="play" :size="18" /></span>
        <span class="resume-copy">
          <strong><span class="resume-status" aria-hidden="true" />{{ resumeLabel }}</strong>
          <span id="saved-game-context" :title="savedTurn">{{ savedTurn }}</span>
        </span>
        <AppIcon name="arrow-right" :size="20" />
      </RouterLink>
    </aside>
    <main id="main-content" ref="mainContent" tabindex="-1"><RouterView /></main>
    <PwaStatus />
    <footer class="site-footer">
      <div class="footer-credit">
        <span class="footer-company">Domain Software Solutions d.o.o</span>
        <a class="footer-contact" href="mailto:ivan.pazanin1996@gmail.com">
          <span>Ivan Pazanin</span>
          <span>ivan.pazanin1996@gmail.com</span>
        </a>
      </div>
      <div class="footer-preferences">
        <ThemePreference />
        <RouterLink class="footer-license" to="/license">{{ t('shell.license') }}</RouterLink>
      </div>
    </footer>
  </div>
</template>
