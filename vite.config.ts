import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/tipsy-trouble/',
  plugins: [
    vue(),
    vueDevTools(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: '/tipsy-trouble/',
        name: 'Tipsy Trouble',
        short_name: 'Tipsy Trouble',
        description: 'A drinking card game with your friends, your cards, and your rules.',
        lang: 'en',
        start_url: '/tipsy-trouble/',
        scope: '/tipsy-trouble/',
        display: 'standalone',
        background_color: '#19212b',
        theme_color: '#19212b',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cacheId: 'tipsy-trouble',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json,woff2}'],
        navigateFallback: '/tipsy-trouble/index.html',
        navigateFallbackAllowlist: [/^\/tipsy-trouble\//],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
