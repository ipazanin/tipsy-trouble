<script setup lang="ts">
import { t } from '@/app/i18n'
import type { CardDefinition } from '@/features/cards/domain/cards'
import CardArtworkImage from '@/features/cards/components/CardArtworkImage.vue'
import AppButton from '@/shared/components/AppButton.vue'

defineProps<{
  title: string
  cards: readonly CardDefinition[]
  custom: boolean
  enabled: boolean
  busy: boolean
}>()
const emit = defineEmits<{
  toggle: [card: CardDefinition]
  edit: [card: CardDefinition]
  remove: [card: CardDefinition, event: MouseEvent]
}>()
</script>

<template>
  <section class="card-library-section" :aria-label="title">
    <header class="card-list-heading">
      <h3>{{ title }}</h3>
      <span>{{ cards.length }}</span>
    </header>
    <p v-if="!cards.length" class="card-list-empty">{{ t('library.noCards') }}</p>
    <div v-else class="saved-card-grid">
      <article v-for="card in cards" :key="card.id" class="saved-card-tile" :data-card-id="card.id">
        <CardArtworkImage :card="card" />
        <div class="saved-card-copy">
          <p class="eyebrow">
            {{
              t(
                card.kind === 'temporary-rule'
                  ? 'cards.temporary'
                  : card.kind === 'special'
                    ? 'game.special'
                    : 'cards.prompt',
              )
            }}
          </p>
          <h4>{{ card.title }}</h4>
          <p class="card-text">{{ card.text }}</p>
          <p v-if="card.kind === 'temporary-rule'" class="card-mechanics">
            {{
              t(
                card.target === 'everyone'
                  ? 'cards.targetEveryone'
                  : card.target === 'current-player'
                    ? 'cards.targetCurrent'
                    : 'cards.targetChoose',
              )
            }}
            ·
            {{
              t(
                card.duration.unit === 'circles'
                  ? 'library.durationCircles'
                  : 'library.durationTurns',
                { count: card.duration.amount },
              )
            }}
          </p>
          <div class="card-controls">
            <button
              :id="`card-toggle-${card.id}`"
              type="button"
              class="card-toggle"
              role="switch"
              :aria-checked="enabled"
              :aria-label="t('library.includeCard', { title: card.title })"
              :disabled="busy"
              @click="emit('toggle', card)"
            >
              <span class="toggle-track" aria-hidden="true"><span /></span
              >{{ t(enabled ? 'library.enabled' : 'library.disabled') }}
            </button>
            <div v-if="custom" class="tile-actions">
              <AppButton variant="quiet" :disabled="busy" @click="emit('edit', card)">{{
                t('common.edit')
              }}</AppButton
              ><AppButton variant="quiet" :disabled="busy" @click="emit('remove', card, $event)">{{
                t('common.delete')
              }}</AppButton>
            </div>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.card-library-section {
  margin-top: 32px;
}
.card-list-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.card-list-heading h3 {
  font-size: 1.1rem;
}
.card-list-heading > span {
  display: grid;
  place-items: center;
  min-width: 28px;
  padding: 4px 8px;
  border-radius: 20px;
  font-size: 0.75rem;
  background: var(--panel);
  color: var(--muted);
}
.card-list-empty {
  color: var(--muted);
  font-size: 0.9rem;
  padding: 16px 20px;
  border: 1px dashed var(--line);
  border-radius: 12px;
}
.saved-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
  gap: 20px;
}
.saved-card-tile {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--panel);
  color: var(--text);
}
.saved-card-tile > img {
  width: 100%;
  aspect-ratio: 3/2;
  object-fit: cover;
}
.saved-card-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 22px;
  flex: 1;
}
.saved-card-copy h4 {
  margin: 0;
  font-size: 1.3rem;
  overflow-wrap: anywhere;
}
.card-text {
  font-size: 0.95rem;
  overflow-wrap: anywhere;
}
.card-mechanics {
  font-size: 0.8rem;
  color: var(--muted);
}
.card-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-top: auto;
  padding-top: 8px;
}
.tile-actions {
  display: flex;
  gap: 0;
}
.card-toggle {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 44px;
  background: transparent;
  color: var(--text);
  padding: 6px 0;
  font-size: 0.85rem;
}
.toggle-track {
  width: 36px;
  height: 22px;
  padding: 3px;
  border-radius: 20px;
  background: var(--line);
  border: 1px solid var(--muted);
}
.toggle-track > span {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--muted);
}
.card-toggle[aria-checked='true'] .toggle-track {
  background: var(--lime);
  border-color: var(--positive);
}
.card-toggle[aria-checked='true'] .toggle-track > span {
  transform: translateX(14px);
  background: var(--ink);
}
</style>
