<script setup lang="ts">
import { t } from '@/app/i18n'
import AppIcon from '@/shared/components/AppIcon.vue'
import { useGameSession } from '@/features/game/composables/useGameSession'

const { isGameActive, sessionLoaded } = useGameSession()
</script>

<template>
  <section class="page how-to-page">
    <RouterLink class="back-link" to="/">
      <AppIcon name="arrow-left" :size="18" />{{ t('nav.home') }}
    </RouterLink>
    <h1>{{ t('about.title') }}</h1>
    <p class="page-intro">{{ t('about.intro') }}</p>
    <ol class="play-steps">
      <li v-for="step in 4" :key="step">
        <span class="play-step-number" aria-hidden="true">{{ step }}</span>
        <div>
          <h2>{{ t(`about.step${step}Title`) }}</h2>
          <p>{{ t(`about.step${step}`) }}</p>
        </div>
      </li>
    </ol>
    <aside class="callout">{{ t('about.note') }}</aside>
    <details class="storage-details">
      <summary>{{ t('about.storageTitle') }}</summary>
      <p>{{ t('shell.storage') }}</p>
      <RouterLink class="back-link" to="/library?tab=backups">
        {{ t('shell.library.backups') }}<AppIcon name="arrow-right" :size="18" />
      </RouterLink>
    </details>
    <RouterLink
      v-if="sessionLoaded"
      class="button button-primary"
      :to="isGameActive ? '/play' : '/players'"
    >
      {{ t(isGameActive ? 'shell.resume' : 'shell.start') }}<AppIcon name="arrow-right" />
    </RouterLink>
  </section>
</template>

<style scoped>
.how-to-page {
  max-width: 680px;
  margin: auto;
}
.play-steps {
  list-style: none;
  display: grid;
  gap: 24px;
  padding: 0;
  margin: 28px 0;
}
.play-steps li {
  display: flex;
  gap: 16px;
}
.play-step-number {
  display: grid;
  place-items: center;
  flex: 0 0 32px;
  height: 32px;
  background: var(--panel);
  color: var(--accent);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-weight: 750;
}
.play-steps h2 {
  margin: 3px 0 7px;
  font-size: 1.05rem;
}
.play-steps p,
.storage-details p {
  color: var(--muted);
  font-size: 0.9rem;
}
.storage-details {
  margin: 16px 0 22px;
  border-bottom: 1px solid var(--line);
}
.storage-details .back-link {
  margin: 6px 0;
}
</style>
