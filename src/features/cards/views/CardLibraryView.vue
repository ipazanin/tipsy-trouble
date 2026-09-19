<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '@/app/i18n'
import { library } from '@/app/library'
import { builtInCards } from '../catalogue'
import type { CardDefinition } from '../domain/cards'
import CardEditor from '../components/CardEditor.vue'
import BackupPanel from '../components/BackupPanel.vue'
const cards = ref<CardDefinition[]>([]),
  editing = ref<CardDefinition>(),
  error = ref(''),
  loaded = ref(false)
async function load() {
  error.value = ''
  try {
    cards.value = await library.listCustomCards()
    loaded.value = true
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('common.error')
  }
}
onMounted(load)
async function saved() {
  editing.value = undefined
  await load()
}
async function remove(card: CardDefinition) {
  if (!window.confirm(t('cards.deleteConfirm'))) return
  try {
    await library.deleteCustomCard(card.id)
    cards.value = cards.value.filter((saved) => saved.id !== card.id)
    if (editing.value?.id === card.id) editing.value = undefined
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('common.error')
  }
}
</script>
<template>
  <section class="page">
    <RouterLink class="back-link" to="/">← {{ t('nav.home') }}</RouterLink>
    <p class="eyebrow">{{ t('cards.eyebrow') }}</p>
    <h1>{{ t('cards.title') }}</h1>
    <p class="page-intro">{{ t('cards.intro') }}</p>
    <p v-if="error" class="error-message" role="alert">
      {{ error }} <button class="button button-quiet" @click="load">{{ t('common.retry') }}</button>
    </p>
    <div class="library-columns">
      <CardEditor :card="editing" @saved="saved" @cancel="editing = undefined" />
      <section>
        <h2>{{ t('cards.custom') }}</h2>
        <p class="help-text">{{ t('cards.builtin', { count: builtInCards.length }) }}</p>
        <p v-if="!loaded" class="loading-state">{{ t('common.loading') }}</p>
        <p v-else-if="!cards.length" class="empty-state">{{ t('cards.empty') }}</p>
        <div class="custom-card-list">
          <article v-for="card in cards" :key="card.id" class="custom-card">
            <h3>{{ card.title }}</h3>
            <p>{{ card.text }}</p>
            <div class="custom-card-footer">
              <small>{{
                t(card.kind === 'temporary-rule' ? 'cards.temporary' : 'cards.prompt')
              }}</small>
              <div class="form-actions">
                <button class="button button-quiet" @click="editing = card">
                  {{ t('common.edit') }}</button
                ><button class="button button-quiet" @click="remove(card)">
                  {{ t('common.delete') }}
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
    <BackupPanel @imported="load" />
  </section>
</template>
