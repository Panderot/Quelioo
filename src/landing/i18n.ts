import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

/** The landing page's own i18n setup: same detection as the app, but only the visitor's language file is downloaded. */
const loaders = {
  en: () => import('../i18n/locales/en.json'),
  tr: () => import('../i18n/locales/tr.json'),
  hyw: () => import('../i18n/locales/hyw.json'),
}
type Code = keyof typeof loaders

const backend = {
  type: 'backend' as const,
  init() {},
  read(language: string, _namespace: string, callback: (error: unknown, data?: object) => void) {
    const load = loaders[language as Code]
    if (!load) return callback(new Error(`no locale ${language}`))
    load().then((mod) => callback(null, mod.default), (error) => callback(error))
  },
}

export async function initLandingI18n(fixed?: 'en' | 'hyw'): Promise<typeof i18n> {
  await i18n
    .use(backend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      lng: fixed,
      fallbackLng: false,
      supportedLngs: ['en', 'tr', 'hyw'],
      nonExplicitSupportedLngs: false,
      detection: {
        order: ['querystring', 'localStorage', 'navigator', 'htmlTag'],
        lookupQuerystring: 'lng',
        lookupLocalStorage: 'quelio_lang',
        caches: fixed ? [] : ['localStorage'],
        convertDetectedLanguage: (lng) => (lng.toLowerCase().startsWith('hy') ? 'hyw' : lng),
      },
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
  document.documentElement.lang = i18n.resolvedLanguage ?? 'en'
  i18n.on('languageChanged', (lng) => {
    document.documentElement.lang = lng
  })
  return i18n
}
