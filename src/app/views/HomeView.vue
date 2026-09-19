<script setup lang="ts">
import { onMounted } from 'vue'
import { t } from '@/app/i18n'
import { useGameSession } from '@/features/game/composables/useGameSession'
import InstallApp from '@/app/pwa/InstallApp.vue'
const { isGameActive, sessionLoaded, sessionError, loadSession } = useGameSession()
onMounted(() => loadSession())
</script>
<template>
  <section class="home-page">
    <p v-if="sessionError" class="error-message" role="alert">
      {{ sessionError }}
      <button class="button button-quiet" @click="loadSession(true)">
        {{ t('common.retry') }}
      </button>
    </p>
    <div class="hero">
      <div class="hero-copy">
        <p class="eyebrow">{{ t('home.eyebrow') }}</p>
        <h1>
          {{ t('home.line1') }}<span>{{ t('home.line2') }}</span>
        </h1>
        <p class="page-intro">{{ t('home.intro') }}</p>
        <div class="hero-actions">
          <RouterLink
            v-if="sessionLoaded"
            class="button button-primary"
            :to="isGameActive ? '/play' : '/players'"
            >{{ t(isGameActive ? 'home.resume' : 'home.start') }}
            <span aria-hidden="true">↗</span></RouterLink
          >
          <p v-else class="muted">{{ t('common.loading') }}</p>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="hero-card">
          <small>{{ t('home.cardLabel') }}</small>
          <div>
            <h2>{{ t('home.cardTitle') }}</h2>
            <p>{{ t('home.cardText') }}</p>
          </div>
          <div class="hero-card-footer">
            <span>{{ t('home.cardFooter') }}</span
            ><span class="hero-star">✳</span>
          </div>
        </div>
        <span class="hero-sticker">↗</span>
      </div>
    </div>
    <div class="home-features">
      <span>{{ t('home.feature1') }}</span
      ><span>{{ t('home.feature2') }}</span
      ><span>{{ t('home.feature3') }}</span>
    </div>
    <div class="home-bottom">
      <RouterLink class="library-link" to="/cards"
        ><span
          ><strong>{{ t('home.library') }}</strong
          ><span class="muted">{{ t('home.libraryText') }}</span></span
        ><span aria-hidden="true">↗</span></RouterLink
      >
      <p>{{ t('home.safe') }}</p>
    </div>
    <InstallApp />
  </section>
</template>
