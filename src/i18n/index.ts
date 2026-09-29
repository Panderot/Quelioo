import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import hyw from './locales/hyw.json'
import tr from './locales/tr.json'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      tr: { translation: tr },
      hyw: { translation: hyw },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'tr', 'hyw'],
    detection: {
      order: ['querystring', 'localStorage', 'navigator', 'htmlTag'],
      lookupQuerystring: 'lng',
      lookupLocalStorage: 'quelio_lang',
      caches: ['localStorage'],
      // Browsers report Armenian as "hy"/"hy-AM" (Eastern); Quelio only ships
      // Western Armenian, so map any Armenian browser locale to "hyw".
      convertDetectedLanguage: (lng) => (lng.toLowerCase().startsWith('hy') ? 'hyw' : lng),
    },
    interpolation: {
      escapeValue: false,
    },
  })
  .then(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? 'en'
  })

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
})

export default i18n
