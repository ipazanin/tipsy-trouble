<script setup lang="ts">
import { t } from '@/app/i18n'
import AppIcon from '@/shared/components/AppIcon.vue'
import mitLicense from '../../../LICENSE?raw'
</script>

<template>
  <section class="page license-page">
    <RouterLink class="back-link" to="/">
      <AppIcon name="arrow-left" :size="18" />{{ t('nav.home') }}
    </RouterLink>
    <h1>{{ t('license.title') }}</h1>
    <p class="page-intro">{{ t('license.intro') }}</p>
    <pre class="license-text">{{ mitLicense }}</pre>
    <h2>{{ t('license.photosTitle') }}</h2>
    <p>{{ t('license.photos') }}</p>
    <a
      class="quiet-link"
      href="https://unsplash.com/license"
      target="_blank"
      rel="noopener noreferrer"
    >
      {{ t('license.photosLink') }}<AppIcon name="arrow-right" :size="18" />
    </a>
  </section>
</template>

<style scoped>
.license-page {
  max-width: 760px;
  margin: auto;
}
.license-text {
  margin: 24px 0;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel);
  font: inherit;
  font-size: 0.85rem;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.license-page h2 {
  margin-bottom: 12px;
}
.license-page > p {
  color: var(--muted);
}
</style>
