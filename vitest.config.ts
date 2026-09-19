import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      coverage: {
        provider: 'v8',
        include: [
          'src/features/**/domain/**/*.ts',
          'src/features/game/composables/useGameSession.ts',
          'src/infrastructure/storage/localBackup.ts',
          'src/infrastructure/storage/localLibraryPolicy.ts',
        ],
        exclude: ['**/__tests__/**'],
        reporter: ['text', 'html', 'json', 'json-summary'],
        thresholds: { perFile: true, statements: 96, branches: 96, functions: 96, lines: 96 },
      },
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
