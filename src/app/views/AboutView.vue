<script setup lang="ts">
import { t } from '@/app/i18n'
</script>
<template>
  <section class="page reading-page">
    <RouterLink class="back-link" to="/">← {{ t('nav.home') }}</RouterLink>
    <p class="eyebrow">{{ t('about.eyebrow') }}</p>
    <h1>{{ t('about.title') }}</h1>
    <p class="page-intro">{{ t('about.intro') }}</p>
    <ol class="how-to-list">
      <li v-for="step in 4" :key="step">
        <span class="step-number">0{{ step }}</span>
        <div>
          <h2>{{ t(`about.step${step}Title`) }}</h2>
          <p>{{ t(`about.step${step}`) }}</p>
        </div>
      </li>
    </ol>
    <aside class="callout">{{ t('about.note') }}</aside>
    <h2>{{ t('about.storageTitle') }}</h2>
    <p class="muted">{{ t('about.storage') }}</p>
    <RouterLink class="button button-primary" to="/players"
      >{{ t('about.start') }} <span aria-hidden="true">↗</span></RouterLink
    >
  </section>
</template>
