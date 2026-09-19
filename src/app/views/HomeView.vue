<script setup lang="ts">
import { onMounted } from 'vue'
import { t } from '@/app/i18n'
import { useGameSession } from '@/features/game/composables/useGameSession'
import InstallApp from '@/app/pwa/InstallApp.vue'
import AppButton from '@/shared/components/AppButton.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import { useMultiplayer } from '@/features/multiplayer/composables/useMultiplayer'

const { isGameActive, sessionLoaded, sessionError, loadSession } = useGameSession()
const { guestActive, guestState } = useMultiplayer()
const brandIcon = `${import.meta.env.BASE_URL}icon.svg`
onMounted(() => loadSession())
</script>

<template>
  <section class="home-launcher">
    <div v-if="sessionError" class="error-message" role="alert">
      <p>{{ sessionError }}</p>
      <AppButton variant="quiet" @click="loadSession(true)">{{ t('common.retry') }}</AppButton>
    </div>
    <div class="home-stage">
      <div class="home-copy">
        <h1>
          {{ t('shell.homeTitle') }}<span>{{ t('shell.homeAccent') }}</span>
        </h1>
        <p class="home-intro">{{ t('shell.homeIntro') }}</p>
        <div class="home-actions">
          <RouterLink
            v-if="sessionLoaded"
            class="button button-primary"
            :to="
              guestActive
                ? guestState
                  ? '/remote'
                  : '/multiplayer'
                : isGameActive
                  ? '/play'
                  : '/players'
            "
          >
            {{
              t(guestActive ? 'multiplayer.resume' : isGameActive ? 'shell.resume' : 'shell.start')
            }}
            <AppIcon name="arrow-right" />
          </RouterLink>
          <p v-else class="muted" role="status">{{ t('common.loading') }}</p>
          <RouterLink v-if="!guestActive" class="button button-secondary" to="/multiplayer">
            {{ t('multiplayer.join') }}
          </RouterLink>
          <RouterLink class="button button-secondary" to="/about">
            <AppIcon name="info" :size="18" />{{ t('shell.howTo') }}
          </RouterLink>
        </div>
      </div>
      <div class="home-deck" aria-hidden="true">
        <div class="sample-card">
          <span class="sample-label">{{ t('shell.sampleLabel') }}</span>
          <AppIcon name="spark" :size="44" />
          <div>
            <h2>{{ t('shell.sampleTitle') }}</h2>
            <p>{{ t('shell.sampleText') }}</p>
          </div>
          <div class="sample-footer">
            <span>{{ t('shell.sampleFooter') }}</span>
            <img :src="brandIcon" alt="" width="34" height="34" />
          </div>
        </div>
      </div>
    </div>
    <RouterLink class="home-library" to="/library">
      <span class="home-library-icon"><AppIcon name="library" :size="24" /></span>
      <span class="home-library-copy">
        <strong>{{ t('shell.libraryTitle') }}</strong>
        <span>{{ t('shell.libraryDescription') }}</span>
      </span>
      <AppIcon name="arrow-right" />
    </RouterLink>
    <div class="home-notes">
      <p>{{ t('shell.safe') }}</p>
      <InstallApp />
    </div>
  </section>
</template>

<style scoped>
.home-launcher {
  max-width: 960px;
  margin: auto;
  padding: clamp(32px, 7vh, 68px) 0 12px;
}
.home-stage {
  display: grid;
  grid-template-columns: 1.25fr 0.85fr;
  align-items: center;
  gap: 44px;
  margin-bottom: 40px;
}
.home-copy h1 {
  font-size: clamp(2.6rem, 5.2vw, 4.2rem);
  line-height: 1.03;
  letter-spacing: -0.055em;
}
.home-copy h1 span {
  display: block;
  color: var(--accent);
}
.home-intro {
  max-width: 340px;
  margin-top: 20px;
  color: var(--muted);
  font-size: 1.05rem;
}
.home-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 24px;
}
.home-actions .button-primary {
  min-width: 180px;
}

.home-deck {
  padding: 18px;
  min-width: 0;
}
.sample-card {
  position: relative;
  isolation: isolate;
  display: grid;
  gap: 22px;
  border-radius: 22px;
  padding: 24px;
  color: var(--ink);
  background: var(--cream);
  transform: rotate(4deg);
  box-shadow: 0 18px 40px #0003;
}
.sample-card::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -2;
  background: var(--coral);
  border-radius: inherit;
  transform: rotate(-10deg);
}
.sample-card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background: var(--cream);
  border-radius: inherit;
}
.sample-label {
  font-size: 0.72rem;
  font-weight: 800;
}
.sample-card > .app-icon {
  color: #a9432c;
}
.sample-card h2 {
  font-size: 2rem;
  line-height: 1.05;
  margin-bottom: 10px;
}
.sample-card p {
  font-size: 1rem;
  line-height: 1.5;
}
.sample-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.7rem;
  font-weight: 650;
}
.home-library {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel);
}
.home-library:hover {
  border-color: var(--accent);
}
.home-library-icon {
  display: grid;
  place-items: center;
  color: var(--positive);
}
.home-library-copy {
  flex: 1;
  display: grid;
  gap: 4px;
}
.home-library-copy strong {
  font-size: 1rem;
}
.home-library-copy > span {
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.4;
}
.home-notes {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
}
.home-notes > p {
  color: var(--muted);
  font-size: 0.78rem;
}
.home-notes :deep(.install-app) {
  margin: 0;
  font-size: 0.78rem;
}
.home-notes :deep(.install-app button) {
  border-color: var(--line);
}
@media (max-width: 660px) {
  .home-launcher {
    padding-top: 32px;
  }
  .home-stage {
    grid-template-columns: 1fr;
    gap: 0;
    margin-bottom: 24px;
  }
  .home-copy h1 {
    font-size: clamp(2rem, 9vw, 3.6rem);
  }
  .home-intro {
    margin-top: 14px;
    max-width: 360px;
  }
  .home-deck {
    display: none;
  }
  .home-library {
    padding: 16px;
    gap: 12px;
  }
  .home-notes {
    align-items: flex-start;
    flex-direction: column;
    margin-top: 14px;
    gap: 10px;
  }
}
</style>
