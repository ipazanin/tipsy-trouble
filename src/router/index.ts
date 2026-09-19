import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: () => import('@/app/views/HomeView.vue') },
    { path: '/about', component: () => import('@/app/views/AboutView.vue') },
    { path: '/players', component: () => import('@/features/players/views/PlayerSetupView.vue') },
    { path: '/play', component: () => import('@/features/game/views/GameView.vue') },
    { path: '/cards', component: () => import('@/features/cards/views/CardLibraryView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, top: 24 }
    return { top: 0 }
  },
})

export default router
