import { createRouter, createWebHashHistory } from 'vue-router'
import { useGameSession } from '@/features/game/composables/useGameSession'
import { useMultiplayer } from '@/features/multiplayer/composables/useMultiplayer'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: () => import('@/app/views/HomeView.vue') },
    { path: '/about', component: () => import('@/app/views/AboutView.vue') },
    { path: '/license', component: () => import('@/app/views/LicenseView.vue') },
    {
      path: '/players',
      component: () => import('@/features/players/views/PlayerSetupView.vue'),
      async beforeEnter() {
        if (useMultiplayer().guestActive.value) return '/remote'
        const { loadSession, sessionLoaded, isGameActive } = useGameSession()
        await loadSession()
        return sessionLoaded.value && !isGameActive.value ? true : '/play'
      },
    },
    {
      path: '/play',
      component: () => import('@/features/game/views/GameView.vue'),
      beforeEnter: () => (useMultiplayer().guestActive.value ? '/remote' : true),
    },
    { path: '/multiplayer', component: () => import('@/features/multiplayer/views/RoomView.vue') },
    { path: '/remote', component: () => import('@/features/multiplayer/views/GuestGameView.vue') },
    { path: '/library', component: () => import('@/features/library/views/LibraryView.vue') },
    { path: '/cards', redirect: { path: '/library', query: { tab: 'cards' } } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, top: 24 }
    return { top: 0 }
  },
})

export default router
