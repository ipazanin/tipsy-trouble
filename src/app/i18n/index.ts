import { createI18n } from 'vue-i18n'
import interfaceMessages from './ui.en.json'
import coreMessages from './core.en.json'

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en: { ...interfaceMessages, ...coreMessages },
  },
})

export function t(key: string, parameters?: Record<string, string | number>): string {
  return i18n.global.t(key, parameters ?? {})
}
